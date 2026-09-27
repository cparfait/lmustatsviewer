/**
 * Page « Classement » (COMMUNITY-SPEC.md §9, lot 4) : position du joueur parmi les
 * pilotes de la communauté, sur chaque combo roulé, calculée automatiquement à partir
 * de ses meilleurs tours locaux. Classements ouverts à tous : la page fonctionne même
 * si le joueur ne partage pas ses tours (il n'y apparaît simplement pas).
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Car, ChevronDown, ExternalLink, Flag, Globe, Loader2, Package, Route, Share2, Star, Tag, Target, Timer, Trophy, Users, X } from "lucide-react";
import { ClassBadge } from "@/components/ClassBadge";
import { CarLogo } from "@/components/CarLogo";
import { Card, CardContent } from "@/components/ui/card";
import { FilterField } from "@/components/FilterField";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrackFlag } from "@/components/TrackFlag";
import { Button } from "@/components/ui/button";
import {
  community,
  isTauri,
  type CommunityDetail,
  type CommunityLeaderboard,
  type CommunityPosition,
  type CommunityStats,
  type CommunityStatus,
  type MyCombo,
} from "@/lib/api";
import { cn, formatTime } from "@/lib/utils";
import { useAppStore } from "@/stores/app";
import { TierBadge } from "@/components/TierBadge";
import { fetchBenchmarks, type PaceBenchmark } from "@/lib/ohne_speed";
import { References } from "@/routes/References";

const RANKED_MIN = 20;
/** Bloc « performance » teinté + séparateurs, comme les tableaux du tableau de bord. */
const PERF_HEAD = "bg-sky-500/10";
const PERF_CELL = "bg-sky-500/[0.06]";
const GROUP_SEP = "border-l border-border/55";
const SITE = "https://lmu.cparfait.ovh";

/** Pilote du record d'un combo (format du classement : nom, ou anonyme avec son repère). */
interface RecordHolder {
  name: string | null;
  tag: string;
  homonym: boolean;
}

interface Row {
  combo: MyCombo;
  pos: CommunityPosition | null;
  /** Requête serveur du combo, filtres Session / Mode / Version compris. */
  q: Record<string, string>;
  /** Détenteur du meilleur temps du combo (liste `combos` du serveur). */
  leader?: RecordHolder | null;
}

const recordKey = (track: string, course: string, cls: string) => `${track}|${course}|${cls}`;

const comboQuery = (c: MyCombo) => ({ track: c.track, course: c.track_course, class: c.car_class });
/** Page du combo sur le site (mêmes filtres) ; `me` y épingle la ligne du joueur (repère public). */
const siteUrlFor = (q: Record<string, string>, myTag?: string | null) =>
  `${SITE}/combo.html?${new URLSearchParams({ ...q, ...(myTag ? { me: myTag } : {}) }).toString()}`;

/** « 1.4200 » → « 1.42 » (version majeure.mineure du serveur, cf. `gameMinor` côté serveur). */
const gameMinor = (v: string) => {
  const [major, frac = ""] = v.split(".");
  return `${Number(major)}.${frac.padEnd(2, "0").slice(0, 2)}`;
};

/**
 * Libellé de position lisible : « Top X % » dans la moitié haute, « Derniers X % » dans
 * la moitié basse (171ᵉ / 208 = « Derniers 19 % », pas un « Top 83 % » trompeur).
 */
/** Suffixe ordinal anglais (1st, 2nd, 3rd, 4th, 11th…) ; les autres langues l'ont dans le texte. */
const enSuffix = (n: number) =>
  n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");

function standing(t: (k: string, o?: Record<string, unknown>) => string, topPct: number, rank?: number, n?: number) {
  if (rank === 1) return { label: t("leaderboard.first"), tone: "text-emerald-500" };
  // Moins de 20 pilotes : un pourcentage n'a pas de sens (« Derniers 25 % » = dernier sur 4).
  if (rank != null && n != null && n < RANKED_MIN) {
    if (rank === n) return { label: t("leaderboard.last"), tone: "text-orange-500" };
    return {
      label: t("leaderboard.nth", { n: rank, sfx: enSuffix(rank) }),
      tone: rank <= n / 2 ? "text-emerald-500" : "text-orange-500",
    };
  }
  if (topPct <= 50) return { label: t("leaderboard.top", { pct: topPct }), tone: "text-emerald-500" };
  const bottom = rank && n ? Math.max(1, Math.ceil(((n - rank + 1) / n) * 100)) : Math.max(1, 101 - topPct);
  return { label: t("leaderboard.bottom", { pct: bottom }), tone: "text-orange-500" };
}

function Tile({ label, value, sub, icon: Icon, accent }: { label: string; value: string; sub?: string; icon: typeof Star; accent?: string }) {
  return (
    <div className="relative rounded-lg border border-border/60 bg-card px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold ${accent ?? ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

/** Jauge verte → rouge : position du joueur (trait blanc) et médiane (trait sombre). */
/** Place sur la jauge : 1er = 0 % (vert, à gauche), dernier = 100 % (rouge, à droite). Seul = 1er. */
const gaugePct = (rank: number, drivers: number) => (drivers <= 1 ? 0 : ((rank - 1) / (drivers - 1)) * 100);

function Gauge({ pct }: { pct: number }) {
  return (
    <div className="relative h-2 w-36 rounded-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 opacity-90">
      <div className="absolute -top-0.5 left-1/2 h-3 w-px bg-foreground/70" />
      <div
        className="absolute -top-1.5 h-5 w-1 rounded-sm bg-white shadow-[0_0_0_2px_rgba(0,0,0,0.6)]"
        style={{ left: `calc(${Math.min(100, Math.max(0, pct))}% - 2px)` }}
      />
    </div>
  );
}

function Histogram({ detail, me, youLabel, medianLabel }: { detail: CommunityDetail; me: number; youLabel: string; medianLabel: string }) {
  const { start, width, counts } = detail.histogram;
  const W = 640, H = 200, L = 30, R = 10, T = 22, B = 24;
  const hi = start + counts.length * width;
  const max = Math.max(1, ...counts);
  const sx = (t: number) => L + ((t - start) / (hi - start)) * (W - L - R);
  const sy = (n: number) => H - B - (n / max) * (H - B - T);
  const meBin = Math.floor((me - start) / width);
  const ticks: number[] = [];
  const step = Math.max(1, Math.ceil((hi - start) / 6));
  for (let t = Math.ceil(start); t <= hi; t += step) ticks.push(t);
  const med = detail.percentiles.p50;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full">
      {counts.map((n, i) => (
        <rect
          key={i}
          x={sx(start + i * width) + 1.5}
          y={sy(n)}
          width={Math.max(1, sx(start + (i + 1) * width) - sx(start + i * width) - 3)}
          height={H - B - sy(n)}
          rx={2}
          className={i === meBin ? "fill-amber-400" : "fill-emerald-500/50"}
        />
      ))}
      {ticks.map((t) => (
        <text key={t} x={sx(t)} y={H - 6} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">
          {formatTime(t).slice(0, -4)}
        </text>
      ))}
      {med != null && (
        <g>
          <line x1={sx(med)} x2={sx(med)} y1={T - 4} y2={H - B} className="stroke-muted-foreground" strokeDasharray="3 4" />
          <text x={sx(med) + 3} y={T + 4} className="fill-muted-foreground text-[10px] font-bold">{medianLabel}</text>
        </g>
      )}
      {me >= start && me <= hi && (
        <g>
          <line x1={sx(me)} x2={sx(me)} y1={T + 12} y2={H - B} className="stroke-amber-400" strokeWidth={2.5} />
          <text x={sx(me)} y={T + 8} textAnchor="middle" className="fill-amber-500 text-[11px] font-extrabold">{youLabel}</text>
        </g>
      )}
    </svg>
  );
}

function ComboDetail({ row, myTag }: { row: Row; myTag?: string | null }) {
  const { t } = useTranslation();
  const playerName = useAppStore((s) => s.playerName);
  const [detail, setDetail] = useState<CommunityDetail | null>(null);
  const [around, setAround] = useState<(CommunityLeaderboard["rows"][number] | null)[]>([]);

  useEffect(() => {
    const q = row.q;
    community.get<CommunityDetail>("combos/detail", q).then(setDetail).catch(() => {});
    const rank = row.pos?.rank ?? 1;
    Promise.all([
      community.get<CommunityLeaderboard>("combos/leaderboard", { ...q, limit: 3, offset: 0 }),
      community.get<CommunityLeaderboard>("combos/leaderboard", { ...q, limit: 4, offset: Math.max(3, rank - 3) }),
    ])
      .then(([top, near]) => {
        const rows: (CommunityLeaderboard["rows"][number] | null)[] = [...(top?.rows ?? [])];
        const nearRows = (near?.rows ?? []).filter((r) => r.rank > 3);
        if (nearRows.length && nearRows[0].rank > 4) rows.push(null);
        setAround([...rows, ...nearRows]);
      })
      .catch(() => {});
  }, [row]);

  const name = (d: CommunityLeaderboard["rows"][number]["driver"]) =>
    d.name ? (d.homonym ? `${d.name} · ${d.tag}` : d.name) : t("leaderboard.anonDriver", { tag: d.tag });
  const siteUrl = siteUrlFor(row.q, myTag);

  return (
    <div className="grid gap-0 border-t border-border/60 bg-muted/20 lg:grid-cols-[1.4fr_1fr]">
      <div className="p-4">
        <p className="text-sm font-semibold">{t("leaderboard.distTitle")}</p>
        {detail && (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              {t("leaderboard.distSub", { count: detail.drivers, version: detail.version })}
            </p>
            <Histogram detail={detail} me={row.combo.best} youLabel={t("leaderboard.histYou")} medianLabel={t("leaderboard.median")} />
          </>
        )}
      </div>
      <div className="border-t border-border/60 p-4 lg:border-l lg:border-t-0">
        <p className="text-sm font-semibold">{t("leaderboard.aroundTitle")}</p>
        <p className="mb-2 text-xs text-muted-foreground">{t("leaderboard.aroundSub")}</p>
        <table className="w-full text-sm">
          <tbody>
            {around.map((r, i) =>
              r === null ? (
                <tr key={`gap${i}`}>
                  <td colSpan={3} className="py-0.5 text-center text-muted-foreground">⋯</td>
                </tr>
              ) : (
                <tr key={r.rank + r.driver.tag} className={r.driver.name === playerName ? "bg-amber-400/10 font-bold" : ""}>
                  <td className="w-10 py-1 font-mono">{r.rank}</td>
                  <td className="py-1">
                    {name(r.driver)}
                    {r.driver.name === playerName && ` (${t("leaderboard.you")})`}
                  </td>
                  <td className="py-1 pr-2 text-right font-mono">{formatTime(r.time)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        <a href={siteUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <ExternalLink className="h-3.5 w-3.5" />
          {t("leaderboard.openSite")}
        </a>
      </div>
    </div>
  );
}

/**
 * Page « Classements » : onglet « Ma position » (communauté + niveau OhneSpeed par combo)
 * et onglet « Références OhneSpeed » (la page Références, inchangée). Si l'option
 * OhneSpeed est désactivée, ni onglet ni colonne : la page Classement seule.
 */
export function Classement() {
  const { t } = useTranslation();
  const showOhneSpeed = useAppStore((s) => s.showOhneSpeed);
  const [params, setParams] = useSearchParams();
  const tab = showOhneSpeed && params.get("tab") === "references" ? "references" : "position";
  const setTab = (v: "position" | "references") => setParams(v === "references" ? { tab: v } : {}, { replace: true });

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 px-4 py-6">
      {showOhneSpeed && (
        <div className="inline-flex rounded-lg border border-border/60 bg-card p-1">
          {(["position", "references"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setTab(v)}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                tab === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(v === "position" ? "leaderboard.tabMine" : "leaderboard.tabRefs")}
            </button>
          ))}
        </div>
      )}
      {tab === "references" ? <References /> : <MyPosition showOhne={showOhneSpeed} />}
    </div>
  );
}

function MyPosition({ showOhne }: { showOhne: boolean }) {
  const { t } = useTranslation();
  const dataVersion = useAppStore((s) => s.dataVersion);
  const [benchmarks, setBenchmarks] = useState<PaceBenchmark[] | null>(null);
  useEffect(() => {
    if (showOhne) fetchBenchmarks().then(setBenchmarks).catch(() => setBenchmarks(null));
  }, [showOhne]);
  const [status, setStatus] = useState<CommunityStatus | null>(null);
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Filtres (barre + clic sur une cellule, comme Sessions / Records).
  const [fTrack, setFTrack] = useState("");
  const [fCourse, setFCourse] = useState("");
  const [fClass, setFClass] = useState("");
  const [fCar, setFCar] = useState("");
  const [fSession, setFSession] = useState<"" | "race" | "qualify" | "practice">("");
  const [fMode, setFMode] = useState<"" | "online" | "offline">("");
  const gameVersions = useAppStore((s) => s.gameVersions);
  const selectedVersion = useAppStore((s) => s.selectedVersion);
  const setSelectedVersion = useAppStore((s) => s.setSelectedVersion);
  const versionExact = useAppStore((s) => s.versionExact);
  const setVersionExact = useAppStore((s) => s.setVersionExact);
  const hasFilters = !!(fTrack || fCourse || fClass || fCar || fSession || fMode);
  const clearFilters = () => {
    setFTrack("");
    setFCourse("");
    setFClass("");
    setFCar("");
    setFSession("");
    setFMode("");
  };
  /** Clic sur une cellule : filtre sur sa valeur (re-clic = retire le filtre). */
  const cellFilter = (setter: (v: string) => void, current: string, value: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setter(current === value ? "" : value);
  };

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    (async () => {
      setOffline(false);
      community.status().then((s) => !cancelled && setStatus(s)).catch(() => {});
      const mine = await community
        .myCombos({
          session: fSession || undefined,
          mode: fMode || undefined,
          version: selectedVersion,
          version_exact: versionExact,
        })
        .catch(() => [] as MyCombo[]);
      // Filtres serveur équivalents. Version : « = v » → sa version mineure ; « ≥ v » → toutes
      // les versions du serveur à partir de celle-là ; aucune → la plus récente de chaque combo.
      const extra: Record<string, string> = {};
      if (fSession) extra.session = fSession;
      if (fMode) extra.mode = fMode;
      let st: CommunityStats | null = null;
      try {
        st = await community.get<CommunityStats>("stats");
        if (selectedVersion) {
          const min = gameMinor(selectedVersion);
          const list = versionExact
            ? [min]
            : ((await community.get<{ versions: { version: string }[] }>("combos"))?.versions ?? [])
                .map((v) => v.version)
                .filter((v) => v.localeCompare(min, undefined, { numeric: true }) >= 0);
          extra.version = (list.length ? list : [min]).join(",");
        }
      } catch {
        if (!cancelled) {
          setOffline(true);
          setRows(mine.map((combo) => ({ combo, pos: null, q: { ...comboQuery(combo), ...extra } })));
        }
        return;
      }
      if (!cancelled) setStats(st);
      // Pilote du record de chaque combo : une seule requête, mêmes filtres que les positions.
      const leaders = new Map<string, RecordHolder>();
      try {
        const list = await community.get<{
          combos: { track: string; track_course: string; car_class: string; best_driver?: RecordHolder }[];
        }>("combos", extra);
        for (const c of list?.combos ?? []) {
          if (c.best_driver) leaders.set(recordKey(c.track, c.track_course, c.car_class), c.best_driver);
        }
      } catch {
        /* colonne vide : les positions restent affichées */
      }
      // Positions par petits paquets (pas de rafale sur le serveur).
      const out: Row[] = [];
      for (let i = 0; i < mine.length; i += 4) {
        const part = await Promise.all(
          mine.slice(i, i + 4).map(async (combo) => {
            const q = { ...comboQuery(combo), ...extra };
            return {
              combo,
              q,
              pos: await community.get<CommunityPosition>("combos/position", { ...q, time: combo.best }).catch(() => null),
              leader: leaders.get(recordKey(combo.track, combo.track_course, combo.car_class)) ?? null,
            };
          }),
        );
        out.push(...part);
      }
      if (!cancelled) setRows(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion, fSession, fMode, selectedVersion, versionExact]);

  const options = useMemo(() => {
    const all = rows ?? [];
    const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
    return {
      tracks: uniq(all.map((r) => r.combo.track)),
      courses: uniq(all.filter((r) => !fTrack || r.combo.track === fTrack).map((r) => r.combo.track_course)),
      classes: uniq(all.map((r) => r.combo.car_class)),
      cars: uniq(all.filter((r) => !fClass || r.combo.car_class === fClass).map((r) => r.combo.car_model)),
    };
  }, [rows, fTrack, fClass]);

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows ?? []) {
      const c = r.combo;
      if ((fTrack && c.track !== fTrack) || (fCourse && c.track_course !== fCourse)) continue;
      if ((fClass && c.car_class !== fClass) || (fCar && c.car_model !== fCar)) continue;
      m.set(c.track, [...(m.get(c.track) ?? []), r]);
    }
    // Dans chaque circuit, regroupement par TRACÉ : le principal (même nom que le circuit)
    // d'abord, puis les plus fournis ; l'ordre d'origine est gardé à l'intérieur d'un tracé.
    return [...m.entries()].map(([track, list]) => {
      const count = new Map<string, number>();
      for (const r of list) count.set(r.combo.track_course, (count.get(r.combo.track_course) ?? 0) + 1);
      const rank = (c: string) => (c === track ? -1e9 : -(count.get(c) ?? 0));
      const sorted = list
        .map((r, i) => ({ r, i }))
        .sort((a, b) => rank(a.r.combo.track_course) - rank(b.r.combo.track_course) || a.r.combo.track_course.localeCompare(b.r.combo.track_course) || a.i - b.i)
        .map((x) => x.r);
      return [track, sorted] as [string, Row[]];
    });
  }, [rows, fTrack, fCourse, fClass, fCar]);

  // Tous les combos où le joueur a une place (provisoires compris, comme le tableau) ;
  // « définitifs » = 20 pilotes ou plus.
  const placed = (rows ?? []).filter((r) => r.pos);
  const ranked = placed.filter((r) => r.pos!.drivers >= RANKED_MIN);
  const myTag = status?.registered ? status.tag : null;
  // Place réelle, de 0 (1er) à 1 (dernier) : le « top % » ne compare pas (1er sur 1 = top 100 %).
  const place = (r: Row) => gaugePct(r.pos!.rank, r.pos!.drivers) / 100;
  // Meilleur classement : meilleure place, puis le plus disputé (un record à 10 pilotes > à 1).
  const best = placed.reduce<Row | null>(
    (a, r) => (!a || place(r) < place(a) || (place(r) === place(a) && r.pos!.drivers > a.pos!.drivers) ? r : a),
    null,
  );
  // Position moyenne, exprimée comme un « top % » (1er partout = top 1 %).
  const avg = placed.length
    ? Math.max(1, Math.round((placed.reduce((s, r) => s + place(r), 0) / placed.length) * 100))
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("leaderboard.title")} <span className="text-primary">{t("leaderboard.titleAccent")}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("leaderboard.subtitle")}{" "}
            <a href={myTag ? `${SITE}/?${new URLSearchParams({ me: myTag })}` : SITE} target="_blank" rel="noreferrer" className="underline">
              {t("leaderboard.siteLink")} ↗
            </a>
          </p>
        </div>
        {status?.enabled ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {t("leaderboard.sharingOn", { count: status.sent })}
          </div>
        ) : (
          status && (
            <div className="flex max-w-xl items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t("leaderboard.sharingOff")}</span>
              <Button asChild size="sm" className="shrink-0 gap-1.5">
                <Link to="/config?cat=community">
                  <Share2 className="h-3.5 w-3.5" />
                  {t("leaderboard.goConfig")}
                </Link>
              </Button>
            </div>
          )
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile
          label={t("leaderboard.tileCombos")}
          value={String(placed.length)}
          sub={t("leaderboard.tileCombosSub", { count: rows?.length ?? 0, ranked: ranked.length })}
          icon={Target}
        />
        <Tile
          label={t("leaderboard.tileBest")}
          value={best ? standing(t, best.pos!.top_pct, best.pos!.rank, best.pos!.drivers).label : "—"}
          sub={best ? `${best.combo.track} · ${best.combo.car_class} · ${best.pos!.rank}/${best.pos!.drivers}` : undefined}
          icon={Star}
          accent={best ? standing(t, best.pos!.top_pct, best.pos!.rank, best.pos!.drivers).tone : undefined}
        />
        <Tile
          label={t("leaderboard.tileAvg")}
          value={avg != null ? standing(t, avg).label : "—"}
          sub={t("leaderboard.tileAvgSub")}
          icon={Trophy}
          accent={avg != null ? standing(t, avg).tone : undefined}
        />
        <Tile label={t("leaderboard.tileShared")} value={String(status?.sent ?? 0)} icon={Share2} />
        <Tile
          label={t("leaderboard.tileDrivers")}
          value={stats ? stats.drivers.toLocaleString() : "—"}
          sub={stats ? t("leaderboard.tileDriversSub", { count: stats.drivers_7d }) : undefined}
          icon={Users}
        />
      </div>

      {offline && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          {t("leaderboard.offline")}
        </p>
      )}

      <div className="rounded-lg bg-gradient-to-r from-primary to-primary/80 px-4 py-2.5 text-sm font-bold text-primary-foreground">
        {t("leaderboard.banner")}
      </div>

      {rows === null && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("leaderboard.loading")}
        </p>
      )}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">{t("leaderboard.empty")}</p>}

      {rows !== null && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <FilterField
              icon={Flag}
              label={t("sessions.fCircuit")}
              value={fTrack}
              onChange={(v) => {
                setFTrack(v);
                setFCourse("");
              }}
              options={[{ value: "", label: t("sessions.allTracks") }, ...options.tracks.map((v) => ({ value: v, label: v }))]}
            />
            {options.courses.length > 0 && (
              <FilterField
                icon={Route}
                label={t("sessions.fLayout")}
                value={fCourse}
                onChange={setFCourse}
                options={[{ value: "", label: t("sessions.allLayouts") }, ...options.courses.map((v) => ({ value: v, label: v }))]}
              />
            )}
            <FilterField
              icon={Tag}
              label={t("sessions.fClass")}
              value={fClass}
              onChange={(v) => {
                setFClass(v);
                setFCar("");
              }}
              options={[{ value: "", label: t("sessions.allClasses") }, ...options.classes.map((v) => ({ value: v, label: v }))]}
            />
            <FilterField
              icon={Car}
              label={t("sessions.fCar")}
              value={fCar}
              onChange={setFCar}
              className="max-w-[260px]"
              options={[{ value: "", label: t("sessions.allCars") }, ...options.cars.map((v) => ({ value: v, label: v }))]}
            />
            <FilterField
              icon={Timer}
              label={t("sessions.fSession")}
              value={fSession}
              onChange={(v) => setFSession(v as typeof fSession)}
              options={[
                { value: "", label: t("sessions.allTypes") },
                { value: "race", label: t("leaderboard.sRace") },
                { value: "qualify", label: t("leaderboard.sQualify") },
                { value: "practice", label: t("leaderboard.sPractice") },
              ]}
            />
            <FilterField
              icon={Globe}
              label={t("sessions.fMode")}
              value={fMode}
              onChange={(v) => setFMode(v as typeof fMode)}
              options={[
                { value: "", label: t("sessions.allSettings") },
                { value: "online", label: t("sessions.online") },
                { value: "offline", label: t("sessions.offline") },
              ]}
            />
            {gameVersions.length > 0 && (
              <FilterField
                icon={Package}
                label={t("sessions.fVersion")}
                value={selectedVersion ?? ""}
                onChange={(v) => setSelectedVersion(v || null)}
                options={[
                  { value: "", label: t("header.allVersions") },
                  ...gameVersions.map((v) => ({ value: v, label: `${versionExact ? "=" : "≥"} ${v}` })),
                ]}
              />
            )}
            {gameVersions.length > 0 && selectedVersion && (
              <label className="flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={versionExact}
                  onChange={(e) => setVersionExact(e.target.checked)}
                />
                {t("sessions.versionExact")}
              </label>
            )}
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-9 gap-1 text-xs text-muted-foreground" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" /> {t("sessions.clearFilters")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      {!!rows?.length && groups.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("leaderboard.noMatch")}</p>
      )}

      {groups.map(([track, list]) => {
        const isCollapsed = collapsed.has(track);
        return (
          // Même présentation que les tableaux du tableau de bord : en-tête de circuit
          // repliable, ligne de titres contrastée, bloc « performance » teinté.
          <Card key={track} className="overflow-hidden">
            <div
              className="group flex cursor-pointer items-center gap-2 bg-primary/30 px-3 py-1.5 transition-colors hover:bg-primary/40 dark:bg-primary/25"
              onClick={() =>
                setCollapsed((s) => {
                  const n = new Set(s);
                  if (n.has(track)) n.delete(track);
                  else n.add(track);
                  return n;
                })
              }
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 text-yellow-700 transition-transform dark:text-yellow-300", isCollapsed && "-rotate-90")}
              />
              <TrackFlag track={track} className="h-3.5 w-auto rounded-[2px] shadow-sm ring-1 ring-black/20" />
              <span
                className="text-xs font-semibold uppercase tracking-[0.12em] text-yellow-700 hover:underline dark:text-yellow-300"
                title={t("leaderboard.clickFilter")}
                onClick={cellFilter(setFTrack, fTrack, track)}
              >
                {track}
              </span>
              <span className="rounded-full bg-primary/20 px-1.5 py-0 text-micro font-bold tabular-nums text-yellow-700 dark:text-yellow-300">
                {list.length}
              </span>
            </div>
            {!isCollapsed && (
              <div className="overflow-x-auto">
                {/* Largeurs fixes : colonnes alignées d'un circuit à l'autre. */}
                <Table className="w-full min-w-[1000px] table-fixed text-xs">
                  <colgroup>
                    <col className="w-[110px]" />
                    <col />
                    <col className="w-[120px]" />
                    {showOhne && <col className="w-[130px]" />}
                    <col className="w-[110px]" />
                    <col className="w-[130px]" />
                    <col className="w-[180px]" />
                    <col className="w-[110px]" />
                    <col className="w-[170px]" />
                    <col className="w-[90px]" />
                  </colgroup>
                  <TableHeader>
                    <TableRow className="border-primary/40">
                      <TableHead className="font-medium text-left">{t("leaderboard.colClass")}</TableHead>
                      <TableHead className="font-medium text-left">{t("leaderboard.colCar")}</TableHead>
                      <TableHead className={cn("font-medium text-right", GROUP_SEP, PERF_HEAD)}>{t("leaderboard.colTime")}</TableHead>
                      {showOhne && <TableHead className={cn("font-medium text-center", PERF_HEAD)}>{t("leaderboard.colLevel")}</TableHead>}
                      <TableHead className={cn("font-medium text-center", PERF_HEAD)}>{t("leaderboard.colRank")}</TableHead>
                      <TableHead className={cn("font-medium text-left", PERF_HEAD)}>{t("leaderboard.colTop")}</TableHead>
                      <TableHead className={cn("font-medium text-left", PERF_HEAD)}>{t("leaderboard.colWhere")}</TableHead>
                      <TableHead className={cn("font-medium text-right", PERF_HEAD)}>{t("leaderboard.colGap")}</TableHead>
                      <TableHead className={cn("font-medium text-left", GROUP_SEP)}>{t("leaderboard.colLeader")}</TableHead>
                      <TableHead className="font-medium" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((r, i) => {
                      const key = `${r.combo.track}|${r.combo.track_course}|${r.combo.car_class}`;
                      // Sous-titre de tracé : plusieurs tracés dans ce circuit, ou un seul au nom différent.
                      const courses = new Set(list.map((x) => x.combo.track_course));
                      const withCourses = courses.size > 1 || list[0].combo.track_course !== track;
                      const newCourse = withCourses && (i === 0 || list[i - 1].combo.track_course !== r.combo.track_course);
                      const isRanked = !!r.pos && r.pos.drivers >= RANKED_MIN;
                      const isOpen = open === key;
                      // Position affichée dès le 1er pilote (comme sur le site) ; sous 20 pilotes,
                      // le classement est simplement signalé « provisoire ».
                      const st = r.pos ? standing(t, r.pos.top_pct, r.pos.rank, r.pos.drivers) : null;
                      return (
                        <Fragment key={key}>
                          {newCourse && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell
                                colSpan={showOhne ? 10 : 9}
                                className="border-t border-primary/25 bg-primary/[0.07] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-yellow-700 dark:text-yellow-300"
                              >
                                <span
                                  className="cursor-pointer hover:underline"
                                  title={t("leaderboard.clickFilter")}
                                  onClick={cellFilter(setFCourse, fCourse, r.combo.track_course)}
                                >
                                  ↳ {r.combo.track_course}
                                </span>
                              </TableCell>
                            </TableRow>
                          )}
                          <TableRow className={cn(i % 2 === 1 && "bg-muted/30", isOpen && "bg-amber-400/10")}>
                            <TableCell
                              className="cursor-pointer px-2 py-1.5"
                              title={t("leaderboard.clickFilter")}
                              onClick={cellFilter(setFClass, fClass, r.combo.car_class)}
                            >
                              <ClassBadge carClass={r.combo.car_class} size="sm" />
                            </TableCell>
                            <TableCell className="px-2 py-1.5">
                              <div className="flex items-center gap-2">
                                <CarLogo carName={r.combo.car_model} className="h-3.5 w-auto shrink-0 object-contain opacity-80" />
                                <span className="min-w-0 truncate">
                                  <span
                                    className="cursor-pointer font-medium hover:text-primary"
                                    title={t("leaderboard.clickFilter")}
                                    onClick={cellFilter(setFCar, fCar, r.combo.car_model)}
                                  >
                                    {r.combo.car_model}
                                  </span>
                                  {!withCourses && r.combo.track_course !== r.combo.track && (
                                    <span
                                      className="block cursor-pointer text-micro font-normal text-muted-foreground hover:text-primary"
                                      title={t("leaderboard.clickFilter")}
                                      onClick={cellFilter(setFCourse, fCourse, r.combo.track_course)}
                                    >
                                      {r.combo.track_course}
                                    </span>
                                  )}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className={cn("px-2 py-1.5 text-right font-mono font-bold text-emerald-500", GROUP_SEP, PERF_CELL)}>
                              {formatTime(r.combo.best)}
                            </TableCell>
                            {showOhne && (
                              <TableCell className={cn("px-2 py-1.5 text-center", PERF_CELL)}>
                                <TierBadge
                                  benchmarks={benchmarks}
                                  track={r.combo.track}
                                  layout={r.combo.track_course}
                                  carClass={r.combo.car_class}
                                  lapSeconds={r.combo.best}
                                />
                              </TableCell>
                            )}
                            {r.pos ? (
                              <>
                                <TableCell
                                  className={cn("px-2 py-1.5 text-center font-mono", PERF_CELL)}
                                  title={isRanked ? undefined : t("leaderboard.provisionalTip", { n: r.pos!.drivers, min: RANKED_MIN })}
                                >
                                  <b>{r.pos!.rank}</b>{" "}
                                  {/* Moins de 20 pilotes : effectif en orange (classement provisoire). */}
                                  <span className={isRanked ? "text-muted-foreground" : "font-semibold text-amber-600 dark:text-amber-400"}>
                                    / {r.pos!.drivers}
                                  </span>
                                </TableCell>
                                <TableCell className={cn("px-2 py-1.5 whitespace-nowrap font-bold", st!.tone, PERF_CELL)}>{st!.label}</TableCell>
                                <TableCell className={cn("px-2 py-1.5", PERF_CELL)}><Gauge pct={gaugePct(r.pos!.rank, r.pos!.drivers)} /></TableCell>
                                <TableCell className={cn("px-2 py-1.5 text-right font-mono text-muted-foreground", PERF_CELL)}>
                                  {r.pos!.rank === 1 ? "—" : `+${r.pos!.gap_best.toFixed(3)}`}
                                </TableCell>
                                <LeaderCell row={r} myTag={myTag} />
                                <TableCell className="px-2 py-1.5 text-right">
                                  <button type="button" className="text-xs font-semibold text-primary" onClick={() => setOpen(isOpen ? null : key)}>
                                    {isOpen ? t("leaderboard.hide") : t("leaderboard.details")}
                                  </button>
                                </TableCell>
                              </>
                            ) : (
                              <>
                              <TableCell colSpan={4} className={cn("px-2 py-1.5 text-xs text-muted-foreground", PERF_CELL)}>
                                {offline ? "—" : t("leaderboard.noData")}
                              </TableCell>
                              <LeaderCell row={r} myTag={myTag} />
                              <TableCell className="px-2 py-1.5" />
                              </>
                            )}
                          </TableRow>
                          {isOpen && (
                            <TableRow>
                              <TableCell colSpan={showOhne ? 10 : 9} className="p-0">
                                <ComboDetail row={r} myTag={myTag} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/** Pilote du record du combo : « Vous » si c'est le joueur, sinon son nom (ou son repère s'il est anonyme). */
function LeaderCell({ row, myTag }: { row: Row; myTag: string | null }) {
  const { t } = useTranslation();
  const l = row.leader;
  const mine = !!l && !!myTag && l.tag === myTag;
  return (
    <TableCell className={cn("px-2 py-1.5", GROUP_SEP)}>
      {!l ? (
        <span className="text-muted-foreground">—</span>
      ) : mine ? (
        <span className="font-semibold text-emerald-500">{t("leaderboard.recordYou")}</span>
      ) : l.name ? (
        <span className="block truncate font-medium" title={l.homonym ? `${l.name} · ${l.tag}` : l.name}>
          {l.name}
          {l.homonym && <span className="text-muted-foreground"> · {l.tag}</span>}
        </span>
      ) : (
        <span className="italic text-muted-foreground">{t("community.anonTag", { tag: l.tag })}</span>
      )}
    </TableCell>
  );
}
