import { useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Flag,
  FolderOpen,
  Loader2,
  CheckCircle,
  AlertTriangle,
  FolderSearch,
} from "lucide-react";
import { useAppStore } from "@/stores/app";
import { useTourStore } from "@/stores/tour";
import { config } from "@/lib/api";
import type { DetectResult, IndexReport } from "@/lib/api";

type Step =
  | "idle"
  | "detecting"
  | "detected"
  | "indexing"
  | "done"
  | "error"
  | "manual";

export function Onboarding() {
  const { t } = useTranslation();
  const runSetup = useAppStore((s) => s.runSetup);
  const [step, setStep] = useState<Step>("idle");
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null);
  const [report, setReport] = useState<IndexReport | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [manualPath, setManualPath] = useState("");

  const handleAutoDetect = async () => {
    setStep("detecting");
    try {
      const result = await config.detectLmu();
      setDetectResult(result);
      setStep("detected");
    } catch {
      setErrorMsg(t("onboarding.notDetected"));
      setStep("error");
    }
  };

  const doSetup = async (lmuPath: string, playerName: string) => {
    setStep("indexing");
    try {
      const result = await runSetup(lmuPath, playerName);
      setReport(result);
      setStep("done");
    } catch (e) {
      setErrorMsg(String(e));
      setStep("error");
    }
  };

  const handleConfirmSetup = () => {
    if (!detectResult) return;
    doSetup(detectResult.lmu_path, detectResult.player_name);
  };

  const handleBrowse = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t("onboarding.selectLmuFolder"),
    });
    if (selected && typeof selected === "string") {
      setManualPath(selected);
    }
  };

  const handleManualSetup = async () => {
    if (!manualPath.trim()) return;
    setStep("indexing");
    try {
      const detected = await config.inspectLmu(manualPath.trim());
      setReport(await runSetup(detected.lmu_path, detected.player_name));
      setStep("done");
    } catch {
      setErrorMsg(t("onboarding.resultsNotFound"));
      setStep("error");
    }
  };

  // L'application sort de l'onboarding automatiquement (isConfigured passe à true
  // après runSetup). On enchaîne sur la visite guidée (explication de toutes les
  // fonctions) — relançable ensuite via l'aide « ? » du header.
  const handleFinish = () => {
    useAppStore.setState({ isConfigured: true });
    useTourStore.getState().setOpen(true);
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg mx-auto">
            <Flag className="h-8 w-8" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold">{t("onboarding.welcome")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("onboarding.autoDetect")}
          </p>
        </div>

        {step === "idle" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-primary" />
                {t("onboarding.autoConfig")}
              </CardTitle>
              <CardDescription>
                {t("onboarding.autoConfigDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/40 rounded-md p-4 space-y-2 text-sm">
                {[
                  "detectSteam",
                  "scanXml",
                  "detectDriver",
                  "indexAll",
                ].map((k) => (
                  <div key={k} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-success shrink-0" />
                    <span>{t(`onboarding.${k}`)}</span>
                  </div>
                ))}
              </div>
              <Button className="w-full" size="lg" onClick={handleAutoDetect}>
                <FolderOpen className="h-4 w-4 mr-2" />
                {t("onboarding.startDetect")}
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => setStep("manual")}
              >
                <FolderSearch className="h-4 w-4 mr-2" />
                {t("onboarding.orChooseFolder")}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "detecting" && (
          <Card>
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-medium">{t("onboarding.detecting")}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("onboarding.detectingDesc")}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "detected" && detectResult && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                {t("onboarding.detected")}
              </CardTitle>
              <CardDescription>{t("onboarding.detectedDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-muted/40 rounded-md p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("onboarding.lmuPath")}
                  </span>
                  <span className="font-mono text-xs break-all text-right max-w-[60%]">
                    {detectResult.lmu_path}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("onboarding.detectedDriver")}
                  </span>
                  <span className="font-medium">
                    {detectResult.player_name || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("onboarding.xmlFilesFound")}
                  </span>
                  <span className="font-mono">{detectResult.xml_count}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep("idle")}
                  className="flex-1"
                >
                  {t("onboarding.back")}
                </Button>
                <Button className="flex-1" onClick={handleConfirmSetup}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  {t("onboarding.confirmAndIndex")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "indexing" && (
          <Card>
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-medium">{t("onboarding.indexing")}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("onboarding.indexingDesc")}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {t("onboarding.indexingTime")}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "done" && report && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                {t("onboarding.done")}
              </CardTitle>
              <CardDescription>{t("onboarding.doneDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-muted/40 rounded-md p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("onboarding.filesScanned")}
                  </span>
                  <span className="font-mono">{report.files_scanned}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("onboarding.filesIndexed")}
                  </span>
                  <span className="font-mono">{report.added}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("onboarding.sessionsCreated")}
                  </span>
                  <span className="font-mono font-bold text-primary">
                    {report.sessions_created}
                  </span>
                </div>
                {report.errors.length > 0 && (
                  <div className="pt-2 border-t border-border/60">
                    <span className="text-destructive text-xs">
                      {report.errors.length} {t("onboarding.errorsIgnored")}
                    </span>
                  </div>
                )}
              </div>
              <Button className="w-full" size="lg" onClick={handleFinish}>
                {t("onboarding.goToDashboard")}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "error" && (
          <Card>
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <div className="text-center">
                <p className="font-medium">{t("onboarding.detectFailed")}</p>
                <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
              </div>
              <div className="flex gap-2 w-full">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("idle");
                    setErrorMsg("");
                  }}
                  className="flex-1"
                >
                  {t("onboarding.retry")}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    setStep("manual");
                    setErrorMsg("");
                  }}
                >
                  <FolderSearch className="h-4 w-4 mr-2" />
                  {t("onboarding.chooseFolder")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "manual" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FolderSearch className="h-4 w-4 text-primary" />
                {t("onboarding.selectFolder")}
              </CardTitle>
              <CardDescription>
                {t("onboarding.selectFolderDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full h-auto py-4 justify-start gap-3"
                onClick={handleBrowse}
              >
                <FolderSearch className="h-5 w-5 text-primary shrink-0" />
                <div className="text-left">
                  <div className="text-sm font-medium">
                    {t("onboarding.browse")}
                  </div>
                  {manualPath ? (
                    <div className="font-mono text-xs text-muted-foreground mt-0.5 break-all">
                      {manualPath}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t("onboarding.selectLmuFolder")}
                    </div>
                  )}
                </div>
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("onboarding.mustContain")}{" "}
                <code className="bg-muted px-1 rounded">
                  UserData\Log\Results
                </code>
              </p>
              {errorMsg && (
                <p className="text-xs text-destructive">{errorMsg}</p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("idle");
                    setErrorMsg("");
                  }}
                  className="flex-1"
                >
                  {t("onboarding.back")}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleManualSetup}
                  disabled={!manualPath.trim()}
                >
                  {t("onboarding.startIndex")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
