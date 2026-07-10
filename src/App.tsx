import { useEffect } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router";
import { listen } from "@tauri-apps/api/event";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { UpdateBanner } from "@/components/UpdateBanner";
import { Dashboard } from "@/routes/Dashboard";
import { Sessions } from "@/routes/Sessions";
import { SessionDetail } from "@/routes/SessionDetail";
import { Records } from "@/routes/Records";
import { References } from "@/routes/References";
import { Setups } from "@/routes/Setups";
import { SetupDetail } from "@/routes/SetupDetail";
import { SetupCompare } from "@/routes/SetupCompare";
import { Live } from "@/routes/Live";
import { Telemetry } from "@/routes/Telemetry";
import { TelemetryView } from "@/routes/TelemetryView";
import { ConfigV2 } from "@/routes/ConfigV2";
import { Overlays } from "@/routes/Overlays";
import { Changelog } from "@/routes/Changelog";
import { Onboarding } from "@/routes/Onboarding";
import { GuidedTour } from "@/components/GuidedTour";
import { Profile } from "@/routes/Profile";
import { NotFound } from "@/routes/NotFound";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DialogHost } from "@/components/DialogHost";
import { useAppStore } from "@/stores/app";
import { fetchBenchmarks } from "@/lib/ohne_speed";
import { useSpotter } from "@/lib/useSpotter";
import { usePitLoss } from "@/lib/usePitLoss";
import { useCoachVoice } from "@/lib/useCoachVoice";
import { useCornerCoach } from "@/lib/useCornerCoach";
import { useOverlayShortcut } from "@/lib/useOverlayShortcut";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isLive = location.pathname.startsWith("/live");
  const { configLoaded, isConfigured, init } = useAppStore();

  useEffect(() => {
    init();
  }, [init]); // `init` est une action de store stable → effet exécuté une seule fois

  // Préchargement en tâche de fond des références OhneSpeed (cache module, 1×/
  // lancement) → page Références + badges de tier instantanés ensuite. Best-effort.
  useEffect(() => {
    fetchBenchmarks().catch(() => {});
  }, []);

  // Spotter « à la demande » : raccourcis globaux Statut / Mute / Répète.
  useSpotter();
  // Benchmark automatique du temps perdu au stand (T13 #152) → alimente #151.
  usePitLoss();
  // Coach IA vocal : raccourci global push-to-talk → question libre → réponse parlée.
  useCoachVoice();
  // Coach par virage : conseils vocaux automatiques en roulage (fenêtre de délivrance).
  useCornerCoach();
  // Raccourci global Afficher/Masquer les overlays.
  useOverlayShortcut();

  // Resynchronisation auto quand l'utilisateur revient sur l'app après avoir
  // couru dans LMU (sync delta silencieuse — seuls les nouveaux XML sont relus).
  useEffect(() => {
    const trySync = () => {
      // Inutile de synchroniser pendant qu'on regarde le Live.
      if (window.location.pathname.startsWith("/live")) return;
      useAppStore.getState().syncQuiet();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") trySync();
    };
    window.addEventListener("focus", trySync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", trySync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Navigation déclenchée depuis le menu du system tray.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<string>("tray-nav", (e) => navigate(e.payload)).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [navigate]);

  // Tant que la configuration n'est pas chargée, on n'affiche rien.
  if (!configLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const needsOnboarding = !isConfigured && !isLive;

  return (
    <TooltipProvider>
    <div className="min-h-screen flex flex-col">
      <DialogHost />
      {!isLive && !needsOnboarding && <Header />}
      {!isLive && !needsOnboarding && <UpdateBanner />}
      <main
        className={
          isLive
            ? "flex-1"
            : "mx-auto w-full max-w-[1800px] flex-1 px-4 py-6"
        }
      >
        {needsOnboarding ? (
          <Onboarding />
        ) : (
          <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/sessions/:id" element={<SessionDetail />} />
            <Route path="/records" element={<Records />} />
            <Route path="/references" element={<References />} />
            <Route path="/setups" element={<Setups />} />
            <Route path="/setups/:id" element={<SetupDetail />} />
            <Route path="/setups/compare" element={<SetupCompare />} />
            <Route path="/live" element={<Live />} />
            <Route path="/telemetry" element={<Telemetry />} />
            <Route path="/telemetry/view" element={<TelemetryView />} />
            <Route path="/overlays" element={<Overlays />} />
            {/* Config V2 = seule page de configuration. */}
            <Route path="/config" element={<ConfigV2 />} />
            <Route path="/changelog" element={<Changelog />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </ErrorBoundary>
        )}
      </main>
      {!isLive && !needsOnboarding && <Footer />}
      {!isLive && !needsOnboarding && <ScrollToTop />}
      {/* Visite guidée — ouverte à la fin de l'onboarding ou depuis l'aide « ? ». */}
      {!isLive && <GuidedTour />}
    </div>
    </TooltipProvider>
  );
}
