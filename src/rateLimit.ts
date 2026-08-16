const HOUR_MS = 3600000;

export function createHourlyLimiter(maxPerHour: number, clock: () => number = Date.now): () => boolean {
  let windowStart = clock();
  let reqCount = 0;

  return () => {
    const now = clock();
    if (now - windowStart >= HOUR_MS) {
      windowStart = now;
      reqCount = 0;
    }
    if (reqCount >= maxPerHour) return false;
    reqCount++;
    return true;
  };
}

export function createCooldownLimiter(cooldownMs: number, clock: () => number = Date.now): (teamId: string) => boolean {
  const lastHit = new Map<string, number>();

  return (teamId: string) => {
    const now = clock();
    const last = lastHit.get(teamId) ?? 0;
    if (now - last < cooldownMs) return false;
    lastHit.set(teamId, now);
    return true;
  };
}
