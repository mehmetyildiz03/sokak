import { initialIssues } from './issues';
import { formatIssueAge } from './time';
import { IssueRepositoryError, type ConfirmationResult, type IssueRepository } from './repository';
import type {
  Issue,
  IssueComment,
  IssueCommunitySnapshot,
  ResolutionFeedbackValue,
} from '../types';

const DB_NAME = 'sokak';
const DB_VERSION = 3;
const ISSUE_STORE = 'issues';
const CONFIRMATION_STORE = 'confirmations';
const FOLLOW_STORE = 'follows';
const COMMENT_STORE = 'comments';
const RESOLUTION_FEEDBACK_STORE = 'resolutionFeedback';
const META_STORE = 'meta';
const SEED_KEY = 'seed:v1';

interface StoredConfirmation {
  key: string;
  issueId: string;
  clientId: string;
  createdAt: string;
}

interface StoredFollow {
  key: string;
  issueId: string;
  clientId: string;
  createdAt: string;
}

interface StoredResolutionFeedback {
  key: string;
  issueId: string;
  clientId: string;
  value: ResolutionFeedbackValue;
  createdAt: string;
  updatedAt: string;
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

      if (!db.objectStoreNames.contains(FOLLOW_STORE)) {
        const store = db.createObjectStore(FOLLOW_STORE, { keyPath: 'key' });
        store.createIndex('by-client', 'clientId', { unique: false });
        store.createIndex('by-issue', 'issueId', { unique: false });
      }

      if (!db.objectStoreNames.contains(COMMENT_STORE)) {
        const store = db.createObjectStore(COMMENT_STORE, { keyPath: 'id' });
        store.createIndex('by-issue', 'issueId', { unique: false });
      }

      if (!db.objectStoreNames.contains(RESOLUTION_FEEDBACK_STORE)) {
        const store = db.createObjectStore(RESOLUTION_FEEDBACK_STORE, { keyPath: 'key' });
        store.createIndex('by-issue', 'issueId', { unique: false });
        store.createIndex('by-client', 'clientId', { unique: false });
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

  async getFollowedIssueIds(): Promise<string[]> {
    await this.ensureSeeded();
    const db = await this.dbPromise;
    const tx = db.transaction(FOLLOW_STORE, 'readonly');
    const done = transactionDone(tx);
    const index = tx.objectStore(FOLLOW_STORE).index('by-client');
    const follows = await requestToPromise(index.getAll(this.clientId) as IDBRequest<StoredFollow[]>);
    await done;
    return follows.map((follow) => follow.issueId);
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

  private authorLabel(): string {
    let hash = 0;
    for (let index = 0; index < this.clientId.length; index += 1) {
      hash = ((hash << 5) - hash + this.clientId.charCodeAt(index)) | 0;
    }
    return `Komşu ${Math.abs(hash).toString(36).slice(0, 4).toUpperCase().padStart(4, '0')}`;
  }

  async getCommunitySnapshot(issueId: string): Promise<IssueCommunitySnapshot> {
    await this.ensureSeeded();
    const db = await this.dbPromise;
    const tx = db.transaction([COMMENT_STORE, RESOLUTION_FEEDBACK_STORE], 'readonly');
    const done = transactionDone(tx);

    const commentsIndex = tx.objectStore(COMMENT_STORE).index('by-issue');
    const feedbackIndex = tx.objectStore(RESOLUTION_FEEDBACK_STORE).index('by-issue');

    const [comments, feedback] = await Promise.all([
      requestToPromise(commentsIndex.getAll(issueId) as IDBRequest<IssueComment[]>),
      requestToPromise(feedbackIndex.getAll(issueId) as IDBRequest<StoredResolutionFeedback[]>),
    ]);
    await done;

    comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return {
      comments,
      resolution: {
        resolvedCount: feedback.filter((item) => item.value === 'resolved').length,
        stillOpenCount: feedback.filter((item) => item.value === 'still_open').length,
        myFeedback: feedback.find((item) => item.clientId === this.clientId)?.value ?? null,
      },
    };
  }

  async addComment(issueId: string, body: string): Promise<IssueComment> {
    await this.ensureSeeded();
    const trimmed = body.trim();
    if (trimmed.length < 2 || trimmed.length > 1000) {
      throw new IssueRepositoryError('Yorum 2 ile 1000 karakter arasında olmalı.');
    }

    const db = await this.dbPromise;
    const tx = db.transaction([ISSUE_STORE, COMMENT_STORE], 'readwrite');
    const done = transactionDone(tx);
    const issueStore = tx.objectStore(ISSUE_STORE);
    const commentStore = tx.objectStore(COMMENT_STORE);
    const issue = await requestToPromise(issueStore.get(issueId) as IDBRequest<Issue | undefined>);

    if (!issue) {
      await done;
      throw new IssueRepositoryError('Sorun kaydı bulunamadı.');
    }

    const now = new Date().toISOString();
    const id = typeof crypto.randomUUID === 'function'
      ? `cmt-${crypto.randomUUID()}`
      : `cmt-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const comment: IssueComment = {
      id,
      issueId,
      authorLabel: this.authorLabel(),
      body: trimmed,
      createdAt: now,
    };

    commentStore.put(comment);
    issueStore.put({
      ...issue,
      comments: issue.comments + 1,
      updatedAt: now,
    } satisfies Issue);

    await done;
    return comment;
  }

  async setResolutionFeedback(
    issueId: string,
    feedback: ResolutionFeedbackValue,
  ): Promise<IssueCommunitySnapshot> {
    await this.ensureSeeded();
    const db = await this.dbPromise;

    const issueTx = db.transaction(ISSUE_STORE, 'readonly');
    const issueDone = transactionDone(issueTx);
    const issue = await requestToPromise(
      issueTx.objectStore(ISSUE_STORE).get(issueId) as IDBRequest<Issue | undefined>,
    );
    await issueDone;

    if (!issue) {
      throw new IssueRepositoryError('Sorun kaydı bulunamadı.');
    }
    if (issue.status !== 'Çözüldü') {
      throw new IssueRepositoryError('Çözüm geri bildirimi yalnız çözülmüş kayıtlarda kullanılabilir.');
    }

    const tx = db.transaction(RESOLUTION_FEEDBACK_STORE, 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore(RESOLUTION_FEEDBACK_STORE);
    const key = `${this.clientId}:${issueId}`;
    const existing = await requestToPromise(
      store.get(key) as IDBRequest<StoredResolutionFeedback | undefined>,
    );
    const now = new Date().toISOString();

    store.put({
      key,
      issueId,
      clientId: this.clientId,
      value: feedback,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies StoredResolutionFeedback);

    await done;
    return this.getCommunitySnapshot(issueId);
  }

  async setIssueFollowed(issueId: string, followed: boolean): Promise<void> {
    await this.ensureSeeded();
    const db = await this.dbPromise;

    const issueTx = db.transaction(ISSUE_STORE, 'readonly');
    const issueDone = transactionDone(issueTx);
    const issue = await requestToPromise(issueTx.objectStore(ISSUE_STORE).get(issueId) as IDBRequest<Issue | undefined>);
    await issueDone;

    if (!issue) {
      throw new IssueRepositoryError('Sorun kaydı bulunamadı.');
    }

    const tx = db.transaction(FOLLOW_STORE, 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore(FOLLOW_STORE);
    const key = `${this.clientId}:${issueId}`;

    if (followed) {
      store.put({
        key,
        issueId,
        clientId: this.clientId,
        createdAt: new Date().toISOString(),
      } satisfies StoredFollow);
    } else {
      store.delete(key);
    }

    await done;
  }
}
