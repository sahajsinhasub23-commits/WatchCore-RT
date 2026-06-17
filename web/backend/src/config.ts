import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Repo root: backend/src -> backend -> web -> repo */
export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

export const RTOS_EXE = path.join(
  REPO_ROOT,
  "out", "build", "x64-debug", "WatchCore_RTOS.exe"
);

export const SWARM = [
  { id: "SC-01", port: 8081, orbit: "LEO-A",   label: "Polaris" },
  { id: "SC-02", port: 8082, orbit: "LEO-B",   label: "Vega"    },
  { id: "SC-03", port: 8083, orbit: "MEO",     label: "Lyra"    },
  { id: "SC-04", port: 8084, orbit: "GEO",     label: "Orion"   },
];

export const BACKEND_PORT = 3000;

export const DB_PATH = path.join(REPO_ROOT, "web", "backend", "watchcore.db");

/* Anomaly detection tuning */
export const ANOMALY = {
  windowSize: 60,
  ewmaAlpha: 0.25,
  zHigh: 3.0,
  zMedium: 2.0,
  predictHorizonFrames: 30,
};
