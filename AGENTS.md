# AGENTS.md — Pawgress Agent Ecosystem

## Overview

Multi-agent system for Pawgress development. All task management flows through Plane. The PM agent orchestrates; worker agents execute. Blocked items are escalated to the human immediately.

---

## Agent Roster

### PM — Project Manager
- **Model**: claude-sonnet-4-6 (current model)
- **Role**: Reads Plane issues, breaks them into actionable subtasks, assigns to worker agents, updates issue statuses, detects blockers and escalates.
- **Responsibilities**:
  - Analyze Plane issues before any implementation begins
  - Decompose epics/stories into concrete tasks per agent
  - Update issue status: `backlog → in_progress → in_review → done`
  - Set status to `blocked` and notify human when information is missing
  - Review outputs from worker agents before closing issues

### backend-dev — Rust/Tauri Developer
- **Model**: claude-haiku-4-5-20251001
- **Role**: All Rust and Tauri backend code.
- **Scope**: `src-tauri/` — system activity hooks (`rdev`), pet state machine, persistence layer, Tauri commands/events, IPC bridge.

### frontend-dev — React/TypeScript Developer
- **Model**: claude-haiku-4-5-20251001
- **Role**: All frontend UI code.
- **Scope**: `src/` — React components, pet animations (CSS/Canvas), TypeScript types, Vite config, UI state management.

### qa — QA & Testing
- **Model**: claude-haiku-4-5-20251001
- **Role**: Write and run tests; verify implementations match requirements.
- **Scope**: Rust unit tests (`#[cfg(test)]`), Vitest/Playwright for frontend, integration test scenarios.

### infra — Build & Infrastructure
- **Model**: claude-haiku-4-5-20251001
- **Role**: CI/CD, build pipeline, release packaging.
- **Scope**: GitHub Actions workflows, Tauri build config, code signing, `.gitignore`, tooling config.

---

## Workflow

```
Plane Issue (backlog)
  → PM reads & analyzes
  → PM decomposes into subtasks
  → PM assigns to worker agent(s)
  → Worker implements
  → QA verifies
  → PM marks issue done in Plane
```

### Status conventions (Plane)
| Status | Meaning |
|--------|---------|
| `backlog` | Not yet picked up |
| `in_progress` | Agent actively working |
| `in_review` | Awaiting QA or PM review |
| `blocked` | Needs human input — PM notifies immediately |
| `done` | Verified complete |

---

## Rules

- Worker agents NEVER update Plane statuses directly — only PM does.
- If a task requires information not in the issue, set `blocked` and stop.
- Model overrides are not allowed — Haiku for workers, Sonnet for PM.
- No task is marked `done` without QA passing.
