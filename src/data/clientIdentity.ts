const CLIENT_ID_KEY = 'sokak:v0.3:client-id';

let memoryClientId: string | null = null;

function createClientId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateClientId(): string {
  if (memoryClientId) return memoryClientId;

  try {
    const existing = window.localStorage.getItem(CLIENT_ID_KEY);
    if (existing) {
      memoryClientId = existing;
      return existing;
    }

    const id = createClientId();
    window.localStorage.setItem(CLIENT_ID_KEY, id);
    memoryClientId = id;
    return id;
  } catch {
    memoryClientId = createClientId();
    return memoryClientId;
  }
}
