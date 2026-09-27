/**
 * Limiteur à fenêtre fixe, en mémoire : les clés (IP, installation) ne sont jamais
 * écrites en base ni dans les journaux (spec §4-§5). Suffisant pour une instance unique.
 */
export interface Limit {
  max: number;
  windowMs: number;
}

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private timer: NodeJS.Timeout;

  constructor(private now: () => number = Date.now) {
    // Purge périodique des fenêtres expirées (mémoire bornée).
    this.timer = setInterval(() => this.sweep(), 60_000);
    this.timer.unref();
  }

  /** `null` si autorisé, sinon le nombre de secondes avant la prochaine fenêtre. */
  hit(key: string, limit: Limit): number | null {
    const t = this.now();
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + limit.windowMs });
      return null;
    }
    if (cur.count >= limit.max) return Math.ceil((cur.resetAt - t) / 1000);
    cur.count++;
    return null;
  }

  private sweep() {
    const t = this.now();
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }

  stop() {
    clearInterval(this.timer);
  }
}
