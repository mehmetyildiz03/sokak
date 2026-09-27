import { useEffect, useState } from 'react';
import type { UserProfile } from '../types';

interface ProfilePanelProps {
  user: UserProfile | null;
  busy: boolean;
  onLogin: (input: { username: string; password: string }) => Promise<void>;
  onRegister: (input: { username: string; displayName: string; password: string }) => Promise<void>;
  onLogout: () => Promise<void>;
  onClaimDevice: () => Promise<void>;
  onOpenModeration: () => void;
  onOpenAdminInstitutions: () => void;
}

export function ProfilePanel({
  user,
  busy,
  onLogin,
  onRegister,
  onLogout,
  onClaimDevice,
  onOpenModeration,
  onOpenAdminInstitutions,
}: ProfilePanelProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (user) {
      setPassword('');
    }
  }, [user]);

  if (user) {
    const stats = [
      ['Bildirim', user.stats.reports],
      ['Doğrulama', user.stats.confirmations],
      ['Güncelleme', user.stats.comments],
      ['Takip', user.stats.follows],
    ] as const;

    return (
      <section className="profile-panel" aria-labelledby="profileTitle">
        <header className="profile-header">
          <div>
            <span className="eyebrow">Sokak hesabı</span>
            <h1 id="profileTitle">Profil</h1>
          </div>
          <span className="profile-role">
            {user.role === 'admin'
              ? 'Admin'
              : user.role === 'moderator'
                ? 'Moderatör'
                : user.role === 'official'
                  ? 'Kurum'
                  : 'Vatandaş'}
          </span>
        </header>

        <div className="profile-identity">
          <div className="profile-avatar" aria-hidden="true">
            {user.displayName.slice(0, 2).toLocaleUpperCase('tr-TR')}
          </div>
          <div>
            <strong>{user.displayName}</strong>
            <span>@{user.username}</span>
          </div>
        </div>

        <div className="profile-stats" aria-label="Katkı özeti">
          {stats.map(([label, value]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {(user.role === 'moderator' || user.role === 'admin') && (
          <div className="profile-moderation-card">
            <span className="eyebrow">Moderasyon</span>
            <strong>İnceleme kuyruğu</strong>
            <p>Topluluğun bildirdiği sorun kayıtlarını ve yorumları incele.</p>
            <button
              type="button"
              className="profile-primary"
              onClick={onOpenModeration}
            >
              Kuyruğu aç
            </button>
          </div>
        )}

        {user.role === 'admin' && (
          <div className="profile-admin-card">
            <span className="eyebrow">Kurum yönetimi</span>
            <strong>Doğrulanmış kurumlar</strong>
            <p>Kurum oluştur, kullanıcı yetkilendir ve sorunları doğru kuruma ata.</p>
            <button
              type="button"
              className="profile-primary"
              onClick={onOpenAdminInstitutions}
            >
              Kurum yönetimini aç
            </button>
          </div>
        )}

        <div className="profile-account-card">
          <span className="eyebrow">Cihaz geçmişi</span>
          <strong>Anonim katkıları bu hesaba bağla</strong>
          <p>
            Bu tarayıcıda hesap açmadan önce yaptığın takip, doğrulama, yorum ve bildirim sahipliği hesabına taşınır.
          </p>
          <button
            type="button"
            className="profile-primary"
            disabled={busy}
            onClick={() => void onClaimDevice()}
          >
            {busy ? 'İşleniyor…' : 'Bu cihazın geçmişini bağla'}
          </button>
        </div>

        <button
          type="button"
          className="profile-logout"
          disabled={busy}
          onClick={() => void onLogout()}
        >
          Hesaptan çık
        </button>

        <p className="profile-security-note">
          Hesap oturumu bu cihazda saklanır. Ortak/bilinmeyen cihazlarda işin bittiğinde çıkış yap.
        </p>
      </section>
    );
  }

  return (
    <section className="profile-panel" aria-labelledby="profileTitle">
      <header className="profile-header">
        <div>
          <span className="eyebrow">Katkılarını koru</span>
          <h1 id="profileTitle">Profil</h1>
        </div>
      </header>

      <div className="auth-intro">
        <div className="profile-avatar guest" aria-hidden="true">○</div>
        <div>
          <strong>Hesapla farklı cihazlarda devam et</strong>
          <p>Takiplerin, doğrulamaların ve topluluk katkıların hesabına bağlı kalsın.</p>
        </div>
      </div>

      <div className="auth-tabs" role="tablist" aria-label="Hesap işlemi">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          className={mode === 'login' ? 'active' : ''}
          onClick={() => setMode('login')}
        >
          Giriş yap
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          className={mode === 'register' ? 'active' : ''}
          onClick={() => setMode('register')}
        >
          Hesap oluştur
        </button>
      </div>

      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === 'login') {
            void onLogin({ username, password });
          } else {
            void onRegister({ username, displayName, password });
          }
        }}
      >
        {mode === 'register' && (
          <label>
            <span>Görünen ad</span>
            <input
              type="text"
              autoComplete="name"
              minLength={2}
              maxLength={40}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Örn. Mehmet Yıldız"
              required
            />
          </label>
        )}

        <label>
          <span>Kullanıcı adı</span>
          <input
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            minLength={3}
            maxLength={30}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="mehmet.yildiz"
            required
          />
          {mode === 'register' && <small>Küçük harf, rakam, nokta ve alt çizgi.</small>}
        </label>

        <label>
          <span>Parola</span>
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 10 : undefined}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === 'register' ? 'En az 10 karakter' : 'Parolan'}
            required
          />
        </label>

        <button type="submit" className="profile-primary" disabled={busy}>
          {busy
            ? 'İşleniyor…'
            : mode === 'login'
              ? 'Giriş yap'
              : 'Hesap oluştur'}
        </button>
      </form>

      <p className="profile-security-note">
        Hesap açmadan da bildirim yapabilirsin. Hesap, katkılarını cihazlar arasında korumak içindir.
      </p>
    </section>
  );
}
