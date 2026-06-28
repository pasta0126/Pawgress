# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Pawgress** is a virtual desktop companion (Tauri v2 + React + TypeScript) where a persistent pet lives on the desktop and reacts to keyboard/mouse activity, growing and evolving as the user works.

## Commands

```bash
npm run tauri dev          # Dev mode (starts Vite on :1420 + Rust backend)
npm run tauri build        # Release build
npm run dev                # Vite frontend only (no Rust, for UI iteration)
npx tsc --noEmit           # TypeScript type check
cd src-tauri && cargo test # Run Rust unit tests
pwsh scripts/build-windows.ps1  # Windows release build (local)
```

CI releases are triggered by `v*` tags or `workflow_dispatch` in `.github/workflows/release.yml`. The Mac runner builds a universal DMG; Windows uses the PowerShell script.

## Architecture

### Backend → Frontend data flow

Every second, a `tokio` interval tick in `lib.rs` runs the core loop:
1. Reads a delta snapshot from `ActivityState` (counts keystrokes/clicks since last tick)
2. Calls `pet.apply_activity(ks_delta, cl_delta)` → boosts XP and mood, drains hunger
3. Calls `pet.apply_decay(1.0, is_idle)` → idle restores energy / erodes mood; active drains energy
4. Calls `progression::try_level_up(&mut pet.stats)` → level-up threshold is `level × 100 XP`
5. Calls `pet.resolve_emotion()` → derives `EmotionalState` from mood + energy thresholds
6. Emits `activity-update` and `pet-state-update` Tauri events to the frontend
7. Every 30 ticks, persists `PetState` to `pawgress.json` via `tauri-plugin-store`

### Rust modules (`src-tauri/src/`)

| File | Role |
|---|---|
| `lib.rs` | Tauri builder, shared state (`Arc<Mutex<…>>`), tick loop, IPC commands |
| `activity.rs` | Global OS input capture via `rdev::listen` in a background thread; idle threshold = 30s |
| `pet_state.rs` | `PetStats` (hunger/mood/energy/xp/level) + `EmotionalState` enum + stat mutation logic |
| `progression.rs` | `try_level_up` — XP threshold = `level × 100` |
| `persistence.rs` | Thin `serialize`/`deserialize` helpers (actual I/O is done in `lib.rs` via plugin-store) |

Tauri commands exposed to frontend: `get_activity`, `get_pet_state`, `reset_pet_state`.

### Frontend (`src/`)

- **`App.tsx`** — Root component. Listens to `activity-update` and `pet-state-update` events. Manages panel state (stats/settings/null), pet selection (`localStorage`), always-on-top toggle, and burst detection (≥20 keystrokes/tick triggers a 1.2s wave animation).
- **`LumiScene.tsx`** — React Three Fiber canvas rendering the active pet's GLB. The `emotion` prop drives subtle rotation; `isBurst` triggers a sinusoidal wave. Models are preloaded from `public/<petId>.glb`.
- **`Lumi.tsx` / `Lumi.css`** — Legacy component kept for the `EmotionalState` type export.

Pet roster (defined in `App.tsx`): `lumi`, `cthulhy`, `pedri` (available), `bytee` (locked/coming soon). GLBs live in `public/`.

### Window

Transparent, decoration-less, 280×380px. Dragging is implemented by calling `getCurrentWindow().startDragging()` on `mousedown` on the root `div` (buttons intercept with `stopPropagation`).

## Tauri Plugins

- `tauri-plugin-store` — JSON persistence (`pawgress.json`)
- `tauri-plugin-window-state` — remembers window position across sessions
- `tauri-plugin-opener` — opens URLs/files

## Agent Ecosystem

See `AGENTS.md`. All task tracking lives in Plane (project `edebc4d3-49e0-4d0c-897b-2c0b2bfd7f72`). Only the PM agent (Sonnet) updates Plane statuses; worker agents (Haiku) implement.

## Design Principles

- **Non-intrusive**: the pet must never block work or demand attention aggressively
- **Positive-only reinforcement**: no punishment mechanics, only rewards and encouragement
- **Emotional authenticity**: pet reactions should feel genuine and contextual, not scripted
