export function formatIssueAge(createdAt?: string, fallback = 'şimdi'): string {
  if (!createdAt) return fallback;

  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return fallback;

  const elapsedMs = Math.max(0, Date.now() - created);
  const minutes = Math.floor(elapsedMs / 60_000);

  if (minutes < 1) return 'şimdi';
  if (minutes < 60) return `${minutes} dk`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} gün`;

  const months = Math.floor(days / 30);
  return `${months} ay`;
}
