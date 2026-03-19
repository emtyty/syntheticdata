# Synthetic Data Generator

A full-stack web application for generating realistic synthetic data from SQL or Prisma schemas. Define your tables, configure column generators, and export production-like datasets in seconds.

## Features

- **Schema Import** — Import database schemas via SQL DDL or Prisma schema files
- **Visual Schema Editor** — Configure data generators per column with a rich UI
- **Relationship Awareness** — Respects foreign key constraints, generating parent rows before child rows
- **Conditional Rules** — Define rules to control generated values based on other column values
- **Multi-table Projects** — Manage multiple related tables in a single project with a diagram view
- **Flexible Export** — Export generated data as CSV or ZIP archives

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Zustand, TanStack Table, React Flow |
| Backend | Fastify, TypeScript, Faker.js, Zod |
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
# Terminal 1 — Backend (http://localhost:3000)
npm run dev:backend

# Terminal 2 — Frontend (http://localhost:5173)
npm run dev:frontend
```

### Build

```bash
npm run build
```

## Project Structure

```
synthetic/
├── packages/
│   ├── backend/          # Fastify API server
│   │   └── src/
│   │       ├── routes/   # API route handlers
│   │       ├── services/ # Business logic & data generation
│   │       ├── store/    # In-memory session store
│   │       └── types/    # Shared TypeScript types
│   └── frontend/         # React SPA
│       └── src/
│           ├── components/  # UI components
│           ├── pages/       # Page-level views
│           ├── store/       # Zustand state management
│           └── api/         # API client
└── package.json          # Root workspace config
```

## License

MIT
