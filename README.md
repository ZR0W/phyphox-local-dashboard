# Phyphox Local Dashboard

A local web dashboard that connects to multiple mobile devices running phyphox, displays their live sensor data, and provides controls to view, filter, record, and export it. Runs entirely on your own laptop — no cloud dependency.

> **Status: Phase 0 (project scaffolding).** The full design and roadmap live in [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md); ongoing agent-session context lives in [`CLAUDE.md`](./CLAUDE.md). The sections below will be filled in as each roadmap phase lands — see `IMPLEMENTATION_PLAN.md` Section 9 for the full spec this README is expected to satisfy.

## Prerequisites

- Node.js 22+
- A phone with the [phyphox app](https://phyphox.org/) installed
- Phone and laptop on the same routable network (a phone hotspot is the most reliable option)

## Phone-side setup

1. Open phyphox, load or select the experiment you want to stream.
2. Open the menu and enable **"Allow remote access."**
3. Note the `IP:port` phyphox displays (Android typically `8080`; iOS typically `80`/blank).

## Installation

```bash
npm install
```

## Starting the server

```bash
npm run dev:backend    # starts the local backend (Phase 1+)
npm run dev:frontend   # starts the dashboard UI (Phase 2+)
```

_A single combined `npm start` that launches both and opens a browser tab automatically lands in Phase 7 — see the roadmap._

## Adding a device

_Coming in Phase 3 — device management UI._

## Controls reference

_Coming in Phase 4 — will list every control (Start/Stop/Clear per-device and All, Record, Export, Remove) and exactly what it does, per `IMPLEMENTATION_PLAN.md` Section 9._

## Troubleshooting

_Coming as features land — network isolation, iOS port defaults, reconnect behavior, export file locations._

## Development

```bash
npm run lint       # ESLint across all workspaces
npm run format     # Prettier check
npm run typecheck  # TypeScript across all workspaces
npm run test       # Vitest across all workspaces
npm run build      # Build all workspaces
```

This is an npm-workspaces monorepo: `shared/` (types shared between backend and frontend), `backend/` (Node.js/Fastify server that polls phyphox devices), `frontend/` (React/Vite dashboard UI).
