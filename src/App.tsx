import { Route, Routes, useLocation } from "react-router";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { Dashboard } from "@/routes/Dashboard";
import { Sessions } from "@/routes/Sessions";
import { SessionDetail } from "@/routes/SessionDetail";
import { Records } from "@/routes/Records";
import { Setups } from "@/routes/Setups";
import { SetupDetail } from "@/routes/SetupDetail";
import { SetupCompare } from "@/routes/SetupCompare";
import { Live } from "@/routes/Live";
import { Config } from "@/routes/Config";

export default function App() {
  const location = useLocation();
  const isLive = location.pathname.startsWith("/live");

  return (
    <div className="min-h-screen flex flex-col">
      {!isLive && <Header />}
      <main className={isLive ? "flex-1" : "mx-auto w-full max-w-[1400px] flex-1 px-6 py-8"}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/records" element={<Records />} />
          <Route path="/setups" element={<Setups />} />
          <Route path="/setups/:id" element={<SetupDetail />} />
          <Route path="/setups/compare" element={<SetupCompare />} />
          <Route path="/live" element={<Live />} />
          <Route path="/config" element={<Config />} />
        </Routes>
      </main>
      {!isLive && <Footer />}
      {!isLive && <ScrollToTop />}
    </div>
  );
}
