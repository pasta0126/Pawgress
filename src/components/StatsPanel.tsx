import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface ActivitySnapshot {
  keystrokes: number;
  mouse_moves: number;
  mouse_clicks: number;
  idle_secs: number;
  is_idle: boolean;
}

interface PetStats { hunger: number; mood: number; energy: number; xp: number; level: number; }
interface PetState { stats: PetStats; emotion: string; }

const DEFAULT_ACTIVITY: ActivitySnapshot = {
  keystrokes: 0, mouse_moves: 0, mouse_clicks: 0, idle_secs: 0, is_idle: false,
};
const DEFAULT_PET: PetState = {
  stats: { hunger: 80, mood: 80, energy: 80, xp: 0, level: 1 }, emotion: "Neutral",
};

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

export function StatsPanel() {
  const [activity, setActivity] = useState<ActivitySnapshot>(DEFAULT_ACTIVITY);
  const [pet, setPet] = useState<PetState>(DEFAULT_PET);

  useEffect(() => {
    const ua = listen<ActivitySnapshot>("activity-update", (e) => setActivity(e.payload));
    const up = listen<PetState>("pet-state-update", (e) => setPet(e.payload));
    return () => {
      ua.then((fn) => fn());
      up.then((fn) => fn());
    };
  }, []);

  async function handleClose() {
    try { await getCurrentWindow().close(); } catch { /* dev */ }
  }

  async function startDrag(e: React.MouseEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).tagName === "BUTTON") return;
    try { await getCurrentWindow().startDragging(); } catch { /* dev */ }
  }

  const xpNeeded = pet.stats.level * 100;

  return (
    <div className="panel-window" onMouseDown={startDrag}>
      <div className="panel-header">
        <span className="panel-title">Stats · Lv.{pet.stats.level}</span>
        <button
          className="panel-close-btn"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleClose}
        >×</button>
      </div>

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
  );
}
