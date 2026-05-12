import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { FolderOpen, RefreshCw, Database, Trash2, ExternalLink, GitBranch, Check } from "lucide-react";
import { useVersion } from "@/stores/version";
import { cn } from "@/lib/utils";

export function Config() {
  const { active, versions, activeId, setActive, showOutdated, setShowOutdated } = useVersion();
  const [ohneSpeedEnabled, setOhneSpeedEnabled] = useState(true);
  const [autoIndex, setAutoIndex] = useState(true);
  const [systemTray, setSystemTray] = useState(true);
  const [autoUpdate, setAutoUpdate] = useState(true);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuration</h1>
        <p className="text-sm text-muted-foreground">Tous les réglages de LMU Stats Viewer.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Game paths */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chemins du jeu</CardTitle>
              <CardDescription>Les dossiers de Le Mans Ultimate sur ton disque.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PathField
                label="Dossier d'installation LMU"
                value="D:\Steam\steamapps\common\Le Mans Ultimate"
                hint="Utilisé pour lire les setups (.svm)"
              />
              <PathField
                label="Dossier des résultats"
                value="D:\Steam\steamapps\common\Le Mans Ultimate\UserData\Log\Results"
                hint="Source des XML indexés"
              />
              <PathField
                label="Dossier des setups"
                value="D:\Steam\steamapps\common\Le Mans Ultimate\UserData\player\Settings"
                hint="Détecté automatiquement"
                detected
              />
            </CardContent>
          </Card>

          {/* Game versions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                Versions du jeu
                <Badge variant="default" className="text-[10px]">Nouveau</Badge>
              </CardTitle>
              <CardDescription>
                Les patches de LMU modifient régulièrement le BoP et le grip — les stats ne sont pas comparables d'une version à l'autre.
                Sélectionne la version active : les Records, Dashboard et Sessions seront filtrés en conséquence.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {versions.map((v) => {
                  const isActive = v.id === activeId;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setActive(v.id)}
                      className={cn(
                        "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md border transition-colors",
                        isActive ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
                      )}
                    >
                      <div className={cn("flex h-7 w-7 items-center justify-center rounded-full shrink-0", isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                        {isActive ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <GitBranch className="h-3.5 w-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">v{v.label}</span>
                          <span className="text-xs text-muted-foreground font-mono">build {v.build}</span>
                          {v.isLatest && <Badge variant="default" className="text-[9px]">Dernière</Badge>}
                          {v.isCurrent && !v.isLatest && <Badge variant="semi" className="text-[9px]">Installée</Badge>}
                        </div>
                        <div className="text-[11px] text-muted-foreground">Sortie le {v.releasedAt}</div>
                      </div>
                      {isActive && <Badge variant="default" className="text-[9px]">Active</Badge>}
                    </button>
                  );
                })}
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Inclure les records d'anciennes versions</div>
                  <div className="text-xs text-muted-foreground">Les afficher en grisé avec un badge d'alerte</div>
                </div>
                <Switch checked={showOutdated} onCheckedChange={setShowOutdated} />
              </div>
              <div className="rounded-md bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                💡 Astuce : le sélecteur dans le header permet de basculer rapidement entre versions sans venir ici.
                Version active actuelle : <span className="font-mono text-foreground font-medium">v{active.label}</span>
              </div>
            </CardContent>
          </Card>

          {/* Driver profile */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profil pilote</CardTitle>
              <CardDescription>Identité utilisée pour reconnaître tes laps.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Nom pilote">
                <Input defaultValue="Cédric P." />
              </Field>
              <Field label="Fuseau horaire">
                <Input defaultValue="Europe/Paris" />
              </Field>
            </CardContent>
          </Card>

          {/* ohne_speed */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    Comparaison ohne_speed
                    <Badge variant="default" className="text-[10px]">Nouveau</Badge>
                  </CardTitle>
                  <CardDescription>Compare tes temps aux tiers de référence de la communauté.</CardDescription>
                </div>
                <Switch checked={ohneSpeedEnabled} onCheckedChange={setOhneSpeedEnabled} />
              </div>
            </CardHeader>
            <CardContent className={ohneSpeedEnabled ? "space-y-4" : "space-y-4 opacity-50 pointer-events-none"}>
              <Field label="URL Google Sheets (publication HTML)">
                <Input defaultValue="https://docs.google.com/spreadsheets/d/e/2PACX-1vTN03UvJDm99byA6vQPZHKOCYVvfxLu1zkJAzdaKyROykzEKY2-Xl1rl1q5znZEf36m88dxMKsY2eaO/pubhtml" className="font-mono text-xs" />
              </Field>
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span>Dernière synchronisation</span>
                  <span className="text-muted-foreground">il y a 4 heures</span>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh maintenant
                </Button>
              </div>
              <a href="#" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Ouvrir le Sheet d'origine <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Préférences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <ToggleRow label="Indexation automatique" desc="Scan au démarrage" checked={autoIndex} onChange={setAutoIndex} />
              <Separator />
              <ToggleRow label="Icône system tray" desc="Garder accessible en arrière-plan" checked={systemTray} onChange={setSystemTray} />
              <Separator />
              <ToggleRow label="Mises à jour auto" desc="Vérifie via GitHub Releases" checked={autoUpdate} onChange={setAutoUpdate} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Maintenance</CardTitle>
              <CardDescription>Outils de réparation de la base.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-2">
                <RefreshCw className="h-4 w-4" /> Réindexer tous les XML
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2">
                <Database className="h-4 w-4" /> Importer ancienne base (.db)
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2 text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" /> Vider le cache
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>Version</span><span className="font-mono">2.0.0-poc</span></div>
              <div className="flex justify-between"><span>Build</span><span className="font-mono">2026-05-12</span></div>
              <div className="flex justify-between"><span>Stack</span><span className="font-mono">Tauri · React 19</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function PathField({ label, value, hint, detected }: { label: string; value: string; hint: string; detected?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
        {detected && <Badge variant="semi" className="text-[10px]">Auto-détecté</Badge>}
      </div>
      <div className="flex gap-2">
        <Input defaultValue={value} className="font-mono text-xs" />
        <Button variant="outline" size="icon" className="shrink-0"><FolderOpen className="h-4 w-4" /></Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
