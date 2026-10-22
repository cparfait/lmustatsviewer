/**
 * Table des crans d'une voiture : à chaque index d'un réglage, le texte que le
 * garage affiche (« 7.0 deg », « 120 N/mm ») et, quand le jeu l'a dit, le nombre
 * de crans du réglage.
 *
 * Pourquoi : un `.svm` sauvé sans toucher à un réglage ne garde que l'affichage
 * (`RWSetting=//7.0 deg`, « commented out if using the default ») ; pour écrire
 * une autre valeur, il faut l'index. La table, apprise sur les fichiers du
 * pilote (lignes `Clé=12//7.0 deg`) et sur les bornes lues dans le jeu
 * (`getPlayerGarageData` : index, texte, nombre de crans), rend cet index.
 *
 * Clé de voiture : `<dossier du véhicule>/<version>` lu dans `//VEH=` (la
 * version change quand le jeu modifie la voiture : une table d'avant ne
 * contamine pas celle d'après). Module pur, sauf `loadNotchTables` /
 * `saveNotchTables` (config).
 */

import type { RestSettingBound, SetupEntry, SvmFile } from "@/lib/api";

/** Ce qu'on sait d'un réglage (`SECTION.Clé`). */
export interface NotchEntry {
  /** Index → texte affiché par le garage. */
  displays: Record<string, string>;
  /** Nombre de crans (index 0..count-1), quand le jeu l'a donné. */
  count?: number;
}

export type NotchTable = Record<string, NotchEntry>;
export type NotchTables = Record<string, NotchTable>;

export const NOTCH_TABLES_KEY = "setup_notch_tables";

/** Réglage figé sur cette voiture : rien à apprendre ni à écrire. */
const FIXED = /^(n\/a|non-adjustable|fixed|nicht einstellbar|non r[ée]glable)$/i;
const INT = /^-?\d+$/;

/** « Mercedes_AMGGT3Evo_2025/1.11 » depuis `//VEH=…\Vehicles\<dossier>\<version>\…`. */
export function carKeyOf(svm: Pick<SvmFile, "header">): string {
  const p = (svm.header.veh_path ?? "").replace(/\//g, "\\");
  const m = /\\Vehicles\\([^\\]+)\\([^\\]+)\\/i.exec(p);
  if (m) return `${m[1]}/${m[2]}`;
  return (svm.header.vehicle_class || "").trim();
}

export function paramId(section: string, key: string): string {
  return `${section.toUpperCase()}.${key}`;
}

function entry(table: NotchTable, id: string): NotchEntry {
  return (table[id] ??= { displays: {} });
}

/** Apprend les couples (index, affichage) écrits dans un `.svm`. Rend le nombre de couples neufs. */
export function learnFromSvm(table: NotchTable, svm: SvmFile): number {
  let added = 0;
  for (const sec of svm.sections) {
    for (const p of sec.params) {
      const v = p.value.trim();
      const d = (p.comment ?? "").trim();
      if (!INT.test(v) || !d || FIXED.test(d)) continue;
      const e = entry(table, paramId(sec.name, p.key));
      if (e.displays[v] !== d) {
        e.displays[v] = d;
        added++;
      }
    }
  }
  return added;
}

// ── Bornes du jeu (`getPlayerGarageData`) ────────────────────────────────────

/** Clés « véhicule » du jeu → clé `.svm` (section libre). */
const REST_VEHICLE: Record<string, string[]> = {
  VM_FRONT_ANTISWAY: ["FrontAntiSwaySetting"],
  VM_REAR_ANTISWAY: ["RearAntiSwaySetting"],
  VM_FRONT_WING: ["FWSetting", "FrontWingSetting"],
  VM_REAR_WING: ["RWSetting", "RearWingSetting"],
  VM_BRAKE_BALANCE: ["RearBrakeSetting"],
  VM_DIFF_POWER: ["DiffPowerSetting"],
  VM_DIFF_COAST: ["DiffCoastSetting"],
  VM_DIFF_PRELOAD: ["DiffPreloadSetting"],
  VM_FRONT_TOEIN: ["FrontToeInSetting"],
  VM_REAR_TOEIN: ["RearToeInSetting"],
  VM_FRONT_3RD_SPRING: ["Front3rdSpringSetting"],
  VM_FRONT_3RD_PACKERS: ["Front3rdPackerSetting"],
  VM_REAR_3RD_SPRING: ["Rear3rdSpringSetting"],
  VM_REAR_3RD_PACKERS: ["Rear3rdPackerSetting"],
};
/** Clés « roue » du jeu (`WM_<X>-W_FL`) → clé `.svm` dans la section de la roue. */
const REST_WHEEL: Record<string, string> = {
  SPRING: "SpringSetting",
  RIDEHEIGHT: "RideHeightSetting",
  CAMBER: "CamberSetting",
  PRESSURE: "PressureSetting",
  PACKERS: "PackerSetting",
  SLOWBUMP: "SlowBumpSetting",
  SLOWREBOUND: "SlowReboundSetting",
  FASTBUMP: "FastBumpSetting",
  FASTREBOUND: "FastReboundSetting",
};
const WHEEL_SECTION: Record<string, string> = { W_FL: "FRONTLEFT", W_FR: "FRONTRIGHT", W_RL: "REARLEFT", W_RR: "REARRIGHT" };

/** Le réglage `.svm` (`SECTION.Clé`) que vise une clé du jeu, parmi ceux du fichier. */
export function restTarget(restKey: string, svm: SvmFile): string | null {
  const k = restKey.toUpperCase();
  const w = /^WM_([A-Z0-9]+)-(W_[FR][LR])$/.exec(k);
  if (w) {
    const key = REST_WHEEL[w[1]];
    const sec = WHEEL_SECTION[w[2]];
    if (!key || !sec) return null;
    const s = svm.sections.find((x) => x.name.toUpperCase() === sec);
    return s?.params.some((p) => p.key === key) ? paramId(sec, key) : null;
  }
  const keys = REST_VEHICLE[k];
  if (!keys) return null;
  for (const s of svm.sections) {
    const p = s.params.find((x) => keys.includes(x.key));
    if (p) return paramId(s.name, p.key);
  }
  return null;
}

/**
 * Apprend les bornes lues dans le jeu, **seulement** si elles décrivent bien la
 * voiture de ce fichier : là où le fichier et le jeu sont au même index, le
 * texte doit être le même (un texte différent au même index = autre voiture) ;
 * là où le fichier n'a pas d'index (réglage par défaut) mais le même texte que
 * le jeu, l'index du jeu est le sien. Il faut au moins deux accords et aucun
 * désaccord. Rend vrai si la table a été enrichie.
 */
export function learnFromRest(table: NotchTable, bounds: RestSettingBound[] | null | undefined, svm: SvmFile): boolean {
  if (!bounds?.length) return false;
  const byId = new Map<string, RestSettingBound>();
  for (const b of bounds) {
    const id = restTarget(b.key, svm);
    if (id) byId.set(id, b);
  }
  let agree = 0;
  for (const s of svm.sections) {
    for (const p of s.params) {
      const b = byId.get(paramId(s.name, p.key));
      const d = (p.comment ?? "").trim();
      if (!b || !d || FIXED.test(d) || !b.text.trim()) continue;
      const v = p.value.trim();
      if (INT.test(v) && Number(v) === Math.round(b.value)) {
        if (b.text.trim() !== d) return false;
        agree++;
      } else if (!INT.test(v) && b.text.trim() === d) {
        agree++;
      }
    }
  }
  if (agree < 2) return false;
  for (const [id, b] of byId) {
    const e = entry(table, id);
    if (b.min === 0 && b.max > 0) e.count = Math.round(b.max);
    if (b.text.trim()) e.displays[String(Math.round(b.value))] = b.text.trim();
  }
  return true;
}

// ── Résolution d'un index ────────────────────────────────────────────────────

const NUM = /-?\d+(?:[.,]\d+)?/;

function numOf(display: string): number | null {
  const m = NUM.exec(display);
  return m ? Number(m[0].replace(",", ".")) : null;
}

/** L'unité d'un affichage (« 7.0 deg » → « deg ») : deux affichages ne se comparent que dans la même. */
function unitOf(display: string): string {
  return display.replace(/-?\d+(?:[.,]\d+)?/g, "#").trim();
}

/**
 * L'index d'un affichage pour ce réglage : correspondance exacte d'abord ;
 * sinon, si au moins deux couples connus de même unité tombent sur une même
 * pente (graduation régulière), l'index qu'elle donne (entier à 5 % près).
 * `null` si on ne sait pas.
 */
export function resolveIndex(e: NotchEntry | undefined, display: string): number | null {
  const d = display.trim();
  if (!e || !d) return null;
  for (const [i, txt] of Object.entries(e.displays)) if (txt === d) return Number(i);
  const target = numOf(d);
  if (target == null) return null;
  const unit = unitOf(d);
  const pts = Object.entries(e.displays)
    .filter(([, txt]) => unitOf(txt) === unit)
    .map(([i, txt]) => [Number(i), numOf(txt)] as const)
    .filter((x): x is readonly [number, number] => x[1] != null)
    .sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return null;
  const slopes = new Set<number>();
  for (let k = 1; k < pts.length; k++) {
    const di = pts[k][0] - pts[k - 1][0];
    if (di <= 0) continue;
    slopes.add(Math.round(((pts[k][1] - pts[k - 1][1]) / di) * 1e4) / 1e4);
  }
  if (slopes.size !== 1) return null;
  const slope = [...slopes][0];
  if (!slope) return null;
  const idx = pts[0][0] + (target - pts[0][1]) / slope;
  const r = Math.round(idx);
  if (Math.abs(idx - r) > 0.05 || r < 0) return null;
  if (e.count != null && r >= e.count) return null;
  return r;
}

/** Index le plus haut connu d'un réglage (nombre de crans − 1), sinon `null`. */
export function topIndex(e: NotchEntry | undefined): number | null {
  return e?.count != null && e.count > 0 ? e.count - 1 : null;
}

/**
 * Copie du `.svm` où chaque réglage resté « par défaut » (sans index) reçoit
 * l'index que la table permet de retrouver. `inferred` liste les réglages
 * complétés ainsi ; les autres restent tels quels.
 */
export function withResolvedIndices(svm: SvmFile, table: NotchTable | undefined): { svm: SvmFile; inferred: Set<string> } {
  const inferred = new Set<string>();
  if (!table) return { svm, inferred };
  const sections = svm.sections.map((s) => ({
    name: s.name,
    params: s.params.map((p) => {
      const d = (p.comment ?? "").trim();
      if (INT.test(p.value.trim()) || !d || FIXED.test(d)) return p;
      const id = paramId(s.name, p.key);
      const idx = resolveIndex(table[id], d);
      if (idx == null) return p;
      inferred.add(id);
      return { ...p, value: String(idx) };
    }),
  }));
  return { svm: { header: svm.header, sections }, inferred };
}

/** Fusionne deux tables (la seconde complète la première sans l'écraser). */
export function mergeTables(a: NotchTable, b: NotchTable): NotchTable {
  const out: NotchTable = structuredClone(a);
  for (const [id, e] of Object.entries(b)) {
    const t = entry(out, id);
    if (t.count == null && e.count != null) t.count = e.count;
    for (const [i, d] of Object.entries(e.displays)) t.displays[i] ??= d;
  }
  return out;
}

/** L'instantané `.svm` d'une entrée en base, ou `null` s'il est illisible. */
export function svmOfEntry(e: Pick<SetupEntry, "content_json">): SvmFile | null {
  if (!e.content_json) return null;
  try {
    const v = JSON.parse(e.content_json) as SvmFile;
    return v && Array.isArray(v.sections) && v.header ? v : null;
  } catch {
    return null;
  }
}

// ── Persistance (config) ─────────────────────────────────────────────────────

export async function loadNotchTables(): Promise<NotchTables> {
  const { config } = await import("@/lib/api");
  try {
    const raw = await config.get(NOTCH_TABLES_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === "object" ? (v as NotchTables) : {};
  } catch {
    return {};
  }
}

export async function saveNotchTables(t: NotchTables): Promise<void> {
  const { config } = await import("@/lib/api");
  await config.set(NOTCH_TABLES_KEY, JSON.stringify(t));
}

/**
 * Apprend d'un coup tout ce que l'on sait pour la voiture de `svm` : ce fichier,
 * les autres setups de la même voiture (instantanés en base) et, s'ils collent,
 * les bornes lues dans le jeu. Écrit la table si elle a changé et la rend.
 */
export async function learnForCar(
  svm: SvmFile,
  others: (SvmFile | null)[],
  bounds?: RestSettingBound[] | null,
): Promise<NotchTable> {
  const all = await loadNotchTables();
  const key = carKeyOf(svm);
  if (!key) return {};
  const table = all[key] ?? {};
  const before = JSON.stringify(table);
  learnFromSvm(table, svm);
  for (const o of others) if (o && carKeyOf(o) === key) learnFromSvm(table, o);
  learnFromRest(table, bounds, svm);
  if (JSON.stringify(table) !== before) {
    all[key] = table;
    await saveNotchTables(all).catch(() => {});
  }
  // Partage des setups (option de l'Atelier) : déclare la table, la complète par le
  // consensus de la communauté. Seule notre table est écrite en config.
  const { shareNotches } = await import("@/lib/setupSharing");
  return shareNotches(key, table).catch(() => table);
}
