// Vercel serverless function — wraps the full bill processing API
// Uses standard OpenAI SDK with OPENAI_API_KEY env var (set in Vercel dashboard)
"use strict";

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const ExcelJS = require("exceljs");
const OpenAI = require("openai");

// ── OpenAI client (lazy — created on first request so missing key doesn't crash startup) ──
let _openai = null;
function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured. Set it in your Vercel environment variables.");
    }
    _openai = new OpenAI.default({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// ── In-memory job store (bill data only — Excel re-generated on download) ────
// Note: works within the same warm serverless instance. Good enough for MVP.
const jobStore = new Map();

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PDF, JPG, and PNG files are allowed"));
  },
});

// ── AI extraction ─────────────────────────────────────────────────────────────
async function extractBillDataFromText(rawText) {
  const prompt = `You are an expert at reading Indian electricity bills (MSEDCL, BESCOM, TATA Power, etc.).
Extract the following fields from this electricity bill text:
- Consumer Name
- Consumer Number / Account Number
- Billing Month (format: "Month YYYY")
- Units Consumed (kWh) — total units consumed this billing period
- Sanctioned Load (kW) — contracted/sanctioned load
- Tariff Category (e.g., LT-I, LT-II, Commercial, Domestic, Industrial)
- Total Bill Amount (in INR)
- Meter Number (if available)
- Distribution Company (e.g., MSEDCL, BESCOM, TATA Power)

Electricity bill text:
${rawText}

Respond ONLY with a valid JSON object. Use null for fields not found. Numbers must be numeric.
{
  "consumerName": "",
  "consumerNumber": "",
  "billingMonth": "",
  "unitsConsumed": 0,
  "sanctionedLoad": 0,
  "tariffCategory": "",
  "totalBillAmount": 0,
  "meterNumber": null,
  "distributionCompany": null
}`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse AI response");
  const p = JSON.parse(jsonMatch[0]);
  return normalize(p);
}

async function extractBillDataFromImage(imageBuffer, mimeType) {
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const prompt = `You are an expert at reading Indian electricity bills (MSEDCL, BESCOM, TATA Power, etc.).
Extract the following fields from this electricity bill image:
- Consumer Name, Consumer Number, Billing Month (format: "Month YYYY")
- Units Consumed (kWh), Sanctioned Load (kW), Tariff Category
- Total Bill Amount (INR), Meter Number, Distribution Company

Respond ONLY with a valid JSON object. Use null for missing fields. Numbers must be numeric.
{
  "consumerName": "",
  "consumerNumber": "",
  "billingMonth": "",
  "unitsConsumed": 0,
  "sanctionedLoad": 0,
  "tariffCategory": "",
  "totalBillAmount": 0,
  "meterNumber": null,
  "distributionCompany": null
}`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse AI response");
  const p = JSON.parse(jsonMatch[0]);
  return normalize(p);
}

function normalize(p) {
  return {
    consumerName: p.consumerName || "Unknown",
    consumerNumber: p.consumerNumber || "Unknown",
    billingMonth: p.billingMonth || "Unknown",
    unitsConsumed: Number(p.unitsConsumed) || 0,
    sanctionedLoad: Number(p.sanctionedLoad) || 0,
    tariffCategory: p.tariffCategory || "Unknown",
    totalBillAmount: Number(p.totalBillAmount) || 0,
    meterNumber: p.meterNumber || undefined,
    distributionCompany: p.distributionCompany || undefined,
  };
}

// ── Solar calculation ────────────────────────────────────────────────────────
function calculateSolarRecommendation(billData) {
  const { unitsConsumed, totalBillAmount, sanctionedLoad } = billData;
  const dailyUnits = unitsConsumed / 30;
  const byUnits = dailyUnits / 4.5;
  const bySanctionedLoad = sanctionedLoad * 0.8;
  const recommendedSystemSizeKw =
    Math.ceil(Math.max(byUnits, bySanctionedLoad) * 2) / 2;

  const costPerUnit = unitsConsumed > 0 ? totalBillAmount / unitsConsumed : 7;
  const monthlyGeneration = recommendedSystemSizeKw * 4 * 30;
  const coveredUnits = Math.min(monthlyGeneration, unitsConsumed);
  const estimatedMonthlySavings = Math.round(coveredUnits * costPerUnit);
  const estimatedAnnualSavings = estimatedMonthlySavings * 12;
  const systemCost = recommendedSystemSizeKw * 60000;
  const paybackPeriodYears =
    Math.round((systemCost / (estimatedAnnualSavings || 1)) * 10) / 10;
  const co2ReductionKgPerYear = Math.round(monthlyGeneration * 12 * 0.82);

  return {
    recommendedSystemSizeKw,
    estimatedMonthlySavings,
    estimatedAnnualSavings,
    paybackPeriodYears: isFinite(paybackPeriodYears) ? paybackPeriodYears : 0,
    co2ReductionKgPerYear,
  };
}

// ── Excel generation ─────────────────────────────────────────────────────────
async function generateExcel(billData, solar) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Solar Load Calculator");

  sheet.mergeCells("A1:F1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "ENERGYBAE — Solar Load Calculator";
  titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2C7A2C" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 36;

  sheet.mergeCells("A2:F2");
  const subtitle = sheet.getCell("A2");
  subtitle.value = "Electricity Bill Analysis & Solar System Recommendation";
  subtitle.font = { italic: true, size: 11, color: { argb: "FF555555" } };
  subtitle.alignment = { horizontal: "center" };
  sheet.getRow(2).height = 20;

  sheet.getColumn("A").width = 30;
  sheet.getColumn("B").width = 28;
  sheet.getColumn("C").width = 20;
  sheet.getColumn("D").width = 20;
  sheet.getColumn("E").width = 20;
  sheet.getColumn("F").width = 20;

  function addSectionHeader(row, title) {
    sheet.mergeCells(`A${row}:F${row}`);
    const cell = sheet.getCell(`A${row}`);
    cell.value = title;
    cell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a5276" } };
    cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    sheet.getRow(row).height = 24;
  }

  function addRow(row, label, value, unit, isBold) {
    const labelCell = sheet.getCell(`A${row}`);
    labelCell.value = label;
    labelCell.font = { bold: isBold };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
    labelCell.border = {
      top: { style: "thin", color: { argb: "FFCCCCCC" } },
      bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    };
    sheet.mergeCells(`B${row}:D${row}`);
    const valueCell = sheet.getCell(`B${row}`);
    valueCell.value = value;
    valueCell.font = { bold: isBold };
    valueCell.border = {
      top: { style: "thin", color: { argb: "FFCCCCCC" } },
      bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    };
    if (unit) {
      sheet.mergeCells(`E${row}:F${row}`);
      const unitCell = sheet.getCell(`E${row}`);
      unitCell.value = unit;
      unitCell.font = { color: { argb: "FF777777" }, italic: true };
    }
    sheet.getRow(row).height = 22;
  }

  addSectionHeader(4, "SECTION 1: Customer Information");
  addRow(5, "Consumer Name", billData.consumerName);
  addRow(6, "Consumer Number", billData.consumerNumber);
  addRow(7, "Meter Number", billData.meterNumber || "N/A");
  addRow(8, "Distribution Company", billData.distributionCompany || "N/A");
  addRow(9, "Billing Month", billData.billingMonth);
  addRow(10, "Tariff Category", billData.tariffCategory);

  addSectionHeader(12, "SECTION 2: Electricity Usage");
  addRow(13, "Units Consumed", billData.unitsConsumed, "kWh");
  addRow(14, "Sanctioned Load", billData.sanctionedLoad, "kW");
  addRow(15, "Total Bill Amount", billData.totalBillAmount, "INR (Rs.)");
  addRow(
    16,
    "Cost per Unit",
    Math.round((billData.totalBillAmount / (billData.unitsConsumed || 1)) * 100) / 100,
    "Rs./kWh"
  );
  addRow(
    17,
    "Average Daily Consumption",
    Math.round((billData.unitsConsumed / 30) * 100) / 100,
    "kWh/day"
  );

  addSectionHeader(19, "SECTION 3: Solar System Recommendation");
  addRow(20, "Recommended System Size", solar.recommendedSystemSizeKw, "kWp", true);
  addRow(
    21,
    "Estimated Monthly Savings",
    `Rs. ${solar.estimatedMonthlySavings.toLocaleString("en-IN")}`,
    "",
    true
  );
  addRow(
    22,
    "Estimated Annual Savings",
    `Rs. ${solar.estimatedAnnualSavings.toLocaleString("en-IN")}`,
    "",
    true
  );
  addRow(23, "Estimated Payback Period", solar.paybackPeriodYears, "years");
  addRow(24, "CO2 Reduction", solar.co2ReductionKgPerYear.toLocaleString("en-IN"), "kg/year");

  addSectionHeader(26, "SECTION 4: Financial Summary");
  const systemCost = solar.recommendedSystemSizeKw * 60000;
  addRow(27, "Estimated System Cost", `Rs. ${systemCost.toLocaleString("en-IN")}`, "(approx. Rs.60,000/kWp)");
  addRow(28, "25-Year Savings", `Rs. ${(solar.estimatedAnnualSavings * 25).toLocaleString("en-IN")}`, "(estimated)");
  addRow(
    29,
    "Net Benefit (25yr - Cost)",
    `Rs. ${(solar.estimatedAnnualSavings * 25 - systemCost).toLocaleString("en-IN")}`,
    ""
  );

  sheet.mergeCells("A31:F31");
  const footer = sheet.getCell("A31");
  footer.value = "Generated by Energybae Solar Load Calculator | www.energybae.in | energybae.co@gmail.com";
  footer.font = { italic: true, size: 9, color: { argb: "FF888888" } };
  footer.alignment = { horizontal: "center" };

  sheet.mergeCells("A32:F32");
  const disc = sheet.getCell("A32");
  disc.value = "* Savings estimates are based on current tariff rates and 4.5 peak sun hours/day. Actual results may vary.";
  disc.font = { italic: true, size: 8, color: { argb: "FFAAAAAA" } };
  disc.alignment = { horizontal: "center" };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/bill/process
app.post("/api/bill/process", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "bad_request", message: "No file uploaded" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "config_error",
        message: "OPENAI_API_KEY is not configured. Please set it in your Vercel environment variables.",
      });
    }

    let billData;

    if (file.mimetype === "application/pdf") {
      const pdfParse = require("pdf-parse");
      const pdfData = await pdfParse(file.buffer);
      const rawText = pdfData.text;
      if (!rawText || rawText.trim().length < 20) {
        billData = await extractBillDataFromText(
          `[Scanned PDF with minimal text. File: ${file.originalname}. Extraction may be limited.]`
        );
      } else {
        billData = await extractBillDataFromText(rawText);
      }
    } else {
      billData = await extractBillDataFromImage(file.buffer, file.mimetype);
    }

    const solarRecommendation = calculateSolarRecommendation(billData);
    const jobId = uuidv4();

    // Store bill data for download endpoint (re-generates Excel on demand)
    jobStore.set(jobId, { billData, solarRecommendation });
    setTimeout(() => jobStore.delete(jobId), 60 * 60 * 1000);

    return res.json({ jobId, extractedData: billData, solarRecommendation });
  } catch (err) {
    console.error("Error processing bill:", err);
    return res.status(500).json({
      error: "processing_failed",
      message: err instanceof Error ? err.message : "Failed to process the electricity bill",
    });
  }
});

// GET /api/bill/download/:jobId
app.get("/api/bill/download/:jobId", async (req, res) => {
  const { jobId } = req.params;
  const job = jobStore.get(jobId);

  if (!job) {
    return res.status(404).json({
      error: "not_found",
      message: "Excel file not found or has expired. Please process the bill again.",
    });
  }

  try {
    const excelBuffer = await generateExcel(job.billData, job.solarRecommendation);
    const safeNum = (job.billData.consumerNumber || "report").replace(/[^a-zA-Z0-9_-]/g, "_");

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="solar_load_${safeNum}.xlsx"`);
    res.setHeader("Content-Length", excelBuffer.length);
    return res.end(excelBuffer);
  } catch (err) {
    console.error("Error generating Excel:", err);
    return res.status(500).json({ error: "excel_failed", message: "Failed to generate Excel file" });
  }
});

// GET /api/healthz
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

module.exports = app;
