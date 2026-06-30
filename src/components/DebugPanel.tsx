import { useEffect, useState, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { AnimOffset } from "./LumiScene";

export type { AnimOffset };

const DEFAULT_OFFSET: AnimOffset = { x: 0, y: -1, scale: 1 };

// ── localStorage keys used for cross-window communication ─────────────────
const LS_FORCE_ANIM   = "pawgress_debug_force_anim";
const LS_OFFSET_LIVE  = "pawgress_debug_offset_live";
const LS_ANIM_NAMES   = "pawgress_anim_names";
const LS_ANIM_OFFSETS = "pawgress_anim_offsets";

export function DebugPanel() {
  const [animNames, setAnimNames] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_ANIM_NAMES) || "[]"); }
    catch { return []; }
  });
  const [animOffsets, setAnimOffsets] = useState<Record<string, AnimOffset>>(() => {
    try { return JSON.parse(localStorage.getItem(LS_ANIM_OFFSETS) || "{}"); }
    catch { return {}; }
  });
  const [activeAnim, setActiveAnim] = useState("");
  const [offset,     setOffset]     = useState<AnimOffset>(DEFAULT_OFFSET);
  const [mainSize,   setMainSize]   = useState({ w: 0, h: 0 });
  const aliveRef = useRef(true);

  // Poll main window outer size
  useEffect(() => {
    aliveRef.current = true;
    const poll = async () => {
      try {
        const mainWin = await WebviewWindow.getByLabel("main");
        if (mainWin && aliveRef.current) {
          const [sz, f] = await Promise.all([mainWin.outerSize(), mainWin.scaleFactor()]);
          if (aliveRef.current) {
            setMainSize({ w: Math.round(sz.width / f), h: Math.round(sz.height / f) });
          }
        }
      } catch { /* dev */ }
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => { aliveRef.current = false; clearInterval(id); };
  }, []);

  // Listen for localStorage changes from the main window
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_ANIM_NAMES && e.newValue) {
        try { setAnimNames(JSON.parse(e.newValue)); } catch {}
      }
      if (e.key === LS_ANIM_OFFSETS && e.newValue) {
        try { setAnimOffsets(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Write to localStorage so the main window picks it up via storage event
  function setForceAnim(name: string) {
    if (name) {
      localStorage.setItem(LS_FORCE_ANIM, name);
    } else {
      localStorage.removeItem(LS_FORCE_ANIM);
    }
    // Dispatch a storage event for the same window (storage events only fire in OTHER windows)
    window.dispatchEvent(new StorageEvent("storage", { key: LS_FORCE_ANIM, newValue: name || null }));
  }

  function setOffsetLive(anim: string, o: AnimOffset) {
    const val = JSON.stringify({ anim, ...o });
    localStorage.setItem(LS_OFFSET_LIVE, val);
    window.dispatchEvent(new StorageEvent("storage", { key: LS_OFFSET_LIVE, newValue: val }));
  }

  async function handleClose() {
    setForceAnim("");
    localStorage.removeItem(LS_OFFSET_LIVE);
    try { await getCurrentWindow().close(); } catch { /* dev */ }
  }

  async function startDrag(e: React.MouseEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).tagName === "BUTTON") return;
    try { await getCurrentWindow().startDragging(); } catch { /* dev */ }
  }

  function handleSelectAnim(name: string) {
    const saved = animOffsets[name] ?? DEFAULT_OFFSET;
    setActiveAnim(name);
    setOffset(saved);
    setForceAnim(name);
    setOffsetLive(name, saved);
  }

  function handleOffsetChange(o: AnimOffset) {
    setOffset(o);
    if (activeAnim) setOffsetLive(activeAnim, o);
  }

  function handleSave() {
    if (!activeAnim) return;
    const next = { ...animOffsets, [activeAnim]: offset };
    setAnimOffsets(next);
    localStorage.setItem(LS_ANIM_OFFSETS, JSON.stringify(next));
    // main window will pick this up via storage event automatically
  }

  function handleReset() {
    if (!activeAnim) return;
    const next = { ...animOffsets };
    delete next[activeAnim];
    setAnimOffsets(next);
    setOffset(DEFAULT_OFFSET);
    localStorage.setItem(LS_ANIM_OFFSETS, JSON.stringify(next));
    setOffsetLive(activeAnim, DEFAULT_OFFSET);
  }

  const saved = animOffsets[activeAnim];

  const mkSlider = (
    label: string, val: number, min: number, max: number, step: number,
    cb: (v: number) => void,
  ) => (
    <div className="dbg-row" key={label}>
      <span className="dbg-axis">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={val}
        className="dbg-slider"
        onChange={e => cb(parseFloat(e.target.value))}
      />
      <span className="dbg-val">{val.toFixed(2)}</span>
    </div>
  );

  return (
    <div className="panel-window" onMouseDown={startDrag}>
      <div className="panel-header">
        <span className="panel-title">Debug</span>
        <span className="dbg-size">
          {mainSize.w > 0 ? `${mainSize.w}×${mainSize.h}` : "—"}
        </span>
        <button
          className="panel-close-btn"
          onMouseDown={e => e.stopPropagation()}
          onClick={handleClose}
        >×</button>
      </div>

      <div className="dbg-section">
        <div className="dbg-label">ANIMATIONS</div>
        <div className="dbg-anims">
          {animNames.length === 0
            ? <span className="dbg-empty">Esperando app principal…</span>
            : animNames.map(name => (
              <button
                key={name}
                className={[
                  "dbg-anim-btn",
                  activeAnim === name ? "active"   : "",
                  animOffsets[name]   ? "has-save" : "",
                ].join(" ")}
                onClick={() => handleSelectAnim(name)}
                title={
                  animOffsets[name]
                    ? `saved x=${animOffsets[name].x.toFixed(2)} y=${animOffsets[name].y.toFixed(2)} s=${animOffsets[name].scale.toFixed(2)}`
                    : name
                }
              >
                {name}
              </button>
            ))
          }
        </div>
      </div>

      {activeAnim && (
        <div className="dbg-section">
          <div className="dbg-label">
            OFFSET — <span className="dbg-anim-name">{activeAnim}</span>
          </div>
          {mkSlider("X", offset.x,     -2, 2,  0.01, v => handleOffsetChange({ ...offset, x: v }))}
          {mkSlider("Y", offset.y,     -2, 2,  0.01, v => handleOffsetChange({ ...offset, y: v }))}
          {mkSlider("S", offset.scale, 0.1, 3, 0.01, v => handleOffsetChange({ ...offset, scale: v }))}
          <div className="dbg-actions">
            <button className="dbg-save-btn" onClick={handleSave}>💾 Save</button>
            <button
              className="dbg-save-btn dbg-restore-btn"
              onClick={() => handleOffsetChange(saved ?? DEFAULT_OFFSET)}
              title="Restaurar guardado o resetear"
            >↺</button>
            {saved && <button className="dbg-del-btn" onClick={handleReset}>× Del</button>}
          </div>
          {saved && (
            <div className="dbg-saved">
              saved x={saved.x.toFixed(2)} y={saved.y.toFixed(2)} s={saved.scale.toFixed(2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
