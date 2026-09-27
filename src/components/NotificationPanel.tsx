import { useEffect, useState } from 'react';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type CivicNotification,
} from '../data/notificationsApi';
import { formatIssueAge } from '../data/time';

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  onUnreadChange: (count: number) => void;
  onOpenIssue: (issueId: string) => boolean;
  notify: (message: string) => void;
}

function notificationIcon(type: CivicNotification['type']): string {
  if (type === 'comment') return '💬';
  if (type === 'moderation') return '⚑';
  return '✓';
}

export function NotificationPanel({
  open,
  onClose,
  onUnreadChange,
  onOpenIssue,
  notify,
}: NotificationPanelProps) {
  const [items, setItems] = useState<CivicNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const snapshot = await listNotifications(60);
      setItems(snapshot.notifications);
      onUnreadChange(snapshot.unreadCount);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Bildirimler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  if (!open) return null;

  const unread = items.filter((item) => !item.readAt).length;

  const openNotification = async (item: CivicNotification) => {
    if (!item.readAt) {
      try {
        await markNotificationRead(item.id);
        const now = new Date().toISOString();
        setItems((current) => current.map((candidate) =>
          candidate.id === item.id ? { ...candidate, readAt: now } : candidate,
        ));
        onUnreadChange(Math.max(0, unread - 1));
      } catch {
        // Navigation can still continue if read-state update fails.
      }
    }

    if (item.issueId) {
      const opened = onOpenIssue(item.issueId);
      if (opened) {
        onClose();
      } else {
        notify('Bu kayıt artık haritada görünmüyor.');
      }
    }
  };

  const readAll = async () => {
    if (busy || unread === 0) return;
    setBusy(true);
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => (
        item.readAt ? item : { ...item, readAt: now }
      )));
      onUnreadChange(0);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Bildirimler güncellenemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="notification-panel" aria-labelledby="notificationTitle">
      <header className="notification-header">
        <div>
          <span className="eyebrow">Sokak gündemi</span>
          <h2 id="notificationTitle">Bildirimler</h2>
        </div>
        <button type="button" className="notification-close" onClick={onClose} aria-label="Bildirimleri kapat">
          ×
        </button>
      </header>

      <div className="notification-toolbar">
        <span>{unread > 0 ? `${unread} okunmamış` : 'Hepsi okundu'}</span>
        <button type="button" disabled={busy || unread === 0} onClick={() => void readAll()}>
          Tümünü okundu yap
        </button>
      </div>

      {loading ? (
        <div className="notification-loading">
          <span className="loading-dot" />
          Bildirimler yükleniyor
        </div>
      ) : items.length === 0 ? (
        <div className="notification-empty">
          <span aria-hidden="true">♢</span>
          <strong>Henüz bildirim yok</strong>
          <p>Takip ettiğin veya sana ait sorunlardaki gelişmeler burada görünür.</p>
        </div>
      ) : (
        <div className="notification-list">
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`notification-item ${item.readAt ? '' : 'unread'}`}
              onClick={() => void openNotification(item)}
            >
              <span className={`notification-type ${item.type}`} aria-hidden="true">
                {notificationIcon(item.type)}
              </span>
              <span className="notification-copy">
                <strong>{item.title}</strong>
                <span>{item.body}</span>
                <small>{formatIssueAge(item.createdAt, 'şimdi')}</small>
              </span>
              {!item.readAt && <i aria-label="Okunmamış" />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
