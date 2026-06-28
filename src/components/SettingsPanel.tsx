import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

const PETS = [
  { id: "lumi",    label: "Lumi",    available: true },
  { id: "cthulhy", label: "Cthulhu", available: true },
  { id: "pedri",   label: "Pedri",   available: true },
  { id: "bytee",   label: "Bytee",   available: false },
];

export function SettingsPanel() {
  const [activePet, setActivePet] = useState(() => {
    const stored = localStorage.getItem("pawgress_active_pet") ?? "lumi";
    return PETS.some(p => p.id === stored && p.available) ? stored : "lumi";
  });
  const [pendingPet, setPendingPet] = useState<string | null>(null);
  const [alwaysOnTop, setAlwaysOnTop] = useState(
    () => localStorage.getItem("pawgress_always_on_top") === "true"
  );

  async function handleClose() {
    try { await getCurrentWindow().close(); } catch { /* dev */ }
  }

  async function startDrag(e: React.MouseEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).tagName === "BUTTON") return;
    try { await getCurrentWindow().startDragging(); } catch { /* dev */ }
  }

  async function confirmSwitch() {
    if (!pendingPet) return;
    try { await invoke("reset_pet_state"); } catch { /* dev */ }
    localStorage.setItem("pawgress_active_pet", pendingPet);
    setActivePet(pendingPet);
    setPendingPet(null);
    await emit("pawgress:switch-pet", { petId: pendingPet });
  }

  async function handleToggleAlwaysOnTop() {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    localStorage.setItem("pawgress_always_on_top", String(next));
    await emit("pawgress:toggle-always-on-top", { value: next });
  }

  async function handleCloseApp() {
    await emit("pawgress:close-app", {});
    try { await getCurrentWindow().close(); } catch { /* dev */ }
  }

  return (
    <div className="panel-window" onMouseDown={startDrag}>
      <div className="panel-header">
        <span className="panel-title">Settings</span>
        <button
          className="panel-close-btn"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleClose}
        >×</button>
      </div>

      {pendingPet ? (
        <div className="panel-confirm">
          <p className="confirm-title">Change companion?</p>
          <p className="confirm-msg">
            Switching to <strong>{PETS.find(p => p.id === pendingPet)?.label}</strong> will
            reset your current pet's progress.
          </p>
          <div className="confirm-btns">
            <button className="confirm-cancel" onClick={() => setPendingPet(null)}>Cancel</button>
            <button className="confirm-ok" onClick={confirmSwitch}>Switch</button>
          </div>
        </div>
      ) : (
        <>
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
              <button
                className={`toggle-btn ${alwaysOnTop ? "on" : ""}`}
                onClick={handleToggleAlwaysOnTop}
              >
                {alwaysOnTop ? "ON" : "OFF"}
              </button>
            </label>
          </div>

          <button className="close-app-btn" onClick={handleCloseApp}>
            × Close Pawgress
          </button>
          <span className="cfg-version">v0.3.2</span>
        </>
      )}
    </div>
  );
}
