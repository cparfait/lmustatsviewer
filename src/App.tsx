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
import { Setups } from "@/routes/Setups";
import { SetupDetail } from "@/routes/SetupDetail";
import { SetupCompare } from "@/routes/SetupCompare";
import { Live } from "@/routes/Live";
import { Telemetry } from "@/routes/Telemetry";
import { TelemetryView } from "@/routes/TelemetryView";
import { Config } from "@/routes/Config";
import { Overlays } from "@/routes/Overlays";
import { Changelog } from "@/routes/Changelog";
import { Onboarding } from "@/routes/Onboarding";
import { Profile } from "@/routes/Profile";
import { useAppStore } from "@/stores/app";
import { useSpotter } from "@/lib/useSpotter";
import { useCoachVoice } from "@/lib/useCoachVoice";
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

  // Spotter « à la demande » : raccourcis globaux Statut / Mute / Répète.
  useSpotter();
  // Coach IA vocal : raccourci global push-to-talk → question libre → réponse parlée.
  useCoachVoice();
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
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/sessions/:id" element={<SessionDetail />} />
            <Route path="/records" element={<Records />} />
            <Route path="/setups" element={<Setups />} />
            <Route path="/setups/:id" element={<SetupDetail />} />
            <Route path="/setups/compare" element={<SetupCompare />} />
            <Route path="/live" element={<Live />} />
            <Route path="/telemetry" element={<Telemetry />} />
            <Route path="/telemetry/view" element={<TelemetryView />} />
            <Route path="/overlays" element={<Overlays />} />
            <Route path="/config" element={<Config />} />
            <Route path="/changelog" element={<Changelog />} />
          </Routes>
        )}
      </main>
      {!isLive && !needsOnboarding && <Footer />}
      {!isLive && !needsOnboarding && <ScrollToTop />}
    </div>
    </TooltipProvider>
  );
}
