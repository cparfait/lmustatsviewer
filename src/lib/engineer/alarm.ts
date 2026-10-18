/**
 * Réveil radio (module pur) : « réveille-moi à 14 h 30 », « préviens-moi dans
 * 20 minutes » — utile en endurance pour un changement de pilote, un repas, une
 * relève. Heure de l'horloge du PC (pas du jeu).
 */

/** Une alarme posée : échéance en millisecondes epoch. */
export interface Alarm {
  at: number;
  /** Libellé lu à l'échéance (« 14 h 30 », « 20 minutes »). */
  label: string;
}

/**
 * Lit l'échéance dans une phrase normalisée (`router.normalize`) :
 * « a 14 h 30 », « 14 30 », « at 2 30 pm », « dans 20 minutes », « in 20 minutes ».
 * `now` en ms epoch. `null` si rien de lisible.
 */
export function parseAlarm(norm: string, now: number): Alarm | null {
  const n = ` ${norm} `;
  const rel = / (?:dans|in|en|tra|fra|zwischen|in) (\d{1,3}) ?(minutes?|min|minutos?|minuten?|minut[oi]|heures?|hours?|horas?|stunden?|or[ae]) /.exec(n);
  if (rel) {
    const v = Number(rel[1]);
    const hours = /^(h|ho|st|or)/.test(rel[2]);
    const ms = v * (hours ? 3_600_000 : 60_000);
    if (ms <= 0 || ms > 24 * 3_600_000) return null;
    return { at: now + ms, label: `${v} ${hours ? "h" : "min"}` };
  }
  const abs = / (\d{1,2}) ?(?:h|heures?|hours?|uhr|:)? ?(\d{2})? ?(am|pm)? /.exec(n);
  if (!abs) return null;
  // Exige un indice d'heure (« à », « at », « h », « uhr »…) pour ne pas lire n'importe quel nombre.
  if (!/ (a|at|um|alle|las|pour|for) \d| \d{1,2} ?(h|heures?|uhr|hours?) | \d{1,2} \d{2} /.test(n)) return null;
  let h = Number(abs[1]);
  const m = abs[2] ? Number(abs[2]) : 0;
  if (abs[3] === "pm" && h < 12) h += 12;
  if (abs[3] === "am" && h === 12) h = 0;
  if (h > 23 || m > 59) return null;
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return { at: d.getTime(), label: `${h} h ${String(m).padStart(2, "0")}` };
}

/** Alarmes en attente (une seule par échéance). */
export class AlarmClock {
  private list: Alarm[] = [];

  add(a: Alarm) {
    if (!this.list.some((x) => Math.abs(x.at - a.at) < 30_000)) this.list.push(a);
  }

  clear() {
    this.list = [];
  }

  get pending(): Alarm[] {
    return [...this.list];
  }

  /** Alarmes échues (retirées de la liste). */
  due(now: number): Alarm[] {
    const done = this.list.filter((a) => a.at <= now);
    this.list = this.list.filter((a) => a.at > now);
    return done;
  }
}
