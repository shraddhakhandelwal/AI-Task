# Solar Load Calculator — Bill to Excel Automation

Built for **Energybae**, a renewable energy company based in Pune that helps businesses and homes switch to solar power.

Upload a customer electricity bill (PDF or image) and get back a filled Excel file with the solar system recommendation — automatically. What used to take 15–30 minutes of manual work now takes seconds.

---

## What It Does

1. **Upload** a PDF or image of an electricity bill (MSEDCL, BESCOM, TATA Power, etc.)
2. **AI extracts** key data — consumer name, units consumed, sanctioned load, tariff category, bill amount, and more
3. **Solar recommendation** is calculated — system size, monthly savings, payback period, CO₂ reduction
4. **Download** a formatted Excel file, ready to use with the customer

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TailwindCSS |
| Backend | Node.js + Express 5 |
| AI / OCR | OpenAI GPT-5.4 (vision + text) via Replit AI Integrations |
| PDF Parsing | pdf-parse |
| Excel Generation | ExcelJS |
| API Contract | OpenAPI 3.1 + Orval codegen |
| Validation | Zod |
| Package Manager | pnpm (monorepo) |

---

## Project Structure

```
artifacts/
  api-server/               Express backend
    src/routes/bill/        Bill upload, AI extraction, Excel generation
  solar-calculator/         React + Vite frontend
lib/
  api-spec/                 OpenAPI spec (source of truth)
  api-client-react/         Generated React Query hooks
  api-zod/                  Generated Zod validators
  db/                       Drizzle ORM (PostgreSQL)
  integrations-openai-ai-server/   OpenAI client wrapper
```

---

## Running on Replit (Recommended)

This project is designed to run on [Replit](https://replit.com). Fork it there for the easiest setup — the AI integration and database are provisioned automatically.

1. Fork this project on Replit
2. Open the Shell and run:
   ```bash
   pnpm install
   ```
3. Set up the OpenAI integration via the Replit AI Integrations panel (no API key purchase needed — billed to Replit credits)
4. Click **Run** — both the API server and frontend start automatically

---

## Running Locally

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL database
- OpenAI API key (or a Replit account for the managed integration)

### Steps

```bash
# Install dependencies
pnpm install

# Set environment variables
cp .env.example .env
# Edit .env with your values (see below)

# Push database schema
pnpm --filter @workspace/db run push

# Start the API server (port 8080)
pnpm --filter @workspace/api-server run dev

# In a separate terminal, start the frontend
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/solar-calculator run dev
```

### Required Environment Variables

```env
# OpenAI (get from platform.openai.com)
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
AI_INTEGRATIONS_OPENAI_API_KEY=sk-...

# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/solar_calculator

# Session
SESSION_SECRET=your-random-secret-here
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/bill/process` | Upload bill (multipart/form-data, field: `file`). Returns extracted data + job ID. |
| `GET` | `/api/bill/download/:jobId` | Download the generated Excel file. Job expires after 1 hour. |
| `GET` | `/api/healthz` | Health check |

### Example: Process a bill

```bash
curl -X POST http://localhost:8080/api/bill/process \
  -F "file=@electricity-bill.pdf"
```

Response:
```json
{
  "jobId": "abc-123",
  "extractedData": {
    "consumerName": "Ramesh Sharma",
    "consumerNumber": "123456789",
    "billingMonth": "March 2025",
    "unitsConsumed": 450,
    "sanctionedLoad": 5,
    "tariffCategory": "LT-II",
    "totalBillAmount": 4200,
    "distributionCompany": "MSEDCL"
  },
  "solarRecommendation": {
    "recommendedSystemSizeKw": 4,
    "estimatedMonthlySavings": 3500,
    "estimatedAnnualSavings": 42000,
    "paybackPeriodYears": 5.7,
    "co2ReductionKgPerYear": 1771
  }
}
```

### Example: Download Excel

```bash
curl http://localhost:8080/api/bill/download/abc-123 \
  -o solar-load-calculator.xlsx
```

---

## Regenerating API Code

If you modify `lib/api-spec/openapi.yaml`, regenerate the hooks and validators:

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## Notes

- Supported bill formats: PDF (with selectable text), JPG, PNG
- Scanned PDFs with no extractable text have limited accuracy — upload as an image instead
- Generated Excel files are held in memory and expire after 1 hour
- Solar calculations assume 4.5 peak sun hours/day (India average) and ₹60,000/kWp installation cost

---

## Contact

**Energybae** — Empowering People with Renewable Energy Solutions  
[www.energybae.in](https://www.energybae.in) | energybae.co@gmail.com | +91 9112233120
