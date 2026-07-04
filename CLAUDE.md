# CLAUDE.md — Agent Context for phyphox-local-dashboard

Read this file first in any new session on this repo. It is a short status snapshot, not a design doc — for full architecture/rationale see `IMPLEMENTATION_PLAN.md`.

## What this project is
A local web dashboard (runs on a researcher's laptop, no cloud) that connects to multiple mobile devices running **phyphox**, each exposing its sensors over phyphox's built-in unauthenticated HTTP remote-access interface (`/get`, `/config`, `/meta`, `/control`, `/time`, `/export`). The dashboard polls each device, re-publishes live data to a browser UI over WebSocket, and provides view/filter/record/export/control features across all connected devices. Full detail: `IMPLEMENTATION_PLAN.md`.

## Current status
**Planning stage — no application code yet.** Only `IMPLEMENTATION_PLAN.md` and this file exist. Next step is Phase 0 (project scaffolding) from the roadmap in `IMPLEMENTATION_PLAN.md` Section 11.

## Locked-in architectural decisions (don't re-litigate without reason)
- Backend owns **all** polling of phone devices; the browser never talks to phones directly — only to the local backend via REST + WebSocket. (`IMPLEMENTATION_PLAN.md` Section 1)
- Stack: Node.js + TypeScript backend (Fastify, `ws`, `better-sqlite3`), React + TypeScript + Vite frontend, uPlot for real-time charts, Zustand for state, Tailwind for styling. (Section 2)
- Packaging for v1: plain `npm start` that launches the backend and opens a browser tab — no Electron unless/until the user asks for it. (Section 2, open question in Section 12)
- Phyphox's remote interface has no auth — the dashboard cannot add security phone-side; it binds to `localhost` by default and warns the user to stay on a private network. (Section 8)

## Open questions not yet resolved (do not silently decide these — see `IMPLEMENTATION_PLAN.md` Section 4 and 12 for full context)
1. **Cross-device timestamp trust**: can `/time`-aligned timestamps from two different phones be treated as directly comparable, and to what tolerance? Needs a real synchronized-capture test before deciding. (Plan Section 4.1)
2. **Pause/resume semantics**: if one device is stopped/paused while others keep running and later resumes, what happens to its clock and how should the dashboard represent the gap in recorded/exported data? Needs a real pause/resume test capture before deciding. (Plan Section 4.2)
3. Preferred export format (raw per-device CSV vs. combined time-aligned CSV vs. both) — unresolved, ask the user.
4. Expected max concurrent device count — affects whether default 200ms polling is safe or needs adaptive scaling — unresolved, ask the user.

## Documentation maintenance rule
`README.md` (setup/getting-started/controls reference) and this `CLAUDE.md` must be updated as part of the definition-of-done for any phase/PR that changes a feature, control, or architectural decision — not deferred as separate cleanup. See `IMPLEMENTATION_PLAN.md` Sections 9 and 10.

## How to run locally
Not yet applicable — no code exists. This section will be filled in once Phase 0/1 scaffolding lands.
