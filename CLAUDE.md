# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Pawgress** is a virtual desktop companion application that transforms productivity into an interactive experience. A persistent pet lives on the desktop and reacts to keyboard activity, mouse movement, focus sessions, and breaks — growing, evolving, and developing its personality as the user works.

## Project Status

Early initialization phase — no source code exists yet. Tech stack, build system, and directory structure are not yet defined.

## Core Architecture (Planned)

The application is built around five interconnected systems:

1. **Activity Monitor** — Captures keyboard/mouse input and focus/break sessions from the OS
2. **Pet State Machine** — Translates raw activity into pet stats (hunger, mood, energy, growth XP) with emotional state transitions
3. **Progression Engine** — Manages evolution milestones, personality development, and persistent memory across sessions
4. **Renderer / UI Layer** — Non-intrusive overlay on the desktop; cozy animated pet character reacting to state changes in real time
5. **Persistence Layer** — Saves pet state, history, and user preferences between sessions

Data flows unidirectionally: `Activity Monitor → Pet State Machine → Progression Engine → UI Layer`, with the Persistence Layer reading/writing state at session boundaries.

## Agent Ecosystem

See `AGENTS.md` for the full multi-agent roster and workflow. Key rules:
- **PM agent** (Sonnet) orchestrates — reads Plane, decomposes tasks, updates statuses
- **Worker agents** (Haiku) implement — backend-dev, frontend-dev, qa, infra
- All task tracking lives in Plane (`b2fcc3c4-c580-4bda-97c2-3365988da60c`); connection config in `.plane.json`
- API token goes in `.env` as `PLANE_API_TOKEN` (never committed)

## Design Principles

- **Non-intrusive**: the pet must never block work or demand attention aggressively
- **Positive-only reinforcement**: no punishment mechanics, only rewards and encouragement
- **Emotional authenticity**: pet reactions should feel genuine and contextual, not scripted
