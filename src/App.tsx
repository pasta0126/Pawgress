import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import LumiScene, { type EmotionalState } from "./components/LumiScene";
import { StatsPanel } from "./components/StatsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

interface ActivitySnapshot {
  keystrokes: number; mouse_moves: number; mouse_clicks: number; idle_secs: number; is_idle: boolean;
}
interface PetStats { hunger: number; mood: number; energy: number; xp: number; level: number; }
interface PetState { stats: PetStats; emotion: EmotionalState; }

const DEFAULT_ACTIVITY: ActivitySnapshot = { keystrokes: 0, mouse_moves: 0, mouse_clicks: 0, idle_secs: 0, is_idle: false };
const DEFAULT_PET: PetState = { stats: { hunger: 80, mood: 80, energy: 80, xp: 0, level: 1 }, emotion: "Neutral" };

const BURST_THRESHOLD = 20;
const BURST_DURATION  = 1200;
const PANEL_W = 300;

const PETS = [
  { id: "lumi",    label: "Lumi",    available: true },
  { id: "cthulhy", label: "Cthulhu", available: true },
  { id: "pedri",   label: "Pedri",   available: true },
  { id: "bytee",   label: "Bytee",   available: false },
];

const EMOTION_ICON: Record<EmotionalState, string> = {
  Excited: "✨", Happy: "😊", Neutral: "🌿", Tired: "💤",
};

type Panel = "stats" | "settings" | null;

// Detect which window this instance is rendering in
let WINDOW_LABEL = "main";
try { WINDOW_LABEL = getCurrentWindow().label; } catch { /* browser/dev fallback */ }

// Route panel windows to their dedicated components
export default function App() {
  if (WINDOW_LABEL === "stats-panel")    return <StatsPanel />;
  if (WINDOW_LABEL === "settings-panel") return <SettingsPanel />;
  return <MainApp />;
}

function MainApp() {
  const [activity, setActivity] = useState<ActivitySnapshot>(DEFAULT_ACTIVITY);
  const [pet, setPet]           = useState<PetState>(DEFAULT_PET);
  const [panel, setPanel]       = useState<Panel>(null);
  const [activePet, setActivePet] = useState(() => {
    const stored = localStorage.getItem("pawgress_active_pet") ?? "lumi";
    return PETS.some(p => p.id === stored && p.available) ? stored : "lumi";
  });
  const [alwaysOnTop, setAlwaysOnTop] = useState(
    () => localStorage.getItem("pawgress_always_on_top") === "true"
  );
  const [isBurst, setIsBurst] = useState(false);

  const prevKeys    = useRef(0);
  const burstTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelWinRef = useRef<WebviewWindow | null>(null);

  // Apply persisted always-on-top on first mount
  useEffect(() => {
    if (alwaysOnTop) getCurrentWindow().setAlwaysOnTop(true).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tauri event listeners
  useEffect(() => {
    const ua = listen<ActivitySnapshot>("activity-update", (e) => {
      const snap = e.payload;
      setActivity(snap);
      const delta = snap.keystrokes - prevKeys.current;
      prevKeys.current = snap.keystrokes;
      if (delta >= BURST_THRESHOLD) {
        setIsBurst(true);
        if (burstTimer.current) clearTimeout(burstTimer.current);
        burstTimer.current = setTimeout(() => setIsBurst(false), BURST_DURATION);
      }
    });
    const up = listen<PetState>("pet-state-update", (e) => setPet(e.payload));

    // Cross-window events from panel windows
    const unSwitchPet = listen<{ petId: string }>("pawgress:switch-pet", (e) => {
      setActivePet(e.payload.petId);
    });
    const unAlwaysOnTop = listen<{ value: boolean }>("pawgress:toggle-always-on-top", async (e) => {
      const next = e.payload.value;
      setAlwaysOnTop(next);
      try { await getCurrentWindow().setAlwaysOnTop(next); } catch { /* dev */ }
    });
    const unCloseApp = listen("pawgress:close-app", async () => {
      try { await getCurrentWindow().close(); } catch { /* dev */ }
    });

    return () => {
      ua.then((fn) => fn());
      up.then((fn) => fn());
      unSwitchPet.then((fn) => fn());
      unAlwaysOnTop.then((fn) => fn());
      unCloseApp.then((fn) => fn());
      if (burstTimer.current) clearTimeout(burstTimer.current);
    };
  }, []);

  const xpNeeded = pet.stats.level * 100;
  const xpPct    = Math.min((pet.stats.xp / xpNeeded) * 100, 100);

  async function startDrag(e: React.MouseEvent) {
    if (e.button !== 0) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "BUTTON" || tag === "INPUT") return;
    try { await getCurrentWindow().startDragging(); } catch { /* dev */ }
  }

  async function handleClose() {
    try { await getCurrentWindow().close(); } catch { /* dev */ }
  }

  async function togglePanelWindow(p: "stats" | "settings") {
    // If this panel is already open, close it
    if (panel === p && panelWinRef.current) {
      try { await panelWinRef.current.close(); } catch { /* dev */ }
      panelWinRef.current = null;
      setPanel(null);
      return;
    }

    // Close any currently open panel first
    if (panelWinRef.current) {
      try { await panelWinRef.current.close(); } catch { /* dev */ }
      panelWinRef.current = null;
    }

    setPanel(p);

    // Calculate position: prefer left of gotchi, fall back to right
    const mainWin = getCurrentWindow();
    const [pos, outerSize, factor] = await Promise.all([
      mainWin.outerPosition(),
      mainWin.outerSize(),
      mainWin.scaleFactor(),
    ]);
    const mainX = Math.round(pos.x / factor);
    const mainY = Math.round(pos.y / factor);
    const mainW = Math.round(outerSize.width / factor);
    const panelX = mainX > PANEL_W + 8 ? mainX - PANEL_W - 8 : mainX + mainW + 8;
    const panelH = p === "stats" ? 220 : 340;

    const win = new WebviewWindow(`${p}-panel`, {
      url: "index.html",
      width: PANEL_W,
      height: panelH,
      x: panelX,
      y: mainY,
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
      shadow: false,
      resizable: false,
      skipTaskbar: true,
      title: "Pawgress",
    });

    panelWinRef.current = win;

    win.once("tauri://destroyed", () => {
      panelWinRef.current = null;
      setPanel((cur) => cur === p ? null : cur);
    });
  }

  return (
    <div className="app" onMouseDown={startDrag}>
      <div className="pet-canvas-wrap">

        <LumiScene emotion={pet.emotion} isBurst={isBurst} petId={activePet} />

        {/* Bottom HUD: status + level + emotion */}
        <div className="pet-hud">
          <div className={`status-dot ${activity.is_idle ? "idle" : "active"}`} />
          <span className="pet-level">Lv.{pet.stats.level}</span>
          <span className="pet-emotion">{EMOTION_ICON[pet.emotion]}</span>
        </div>

        {/* XP strip */}
        <div className="xp-strip">
          <div className="xp-fill" style={{ width: `${xpPct}%` }} />
        </div>

        {/* Hover-reveal controls */}
        <div className="pet-controls">
          <button
            className={`ctrl-btn ${panel === "stats" ? "active" : ""}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => togglePanelWindow("stats")}
            title="Stats"
          >≡</button>
          <button
            className={`ctrl-btn ${panel === "settings" ? "active" : ""}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => togglePanelWindow("settings")}
            title="Settings"
          >⚙</button>
          <button
            className="ctrl-btn close-ctrl"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleClose}
            title="Close"
          >×</button>
        </div>

      </div>
    </div>
  );
}

