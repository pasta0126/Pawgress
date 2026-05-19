import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import LumiScene, { type EmotionalState } from "./components/LumiScene";
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

const PETS = [
  { id: "lumi",    label: "Lumi",    available: true },
  { id: "bytee",   label: "Bytee",   available: true },
  { id: "cthulhy", label: "Cthulhy", available: true },
  { id: "pedri",   label: "Pedri",   available: true },
  { id: "galaxy",  label: "Galaxy",  available: true },
];

const EMOTION_ICON: Record<EmotionalState, string> = {
  Excited: "✨", Happy: "😊", Neutral: "🌿", Tired: "💤",
};

type Panel = "stats" | "settings" | null;

function fmtIdle(secs: number) {
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function StatBar({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="stat-bar-row">
      <span className="stat-bar-label">{label}</span>
      <div className="stat-bar-track">
        <div className={`stat-bar-fill ${colorClass}`} style={{ width: `${Math.round(value)}%` }} />
      </div>
      <span className="stat-bar-pct">{Math.round(value)}%</span>
    </div>
  );
}

const stopProp = (e: React.MouseEvent) => e.stopPropagation();

export default function App() {
  const [activity, setActivity] = useState<ActivitySnapshot>(DEFAULT_ACTIVITY);
  const [pet, setPet]           = useState<PetState>(DEFAULT_PET);
  const [panel, setPanel]       = useState<Panel>(null);
  const [activePet, setActivePet]     = useState(
    () => localStorage.getItem("pawgress_active_pet") ?? "lumi"
  );
  const [pendingPet, setPendingPet]   = useState<string | null>(null);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [isBurst, setIsBurst]         = useState(false);
  const prevKeys   = useRef(0);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return () => {
      ua.then((fn) => fn());
      up.then((fn) => fn());
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

  async function handleToggleAlwaysOnTop() {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    try { await getCurrentWindow().setAlwaysOnTop(next); } catch { /* dev */ }
  }

  async function confirmSwitch() {
    if (!pendingPet) return;
    try { await invoke("reset_pet_state"); } catch { /* dev */ }
    localStorage.setItem("pawgress_active_pet", pendingPet);
    setActivePet(pendingPet);
    setPendingPet(null);
    setPanel(null);
  }

  function togglePanel(p: Panel) {
    setPanel(cur => cur === p ? null : p);
  }

  return (
    <div className="app" onMouseDown={startDrag}>
      <div className="pet-canvas-wrap">

        {/* 3D model — pointer-events disabled inside LumiScene */}
        <LumiScene emotion={pet.emotion} isBurst={isBurst} petId={activePet} />

        {/* Bottom HUD: status + level + emotion */}
        <div className="pet-hud">
          <div className={`status-dot ${activity.is_idle ? "idle" : "active"}`} />
          <span className="pet-level">Lv.{pet.stats.level}</span>
          <span className="pet-emotion">{EMOTION_ICON[pet.emotion]}</span>
        </div>

        {/* XP strip — absolute bottom */}
        <div className="xp-strip">
          <div className="xp-fill" style={{ width: `${xpPct}%` }} />
        </div>

        {/* Hover-reveal controls — top right */}
        <div className="pet-controls">
          <button
            className={`ctrl-btn ${panel === "stats" ? "active" : ""}`}
            onMouseDown={stopProp}
            onClick={() => togglePanel("stats")}
            title="Stats"
          >≡</button>
          <button
            className={`ctrl-btn ${panel === "settings" ? "active" : ""}`}
            onMouseDown={stopProp}
            onClick={() => togglePanel("settings")}
            title="Settings"
          >⚙</button>
          <button
            className="ctrl-btn close-ctrl"
            onMouseDown={stopProp}
            onClick={handleClose}
            title="Close"
          >×</button>
        </div>

        {/* ── Floating stats panel ── */}
        {panel === "stats" && (
          <div className="floating-panel" onMouseDown={stopProp}>
            <StatBar label="Mood"   value={pet.stats.mood}   colorClass="bar-mood"   />
            <StatBar label="Hunger" value={pet.stats.hunger} colorClass="bar-hunger" />
            <StatBar label="Energy" value={pet.stats.energy} colorClass="bar-energy" />
            <div className="stats-mini">
              <span>⌨ {activity.keystrokes.toLocaleString()}</span>
              <span>🖱 {activity.mouse_moves.toLocaleString()}</span>
              <span>💤 {fmtIdle(activity.idle_secs)}</span>
              <span>✦ {pet.stats.xp}/{xpNeeded} xp</span>
            </div>
          </div>
        )}

        {/* ── Floating settings panel ── */}
        {panel === "settings" && (
          <div className="floating-panel settings" onMouseDown={stopProp}>
            <div className="cfg-section">
              <span className="cfg-label">Companion</span>
              <div className="pet-selector">
                {PETS.map((p) => (
                  <button
                    key={p.id}
                    className={`pet-btn ${activePet === p.id ? "active" : ""} ${!p.available ? "locked" : ""}`}
                    onClick={() => { if (p.available && p.id !== activePet) setPendingPet(p.id); }}
                    title={p.available ? p.label : `${p.label} — coming soon`}
                  >
                    <span className="pet-btn-name">{p.label}</span>
                    {!p.available && <span className="pet-lock">🔒</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="cfg-section">
              <span className="cfg-label">Window</span>
              <label className="cfg-row">
                <span>Always on top</span>
                <button className={`toggle-btn ${alwaysOnTop ? "on" : ""}`} onClick={handleToggleAlwaysOnTop}>
                  {alwaysOnTop ? "ON" : "OFF"}
                </button>
              </label>

            </div>

            <button className="close-app-btn" onClick={handleClose}>
              × Close Pawgress
            </button>
          </div>
        )}

        {/* ── Companion-switch confirmation ── */}
        {pendingPet !== null && (
          <div className="confirm-overlay" onMouseDown={stopProp}>
            <div className="confirm-box">
              <p className="confirm-title">Change companion?</p>
              <p className="confirm-msg">
                Switching to <strong>{PETS.find(p => p.id === pendingPet)?.label}</strong> will
                reset your current pet's progress and level.
              </p>
              <div className="confirm-btns">
                <button className="confirm-cancel" onClick={() => setPendingPet(null)}>Cancel</button>
                <button className="confirm-ok" onClick={confirmSwitch}>Switch</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
