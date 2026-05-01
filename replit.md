# Solar Load Calculator — Energybae

## Overview

A full-stack AI-powered web app that automates electricity bill processing for Energybae, a renewable energy company.

**Flow:** Upload electricity bill (PDF/JPG/PNG) → AI extracts key data → Solar system recommendation is calculated → Downloadable Excel file is generated.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/solar-calculator)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM (provisioned but not currently used — Excel files are in-memory)
- **Validation**: Zod (zod/v4), drizzle-zod
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: OpenAI GPT-5.4 via Replit AI Integrations (no user API key needed)
- **File handling**: multer (upload), pdf-parse (PDF text extraction), exceljs (Excel generation)

## Key Features

1. **File Upload**: Drag-and-drop or browse for PDF, JPG, PNG electricity bills (up to 20MB)
2. **AI Extraction**: OpenAI GPT-5.4 with vision — reads both text PDFs and image bills (MSEDCL, BESCOM, TATA Power, etc.)
3. **Data Extracted**:
   - Consumer Name, Number, Meter Number
   - Billing Month, Tariff Category
   - Units Consumed (kWh), Sanctioned Load (kW)
   - Total Bill Amount, Distribution Company
4. **Solar Calculation**: System size, monthly/annual savings, payback period, CO₂ reduction
5. **Excel Output**: Beautifully formatted Excel file with all extracted data and solar recommendations

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## API Endpoints

- `POST /api/bill/process` — Upload and process electricity bill, returns extracted data + job ID
- `GET /api/bill/download/:jobId` — Download generated Excel file (expires after 1 hour)
- `GET /api/healthz` — Health check

## Project Structure

```
artifacts/
  api-server/         — Express backend with bill processing routes
    src/routes/bill/  — Bill upload, AI extraction, Excel generation
  solar-calculator/   — React + Vite frontend
lib/
  api-spec/           — OpenAPI spec + codegen config
  api-client-react/   — Generated React Query hooks
  api-zod/            — Generated Zod schemas
  db/                 — Drizzle ORM schema
  integrations-openai-ai-server/ — OpenAI client (Replit AI Integrations)
```

## Environment Variables

- `AI_INTEGRATIONS_OPENAI_BASE_URL` — Auto-set by Replit AI Integrations
- `AI_INTEGRATIONS_OPENAI_API_KEY` — Auto-set by Replit AI Integrations
- `DATABASE_URL`, `PGHOST`, etc. — Auto-set by Replit database

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
