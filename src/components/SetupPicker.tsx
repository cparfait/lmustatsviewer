/**
 * Choix d'un setup pour la comparaison (A ou B) : une seule carte par côté.
 * Choisi : nom, voiture, catégorie, circuit (drapeau), type, meilleur tour lié,
 * date. Panneau de choix : recherche, setups rangés voiture → circuit → setup,
 * filtre « même voiture que A » pour B, setup de l'autre côté signalé.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { SetupGroup, SetupSummary } from "@/lib/api";
import { CarLogo } from "@/components/CarLogo";
import { ClassBadge } from "@/components/ClassBadge";
import { TrackFlag } from "@/components/TrackFlag";
import { cn, formatTime } from "@/lib/utils";

export interface PickedSetup {
  setup: SetupSummary;
  car: string;
  car_class: string;
  circuit: string;
}

/** Setup choisi retrouvé dans les groupes (voiture → circuit → setups). */
function findPicked(groups: SetupGroup[], id: number | null): PickedSetup | null {
  if (!id) return null;
  for (const g of groups)
    for (const tr of g.tracks) {
      const s = tr.setups.find((x) => x.id === id);
      if (s) return { setup: s, car: g.car, car_class: g.car_class, circuit: tr.name };
    }
  return null;
}

const bare = (name: string) => name.replace(/\.svm$/i, "");

function TypeTag({ type }: { type: string }) {
  const { t } = useTranslation();
  if (type !== "Course" && type !== "Qualif") return null;
  return (
    <span className="rounded bg-muted px-1.5 py-px text-micro font-semibold uppercase tracking-wide text-muted-foreground">
      {t(type === "Course" ? "setupDetail.typeRace" : "setupDetail.typeQualif")}
    </span>
  );
}

export function SetupPicker({
  side,
  groups,
  selected,
  onSelect,
  other,
}: {
  side: "A" | "B";
  groups: SetupGroup[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  /** Setup choisi de l'autre côté (signalé ; pour B, filtre « même voiture »). */
  other: PickedSetup | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sameCar, setSameCar] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const info = findPicked(groups, selected);
  const isA = side === "A";
  const otherSide = isA ? "B" : "A";
  const filterCar = !isA && sameCar && other ? other.car : null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Voiture → circuit → setups, filtrés par la recherche (et la voiture de A pour B).
  const tree = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .filter((g) => !filterCar || g.car === filterCar)
      .map((g) => ({
        g,
        tracks: g.tracks
          .map((tr) => ({
            name: tr.name,
            setups: tr.setups
              .filter((s) => !q || `${g.car} ${g.car_class} ${tr.name} ${s.name}`.toLowerCase().includes(q))
              .sort((a, b) => a.name.localeCompare(b.name)),
          }))
          .filter((tr) => tr.setups.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((x) => x.tracks.length > 0);
  }, [groups, query, filterCar]);
  const first = tree[0]?.tracks[0]?.setups[0] ?? null;
  const total = tree.reduce((n, x) => n + x.tracks.reduce((m, tr) => m + tr.setups.length, 0), 0);

  const choose = (id: number) => {
    onSelect(id);
    setOpen(false);
    setQuery("");
  };

  const badge = (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-base font-bold",
        isA ? "border-primary/30 bg-primary/20 text-primary" : "border-sky-500/30 bg-sky-500/20 text-sky-500",
      )}
    >
      {side}
    </div>
  );

  return (
    <div className="relative min-w-0 flex-1" ref={ref}>
      {info ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3">
          {badge}
          <CarLogo carName={info.car} className="h-6 w-auto shrink-0 object-contain opacity-80" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-semibold leading-tight" title={info.setup.name}>
              {bare(info.setup.name)}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <ClassBadge carClass={info.car_class} solid />
              <span className="font-medium text-foreground/80">{info.car}</span>
              <span className="inline-flex items-center gap-1">
                <TrackFlag track={info.circuit} />
                {info.circuit}
              </span>
              <TypeTag type={info.setup.setup_type} />
              {info.setup.best_lap != null && <span className="font-mono tabular-nums">{formatTime(info.setup.best_lap)}</span>}
              <span className="text-muted-foreground/70">{t("setupCompare.modifiedOn", { date: info.setup.updated_at.slice(0, 10) })}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50">
              {t("setupCompare.change")}
            </button>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="inline-flex items-center justify-center gap-1 rounded-md px-2 py-0.5 text-micro text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
              {t("setupCompare.clear")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border border-dashed p-3 text-left transition-colors",
            open ? "border-primary bg-primary/5" : "border-border/60 bg-muted/20 hover:border-primary/50 hover:bg-accent/30",
          )}
        >
          {badge}
          <span className="flex-1 text-sm text-muted-foreground">{t("setupCompare.pickTitle", { side })}</span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex flex-col gap-2 border-b border-border/60 p-2">
            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && first && choose(first.id)}
                placeholder={t("setupCompare.search")}
                aria-label={t("setupCompare.search")}
                className="h-8 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              {!isA && other ? (
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={sameCar} onChange={(e) => setSameCar(e.target.checked)} />
                  {t("setupCompare.sameCar", { car: other.car })}
                </label>
              ) : (
                <span />
              )}
              <span>{t("setupCompare.count", { count: total })}</span>
            </div>
          </div>

          <div className="max-h-[26rem] overflow-y-auto py-1">
            {tree.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("setupCompare.noResult")}</p>}
            {tree.map(({ g, tracks }) => (
              <div key={g.car} className="pb-1">
                <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-border/40 bg-muted/80 px-3 py-1.5 backdrop-blur">
                  <CarLogo carName={g.car} className="h-4 w-auto shrink-0 object-contain opacity-80" />
                  <span className="text-sm font-semibold">{g.car}</span>
                  <ClassBadge carClass={g.car_class} solid />
                </div>
                {tracks.map((tr) => (
                  <div key={tr.name}>
                    <div className="flex items-center gap-1.5 px-4 pb-0.5 pt-1.5 text-micro font-bold uppercase tracking-wide text-primary">
                      <TrackFlag track={tr.name} />
                      {tr.name}
                    </div>
                    {tr.setups.map((s) => {
                      const isSel = s.id === selected;
                      const isOther = other?.setup.id === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => choose(s.id)}
                          className={cn(
                            "flex w-full items-center gap-2 px-6 py-1.5 text-left text-sm transition-colors",
                            isSel ? "bg-primary/15 text-primary" : "hover:bg-accent/50",
                          )}
                        >
                          {isSel ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                          <span className="min-w-0 flex-1 truncate font-mono text-xs" title={s.name}>
                            {bare(s.name)}
                          </span>
                          {isOther && (
                            <span className="rounded bg-muted px-1.5 text-micro font-semibold text-muted-foreground">{t("setupCompare.alreadyOther", { side: otherSide })}</span>
                          )}
                          <TypeTag type={s.setup_type} />
                          {s.best_lap != null && <span className="font-mono text-micro tabular-nums text-muted-foreground">{formatTime(s.best_lap)}</span>}
                          <span className="w-20 shrink-0 text-right text-micro text-muted-foreground/70">{s.updated_at.slice(0, 10)}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
