import { useEffect, useMemo, useState } from 'react';
import { AdminInstitutionPanel } from './components/AdminInstitutionPanel';
import { MapView } from './components/MapView';
import { MapFilterPanel } from './components/MapFilterPanel';
import { ModerationQueuePanel } from './components/ModerationQueuePanel';
import { ModerationReportDialog } from './components/ModerationReportDialog';
import { FollowPanel } from './components/FollowPanel';
import { IssueSheet } from './components/IssueSheet';
import { NearbyPanel } from './components/NearbyPanel';
import { NotificationPanel } from './components/NotificationPanel';
import { ProfilePanel } from './components/ProfilePanel';
import { ReportFlow } from './components/ReportFlow';
import { createIssueRepository } from './data/createIssueRepository';
import {
  claimDeviceHistory,
  loginAccount,
  logoutAccount,
  refreshAccount,
  registerAccount,
} from './data/authApi';
import { getStoredAuthSession, setStoredAuthSession } from './data/authSession';
import { getIssueHistory } from './data/issueHistoryApi';
import {
  getIssueAuthority,
  updateOfficialIssueStatus,
} from './data/officialApi';
import { listNotifications } from './data/notificationsApi';
import {
  submitModerationReport,
  type ModerationReportInput,
  type ModerationTargetType,
} from './data/moderationApi';
import { initialIssues } from './data/issues';
import {
  countActiveMapFilters,
  emptyMapFilters,
  filterMapIssues,
  type MapFilterState,
} from './data/mapFilters';
import type {
  Issue,
  IssueAuthority,
  IssueComment,
  IssueCommunitySnapshot,
  IssueHistoryEvent,
  IssueStatus,
  MapMode,
  Point,
  ReportDraft,
  ResolutionFeedbackValue,
  UserProfile,
} from './types';

const initialCenter: Point = { lng: 30.5566, lat: 37.7648 };
const sharedBackendEnabled = Boolean(import.meta.env.VITE_API_BASE_URL?.trim());

function createIssueId(): string {
  return typeof crypto.randomUUID === 'function'
    ? `iss-${crypto.randomUUID()}`
    : `iss-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function App() {
  const repository = useMemo(() => createIssueRepository(), []);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [confirmedIssueIds, setConfirmedIssueIds] = useState<string[]>([]);
  const [followedIssueIds, setFollowedIssueIds] = useState<string[]>([]);
  const [mode, setMode] = useState<MapMode>('issues');
  const [mapFilters, setMapFilters] = useState<MapFilterState>(emptyMapFilters);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [activeView, setActiveView] = useState<'map' | 'nearby' | 'following' | 'profile' | 'moderation' | 'admin'>('map');
  const [center, setCenter] = useState<Point>(initialCenter);
  const [nearbyOrigin, setNearbyOrigin] = useState<Point>(initialCenter);
  const [nearbyDeviceOrigin, setNearbyDeviceOrigin] = useState<Point | null>(null);
  const [nearbyLocationSource, setNearbyLocationSource] = useState<'device' | 'map'>('map');
  const [nearbyLocating, setNearbyLocating] = useState(false);
  const [nearbyAutoLocationTried, setNearbyAutoLocationTried] = useState(false);
  const [focus, setFocus] = useState<(Point & { key: number }) | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [dataLoadFailed, setDataLoadFailed] = useState(false);
  const [dataReloadKey, setDataReloadKey] = useState(0);
  const [persistenceAvailable, setPersistenceAvailable] = useState(true);
  const [toast, setToast] = useState('');
  const [communityByIssueId, setCommunityByIssueId] = useState<Record<string, IssueCommunitySnapshot>>({});
  const [communityLoadingIssueId, setCommunityLoadingIssueId] = useState<string | null>(null);
  const [historyByIssueId, setHistoryByIssueId] = useState<Record<string, IssueHistoryEvent[]>>({});
  const [historyLoadingIssueId, setHistoryLoadingIssueId] = useState<string | null>(null);
  const [authorityByIssueId, setAuthorityByIssueId] = useState<Record<string, IssueAuthority | null>>({});
  const [authorityLoadingIssueId, setAuthorityLoadingIssueId] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<UserProfile | null>(
    () => getStoredAuthSession()?.user ?? null,
  );
  const [authBusy, setAuthBusy] = useState(false);
  const [moderationTarget, setModerationTarget] = useState<{
    type: ModerationTargetType;
    id: string;
    label: string;
  } | null>(null);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationUnread, setNotificationUnread] = useState(0);

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === selectedIssueId) ?? null,
    [issues, selectedIssueId],
  );

  const visibleMapIssues = useMemo(
    () => filterMapIssues(issues, mapFilters, followedIssueIds),
    [issues, mapFilters, followedIssueIds],
  );

  const activeMapFilterCount = useMemo(
    () => countActiveMapFilters(mapFilters),
    [mapFilters],
  );

  const notify = (message: string) => setToast(message);

  useEffect(() => {
    let cancelled = false;
    setDataReady(false);
    setDataLoadFailed(false);
    setPersistenceAvailable(true);

    void Promise.all([
      repository.listIssues(),
      repository.getConfirmedIssueIds(),
      repository.getFollowedIssueIds(),
    ]).then(([storedIssues, confirmedIds, followedIds]) => {
      if (cancelled) return;
      setIssues(storedIssues);
      setConfirmedIssueIds(confirmedIds);
      setFollowedIssueIds(followedIds);
    }).catch(() => {
      if (cancelled) return;
      setPersistenceAvailable(false);

      if (sharedBackendEnabled) {
        setIssues([]);
        setConfirmedIssueIds([]);
        setFollowedIssueIds([]);
        setDataLoadFailed(true);
        notify('Ortak şehir verilerine ulaşılamadı.');
      } else {
        setIssues(initialIssues);
        notify('Yerel veri deposu açılamadı; bu oturum geçici modda çalışıyor.');
      }
    }).finally(() => {
      if (!cancelled) setDataReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [repository, dataReloadKey]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!sharedBackendEnabled || !getStoredAuthSession()) return;

    let cancelled = false;
    void refreshAccount()
      .then((user) => {
        if (!cancelled) setAuthUser(user);
      })
      .catch(() => {
        if (cancelled) return;
        setStoredAuthSession(null);
        setAuthUser(null);
        setDataReloadKey((key) => key + 1);
        notify('Oturum süresi doldu; anonim moda geçildi.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sharedBackendEnabled) return;

    let cancelled = false;
    let refreshing = false;

    const refreshSharedMap = async () => {
      if (refreshing || document.visibilityState !== 'visible') return;
      refreshing = true;
      try {
        const storedIssues = await repository.listIssues();
        if (!cancelled) setIssues(storedIssues);
      } catch {
        // Keep the last known city map visible during transient network failures.
      } finally {
        refreshing = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshSharedMap();
    };

    const timer = window.setInterval(() => {
      void refreshSharedMap();
    }, 12_000);

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [repository, dataReloadKey]);

  useEffect(() => {
    if (!sharedBackendEnabled) return;

    let cancelled = false;
    const refreshNotificationCount = () => {
      void listNotifications(1)
        .then((snapshot) => {
          if (!cancelled) setNotificationUnread(snapshot.unreadCount);
        })
        .catch(() => {
          // Keep the map usable when notification refresh is temporarily unavailable.
        });
    };

    refreshNotificationCount();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshNotificationCount();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authUser?.id, dataReloadKey]);

  useEffect(() => {
    if (!selectedIssueId) return;

    let cancelled = false;
    setCommunityLoadingIssueId(selectedIssueId);

    void repository.getCommunitySnapshot(selectedIssueId)
      .then((snapshot) => {
        if (cancelled) return;
        setCommunityByIssueId((current) => ({
          ...current,
          [selectedIssueId]: snapshot,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setCommunityByIssueId((current) => ({
          ...current,
          [selectedIssueId]: current[selectedIssueId] ?? {
            comments: [],
            resolution: {
              resolvedCount: 0,
              stillOpenCount: 0,
              myFeedback: null,
            },
          },
        }));
      })
      .finally(() => {
        if (!cancelled) setCommunityLoadingIssueId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [repository, selectedIssueId, selectedIssue?.comments]);

  useEffect(() => {
    if (!selectedIssueId || !sharedBackendEnabled) return;

    let cancelled = false;
    setHistoryLoadingIssueId(selectedIssueId);

    void getIssueHistory(selectedIssueId)
      .then((events) => {
        if (cancelled) return;
        setHistoryByIssueId((current) => ({
          ...current,
          [selectedIssueId]: events,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setHistoryByIssueId((current) => ({
          ...current,
          [selectedIssueId]: current[selectedIssueId] ?? [],
        }));
      })
      .finally(() => {
        if (!cancelled) setHistoryLoadingIssueId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedIssueId, selectedIssue?.status]);

  useEffect(() => {
    if (!selectedIssueId || !sharedBackendEnabled) return;

    let cancelled = false;
    setAuthorityLoadingIssueId(selectedIssueId);

    void getIssueAuthority(selectedIssueId)
      .then((authority) => {
        if (cancelled) return;
        setAuthorityByIssueId((current) => ({
          ...current,
          [selectedIssueId]: authority,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setAuthorityByIssueId((current) => ({
          ...current,
          [selectedIssueId]: current[selectedIssueId] ?? null,
        }));
      })
      .finally(() => {
        if (!cancelled) setAuthorityLoadingIssueId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedIssueId, authUser?.id]);

  const requestLocation = (): Promise<Point> => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { lng: coords.longitude, lat: coords.latitude };
        setCenter(point);
        setFocus({ ...point, key: Date.now() });
        resolve(point);
      },
      reject,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });

  const locateFromHeader = async () => {
    try {
      await requestLocation();
      notify('Konumuna gidildi.');
    } catch {
      notify('Konum alınamadı. Tarayıcı izinlerini kontrol et.');
    }
  };

  const useDeviceLocationForNearby = async () => {
    if (nearbyLocating) return;
    setNearbyLocating(true);
    try {
      const point = await requestLocation();
      setNearbyDeviceOrigin(point);
      setNearbyOrigin(point);
      setNearbyLocationSource('device');
      notify('Yakındaki sorunlar konumuna göre sıralandı.');
    } catch {
      setNearbyLocationSource('map');
      notify('Konum alınamadı; harita merkezi referans olarak kullanılıyor.');
    } finally {
      setNearbyLocating(false);
    }
  };

  const openNearby = () => {
    setSelectedIssueId(null);
    setReportOpen(false);
    setNotificationsOpen(false);
    setFilterPanelOpen(false);
    setActiveView('nearby');

    if (nearbyDeviceOrigin) {
      setNearbyOrigin(nearbyDeviceOrigin);
      setNearbyLocationSource('device');
      return;
    }

    setNearbyOrigin(center);
    setNearbyLocationSource('map');

    if (!nearbyAutoLocationTried) {
      setNearbyAutoLocationTried(true);
      void useDeviceLocationForNearby();
    }
  };

  const confirmIssue = async (id: string) => {
    if (confirmedIssueIds.includes(id)) {
      notify('Bu sorunu zaten doğruladın.');
      return;
    }

    if (!persistenceAvailable) {
      setIssues((current) => current.map((issue) => {
        if (issue.id !== id) return issue;
        const confirms = issue.confirms + 1;
        return {
          ...issue,
          confirms,
          status: issue.status === 'Yeni' && confirms >= 2 ? 'Doğrulandı' : issue.status,
        };
      }));
      setConfirmedIssueIds((current) => [...current, id]);
      notify('Doğrulama bu oturum için kaydedildi.');
      return;
    }

    try {
      const result = await repository.confirmIssue(id);

      setIssues((current) => current.map((issue) =>
        issue.id === id ? result.issue : issue,
      ));

      setConfirmedIssueIds((current) =>
        current.includes(id) ? current : [...current, id],
      );

      notify(result.alreadyConfirmed
        ? 'Bu sorunu zaten doğruladın.'
        : 'Doğrulaman kaydedildi. Teşekkürler.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Doğrulama kaydedilemedi.');
    }
  };

  const addCommunityComment = async (issueId: string, body: string): Promise<void> => {
    const trimmed = body.trim();
    if (trimmed.length < 2) return;

    if (!persistenceAvailable) {
      const now = new Date().toISOString();
      const comment: IssueComment = {
        id: `session-comment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        issueId,
        authorLabel: 'Bu cihaz',
        body: trimmed,
        createdAt: now,
      };

      setCommunityByIssueId((current) => {
        const previous = current[issueId] ?? {
          comments: [],
          resolution: { resolvedCount: 0, stillOpenCount: 0, myFeedback: null },
        };
        return {
          ...current,
          [issueId]: {
            ...previous,
            comments: [...previous.comments, comment],
          },
        };
      });
      setIssues((current) => current.map((issue) =>
        issue.id === issueId
          ? { ...issue, comments: issue.comments + 1, lastCommentAt: now, updatedAt: now }
          : issue,
      ));
      notify('Güncelleme bu oturum için eklendi.');
      return;
    }

    try {
      const comment = await repository.addComment(issueId, trimmed);
      setCommunityByIssueId((current) => {
        const previous = current[issueId] ?? {
          comments: [],
          resolution: { resolvedCount: 0, stillOpenCount: 0, myFeedback: null },
        };
        return {
          ...current,
          [issueId]: {
            ...previous,
            comments: [...previous.comments, comment],
          },
        };
      });
      setIssues((current) => current.map((issue) =>
        issue.id === issueId
          ? {
              ...issue,
              comments: issue.comments + 1,
              lastCommentAt: comment.createdAt,
              updatedAt: comment.createdAt,
            }
          : issue,
      ));
      notify('Topluluk güncellemen eklendi.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Güncelleme eklenemedi.');
      throw error;
    }
  };

  const setCommunityResolutionFeedback = async (
    issueId: string,
    feedback: ResolutionFeedbackValue,
  ): Promise<void> => {
    if (!persistenceAvailable) {
      setCommunityByIssueId((current) => {
        const previous = current[issueId] ?? {
          comments: [],
          resolution: { resolvedCount: 0, stillOpenCount: 0, myFeedback: null },
        };
        const resolution = previous.resolution;
        let resolvedCount = resolution.resolvedCount;
        let stillOpenCount = resolution.stillOpenCount;

        if (resolution.myFeedback === 'resolved') resolvedCount = Math.max(0, resolvedCount - 1);
        if (resolution.myFeedback === 'still_open') stillOpenCount = Math.max(0, stillOpenCount - 1);
        if (feedback === 'resolved') resolvedCount += 1;
        if (feedback === 'still_open') stillOpenCount += 1;

        return {
          ...current,
          [issueId]: {
            ...previous,
            resolution: { resolvedCount, stillOpenCount, myFeedback: feedback },
          },
        };
      });
      notify('Çözüm görüşün bu oturum için kaydedildi.');
      return;
    }

    try {
      const snapshot = await repository.setResolutionFeedback(issueId, feedback);
      setCommunityByIssueId((current) => ({
        ...current,
        [issueId]: snapshot,
      }));
      notify(feedback === 'resolved'
        ? 'Çözüm doğrulaman kaydedildi.'
        : 'Sorunun devam ettiği geri bildirimi kaydedildi.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Geri bildirim kaydedilemedi.');
      throw error;
    }
  };

  const handleLogin = async (input: { username: string; password: string }) => {
    setAuthBusy(true);
    try {
      const session = await loginAccount(input);
      setAuthUser(session.user);
      setDataReloadKey((key) => key + 1);
      notify(`Hoş geldin, ${session.user.displayName}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Giriş yapılamadı.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRegister = async (input: {
    username: string;
    displayName: string;
    password: string;
  }) => {
    setAuthBusy(true);
    try {
      const session = await registerAccount(input);
      setAuthUser(session.user);
      setDataReloadKey((key) => key + 1);
      notify('Hesabın oluşturuldu.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Hesap oluşturulamadı.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleClaimDevice = async () => {
    setAuthBusy(true);
    try {
      const user = await claimDeviceHistory();
      setAuthUser(user);
      setDataReloadKey((key) => key + 1);
      notify('Bu cihazdaki anonim katkılar hesabına bağlandı.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Cihaz geçmişi bağlanamadı.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    setAuthBusy(true);
    try {
      await logoutAccount();
      setAuthUser(null);
      setDataReloadKey((key) => key + 1);
      notify('Hesaptan çıkıldı; anonim moda geçildi.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Çıkış tamamlanamadı.');
    } finally {
      setAuthBusy(false);
    }
  };

  const openModerationReport = (
    type: ModerationTargetType,
    id: string,
    label: string,
  ) => {
    if (!authUser) {
      setSelectedIssueId(null);
      setReportOpen(false);
      setFilterPanelOpen(false);
      setActiveView('profile');
      notify('İçeriği raporlamak için hesabına giriş yapmalısın.');
      return;
    }

    setModerationTarget({ type, id, label });
  };

  const handleModerationSubmit = async (input: ModerationReportInput) => {
    setModerationBusy(true);
    try {
      await submitModerationReport(input);
      setModerationTarget(null);
      notify('Rapor inceleme kuyruğuna gönderildi.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Rapor gönderilemedi.');
    } finally {
      setModerationBusy(false);
    }
  };

  const handleOfficialStatusUpdate = async (
    issueId: string,
    status: Extract<IssueStatus, 'İşlemde' | 'Çözüldü'>,
    note: string,
  ) => {
    try {
      const result = await updateOfficialIssueStatus(issueId, status, note);

      setIssues((current) => current.map((issue) =>
        issue.id === issueId ? result.issue : issue,
      ));
      setAuthorityByIssueId((current) => ({
        ...current,
        [issueId]: result.organization,
      }));

      try {
        const events = await getIssueHistory(issueId);
        setHistoryByIssueId((current) => ({
          ...current,
          [issueId]: events,
        }));
      } catch {
        // The status change is already persisted; stale timeline can recover on reopen.
      }

      notify(
        status === 'Çözüldü'
          ? 'Kurum sorunu çözüldü olarak güncelledi.'
          : 'Kurum durumu İşlemde olarak güncellendi.',
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Kurum durumu güncellenemedi.');
      throw error;
    }
  };

  const toggleFollow = async (id: string) => {
    const shouldFollow = !followedIssueIds.includes(id);

    if (!persistenceAvailable) {
      setFollowedIssueIds((current) =>
        shouldFollow ? [...current, id] : current.filter((item) => item !== id),
      );
      notify(shouldFollow ? 'Sorun bu oturum için takip ediliyor.' : 'Takip bu oturum için kaldırıldı.');
      return;
    }

    try {
      await repository.setIssueFollowed(id, shouldFollow);
      setFollowedIssueIds((current) =>
        shouldFollow
          ? (current.includes(id) ? current : [...current, id])
          : current.filter((item) => item !== id),
      );
      notify(shouldFollow ? 'Sorun takip listene eklendi.' : 'Sorun takibinden çıkarıldı.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Takip durumu güncellenemedi.');
    }
  };

  const openExistingIssue = (id: string): boolean => {
    const issue = issues.find((item) => item.id === id);
    if (!issue) return false;
    setNotificationsOpen(false);
    setReportOpen(false);
    setFilterPanelOpen(false);
    setActiveView('map');
    setSelectedIssueId(id);
    setMode('issues');
    setFocus({ lng: issue.lng, lat: issue.lat, key: Date.now() });
    return true;
  };

  const submitReport = async (draft: ReportDraft): Promise<void> => {
    if (!draft.category) return;

    const now = new Date().toISOString();
    const issue: Issue = {
      id: createIssueId(),
      lng: draft.lng,
      lat: draft.lat,
      category: draft.category,
      categoryLabel: draft.categoryLabel,
      emoji: draft.emoji,
      title: draft.description.length > 44 ? `${draft.description.slice(0, 44)}…` : draft.description,
      place: draft.place || `${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}`,
      description: draft.description,
      confirms: 1,
      comments: 0,
      age: 'şimdi',
      severity: 1,
      status: 'Yeni',
      photoUrl: draft.photoUrl || undefined,
      createdAt: now,
      updatedAt: now,
    };

    if (!persistenceAvailable) {
      setIssues((current) => [issue, ...current]);
      setConfirmedIssueIds((current) => [...current, issue.id]);
      setReportOpen(false);
      setSelectedIssueId(issue.id);
      setFocus({ lng: issue.lng, lat: issue.lat, key: Date.now() });
      notify('Bildirim yalnızca bu oturum için eklendi.');
      return;
    }

    try {
      const stored = await repository.createIssue(issue);
      setIssues((current) => [stored, ...current.filter((item) => item.id !== stored.id)]);
      setConfirmedIssueIds((current) =>
        current.includes(stored.id) ? current : [...current, stored.id],
      );
      setReportOpen(false);
      setSelectedIssueId(stored.id);
      setFocus({ lng: stored.lng, lat: stored.lat, key: Date.now() });
      notify(sharedBackendEnabled
        ? 'Bildirim ortak şehir haritasına kaydedildi.'
        : 'Bildirim bu cihazda kalıcı olarak kaydedildi.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Bildirim kaydedilemedi.');
    }
  };

  return (
    <main className="app-shell">
      <section className="map-screen" aria-label="Şehir sorun haritası">
        <MapView
          issues={visibleMapIssues}
          mode={mode}
          focus={focus}
          selectedIssue={selectedIssue}
          followedIssueIds={followedIssueIds}
          onSelectIssue={(id) => {
            setFilterPanelOpen(false);
            setSelectedIssueId(id);
          }}
          onCenterChange={setCenter}
        />

        {!dataReady && (
          <div className="data-loading glass" role="status" aria-live="polite">
            <span className="loading-dot" />
            Kayıtlar yükleniyor
          </div>
        )}

        {activeView === 'nearby' && (
          <NearbyPanel
            issues={issues}
            origin={nearbyOrigin}
            locationSource={nearbyLocationSource}
            locating={nearbyLocating}
            onUseDeviceLocation={() => void useDeviceLocationForNearby()}
            onSelectIssue={openExistingIssue}
          />
        )}

        {activeView === 'following' && (
          <FollowPanel
            issues={issues}
            followedIssueIds={followedIssueIds}
            onSelectIssue={openExistingIssue}
            onUnfollow={(id) => void toggleFollow(id)}
          />
        )}

        {activeView === 'profile' && (
          <ProfilePanel
            user={authUser}
            busy={authBusy}
            onLogin={handleLogin}
            onRegister={handleRegister}
            onLogout={handleLogout}
            onClaimDevice={handleClaimDevice}
            onOpenModeration={() => setActiveView('moderation')}
            onOpenAdminInstitutions={() => setActiveView('admin')}
          />
        )}

        {activeView === 'moderation' && (
          <ModerationQueuePanel
            onBack={() => setActiveView('profile')}
            notify={notify}
          />
        )}

        {activeView === 'admin' && (
          <AdminInstitutionPanel
            issues={issues}
            onBack={() => setActiveView('profile')}
            notify={notify}
          />
        )}

        <header className={`topbar glass ${activeView !== 'map' ? 'under-panel' : ''}`}>
          <button className="icon-btn" onClick={locateFromHeader} aria-label="Konumumu bul">⌖</button>
          <button
            className="location-pill"
            onClick={() => notify('Bölge seçici sonraki sürümde mahalle ve ilçe düzeyinde açılacak.')}
            aria-label="Bölge seç"
          >
            <span className="eyebrow">Bölge</span>
            <strong>Isparta · Canlı</strong>
          </button>
          <button
            className={`icon-btn notification-trigger ${notificationsOpen ? 'active' : ''}`}
            onClick={() => setNotificationsOpen((open) => !open)}
            aria-label={notificationUnread > 0 ? `Bildirimler, ${notificationUnread} okunmamış` : 'Bildirimler'}
            aria-expanded={notificationsOpen}
          >
            ♢
            {notificationUnread > 0 && (
              <span className="notification-badge">
                {notificationUnread > 99 ? '99+' : notificationUnread}
              </span>
            )}
          </button>
        </header>

        {activeView === 'map' && issues.length > 0 && <div className="mode-switch glass" role="group" aria-label="Harita görünümü">
          <button
            className={`mode-btn ${mode === 'issues' ? 'active' : ''}`}
            onClick={() => setMode('issues')}
            aria-pressed={mode === 'issues'}
          >
            Sorunlar
          </button>
          <button
            className={`mode-btn ${mode === 'heat' ? 'active' : ''}`}
            onClick={() => setMode('heat')}
            aria-pressed={mode === 'heat'}
          >
            Yoğunluk
          </button>
        </div>}

        {activeView === 'map' && issues.length > 0 && (
          <button
            type="button"
            className={`map-filter-trigger glass ${activeMapFilterCount > 0 ? 'active' : ''}`}
            onClick={() => setFilterPanelOpen((open) => !open)}
            aria-expanded={filterPanelOpen}
            aria-label="Harita filtrelerini aç"
          >
            <span aria-hidden="true">≡</span>
            <span>Filtre</span>
            {activeMapFilterCount > 0 && <strong>{activeMapFilterCount}</strong>}
          </button>
        )}

        {activeView === 'map' && issues.length > 0 && (
          <MapFilterPanel
            open={filterPanelOpen}
            filters={mapFilters}
            visibleCount={visibleMapIssues.length}
            totalCount={issues.length}
            followedCount={followedIssueIds.length}
            onChange={setMapFilters}
            onClose={() => setFilterPanelOpen(false)}
          />
        )}

        {activeView === 'map' && issues.length > 0 && activeMapFilterCount > 0 && !filterPanelOpen && (
          <div className="filter-summary glass" role="status">
            <span>{visibleMapIssues.length} / {issues.length} kayıt</span>
            <button type="button" onClick={() => setMapFilters(emptyMapFilters)}>Temizle</button>
          </div>
        )}

        {activeView === 'map' && dataReady && dataLoadFailed && (
          <div className="map-empty-state map-error-state glass" role="alert">
            <span className="map-empty-icon" aria-hidden="true">!</span>
            <strong>Canlı verilere ulaşılamıyor</strong>
            <p>Bağlantıyı kontrol edip ortak şehir verilerini yeniden yükleyebilirsin.</p>
            <button
              type="button"
              onClick={() => setDataReloadKey((key) => key + 1)}
            >
              Yeniden dene
            </button>
          </div>
        )}

        {activeView === 'map' && dataReady && !dataLoadFailed && issues.length === 0 && (
          <div className="map-empty-state glass" role="status">
            <span className="map-empty-icon" aria-hidden="true">⌖</span>
            <strong>Henüz bu bölgede bildirim yok</strong>
            <p>Şehir haritasındaki ilk gerçek sorunu sen bildirebilirsin.</p>
            <button
              type="button"
              onClick={() => {
                setSelectedIssueId(null);
                setFilterPanelOpen(false);
                setReportOpen(true);
              }}
            >
              İlk sorunu bildir
            </button>
          </div>
        )}

        {activeView === 'map' && dataReady && !dataLoadFailed && issues.length > 0 && visibleMapIssues.length === 0 && (
          <div className="map-filter-empty glass">
            <strong>Bu filtrelerle eşleşen kayıt yok</strong>
            <button type="button" onClick={() => setMapFilters(emptyMapFilters)}>Tüm kayıtları göster</button>
          </div>
        )}

        {activeView === 'map' && issues.length > 0 && (mode === 'issues' ? (
          <aside className="map-legend glass" aria-label="Sorun durumları">
            <span><i className="dot dot-new" /> Yeni</span>
            <span><i className="dot dot-confirmed" /> Doğrulandı</span>
            <span><i className="dot dot-old" /> Uzun süredir açık</span>
            <span><i className="legend-comment-badge">2</i> Yorum</span>
          </aside>
        ) : (
          <aside className="heat-legend glass" aria-label="Sorun yoğunluğu">
            <span>Az</span><i aria-hidden="true" /><span>Yoğun</span>
          </aside>
        ))}

        {activeView === 'map' && <button
          className="report-fab"
          disabled={!dataReady}
          onClick={() => {
            setSelectedIssueId(null);
            setFilterPanelOpen(false);
            setNotificationsOpen(false);
            setReportOpen(true);
          }}
        >
          <span className="plus">＋</span>
          <span>Sorun bildir</span>
        </button>}

        <IssueSheet
          issue={selectedIssue}
          confirmed={selectedIssue ? confirmedIssueIds.includes(selectedIssue.id) : false}
          followed={selectedIssue ? followedIssueIds.includes(selectedIssue.id) : false}
          onClose={() => setSelectedIssueId(null)}
          onConfirm={confirmIssue}
          onToggleFollow={(id) => void toggleFollow(id)}
          community={selectedIssue ? communityByIssueId[selectedIssue.id] ?? null : null}
          communityLoading={selectedIssue ? communityLoadingIssueId === selectedIssue.id : false}
          history={selectedIssue ? historyByIssueId[selectedIssue.id] ?? [] : []}
          historyLoading={selectedIssue ? historyLoadingIssueId === selectedIssue.id : false}
          authority={selectedIssue ? authorityByIssueId[selectedIssue.id] ?? null : null}
          authorityLoading={selectedIssue ? authorityLoadingIssueId === selectedIssue.id : false}
          onAddComment={addCommunityComment}
          onResolutionFeedback={setCommunityResolutionFeedback}
          onOfficialStatusUpdate={handleOfficialStatusUpdate}
          onReportIssue={(issue) => openModerationReport('issue', issue.id, issue.title)}
          onReportComment={(commentId, label) => openModerationReport('comment', commentId, label)}
        />

        <nav className="bottom-nav glass" aria-label="Ana menü">
          <button
            className={`nav-item ${activeView === 'map' ? 'active' : ''}`}
            onClick={() => {
              setActiveView('map');
              setNotificationsOpen(false);
              setFilterPanelOpen(false);
              setMode('issues');
            }}
          >
            <span>⌘</span><small>Harita</small>
          </button>
          <button
            className={`nav-item ${activeView === 'nearby' ? 'active' : ''}`}
            onClick={openNearby}
          >
            <span>◎</span><small>Yakınımda</small>
          </button>
          <span className="nav-spacer" aria-hidden="true" />
          <button
            className={`nav-item ${activeView === 'following' ? 'active' : ''}`}
            onClick={() => {
              setSelectedIssueId(null);
              setReportOpen(false);
              setNotificationsOpen(false);
              setFilterPanelOpen(false);
              setActiveView('following');
            }}
          >
            <span>{followedIssueIds.length > 0 ? '♥' : '♡'}</span><small>Takip</small>
          </button>
          <button
            className={`nav-item ${activeView === 'profile' ? 'active' : ''}`}
            onClick={() => {
              setSelectedIssueId(null);
              setReportOpen(false);
              setNotificationsOpen(false);
              setFilterPanelOpen(false);
              setActiveView('profile');
            }}
          >
            <span>{authUser ? '●' : '○'}</span><small>Profil</small>
          </button>
        </nav>
      </section>

      <NotificationPanel
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onUnreadChange={setNotificationUnread}
        onOpenIssue={openExistingIssue}
        notify={notify}
      />

      <ModerationReportDialog
        target={moderationTarget}
        busy={moderationBusy}
        onClose={() => {
          if (!moderationBusy) setModerationTarget(null);
        }}
        onSubmit={handleModerationSubmit}
      />

      <ReportFlow
        open={reportOpen}
        center={center}
        issues={issues}
        onClose={() => setReportOpen(false)}
        onSubmit={submitReport}
        onOpenIssue={openExistingIssue}
        requestLocation={requestLocation}
        notify={notify}
      />

      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </main>
  );
}
