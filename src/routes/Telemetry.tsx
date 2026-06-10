import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Gauge, FileWarning, Flag, Tag, Car, Timer, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilterField } from "@/components/FilterField";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SortHeader,
} from "@/components/ui/table";
import { TrackFlag } from "@/components/TrackFlag";
import { CarLogo } from "@/components/CarLogo";
import { ClassBadge } from "@/components/ClassBadge";
import { SessionBadge } from "@/components/SessionBadge";
import { sessionTypeLabel } from "@/lib/sessionLabels";
import { telemetry } from "@/lib/api";
import type { TelemetryFileInfo } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { Loader2 } from "lucide-react";

/**
 * Navigateur des enregistrements de télémétrie (`.duckdb`). Filtrage côté client
 * (façon Dashboard) ; un clic ouvre la page lecteur `/telemetry/view`.
 */
export function Telemetry() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [files, setFiles] = useState<TelemetryFileInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fTrack, setFTrack] = useState("");
  const [fClass, setFClass] = useState("");
  const [fCar, setFCar] = useState("");
  const [fSession, setFSession] = useState("");

  type SortKey =
    | "track"
    | "layout"
    | "car"
    | "class"
    | "session"
    | "driver"
    | "date";
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const onSort = (k: SortKey) => {
    if (k === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(k);
      setSortDir("asc");
    }
  };

  /** Nom de voiture affiché/filtré : vrai modèle si connu, sinon équipe/livrée. */
  const carLabel = (f: TelemetryFileInfo) => f.car_model || f.car_name;

  useEffect(() => {
    telemetry
      .listFiles()
      .then(setFiles)
      .catch((e) => setError(String(e)));
  }, []);

  const options = useMemo(() => {
    const tracks = new Set<string>();
    const classes = new Set<string>();
    const cars = new Set<string>();
    const sessionsT = new Set<string>();
    (files ?? []).forEach((f) => {
      if (f.track) tracks.add(f.track);
      if (f.car_class) classes.add(f.car_class);
      if (f.session_type) sessionsT.add(f.session_type);
      if (!fClass || f.car_class === fClass) {
        const c = carLabel(f);
        if (c) cars.add(c);
      }
    });
    return {
      tracks: [...tracks].sort(),
      classes: [...classes].sort(),
      cars: [...cars].sort(),
      sessions: [...sessionsT].sort(),
    };
  }, [files, fClass]);

  const filteredFiles = useMemo(() => {
    return (files ?? []).filter((f) => {
      if (fTrack && f.track !== fTrack) return false;
      if (fClass && f.car_class !== fClass) return false;
      if (fCar && carLabel(f) !== fCar) return false;
      if (fSession && f.session_type !== fSession) return false;
      return true;
    });
  }, [files, fTrack, fClass, fCar, fSession]);

  const sortedFiles = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (f: TelemetryFileInfo): string | number => {
      switch (sortBy) {
        case "track": return f.track;
        case "layout": return f.track_layout;
        case "car": return carLabel(f);
        case "class": return f.car_class;
        case "session": return f.session_type;
        case "driver": return f.driver;
        case "date": return f.mtime;
      }
    };
    return [...filteredFiles].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filteredFiles, sortBy, sortDir]);

  const hasFilters = !!(fTrack || fClass || fCar || fSession);
  const clearFilters = () => {
    setFTrack("");
    setFClass("");
    setFCar("");
    setFSession("");
  };

  const open = (f: TelemetryFileInfo) =>
    navigate(`/telemetry/view?path=${encodeURIComponent(f.path)}`);

  // ── Rendu ────────────────────────────────────────────────────────────────────
  if (files === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <FileWarning className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="mb-2 text-xl font-bold">{t("telemetry.title")}</h1>
        <p className="mb-4 text-sm text-muted-foreground">{t("telemetry.emptyHelp")}</p>
        <a
          href="https://guide.lemansultimate.com/hc/en-gb/articles/14524956311695-Telemetry-Recording"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary underline"
        >
          {t("telemetry.emptyLink")}
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Gauge className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold">{t("telemetry.title")}</h1>
        <span className="text-sm text-muted-foreground">
          {t("telemetry.fileCount", { count: filteredFiles.length })}
        </span>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="p-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Barre de filtres */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterField icon={Flag} label={t("sessions.fCircuit")} value={fTrack} onChange={setFTrack}>
              <option value="">{t("sessions.allTracks")}</option>
              {options.tracks.map((tr) => (
                <option key={tr} value={tr}>
                  {tr}
                </option>
              ))}
            </FilterField>
            <FilterField
              icon={Tag}
              label={t("sessions.fClass")}
              value={fClass}
              onChange={(v) => {
                setFClass(v);
                setFCar("");
              }}
            >
              <option value="">{t("sessions.allClasses")}</option>
              {options.classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </FilterField>
            <FilterField icon={Car} label={t("sessions.fCar")} value={fCar} onChange={setFCar} className="max-w-[260px]">
              <option value="">{t("sessions.allCars")}</option>
              {options.cars.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </FilterField>
            <FilterField icon={Timer} label={t("sessions.fSession")} value={fSession} onChange={setFSession}>
              <option value="">{t("sessions.allTypes")}</option>
              {options.sessions.map((st) => (
                <option key={st} value={st}>
                  {sessionTypeLabel(st, t)}
                </option>
              ))}
            </FilterField>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-9 gap-1 text-xs text-muted-foreground" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" />
                {t("sessions.clearFilters")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tableau des enregistrements (style tableau Sessions) */}
      {sortedFiles.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-muted-foreground">{t("sessions.noResults")}</p>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <Table className="[&_th]:px-2 [&_td]:px-2">
              <TableHeader>
                <TableRow>
                  <SortHeader col="track" label={t("sessions.fCircuit")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader col="layout" label={t("sessions.fLayout")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader col="car" label={t("sessions.fCar")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader col="class" label={t("sessions.fClass")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader col="session" label={t("sessions.fSession")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader col="driver" label={t("telemetry.driver")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <TableHead className="h-auto py-1 text-micro whitespace-nowrap">{t("telemetry.weather")}</TableHead>
                  <SortHeader col="date" label={t("sessions.colDate")} sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedFiles.map((f) => (
                  <TableRow
                    key={f.path}
                    onClick={() => open(f)}
                    className="cursor-pointer text-xs"
                  >
                    <TableCell className="py-1.5 font-medium">
                      <span className="flex items-center gap-1.5">
                        <TrackFlag track={f.track} className="h-3.5 w-auto" />
                        <span className="truncate">{f.track}</span>
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 text-muted-foreground whitespace-nowrap">
                      {f.track_layout}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className="flex items-center gap-1.5">
                        <CarLogo carName={f.car_model || f.car_name} className="h-4 w-auto" />
                        <span className="truncate">{f.car_model || f.car_name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <ClassBadge carClass={f.car_class} />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <SessionBadge type={f.session_type} />
                    </TableCell>
                    <TableCell className="py-1.5 text-muted-foreground whitespace-nowrap">
                      {f.driver}
                    </TableCell>
                    <TableCell className="py-1.5 text-muted-foreground whitespace-nowrap max-w-[160px] truncate">
                      {f.weather}
                    </TableCell>
                    <TableCell className="py-1.5 text-right text-muted-foreground whitespace-nowrap">
                      {formatDateTime(f.mtime)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
