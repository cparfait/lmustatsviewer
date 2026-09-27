/**
 * Arbitre éditorial de la radio (module pur, rejouable).
 *
 * Constat : chaque émetteur d'annonce (chronos, secteurs, écarts, trafic…) a sa
 * propre logique « au changement », et quand plusieurs ont une info vraie au même
 * instant — typiquement au passage de la ligne — elles partent toutes. Le pilote
 * encaisse alors quatre phrases là où un vrai muret en dit une.
 *
 * L'arbitre reçoit les **candidats** d'un même instant et rend ce qui est dit.
 * Trois lois, dans cet ordre :
 *  1. **La sécurité ne passe jamais par l'arbitre** : tout candidat `critical`
 *     (drapeau, carburant, crevaison, limiteur…) sort, tel quel, dans l'ordre.
 *  2. **On ne fabrique aucun fait** : la fusion colle des fragments déjà écrits
 *     par les émetteurs (même `group`), elle ne résume ni ne reformule.
 *  3. **Un candidat différé peut mourir** : seul un candidat marqué `retryS` est
 *     retenté aux instants suivants, jusqu'à sa péremption. Une vieille consigne
 *     est pire que le silence.
 *
 * S'y ajoutent l'**anti-radotage** par clé (`cooldownS` / `cooldownLaps` : une
 * clé déjà dite récemment est tue) et un garde-fou de **débit** (au plus
 * `BURST_MAX` annonces non critiques par fenêtre de `BURST_WINDOW_S`).
 *
 * Horloge = paramètre (`nowS`), jamais `Date.now()` → déterministe et testable.
 */

import type { VoicePriority } from "@/lib/voice";

export interface Candidate {
  /** Clé stable de l'émetteur (anti-radotage, dédoublonnage). */
  key: string;
  /** Texte déjà localisé. */
  text: string;
  prio: VoicePriority;
  /** Importance relative (0-100) entre candidats non critiques de même priorité. */
  score?: number;
  /** Groupe de fusion (ex. `lap` : fragments du point de tour). */
  group?: string;
  /** Ordre d'assemblage dans le groupe (plus petit = en tête). */
  order?: number;
  /** Silence minimal (s) avant de redire la même clé. */
  cooldownS?: number;
  /** Silence minimal (tours du joueur) avant de redire la même clé. */
  cooldownLaps?: number;
  /** Si dominé ou bridé : retenté pendant ce délai (s), puis périmé. */
  retryS?: number;
  /** TTL de la file vocale (ms) une fois prononcé. */
  ttlMs?: number;
}

export type RejectReason = "cooldown" | "dominated" | "burst" | "too-long" | "expired" | "duplicate";

export interface Decision {
  /** À prononcer, dans l'ordre (critiques d'abord, puis le dominant). */
  spoken: Candidate[];
  rejected: { c: Candidate; reason: RejectReason }[];
}

/** Au plus N annonces non critiques par fenêtre glissante (s). */
export const BURST_MAX = 3;
export const BURST_WINDOW_S = 12;
/** Nombre max de fragments collés dans une même phrase fusionnée. */
export const GROUP_MAX_FRAGMENTS = 2;

const RANK: Record<VoicePriority, number> = { critical: 3, normal: 2, chatty: 1, coach: 1 };

interface Fused extends Candidate {
  parts?: Candidate[];
}

const weight = (c: Candidate) => RANK[c.prio] * 1000 + (c.score ?? 0);

export class RadioArbiter {
  private said = new Map<string, { t: number; lap: number }>();
  private pending: { c: Candidate; until: number }[] = [];
  private recent: number[] = [];

  /** Oublie tout (nouvelle session). */
  reset(): void {
    this.said.clear();
    this.pending = [];
    this.recent = [];
  }

  /** Vrai si `key` a été prononcée il y a moins de `s` secondes. */
  saidWithin(key: string, nowS: number, s: number): boolean {
    const m = this.said.get(key);
    return !!m && nowS - m.t < s;
  }

  private onCooldown(c: Candidate, nowS: number, lap: number): boolean {
    const m = this.said.get(c.key);
    if (!m) return false;
    if (c.cooldownS != null && nowS - m.t < c.cooldownS) return true;
    if (c.cooldownLaps != null && lap - m.lap < c.cooldownLaps) return true;
    return false;
  }

  /**
   * `passthrough` (débit « complet ») : tout est dit, chacun sa phrase, sans
   * dominance ni plafond de débit — seuls les doublons et les clés en
   * anti-radotage explicite (`cooldown*`) sont écartés.
   */
  decide(cands: Candidate[], nowS: number, lap: number, passthrough = false): Decision {
    const rejected: Decision["rejected"] = [];
    if (passthrough) {
      const seen = new Set<string>();
      const spoken: Candidate[] = [];
      for (const c of cands) {
        if (seen.has(c.key)) rejected.push({ c, reason: "duplicate" });
        else if (c.prio !== "critical" && this.onCooldown(c, nowS, lap)) rejected.push({ c, reason: "cooldown" });
        else {
          seen.add(c.key);
          spoken.push(c);
          this.said.set(c.key, { t: nowS, lap });
        }
      }
      return { spoken, rejected };
    }

    // Différés encore frais d'abord (ils ont attendu), puis les nouveaux.
    const carried: Candidate[] = [];
    for (const p of this.pending) {
      if (p.until > nowS) carried.push(p.c);
      else rejected.push({ c: p.c, reason: "expired" });
    }
    this.pending = [];

    const seen = new Set<string>();
    const live: Candidate[] = [];
    for (const c of [...carried, ...cands]) {
      if (seen.has(c.key)) {
        rejected.push({ c, reason: "duplicate" });
        continue;
      }
      seen.add(c.key);
      // Loi 1 : la sécurité ignore l'anti-radotage (l'émetteur gère son front).
      if (c.prio !== "critical" && this.onCooldown(c, nowS, lap)) {
        rejected.push({ c, reason: "cooldown" });
        continue;
      }
      live.push(c);
    }

    const critical = live.filter((c) => c.prio === "critical");
    const others = live.filter((c) => c.prio !== "critical");

    // Loi 2 : fusion des fragments d'un même groupe (collage, jamais de résumé).
    const pool: Fused[] = [];
    const groups = new Map<string, Candidate[]>();
    for (const c of others) {
      if (c.group) {
        const g = groups.get(c.group) ?? [];
        g.push(c);
        groups.set(c.group, g);
      } else pool.push(c);
    }
    for (const [g, list] of groups) {
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const keep = list.slice(0, GROUP_MAX_FRAGMENTS);
      for (const c of list.slice(GROUP_MAX_FRAGMENTS)) rejected.push({ c, reason: "too-long" });
      if (keep.length === 1) {
        pool.push(keep[0]);
        continue;
      }
      const top = keep.reduce((a, b) => (RANK[b.prio] > RANK[a.prio] ? b : a));
      pool.push({
        key: `group:${g}`,
        text: keep.map((c) => c.text).join(", "),
        prio: top.prio,
        score: Math.max(...keep.map((c) => c.score ?? 0)),
        ttlMs: Math.max(...keep.map((c) => c.ttlMs ?? 0)) || undefined,
        parts: keep,
      });
    }

    // Une seule radio dominante non critique par instant.
    let dominant: Fused | null = null;
    for (const c of pool) if (!dominant || weight(c) > weight(dominant)) dominant = c;
    const defer = (c: Fused, reason: RejectReason) => {
      if (c.retryS && c.retryS > 0 && !c.parts) this.pending.push({ c, until: nowS + c.retryS });
      else rejected.push({ c, reason });
    };
    for (const c of pool) if (c !== dominant) defer(c, "dominated");

    // Garde-fou de débit.
    this.recent = this.recent.filter((t) => nowS - t < BURST_WINDOW_S);
    const spoken: Candidate[] = [...critical];
    if (dominant) {
      if (this.recent.length >= BURST_MAX) defer(dominant, "burst");
      else {
        spoken.push(dominant);
        this.recent.push(nowS);
      }
    }

    // Mémoire d'anti-radotage : chaque fragment prononcé compte pour sa clé.
    for (const c of spoken) {
      for (const part of (c as Fused).parts ?? [c]) this.said.set(part.key, { t: nowS, lap });
    }
    return { spoken, rejected };
  }
}
