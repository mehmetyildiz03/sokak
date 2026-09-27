import { useEffect, useMemo, useState } from 'react';
import type { Issue } from '../types';
import {
  addOrganizationMember,
  assignIssueToOrganization,
  createAdminOrganization,
  listAdminOrganizations,
  type AdminOrganization,
} from '../data/adminApi';

interface AdminInstitutionPanelProps {
  issues: Issue[];
  onBack: () => void;
  notify: (message: string) => void;
}

function slugify(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜ]/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function kindLabel(kind: AdminOrganization['kind']): string {
  if (kind === 'municipality') return 'Belediye';
  if (kind === 'utility') return 'Altyapı kurumu';
  return 'Diğer kurum';
}

export function AdminInstitutionPanel({
  issues,
  onBack,
  notify,
}: AdminInstitutionPanelProps) {
  const [organizations, setOrganizations] = useState<AdminOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState('');

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [kind, setKind] = useState<AdminOrganization['kind']>('municipality');

  const [memberUsername, setMemberUsername] = useState('');
  const [memberRole, setMemberRole] = useState<'official' | 'org_admin'>('official');
  const [issueId, setIssueId] = useState('');

  const selectedOrg = organizations.find((item) => item.id === selectedOrgId) ?? null;
  const assignableIssues = useMemo(() => issues.slice(0, 150), [issues]);

  const load = async () => {
    setLoading(true);
    try {
      const items = await listAdminOrganizations();
      setOrganizations(items);
      setSelectedOrgId((current) => current || items[0]?.id || '');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Kurumlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createOrganization = async () => {
    const cleanName = name.trim();
    const cleanSlug = slug.trim();
    if (cleanName.length < 2 || cleanSlug.length < 3 || busy) return;

    setBusy(true);
    try {
      const created = await createAdminOrganization({
        name: cleanName,
        slug: cleanSlug,
        kind,
      });
      setName('');
      setSlug('');
      notify('Doğrulanmış kurum oluşturuldu.');
      await load();
      setSelectedOrgId(created.id);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Kurum oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  };

  const addMember = async () => {
    if (!selectedOrg || memberUsername.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      await addOrganizationMember(selectedOrg.id, {
        username: memberUsername.trim(),
        role: memberRole,
      });
      setMemberUsername('');
      notify('Kullanıcı kuruma eklendi.');
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Kullanıcı kuruma eklenemedi.');
    } finally {
      setBusy(false);
    }
  };

  const assignIssue = async () => {
    if (!selectedOrg || !issueId || busy) return;
    setBusy(true);
    try {
      await assignIssueToOrganization(issueId, selectedOrg.id);
      notify('Sorun doğrulanmış kuruma atandı.');
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Sorun kuruma atanamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-institution-panel" aria-labelledby="adminInstitutionTitle">
      <header className="admin-institution-header">
        <button type="button" onClick={onBack} aria-label="Profile dön">‹</button>
        <div>
          <span className="eyebrow">Yönetici</span>
          <h1 id="adminInstitutionTitle">Kurum yönetimi</h1>
        </div>
      </header>

      <div className="admin-institution-grid">
        <section className="admin-card">
          <div className="admin-card-heading">
            <div>
              <span className="eyebrow">Doğrulanmış kurumlar</span>
              <h2>{loading ? 'Yükleniyor…' : `${organizations.length} kurum`}</h2>
            </div>
          </div>

          {organizations.length > 0 ? (
            <select
              value={selectedOrgId}
              onChange={(event) => setSelectedOrgId(event.target.value)}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          ) : !loading ? (
            <p className="admin-empty-copy">Henüz doğrulanmış kurum yok.</p>
          ) : null}

          {selectedOrg && (
            <div className="admin-org-summary">
              <strong>{selectedOrg.name}</strong>
              <span>{kindLabel(selectedOrg.kind)}</span>
              <small>
                {selectedOrg.memberCount} yetkili · {selectedOrg.assignedIssueCount} atanmış kayıt
              </small>
            </div>
          )}
        </section>

        <section className="admin-card">
          <span className="eyebrow">Yeni kurum</span>
          <h2>Kurum oluştur</h2>

          <label>
            <span>Kurum adı</span>
            <input
              value={name}
              maxLength={120}
              onChange={(event) => {
                const value = event.target.value;
                setName(value);
                if (!slug || slug === slugify(name)) setSlug(slugify(value));
              }}
              placeholder="Örn. Isparta Belediyesi"
            />
          </label>

          <label>
            <span>Slug</span>
            <input
              value={slug}
              maxLength={64}
              onChange={(event) => setSlug(slugify(event.target.value))}
              placeholder="isparta-belediyesi"
            />
          </label>

          <label>
            <span>Kurum türü</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as AdminOrganization['kind'])}>
              <option value="municipality">Belediye</option>
              <option value="utility">Altyapı kurumu</option>
              <option value="other">Diğer</option>
            </select>
          </label>

          <button
            type="button"
            className="admin-primary"
            disabled={busy || name.trim().length < 2 || slug.trim().length < 3}
            onClick={() => void createOrganization()}
          >
            Kurumu oluştur ve doğrula
          </button>
        </section>

        <section className="admin-card">
          <span className="eyebrow">Yetkilendirme</span>
          <h2>Kullanıcıyı kuruma ekle</h2>
          <p>Kullanıcı hesabı önceden oluşturulmuş olmalı.</p>

          <label>
            <span>Kullanıcı adı</span>
            <input
              value={memberUsername}
              onChange={(event) => setMemberUsername(event.target.value)}
              placeholder="kullanici.adi"
              autoCapitalize="none"
            />
          </label>

          <label>
            <span>Kurum rolü</span>
            <select value={memberRole} onChange={(event) => setMemberRole(event.target.value as 'official' | 'org_admin')}>
              <option value="official">Yetkili</option>
              <option value="org_admin">Kurum yöneticisi</option>
            </select>
          </label>

          <button
            type="button"
            className="admin-primary"
            disabled={busy || !selectedOrg || memberUsername.trim().length < 3}
            onClick={() => void addMember()}
          >
            Kuruma ekle
          </button>
        </section>

        <section className="admin-card">
          <span className="eyebrow">Yönlendirme</span>
          <h2>Sorunu kuruma ata</h2>
          <p>Atama yapıldığında kurum yetkilileri resmi statü güncelleyebilir.</p>

          <label>
            <span>Sorun kaydı</span>
            <select value={issueId} onChange={(event) => setIssueId(event.target.value)}>
              <option value="">Sorun seç</option>
              {assignableIssues.map((issue) => (
                <option key={issue.id} value={issue.id}>
                  {issue.title} · {issue.status}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="admin-primary"
            disabled={busy || !selectedOrg || !issueId}
            onClick={() => void assignIssue()}
          >
            Seçili kuruma ata
          </button>
        </section>
      </div>

      <p className="admin-security-note">
        Kurum doğrulama ve atama yalnız global admin hesabında görünür. İlk admin otomatik oluşturulmaz.
      </p>
    </section>
  );
}
