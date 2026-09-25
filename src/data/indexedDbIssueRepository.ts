import { initialIssues } from './issues';
import { formatIssueAge } from './time';
import { IssueRepositoryError, type ConfirmationResult, type IssueRepository } from './repository';
import type { Issue } from '../types';

const DB_NAME = 'sokak';
const DB_VERSION = 1;
const ISSUE_STORE = 'issues';
const CONFIRMATION_STORE = 'confirmations';
const META_STORE = 'meta';
const SEED_KEY = 'seed:v1';

interface StoredConfirmation {
  key: string;
  issueId: string;
  clientId: string;
  createdAt: string;
}

interface MetaRecord {
  key: string;
  value: string;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openDatabase(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(ISSUE_STORE)) {
        db.createObjectStore(ISSUE_STORE, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(CONFIRMATION_STORE)) {
        const store = db.createObjectStore(CONFIRMATION_STORE, { keyPath: 'key' });
        store.createIndex('by-client', 'clientId', { unique: false });
        store.createIndex('by-issue', 'issueId', { unique: false });
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
  });
}

function normalizeIssue(issue: Issue): Issue {
  return {
    ...issue,
    age: formatIssueAge(issue.createdAt, issue.age),
  };
}

export class IndexedDbIssueRepository implements IssueRepository {
  private readonly dbPromise: Promise<IDBDatabase>;

  constructor(
    private readonly clientId: string,
    dbName = DB_NAME,
  ) {
    this.dbPromise = openDatabase(dbName);
  }

  private async ensureSeeded(): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction([META_STORE, ISSUE_STORE], 'readwrite');
    const done = transactionDone(tx);
    const metaStore = tx.objectStore(META_STORE);
    const issueStore = tx.objectStore(ISSUE_STORE);

    const seeded = await requestToPromise(metaStore.get(SEED_KEY) as IDBRequest<MetaRecord | undefined>);

    if (!seeded) {
      initialIssues.forEach((issue) => issueStore.put(issue));
      metaStore.put({ key: SEED_KEY, value: new Date().toISOString() } satisfies MetaRecord);
    }

    await done;
  }

  async listIssues(): Promise<Issue[]> {
    await this.ensureSeeded();
    const db = await this.dbPromise;
    const tx = db.transaction(ISSUE_STORE, 'readonly');
    const done = transactionDone(tx);
    const issues = await requestToPromise(tx.objectStore(ISSUE_STORE).getAll() as IDBRequest<Issue[]>);
    await done;

    return issues
      .map(normalizeIssue)
      .sort((a, b) => {
        if (a.createdAt && b.createdAt) return b.createdAt.localeCompare(a.createdAt);
        if (a.createdAt) return -1;
        if (b.createdAt) return 1;
        return a.id.localeCompare(b.id);
      });
  }

  async getConfirmedIssueIds(): Promise<string[]> {
    await this.ensureSeeded();
    const db = await this.dbPromise;
    const tx = db.transaction(CONFIRMATION_STORE, 'readonly');
    const done = transactionDone(tx);
    const index = tx.objectStore(CONFIRMATION_STORE).index('by-client');
    const confirmations = await requestToPromise(index.getAll(this.clientId) as IDBRequest<StoredConfirmation[]>);
    await done;
    return confirmations.map((confirmation) => confirmation.issueId);
  }

  async createIssue(issue: Issue): Promise<Issue> {
    await this.ensureSeeded();
    const db = await this.dbPromise;
    const now = new Date().toISOString();
    const stored: Issue = {
      ...issue,
      createdAt: issue.createdAt ?? now,
      updatedAt: now,
    };

    const tx = db.transaction([ISSUE_STORE, CONFIRMATION_STORE], 'readwrite');
    const done = transactionDone(tx);
    tx.objectStore(ISSUE_STORE).put(stored);
    tx.objectStore(CONFIRMATION_STORE).put({
      key: `${this.clientId}:${stored.id}`,
      issueId: stored.id,
      clientId: this.clientId,
      createdAt: now,
    } satisfies StoredConfirmation);
    await done;
    return normalizeIssue(stored);
  }

  async confirmIssue(issueId: string): Promise<ConfirmationResult> {
    await this.ensureSeeded();
    const db = await this.dbPromise;
    const tx = db.transaction([ISSUE_STORE, CONFIRMATION_STORE], 'readwrite');
    const done = transactionDone(tx);
    const issueStore = tx.objectStore(ISSUE_STORE);
    const confirmationStore = tx.objectStore(CONFIRMATION_STORE);
    const confirmationKey = `${this.clientId}:${issueId}`;

    const [issue, existing] = await Promise.all([
      requestToPromise(issueStore.get(issueId) as IDBRequest<Issue | undefined>),
      requestToPromise(confirmationStore.get(confirmationKey) as IDBRequest<StoredConfirmation | undefined>),
    ]);

    if (!issue) {
      await done;
      throw new IssueRepositoryError('Sorun kaydı bulunamadı.');
    }

    if (existing) {
      await done;
      return { issue: normalizeIssue(issue), alreadyConfirmed: true };
    }

    if (issue.status === 'Çözüldü') {
      await done;
      throw new IssueRepositoryError('Çözülmüş bir sorun yeniden doğrulanamaz.');
    }

    const confirms = issue.confirms + 1;
    const updated: Issue = {
      ...issue,
      confirms,
      status: issue.status === 'Yeni' && confirms >= 2 ? 'Doğrulandı' : issue.status,
      updatedAt: new Date().toISOString(),
    };

    issueStore.put(updated);
    confirmationStore.put({
      key: confirmationKey,
      issueId,
      clientId: this.clientId,
      createdAt: new Date().toISOString(),
    } satisfies StoredConfirmation);

    await done;
    return { issue: normalizeIssue(updated), alreadyConfirmed: false };
  }
}
