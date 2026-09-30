/**
 * Page « Classement » (COMMUNITY-SPEC.md §9, lot 4) : position du joueur parmi les
 * pilotes de la communauté, sur chaque combo roulé, calculée automatiquement à partir
 * de ses meilleurs tours locaux. Classements ouverts à tous : la page fonctionne même
 * si le joueur ne partage pas ses tours (il n'y apparaît simplement pas).
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Car, ChevronDown, ExternalLink, Eye, Flag, Globe, Loader2, Package, Route, Share2, Star, Tag, Target, Timer, Trophy, Users, X } from "lucide-react";
import { ClassBadge } from "@/components/ClassBadge";
import { CarLogo } from "@/components/CarLogo";
import { Card, CardContent } from "@/components/ui/card";
import { FilterField } from "@/components/FilterField";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrackFlag } from "@/components/TrackFlag";
import { Tip } from "@/components/ui/tooltip";
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
import { AvatarFetch } from "@/components/CommunitySettings";

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
  country?: string | null;
  avatar?: string | null;
}

/**
 * Avatar Steam (si le pilote l'a choisi) et drapeau du pays de son profil du jeu, servis
 * par le site communautaire. Rien pour un pilote anonyme (le serveur ne les renvoie pas).
 */
function DriverMarks({ d }: { d: { country?: string | null; avatar?: string | null } }) {
  const country = d.country && /^[A-Za-z]{2,3}$/.test(d.country) ? d.country.toLowerCase() : null;
  const avatar = d.avatar && /^[0-9a-f]{40}$/.test(d.avatar) ? d.avatar : null;
  const hide = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = "none";
  };
  // Pays puis avatar, emplacements de largeur fixe : les noms restent alignés.
  return (
    <span className="mr-1.5 inline-flex w-[38px] shrink-0 items-center gap-1 align-[-3px]">
      <span className="inline-flex w-[16px] justify-center">
        {country && (
          <img
            src={`${SITE}/cflags/${country === "uk" ? "gb" : country}.svg`}
            alt={country.toUpperCase()}
            title={country.toUpperCase()}
            loading="lazy"
            onError={hide}
            className="h-2.5 w-[14px] rounded-[2px] object-cover ring-1 ring-black/10"
          />
        )}
      </span>
      <span className="inline-flex h-4 w-4">
        {avatar && <img src={`${SITE}/api/v1/avatar/${avatar}`} alt="" loading="lazy" onError={hide} className="h-4 w-4 rounded-full" />}
      </span>
    </span>
  );
}

interface Row {
  combo: MyCombo;
  pos: CommunityPosition | null;
  /** Requête serveur du combo, filtres Session / Mode / Version compris. */
  q: Record<string, string>;
  /** Détenteur du meilleur temps du combo (liste `combos` du serveur). */
  leader?: RecordHolder | null;
  /** Meilleur temps du combo (record, tous pilotes). */
  record?: number | null;
  /**
   * Classement où le joueur n'a pas de temps (même circuit jamais roulé) : affiché pour voir les
   * meilleurs temps de toutes les classes (`combo.car_model` = voiture du record).
   */
  other?: boolean;
}

/** Ordre des classes de l'app (SUIVI §3.6) ; une classe inconnue passe en dernier. */
const CLASS_ORDER = [/hyper/i, /lmp2.*elms/i, /lmp2/i, /lmp3/i, /gt3/i, /gte/i];
const classRank = (c: string) => {
  const i = CLASS_ORDER.findIndex((re) => re.test(c));
  return i < 0 ? CLASS_ORDER.length : i;
};

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

function Histogram({
  detail,
  me,
  myRank,
  youLabel,
  medianLabel,
  posLabel,
}: {
  detail: CommunityDetail;
  me: number | null;
  /** Place exacte du joueur (sinon estimée d'après l'histogramme). */
  myRank?: number | null;
  youLabel: string;
  medianLabel: string;
  posLabel: string;
}) {
  const { start, width, counts } = detail.histogram;
  // B : deux rangées sous les barres, les temps puis la place au classement.
  const W = 640, H = 214, L = 30, R = 10, T = 22, B = 40;
  const hi = start + counts.length * width;
  const max = Math.max(1, ...counts);
  const sx = (t: number) => L + ((t - start) / (hi - start)) * (W - L - R);
  const sy = (n: number) => H - B - (n / max) * (H - B - T);
  const meBin = me == null ? -1 : Math.floor((me - start) / width);
  const ticks: number[] = [];
  const step = Math.max(1, Math.ceil((hi - start) / 6));
  for (let t = Math.ceil(start); t <= hi; t += step) ticks.push(t);
  const med = detail.percentiles.p50;
  // Place au classement correspondant à un temps : pilotes plus rapides + 1 (les pilotes
  // d'une barre sont supposés répartis dans sa tranche de 0,5 s).
  const total = counts.reduce((a, n) => a + n, 0);
  const posAt = (time: number) => {
    let faster = 0;
    counts.forEach((n, i) => {
      const a = start + i * width;
      if (a + width <= time) faster += n;
      else if (a < time) faster += (n * (time - a)) / width;
    });
    return Math.min(Math.max(total, 1), Math.round(faster) + 1);
  };
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
        <g key={t}>
          <text x={sx(t)} y={H - B + 14} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">
            {formatTime(t).slice(0, -4)}
          </text>
          <text x={sx(t)} y={H - 6} textAnchor="middle" className="fill-primary font-mono text-[10px] font-bold">
            P{posAt(t)}
          </text>
        </g>
      ))}
      {/* Règle des places : du 1er (à gauche) au dernier (à droite). */}
      <line x1={L} x2={W - R} y1={H - 18} y2={H - 18} className="stroke-border" />
      <text x={2} y={H - 6} textAnchor="start" className="fill-muted-foreground text-[9px] font-bold">
        {posLabel}
      </text>
      {med != null && (
        <g>
          <line x1={sx(med)} x2={sx(med)} y1={T - 4} y2={H - B} className="stroke-muted-foreground" strokeDasharray="3 4" />
          <text x={sx(med) + 3} y={T + 4} className="fill-muted-foreground text-[10px] font-bold">{medianLabel}</text>
        </g>
      )}
      {me != null && me >= start && me <= hi && (
        <g>
          <line x1={sx(me)} x2={sx(me)} y1={T + 12} y2={H - B} className="stroke-amber-400" strokeWidth={2.5} />
          <text x={sx(me)} y={T + 8} textAnchor="middle" className="fill-amber-500 text-[11px] font-extrabold">
            {youLabel} · P{myRank ?? posAt(me)}
          </text>
        </g>
      )}
    </svg>
  );
}

/** Ligne du classement communautaire (`null` dans la liste = trou « ⋯ »). */
type LbRow = CommunityLeaderboard["rows"][number];

/**
 * Détail d'un combo, comme la page d'un classement sur le site : carte « Votre position »,
 * puis le classement complet en pleine largeur (secteurs, version, date ; meilleurs
 * secteurs en violet, votre ligne surlignée), sans défilement interne ; la répartition
 * des temps en dessous. Sans classe (`q.class` absent) : tous les pilotes de toutes les
 * classes du circuit, colonne Classe en plus.
 */
function ComboDetail({ q, myBest, myRank, myTag }: { q: Record<string, string>; myBest: number | null; myRank: number | null; myTag?: string | null }) {
  const { t, i18n } = useTranslation();
  const playerName = useAppStore((s) => s.playerName);
  const [detail, setDetail] = useState<CommunityDetail | null>(null);
  const [lb, setLb] = useState<(LbRow | null)[] | null>(null);
  /** Classement toutes classes : classe choisie d'un clic sur son badge (null = toutes). */
  const [cls, setCls] = useState<string | null>(null);

  const qKey = JSON.stringify(q);
  useEffect(() => {
    community.get<CommunityDetail>("combos/detail", q).then(setDetail).catch(() => {});
    const rank = myRank ?? 1;
    (async () => {
      // Tous les pilotes, page par page (100 par requête, limite du serveur) ; au-delà de
      // 1000 lignes, vos voisins après un « ⋯ ».
      const rows: (LbRow | null)[] = [];
      for (let offset = 0; offset < 1000; offset += 100) {
        const page = await community.get<CommunityLeaderboard>("combos/leaderboard", { ...q, limit: 100, offset });
        rows.push(...(page?.rows ?? []));
        if (!page || page.rows.length < 100) break;
      }
      if (rank > rows.length && rows.length >= 1000) {
        const near = await community.get<CommunityLeaderboard>("combos/leaderboard", { ...q, limit: 11, offset: Math.max(1000, rank - 6) });
        const nearRows = (near?.rows ?? []).filter((r) => r.rank > 1000);
        if (nearRows.length && nearRows[0].rank > 1001) rows.push(null);
        rows.push(...nearRows);
      }
      setLb(rows);
    })().catch(() => setLb([]));
    // `qKey` : même combo = pas de nouvelle requête (l'objet `q` est recréé à chaque rendu).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qKey, myRank]);

  const isMe = (r: LbRow) => (myTag ? r.driver.tag === myTag : !!playerName && r.driver.name === playerName);
  const all = (lb ?? []).filter((r): r is LbRow => !!r);
  // Filtre par classe : places et écarts recalculés dans la classe (ex-æquo au même rang).
  const rows = cls
    ? all
        .filter((r) => r.car_class === cls)
        .map((r, _i, same) => ({ ...r, rank: same.filter((x) => x.time < r.time).length + 1 }))
    : all;
  const list: (LbRow | null)[] | null = lb === null ? null : cls ? rows : lb;
  const me = rows.find(isMe) ?? null;
  const best = rows[0]?.time ?? null;
  // Meilleur secteur du classement (violet), comme sur le site.
  const bestSec = (k: "s1" | "s2" | "s3") => {
    const v = rows.map((r) => r[k]).filter((x): x is number => x != null);
    return v.length ? Math.min(...v) : null;
  };
  const bests = { s1: bestSec("s1"), s2: bestSec("s2"), s3: bestSec("s3") };
  const date = (iso?: string | null) =>
    iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

  const name = (d: LbRow["driver"]) =>
    d.name ? (d.homonym ? `${d.name} · ${d.tag}` : d.name) : t("leaderboard.anonDriver", { tag: d.tag });
  const siteUrl = siteUrlFor(q, myTag);
  const medal = ["bg-amber-400 text-amber-950", "bg-slate-300 text-slate-800", "bg-orange-400 text-orange-950"];
  const th = "px-2 py-1.5 font-medium";
  // Classement d'un circuit toutes classes (clic sur son nom) : une colonne Classe en plus.
  const allClasses = !q.class;
  const cols = allClasses ? 11 : 10;

  return (
    <div className="space-y-4 border-t border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{t("leaderboard.aroundTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("leaderboard.aroundSub")}</p>
        </div>
        <a href={siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <ExternalLink className="h-3.5 w-3.5" />
          {t("leaderboard.openSite")}
        </a>
      </div>

      {me && (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border-2 border-primary bg-primary/10 px-4 py-2.5">
          <span className="font-extrabold tracking-tight text-primary">
            <span className="text-3xl">{me.rank}</span>
            {(cls || detail) && <span className="text-sm text-muted-foreground"> / {cls ? rows.length : detail!.drivers}</span>}
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("leaderboard.meTitle")}</span>
            <span className="flex items-center font-bold">
              <DriverMarks d={me.driver} />
              <span className="truncate">{name(me.driver)}</span>
            </span>
          </span>
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("leaderboard.lbTime")}</span>
            <span className="font-mono text-lg font-bold">{formatTime(me.time)}</span>
          </span>
          {best != null && me.rank > 1 && (
            <span>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("leaderboard.lbGap")}</span>
              <span className="font-mono text-lg font-bold text-muted-foreground">+{(me.time - best).toFixed(3)}</span>
            </span>
          )}
        </div>
      )}

      {cls && (
        <button
          type="button"
          onClick={() => setCls(null)}
          className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold"
          title={t("leaderboard.clsFilterOff")}
        >
          {t("leaderboard.colClass")} : <ClassBadge carClass={cls} size="sm" />
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="overflow-x-auto rounded-md border border-border/60 bg-card">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="bg-muted text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className={cn(th, "w-12 text-center")}>#</th>
              <th className={cn(th, "text-left")}>{t("leaderboard.lbDriver")}</th>
              {allClasses && <th className={cn(th, "text-left")}>{t("leaderboard.colClass")}</th>}
              <th className={cn(th, "text-left")}>{t("leaderboard.colCar")}</th>
              <th className={cn(th, "text-right", GROUP_SEP, PERF_HEAD)}>{t("leaderboard.lbTime")}</th>
              <th className={cn(th, "text-right", PERF_HEAD)}>{t("leaderboard.lbGap")}</th>
              <th className={cn(th, "text-right", PERF_HEAD)}>S1</th>
              <th className={cn(th, "text-right", PERF_HEAD)}>S2</th>
              <th className={cn(th, "text-right", PERF_HEAD)}>S3</th>
              <th className={cn(th, "text-center", GROUP_SEP)}>{t("leaderboard.colVersion")}</th>
              <th className={cn(th, "text-right")}>{t("leaderboard.lbDate")}</th>
            </tr>
          </thead>
          <tbody>
            {lb === null && (
              <tr>
                <td colSpan={cols} className="px-2 py-3 text-center text-muted-foreground">
                  <Loader2 className="inline h-3.5 w-3.5 animate-spin" />
                </td>
              </tr>
            )}
            {list?.map((r, i) =>
              r === null ? (
                <tr key={`gap${i}`}>
                  <td colSpan={cols} className="py-0.5 text-center text-muted-foreground">⋯</td>
                </tr>
              ) : (
                <tr key={r.rank + r.driver.tag + (r.car_class ?? "")} className={cn("border-t border-border/40", i % 2 === 1 && "bg-muted/30", isMe(r) && "bg-primary/10 font-bold")}>
                  <td className="px-2 py-1.5 text-center font-mono">
                    {r.rank <= 3 ? (
                      <span className={cn("inline-grid h-5 w-5 place-items-center rounded text-[11px] font-extrabold", medal[r.rank - 1])}>{r.rank}</span>
                    ) : (
                      r.rank
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="flex min-w-0 items-center">
                      <DriverMarks d={r.driver} />
                      <span className={cn("truncate text-sm", !r.driver.name && "italic text-muted-foreground")}>{name(r.driver)}</span>
                    </span>
                  </td>
                  {allClasses && (
                    <td className="px-2 py-1.5">
                      {r.car_class ? (
                        <Tip content={cls ? t("leaderboard.clsFilterOff") : t("leaderboard.clsFilterOn")}>
                          <button type="button" onClick={() => setCls(cls === r.car_class ? null : r.car_class!)} className="cursor-pointer">
                            <ClassBadge carClass={r.car_class} size="sm" />
                          </button>
                        </Tip>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <CarLogo carName={r.car_model} className="h-3.5 w-auto shrink-0 object-contain opacity-80" />
                      <span className="truncate">{r.car_model}</span>
                    </span>
                  </td>
                  <td className={cn("px-2 py-1.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400", GROUP_SEP, PERF_CELL)}>
                    {formatTime(r.time)}
                  </td>
                  <td className={cn("px-2 py-1.5 text-right font-mono text-muted-foreground", PERF_CELL)}>
                    {best == null || r.rank === 1 ? "—" : `+${(r.time - best).toFixed(3)}`}
                  </td>
                  {(["s1", "s2", "s3"] as const).map((k) => (
                    <td
                      key={k}
                      className={cn(
                        "px-2 py-1.5 text-right font-mono",
                        PERF_CELL,
                        r[k] != null && r[k] === bests[k] ? "font-bold text-violet-600 dark:text-violet-400" : "text-muted-foreground",
                      )}
                    >
                      {r[k] != null ? r[k]!.toFixed(3) : "—"}
                    </td>
                  ))}
                  <td className={cn("px-2 py-1.5 text-center font-mono text-muted-foreground", GROUP_SEP)}>
                    {r.game_version ? gameMinor(r.game_version) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">{date(r.played_on)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <div>
        <p className="text-sm font-semibold">{t("leaderboard.distTitle")}</p>
        {detail && (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              {t("leaderboard.distSub", { count: detail.drivers })}
            </p>
            <div className="max-w-4xl">
              <Histogram
                detail={detail}
                me={myBest}
                myRank={me?.rank ?? null}
                youLabel={t("leaderboard.histYou")}
                medianLabel={t("leaderboard.median")}
                posLabel={t("leaderboard.histPos")}
              />
            </div>
          </>
        )}
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
    <div className="flex flex-col gap-4">
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
  /** Circuit dont le classement toutes classes est ouvert (clic sur son nom). */
  const [openTrack, setOpenTrack] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Filtres (barre + clic sur une cellule, comme Sessions / Records).
  const [fTrack, setFTrack] = useState("");
  const [fCourse, setFCourse] = useState("");
  const [fClass, setFClass] = useState("");
  const [fCar, setFCar] = useState("");
  const [fSession, setFSession] = useState<"" | "race" | "qualify" | "practice">("");
  const [fMode, setFMode] = useState<"" | "online" | "offline">("");
  // « Mes combos » : désactivé à l'ouverture (rien de mis en évidence) ; « Masquer les autres »
  // redonne l'ancien affichage (seulement les combos roulés).
  const [showMine, setShowMine] = useState(false);
  const [hideOthers, setHideOthers] = useState(false);
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
      const records = new Map<string, number>();
      type ServerCombo = { track: string; track_course: string; car_class: string; best: number; best_car: string; best_driver?: RecordHolder };
      let serverCombos: ServerCombo[] = [];
      try {
        const list = await community.get<{ combos: ServerCombo[] }>("combos", extra);
        serverCombos = list?.combos ?? [];
        for (const c of serverCombos) {
          const k = recordKey(c.track, c.track_course, c.car_class);
          if (c.best_driver) leaders.set(k, c.best_driver);
          records.set(k, c.best);
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
              record: records.get(recordKey(combo.track, combo.track_course, combo.car_class)) ?? null,
            };
          }),
        );
        out.push(...part);
      }
      // Tous les autres classements aussi (même circuits jamais roulés) : meilleurs temps de
      // toutes les classes, sans place pour le joueur.
      const mineKeys = new Set(mine.map((c) => recordKey(c.track, c.track_course, c.car_class)));
      for (const c of serverCombos) {
        const k = recordKey(c.track, c.track_course, c.car_class);
        if (mineKeys.has(k)) continue;
        out.push({
          combo: { track: c.track, track_course: c.track_course, car_class: c.car_class, car_model: c.best_car, best: c.best, last_played: 0 },
          q: { track: c.track, course: c.track_course, class: c.car_class, ...extra },
          pos: null,
          leader: c.best_driver ?? null,
          record: c.best,
          other: true,
        });
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
      if (showMine && hideOthers && r.other) continue;
      m.set(c.track, [...(m.get(c.track) ?? []), r]);
    }
    // Dans chaque circuit, regroupement par TRACÉ : le principal (même nom que le circuit)
    // d'abord, puis les plus fournis ; dans un tracé, les classes dans l'ordre de l'app.
    return [...m.entries()].map(([track, list]) => {
      const count = new Map<string, number>();
      for (const r of list) count.set(r.combo.track_course, (count.get(r.combo.track_course) ?? 0) + 1);
      const rank = (c: string) => (c === track ? -1e9 : -(count.get(c) ?? 0));
      const sorted = list
        .map((r, i) => ({ r, i }))
        .sort(
          (a, b) =>
            rank(a.r.combo.track_course) - rank(b.r.combo.track_course) ||
            a.r.combo.track_course.localeCompare(b.r.combo.track_course) ||
            classRank(a.r.combo.car_class) - classRank(b.r.combo.car_class) ||
            a.i - b.i,
        )
        .map((x) => x.r);
      return [track, sorted] as [string, Row[]];
    });
  }, [rows, fTrack, fCourse, fClass, fCar, showMine, hideOthers]);

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

      {/* Avatar Steam voulu (défaut) mais pas encore récupéré : un clic, une connexion Steam. */}
      {status && status.enabled && status.avatar && !status.avatar_ready && status.steam_linked && !status.anonymous && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("community.avatarPrompt")}</span>
          <AvatarFetch status={status} withDecline onDone={() => community.status().then(setStatus).catch(() => {})} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile
          label={t("leaderboard.tileCombos")}
          value={String(placed.length)}
          sub={t("leaderboard.tileCombosSub", { count: (rows ?? []).filter((r) => !r.other).length, ranked: ranked.length })}
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
            {/* « Mes combos » : met en évidence les combos roulés (bouton orange tant qu'actif) ;
                « Masquer les autres » = n'afficher que ceux-là. */}
            <Button
              variant={showMine ? "default" : "outline"}
              size="sm"
              className="h-9 gap-1.5 text-xs"
              aria-pressed={showMine}
              onClick={() => setShowMine(!showMine)}
            >
              <Star className={cn("h-3.5 w-3.5", showMine && "fill-yellow-400 text-yellow-400")} />
              {t("leaderboard.onlyMine")}
            </Button>
            {showMine && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" className="accent-primary" checked={hideOthers} onChange={(e) => setHideOthers(e.target.checked)} />
                {t("leaderboard.hideOthers")}
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
        const trackOpen = openTrack === track;
        // Toutes classes : le tracé principal s'il est dans la liste, sinon le premier.
        const mainCourse = list.find((r) => r.combo.track_course === track)?.combo.track_course ?? list[0].combo.track_course;
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
              {/* Nom du circuit : tous les temps de toutes les classes (le filtre par circuit
                  reste dans la barre de filtres). */}
              <Tip content={t("leaderboard.allClassesTip")}>
                <button
                  type="button"
                  onClick={(e) => (e.stopPropagation(), setOpenTrack(trackOpen ? null : track))}
                  aria-expanded={trackOpen}
                  className={cn(
                    "rounded px-1 text-xs font-semibold uppercase tracking-[0.12em] text-yellow-700 hover:underline dark:text-yellow-300",
                    trackOpen && "bg-primary text-primary-foreground no-underline dark:text-primary-foreground",
                  )}
                >
                  {track}
                </button>
              </Tip>
              <span className="rounded-full bg-primary/20 px-1.5 py-0 text-micro font-bold tabular-nums text-yellow-700 dark:text-yellow-300">
                {list.length}
              </span>
            </div>
            {trackOpen && (
              <div className="border-b border-border/60">
                <p className="px-4 pt-3 text-xs font-semibold text-primary">
                  {t("leaderboard.allClassesTitle", { course: mainCourse })}
                </p>
                <ComboDetail q={{ track, course: mainCourse }} myBest={null} myRank={null} myTag={myTag} />
              </div>
            )}
            {!isCollapsed && (
              <div className="overflow-x-auto">
                {/* Largeurs fixes : colonnes alignées d'un circuit à l'autre. */}
                <Table className="w-full min-w-[1000px] table-fixed text-xs">
                  <colgroup>
                    <col className="w-[64px]" />
                    <col className="w-[110px]" />
                    <col className="w-[210px]" />
                    <col />
                    <col className="w-[100px]" />
                    <col className="w-[110px]" />
                    <col className="w-[100px]" />
                    {showOhne && <col className="w-[130px]" />}
                    <col className="w-[190px]" />
                    <col className="w-[180px]" />
                    <col className="w-[80px]" />
                  </colgroup>
                  <TableHeader>
                    <TableRow className="border-primary/40">
                      <TableHead className="font-medium text-center">{t("leaderboard.details")}</TableHead>
                      <TableHead className="font-medium text-left">{t("leaderboard.colClass")}</TableHead>
                      <TableHead className="font-medium text-left">{t("leaderboard.colLeader")}</TableHead>
                      <TableHead className="font-medium text-left">{t("leaderboard.colCar")}</TableHead>
                      <TableHead className="font-medium text-right">{t("leaderboard.colRecord")}</TableHead>
                      <TableHead className={cn("font-medium text-right", GROUP_SEP, PERF_HEAD)}>{t("leaderboard.colTime")}</TableHead>
                      <TableHead className={cn("font-medium text-right", PERF_HEAD)}>{t("leaderboard.colGap")}</TableHead>
                      {showOhne && <TableHead className={cn("font-medium text-center", PERF_HEAD)}>{t("leaderboard.colLevel")}</TableHead>}
                      <TableHead className={cn("font-medium text-left", PERF_HEAD)}>{t("leaderboard.colRank")}</TableHead>
                      <TableHead className={cn("font-medium text-left", PERF_HEAD)}>{t("leaderboard.colWhere")}</TableHead>
                      <TableHead className="font-medium text-center">{t("leaderboard.colVersion")}</TableHead>
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
                                colSpan={showOhne ? 11 : 10}
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
                          <TableRow
                            className={cn(
                              "group",
                              i % 2 === 1 && "bg-muted/30",
                              isOpen && "bg-amber-400/10",
                              // « Mes combos » : les combos roulés teintés en orange, les autres estompés.
                              showMine && (r.other ? "opacity-45" : "bg-orange-500/15 font-semibold"),
                            )}
                          >
                            {/* Détail : œil en tête de ligne, comme les autres pages (pas de détail sans position). */}
                            <TableCell className={cn("px-2 py-1.5", showMine && !r.other && "shadow-[inset_5px_0_0_#f97316]")}>
                              {(r.pos || r.other) && (
                                <div className="flex justify-center">
                                  <Tip content={isOpen ? t("leaderboard.hide") : t("leaderboard.details")}>
                                    <button
                                      type="button"
                                      onClick={() => setOpen(isOpen ? null : key)}
                                      aria-label={isOpen ? t("leaderboard.hide") : t("leaderboard.details")}
                                      aria-expanded={isOpen}
                                      className={cn(
                                        "flex h-5 w-5 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        isOpen
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
                                      )}
                                    >
                                      <Eye className="h-3 w-3" />
                                    </button>
                                  </Tip>
                                </div>
                              )}
                            </TableCell>
                            {/* Clic sur la classe : le classement de la classe (comme l'œil) ; le
                                filtre par classe reste dans la barre de filtres. */}
                            <TableCell
                              className={cn("px-2 py-1.5", (r.pos || r.other) && "cursor-pointer")}
                              title={r.pos || r.other ? (isOpen ? t("leaderboard.hide") : t("leaderboard.details")) : undefined}
                              onClick={() => (r.pos || r.other) && setOpen(isOpen ? null : key)}
                            >
                              <ClassBadge carClass={r.combo.car_class} size="sm" />
                            </TableCell>
                            {/* Pilote du record en début de ligne, comme sur le site. */}
                            <LeaderCell row={r} myTag={myTag} />
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
                            <TableCell className="px-2 py-1.5 text-right font-mono font-semibold">
                              {r.record != null ? formatTime(r.record) : "—"}
                            </TableCell>
                            <TableCell className={cn("px-2 py-1.5 text-right font-mono font-bold text-emerald-500", GROUP_SEP, PERF_CELL)}>
                              {r.other ? <span className="font-normal text-muted-foreground">—</span> : formatTime(r.combo.best)}
                            </TableCell>
                            <TableCell className={cn("px-2 py-1.5 text-right font-mono text-muted-foreground", PERF_CELL)}>
                              {r.pos ? (r.pos.rank === 1 ? "—" : `+${r.pos.gap_best.toFixed(3)}`) : ""}
                            </TableCell>
                            {showOhne && (
                              <TableCell className={cn("px-2 py-1.5 text-center", PERF_CELL)}>
                                <TierBadge
                                  benchmarks={benchmarks}
                                  track={r.combo.track}
                                  layout={r.combo.track_course}
                                  carClass={r.combo.car_class}
                                  lapSeconds={r.other ? null : r.combo.best}
                                />
                              </TableCell>
                            )}
                            {r.pos ? (
                              <>
                                {/* Position et « Top » réunis : « 5 / 7 · Dernier ». */}
                                <TableCell
                                  className={cn("px-2 py-1.5 whitespace-nowrap", PERF_CELL)}
                                  title={isRanked ? undefined : t("leaderboard.provisionalTip", { n: r.pos!.drivers, min: RANKED_MIN })}
                                >
                                  <span className="font-mono">
                                    <b>{r.pos!.rank}</b>{" "}
                                    {/* Moins de 20 pilotes : effectif en orange (classement provisoire). */}
                                    <span className={isRanked ? "text-muted-foreground" : "font-semibold text-amber-600 dark:text-amber-400"}>
                                      / {r.pos!.drivers}
                                    </span>
                                  </span>
                                  <span className={cn("ml-2.5 font-bold", st!.tone)}>{st!.label}</span>
                                </TableCell>
                                <TableCell className={cn("px-2 py-1.5", PERF_CELL)}><Gauge pct={gaugePct(r.pos!.rank, r.pos!.drivers)} /></TableCell>
                              </>
                            ) : (
                              <TableCell colSpan={2} className={cn("px-2 py-1.5 text-xs text-muted-foreground", PERF_CELL)}>
                                {offline ? "—" : r.other ? t("leaderboard.noTime") : t("leaderboard.noData")}
                              </TableCell>
                            )}
                            {/* Version du jeu du classement (la plus récente, ou celle du filtre). */}
                            <TableCell className="px-2 py-1.5 text-center font-mono text-muted-foreground">
                              {r.pos?.version ? gameMinor(r.pos.version) : "—"}
                            </TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow>
                              <TableCell colSpan={showOhne ? 11 : 10} className="p-0">
                                <ComboDetail q={r.q} myBest={r.other ? null : r.combo.best} myRank={r.pos?.rank ?? null} myTag={myTag} />
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
    <TableCell className="px-2 py-1.5">
      {!l ? (
        <span className="text-muted-foreground">—</span>
      ) : mine ? (
        <span className="flex items-center font-semibold text-emerald-500">
          <DriverMarks d={l} />
          {t("leaderboard.recordYou")}
        </span>
      ) : l.name ? (
        <span className="flex min-w-0 items-center font-medium" title={l.homonym ? `${l.name} · ${l.tag}` : l.name}>
          <DriverMarks d={l} />
          <span className="truncate">
            {l.name}
            {l.homonym && <span className="text-muted-foreground"> · {l.tag}</span>}
          </span>
        </span>
      ) : (
        <span className="flex items-center italic text-muted-foreground">
          <DriverMarks d={{}} />
          {t("community.anonTag", { tag: l.tag })}
        </span>
      )}
    </TableCell>
  );
}
