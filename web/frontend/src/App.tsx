import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import BootOverlay from "./components/BootOverlay";
import Fleet from "./pages/Fleet";
import Monitor from "./pages/Monitor";
import Simulate from "./pages/Simulate";
import Analytics from "./pages/Analytics";
import { connectLive } from "./lib/store";

export default function App() {
  const [booting, setBooting] = useState(true);
  useEffect(() => { connectLive(); }, []);

  return (
    <>
      {booting && <BootOverlay onDone={() => setBooting(false)} />}
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Fleet />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/simulate" element={<Simulate />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
