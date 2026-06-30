import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import LumiScene, { type EmotionalState, type AnimOffset } from "./components/LumiScene";
import { DebugPanel } from "./components/DebugPanel";
import { StatsPanel } from "./components/StatsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

interface ActivitySnapshot {
  mouse_moves: number; mouse_clicks: number; mouse_scrolls: number; idle_secs: number; is_idle: boolean;
}
interface PetStats { hunger: number; mood: number; energy: number; xp: number; level: number; }
interface PetState { stats: PetStats; emotion: EmotionalState; }

const DEFAULT_ACTIVITY: ActivitySnapshot = { mouse_moves: 0, mouse_clicks: 0, mouse_scrolls: 0, idle_secs: 0, is_idle: false };
const DEFAULT_PET: PetState = { stats: { hunger: 80, mood: 80, energy: 80, xp: 0, level: 1 }, emotion: "Neutral" };
const DEFAULT_OFFSET: AnimOffset = { x: 0, y: 0, scale: 1 };

const BURST_THRESHOLD     = 5;
const BURST_DURATION      = 1200;
const HYPERFOCUS_DURATION = 25 * 60 * 1000; // 25 min
const HYPERFOCUS_COOLDOWN = 30 * 60 * 1000; // 30 min cooldown after use
const PANEL_W  = 300;
const DEBUG_W  = 320;
const DEBUG_H  = 400;

const PETS = [
  { id: "bytee",   label: "Bytee",   available: true  },
  { id: "lumi",    label: "Lumi",    available: false  },
  { id: "cthulhy", label: "Cthulhu", available: false  },
  { id: "pedri",   label: "Pedri",   available: false  },
];

const EMOTION_ICON: Record<EmotionalState, string> = {
  Excited: "✨", Happy: "😊", Neutral: "🌿", Tired: "💤",
};

type Panel = "stats" | "settings" | null;

let WINDOW_LABEL = "main";
try { WINDOW_LABEL = getCurrentWindow().label; } catch { /* browser/dev fallback */ }

export default function App() {
  if (WINDOW_LABEL === "stats-panel")    return <StatsPanel />;
  if (WINDOW_LABEL === "settings-panel") return <SettingsPanel />;
  if (WINDOW_LABEL === "debug-panel")    return <DebugPanel />;
  return <MainApp />;
}

function MainApp() {
  const [consented, setConsented] = useState(
    () => localStorage.getItem("pawgress_consent_v1") === "true"
  );
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

  // ── Hyperfocus (replaces coffee/feed) ────────────────────────────────────
  const [hyperfocusActive, setHyperfocusActive] = useState(false);
  const [hyperfocusEnd,    setHyperfocusEnd]    = useState(0);
  const [lastHyperfocusTime, setLastHyperfocusTime] = useState<number>(() => {
    const s = localStorage.getItem("pawgress_last_feed");
    return s ? parseInt(s) : 0;
  });

  const hfCooldownMs  = Math.max(0, lastHyperfocusTime + HYPERFOCUS_COOLDOWN - Date.now());
  const canHyperfocus = !hyperfocusActive && hfCooldownMs === 0;
  const hfCooldownMin = Math.ceil(hfCooldownMs / 60000);
  const hfMinsLeft    = hyperfocusActive ? Math.max(0, Math.ceil((hyperfocusEnd - Date.now()) / 60000)) : 0;

  // ── Debug state ──────────────────────────────────────────────────────────
  const [debugWinOpen,    setDebugWinOpen]    = useState(false);
  const [debugForceAnim,  setDebugForceAnim]  = useState<string | undefined>(undefined);
  const [debugLiveOffset, setDebugLiveOffset] = useState<(AnimOffset & { anim: string }) | null>(null);
  const [animNames,       setAnimNames]       = useState<string[]>([]);
  const [currentAnim,     setCurrentAnim]     = useState("");
  const [pocketsTrigger,  setPocketsTrigger]  = useState(0);
  const [animOffsets, setAnimOffsets] = useState<Record<string, AnimOffset>>(() => {
    try { return JSON.parse(localStorage.getItem("pawgress_anim_offsets") || "{}"); }
    catch { return {}; }
  });
  // ─────────────────────────────────────────────────────────────────────────

  const prevClicks   = useRef(0);
  const burstTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelWinRef  = useRef<WebviewWindow | null>(null);
  const debugWinRef  = useRef<WebviewWindow | null>(null);

  // Apply persisted always-on-top on first mount
  useEffect(() => {
    if (alwaysOnTop) getCurrentWindow().setAlwaysOnTop(true).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-end hyperfocus after duration
  useEffect(() => {
    if (!hyperfocusActive) return;
    const remaining = hyperfocusEnd - Date.now();
    if (remaining <= 0) { setHyperfocusActive(false); return; }
    const t = setTimeout(() => setHyperfocusActive(false), remaining);
    return () => clearTimeout(t);
  }, [hyperfocusActive, hyperfocusEnd]);

  // Write anim names to localStorage so debug window can read them
  useEffect(() => {
    if (animNames.length === 0) return;
    localStorage.setItem("pawgress_anim_names", JSON.stringify(animNames));
  }, [animNames]);

  // Listen for debug panel communication via localStorage storage events
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "pawgress_debug_force_anim") {
        setDebugForceAnim(e.newValue || undefined);
      }
      if (e.key === "pawgress_debug_offset_live" && e.newValue) {
        try { setDebugLiveOffset(JSON.parse(e.newValue)); } catch {}
      }
      if (e.key === "pawgress_anim_offsets" && e.newValue) {
        try { setAnimOffsets(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Tauri event listeners
  useEffect(() => {
    const ua = listen<ActivitySnapshot>("activity-update", (e) => {
      const snap = e.payload;
      setActivity(snap);
      const delta = snap.mouse_clicks - prevClicks.current;
      prevClicks.current = snap.mouse_clicks;
      if (delta >= BURST_THRESHOLD) {
        setIsBurst(true);
        if (burstTimer.current) clearTimeout(burstTimer.current);
        burstTimer.current = setTimeout(() => setIsBurst(false), BURST_DURATION);
      }
    });
    const up = listen<PetState>("pet-state-update", (e) => setPet(e.payload));

    // Cross-window panel events
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
      ua.then(fn => fn()); up.then(fn => fn());
      unSwitchPet.then(fn => fn()); unAlwaysOnTop.then(fn => fn()); unCloseApp.then(fn => fn());
      if (burstTimer.current) clearTimeout(burstTimer.current);
    };
  }, []);

  const xpNeeded = pet.stats.level * 100;
  const xpPct    = Math.min((pet.stats.xp / xpNeeded) * 100, 100);

  // Compute effective position offset for LumiScene:
  // debug live preview > saved offset for current animation > default
  const posOffset: AnimOffset =
    debugForceAnim && debugLiveOffset?.anim === debugForceAnim
      ? { x: debugLiveOffset.x, y: debugLiveOffset.y, scale: debugLiveOffset.scale }
      : (animOffsets[currentAnim] ?? DEFAULT_OFFSET);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleGotchiClick(e: React.MouseEvent) {
    const t = e.target as HTMLElement;
    if (t.closest("button") || t.closest(".pet-controls") || t.closest(".pet-hud")) return;
    setPocketsTrigger(n => n + 1);
  }

  async function startDrag(e: React.MouseEvent) {
    if (e.button !== 0) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "BUTTON" || tag === "INPUT") return;
    try { await getCurrentWindow().startDragging(); } catch { /* dev */ }
  }

  function handleHyperfocusEnd() {
    setHyperfocusActive(false);
  }

  async function handleHyperfocus() {
    if (hyperfocusActive) {
      // Cancel early
      setHyperfocusActive(false);
      return;
    }
    if (!canHyperfocus) return;
    try { await invoke("feed_pet"); } catch { /* dev — backend boost */ }
    const now = Date.now();
    setLastHyperfocusTime(now);
    localStorage.setItem("pawgress_last_feed", String(now));
    setHyperfocusActive(true);
    setHyperfocusEnd(now + HYPERFOCUS_DURATION);
    setIsBurst(true);
    if (burstTimer.current) clearTimeout(burstTimer.current);
    burstTimer.current = setTimeout(() => setIsBurst(false), BURST_DURATION);
  }

  function handleConsent() {
    localStorage.setItem("pawgress_consent_v1", "true");
    setConsented(true);
  }

  async function handleClose() {
    try { await getCurrentWindow().close(); } catch { /* dev */ }
  }

  async function togglePanelWindow(p: "stats" | "settings") {
    if (panel === p && panelWinRef.current) {
      try { await panelWinRef.current.close(); } catch { /* dev */ }
      panelWinRef.current = null;
      setPanel(null);
      return;
    }
    if (panelWinRef.current) {
      try { await panelWinRef.current.close(); } catch { /* dev */ }
      panelWinRef.current = null;
    }
    setPanel(p);

    const mainWin = getCurrentWindow();
    const [pos, outerSize, factor] = await Promise.all([
      mainWin.outerPosition(), mainWin.outerSize(), mainWin.scaleFactor(),
    ]);
    const mainX  = Math.round(pos.x / factor);
    const mainY  = Math.round(pos.y / factor);
    const mainW  = Math.round(outerSize.width / factor);
    const panelX = mainX > PANEL_W + 8 ? mainX - PANEL_W - 8 : mainX + mainW + 8;
    const panelH = p === "stats" ? 220 : 340;

    const win = new WebviewWindow(`${p}-panel`, {
      url: "index.html", width: PANEL_W, height: panelH,
      x: panelX, y: mainY, transparent: true, decorations: false,
      alwaysOnTop: true, shadow: false, resizable: false, skipTaskbar: true, title: "Pawgress",
    });
    panelWinRef.current = win;
    win.once("tauri://destroyed", () => {
      panelWinRef.current = null;
      setPanel(cur => cur === p ? null : cur);
    });
  }

  async function toggleDebugWindow() {
    if (debugWinRef.current) {
      try { await debugWinRef.current.close(); } catch { /* dev */ }
      debugWinRef.current = null;
      setDebugWinOpen(false);
      setDebugForceAnim(undefined);
      setDebugLiveOffset(null);
      return;
    }

    const mainWin = getCurrentWindow();
    const [pos, outerSize, factor] = await Promise.all([
      mainWin.outerPosition(), mainWin.outerSize(), mainWin.scaleFactor(),
    ]);
    const mainX  = Math.round(pos.x / factor);
    const mainY  = Math.round(pos.y / factor);
    const mainW  = Math.round(outerSize.width / factor);
    const panelX = mainX > DEBUG_W + 8 ? mainX - DEBUG_W - 8 : mainX + mainW + 8;

    const win = new WebviewWindow("debug-panel", {
      url: "index.html", width: DEBUG_W, height: DEBUG_H,
      x: panelX, y: mainY, transparent: true, decorations: false,
      alwaysOnTop: true, shadow: false, resizable: false, skipTaskbar: true, title: "Pawgress Debug",
    });
    debugWinRef.current = win;
    setDebugWinOpen(true);

    win.once("tauri://destroyed", () => {
      debugWinRef.current = null;
      setDebugWinOpen(false);
      setDebugForceAnim(undefined);
      setDebugLiveOffset(null);
      localStorage.removeItem("pawgress_debug_force_anim");
      localStorage.removeItem("pawgress_debug_offset_live");
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app" onMouseDown={startDrag} onClick={handleGotchiClick}>
      <div className="pet-canvas-wrap">

        <LumiScene
          mood={pet.stats.mood}
          idleSecs={activity.idle_secs}
          isIdle={activity.is_idle}
          isBurst={isBurst}
          hyperfocus={hyperfocusActive}
          petId={activePet}
          requestPockets={pocketsTrigger}
          forceAnim={debugForceAnim}
          posOffset={posOffset}
          onAnimsReady={setAnimNames}
          onAnimChange={setCurrentAnim}
          onHyperfocusEnd={handleHyperfocusEnd}
        />

        {/* Bottom HUD */}
        <div className="pet-hud">
          <div className={`status-dot ${activity.is_idle ? "idle" : "active"}`} />
          <span className="pet-level">Lv.{pet.stats.level}</span>
          <span className="pet-emotion">{EMOTION_ICON[pet.emotion]}</span>
          <button
            className={[
              "feed-btn",
              !canHyperfocus && !hyperfocusActive ? "cooldown" : "",
              hyperfocusActive ? "hyperfocus-on" : "",
            ].join(" ")}
            onMouseDown={e => e.stopPropagation()}
            onClick={handleHyperfocus}
            title={
              hyperfocusActive
                ? `⚡ Hiperfoco — ${hfMinsLeft}m restantes (clic para cancelar)`
                : canHyperfocus
                  ? "⚡ Modo Hiperfoco (25 min · x2 XP si trabajas)"
                  : `Disponible en ${hfCooldownMin}m`
            }
          >
            {hyperfocusActive ? `⚡${hfMinsLeft}m` : canHyperfocus ? "⚡" : `${hfCooldownMin}m`}
          </button>
        </div>

        {/* XP strip */}
        <div className="xp-strip">
          <div className="xp-fill" style={{ width: `${xpPct}%` }} />
        </div>

        {/* Hover-reveal controls */}
        <div className="pet-controls">
          <button
            className={`ctrl-btn ${panel === "stats" ? "active" : ""}`}
            onMouseDown={e => e.stopPropagation()}
            onClick={() => togglePanelWindow("stats")}
            title="Stats"
          >≡</button>
          <button
            className={`ctrl-btn ${panel === "settings" ? "active" : ""}`}
            onMouseDown={e => e.stopPropagation()}
            onClick={() => togglePanelWindow("settings")}
            title="Settings"
          >⚙</button>
          <button
            className={`ctrl-btn debug-ctrl ${debugWinOpen ? "active" : ""}`}
            onMouseDown={e => e.stopPropagation()}
            onClick={toggleDebugWindow}
            title="Debug Panel"
          >🐛</button>
          <button
            className="ctrl-btn close-ctrl"
            onMouseDown={e => e.stopPropagation()}
            onClick={handleClose}
            title="Close"
          >×</button>
        </div>

        {/* First-run consent */}
        {!consented && (
          <div className="consent-overlay" onMouseDown={e => e.stopPropagation()}>
            <div className="consent-box">
              <p className="consent-title">Before you begin</p>
              <p className="consent-body">
                Pawgress counts your <strong>mouse activity</strong> (clicks, movement,
                scrolls) to keep your companion alive — like steps on a pedometer.
              </p>
              <ul className="consent-list">
                <li>✓ Only totals are tracked — never what you type</li>
                <li>✓ All data stays on this device</li>
                <li>✓ Nothing is sent to any server</li>
              </ul>
              <button className="consent-btn" onClick={handleConsent}>Got it</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
