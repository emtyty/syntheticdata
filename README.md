# Synthetic Data Generator

A full-stack web application for generating realistic synthetic data from SQL DDL, Prisma schemas, or CSV uploads. Define your tables, configure column generators, and export production-like datasets in seconds — no LLM, no API key, runs entirely offline.

![Node](https://img.shields.io/badge/node-18%2B-green)

## Features

### Schema & Import
- **Multi-format import** — SQL DDL, Prisma schema files, or CSV uploads with automatic type inference
- **Visual schema editor** — Configure data generators per column with a rich UI (30+ Faker locales)
- **Relationship awareness** — Topological sort respects foreign key constraints; parent rows generate before children
- **Conditional rules** — Set values based on other column values (eq/neq/gt/lt/contains, AND-joined)
- **Single-table wizard** — Step-by-step flow (Import → Schema → Generate → Preview) for quick one-off datasets
- **Multi-table projects** — Manage related tables in a single project with a React Flow diagram view

### Generation & Export
- **Streaming generation** — 10k-row chunks bound memory; cancellable jobs with live progress
- **Seeded reproducibility** — Same seed = identical output across runs
- **Advanced FK control** — Uniform / weighted / fixed-per-parent distributions, weighted values, fixed value subsets
- **Multiple export formats** — CSV, JSON, JSONL, SQL INSERT statements, ZIP bundles, SQLite `.db` files
- **Read-only SQL queries** — Run queries against generated data through a built-in safe SQL authorizer

### App
- **Dashboard** — Live stats: total projects, tables, rows generated, completed jobs
- **Project management** — Search, rename, duplicate, delete with confirmation
- **Light / dark theme** — Full Neon Architect palette in dark mode, Material-light variant in light mode; persists across reloads
- **Persistence** — Schemas, projects, and jobs stored in embedded SQLite (WAL mode)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Zustand, TanStack Table, React Flow, react-dropzone |
| Backend | Fastify, TypeScript, Faker.js, Zod, better-sqlite3, papaparse, fast-csv, jszip, archiver, seedrandom |
| Storage | SQLite (embedded, WAL mode) — schemas, projects, jobs |
| Monorepo | npm workspaces |

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
npm install
```

### Development

Run backend and frontend concurrently in separate terminals:

```bash
# Terminal 1 — Backend  (http://localhost:3001)
npm run dev:backend

# Terminal 2 — Frontend (http://localhost:5173)
npm run dev:frontend
```

The Vite dev server proxies `/api/v1/*` to the backend.

### Build

```bash
npm run build
```

## Routes

| Path | Description |
|---|---|
| `/` | Project list — create, search, rename, duplicate, delete projects |
| `/dashboard` | System overview, live stats, recent projects |
| `/projects/:id/:tab` | Project editor — tables, diagram, generate, export, query |
| `/single` | Single-table wizard — quick CSV/SQL/manual generation |
| `/profile` | User settings — theme toggle, instance ID, app preferences |

## API

Backend mounts under `/api/v1`. Selected endpoints:

| Method | Path | Description |
|---|---|---|
| `GET` | `/stats` | Aggregate stats (total rows, completed jobs, last activity) |
| `POST` | `/schemas/infer/csv` | Infer columns from a CSV upload |
| `POST` | `/schemas/infer/sql` | Parse SQL DDL into a single-table schema |
| `POST` | `/projects/infer/prisma` | Parse a Prisma schema into a multi-table project |
| `POST` | `/projects/infer/sql` | Parse multi-table SQL DDL |
| `POST` | `/projects/:id/duplicate` | Deep-copy a project with fresh IDs |
| `POST` | `/generate` | Start a single-table job |
| `POST` | `/generate/project` | Start a multi-table project job |
| `GET` | `/generate/:jobId/preview` | Preview generated rows |
| `GET` | `/export/:jobId/{csv,json,sql,jsonl}` | Download single-table export |
| `GET` | `/export/project/:jobId/{zip,sqlite}` | Download multi-table export |
| `POST` | `/query/project/:jobId` | Run a read-only SQL query against generated data |

## Project Structure

```
synthetic/
├── packages/
│   ├── backend/          # Fastify API server
│   │   ├── data/         # Embedded SQLite (gitignored)
│   │   └── src/
│   │       ├── db/       # SQLite init & migrations
│   │       ├── routes/   # API route handlers
│   │       ├── services/ # Generation, export, parsing, rules
│   │       ├── store/    # SQLite-backed session store
│   │       └── types/    # Shared TypeScript types
│   └── frontend/         # React SPA
│       └── src/
│           ├── components/  # UI components (schema, project, generate, preview, layout)
│           ├── pages/       # Dashboard, ProjectList, ProjectEditor, SingleTablePage, Profile
│           ├── store/       # Zustand state management
│           ├── api/         # Axios client
│           └── index.css    # Theme tokens (CSS vars for dark/light)
└── package.json          # Root workspace config
```

## License

Internal / unlicensed. Contact the author for usage terms.
