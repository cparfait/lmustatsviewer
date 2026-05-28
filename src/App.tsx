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
import { Config } from "@/routes/Config";
import { Changelog } from "@/routes/Changelog";
import { Onboarding } from "@/routes/Onboarding";
import { Profile } from "@/routes/Profile";
import { useAppStore } from "@/stores/app";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isLive = location.pathname.startsWith("/live");
  const { configLoaded, isConfigured, init } = useAppStore();

  useEffect(() => {
    init();
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
