import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import ExcelJS from "exceljs";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../../lib/logger";

const router = Router();

// In-memory store for generated Excel files (MVP approach)
const excelStore = new Map<string, Buffer>();

// Multer config — store in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, JPG, and PNG files are allowed"));
    }
  },
});

interface BillData {
  consumerName: string;
  consumerNumber: string;
  billingMonth: string;
  unitsConsumed: number;
  sanctionedLoad: number;
  tariffCategory: string;
  totalBillAmount: number;
  meterNumber?: string;
  distributionCompany?: string;
}

interface SolarRecommendation {
  recommendedSystemSizeKw: number;
  estimatedMonthlySavings: number;
  estimatedAnnualSavings: number;
  paybackPeriodYears: number;
  co2ReductionKgPerYear: number;
}

async function extractBillDataFromText(rawText: string): Promise<BillData> {
  const prompt = `You are an expert at reading Indian electricity bills (MSEDCL, BESCOM, etc.).
Extract the following fields from this electricity bill text:
- Consumer Name
- Consumer Number / Account Number
- Billing Month (format: "Month YYYY")
- Units Consumed (kWh) — the total units consumed this billing period
- Sanctioned Load (kW) — the contracted/sanctioned load
- Tariff Category (e.g., LT-I, LT-II, Commercial, Domestic, Industrial)
- Total Bill Amount (in INR)
- Meter Number (if available)
- Distribution Company (e.g., MSEDCL, BESCOM, TATA Power)

Electricity bill text:
${rawText}

Respond ONLY with a valid JSON object. Use null for fields not found. Numbers should be numeric (not strings).
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

  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse AI response");

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    consumerName: parsed.consumerName || "Unknown",
    consumerNumber: parsed.consumerNumber || "Unknown",
    billingMonth: parsed.billingMonth || "Unknown",
    unitsConsumed: Number(parsed.unitsConsumed) || 0,
    sanctionedLoad: Number(parsed.sanctionedLoad) || 0,
    tariffCategory: parsed.tariffCategory || "Unknown",
    totalBillAmount: Number(parsed.totalBillAmount) || 0,
    meterNumber: parsed.meterNumber || undefined,
    distributionCompany: parsed.distributionCompany || undefined,
  };
}

async function extractBillDataFromImage(imageBuffer: Buffer, mimeType: string): Promise<BillData> {
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const prompt = `You are an expert at reading Indian electricity bills (MSEDCL, BESCOM, TATA Power, etc.).
Extract the following fields from this electricity bill image:
- Consumer Name
- Consumer Number / Account Number
- Billing Month (format: "Month YYYY")
- Units Consumed (kWh) — total units consumed this billing period
- Sanctioned Load (kW) — contracted/sanctioned load
- Tariff Category (e.g., LT-I, LT-II, Commercial, Domestic, Industrial)
- Total Bill Amount (in INR)
- Meter Number (if available)
- Distribution Company (e.g., MSEDCL, BESCOM, TATA Power)

Respond ONLY with a valid JSON object. Use null for fields not found. Numbers should be numeric.
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

  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: dataUrl },
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse AI response");

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    consumerName: parsed.consumerName || "Unknown",
    consumerNumber: parsed.consumerNumber || "Unknown",
    billingMonth: parsed.billingMonth || "Unknown",
    unitsConsumed: Number(parsed.unitsConsumed) || 0,
    sanctionedLoad: Number(parsed.sanctionedLoad) || 0,
    tariffCategory: parsed.tariffCategory || "Unknown",
    totalBillAmount: Number(parsed.totalBillAmount) || 0,
    meterNumber: parsed.meterNumber || undefined,
    distributionCompany: parsed.distributionCompany || undefined,
  };
}

function calculateSolarRecommendation(billData: BillData): SolarRecommendation {
  const { unitsConsumed, totalBillAmount, sanctionedLoad } = billData;

  // Average daily consumption
  const dailyUnits = unitsConsumed / 30;

  // Solar system size: based on 4.5 peak sun hours/day (average India)
  // System kW = Daily units / Peak Sun Hours
  const byUnits = dailyUnits / 4.5;
  const bySanctionedLoad = sanctionedLoad * 0.8;
  const recommendedSystemSizeKw = Math.ceil(Math.max(byUnits, bySanctionedLoad) * 2) / 2; // round to nearest 0.5

  // Cost per unit from bill
  const costPerUnit = unitsConsumed > 0 ? totalBillAmount / unitsConsumed : 7;

  // Solar generation: 4 units per kW per day (conservative)
  const monthlyGeneration = recommendedSystemSizeKw * 4 * 30;
  const coveredUnits = Math.min(monthlyGeneration, unitsConsumed);
  const estimatedMonthlySavings = Math.round(coveredUnits * costPerUnit);
  const estimatedAnnualSavings = estimatedMonthlySavings * 12;

  // System cost approx: ₹50,000–65,000 per kW (installed)
  const systemCost = recommendedSystemSizeKw * 60000;
  const paybackPeriodYears = Math.round((systemCost / estimatedAnnualSavings) * 10) / 10;

  // CO2 reduction: 0.82 kg CO2 per kWh (India grid emission factor)
  const co2ReductionKgPerYear = Math.round(monthlyGeneration * 12 * 0.82);

  return {
    recommendedSystemSizeKw,
    estimatedMonthlySavings,
    estimatedAnnualSavings,
    paybackPeriodYears: isFinite(paybackPeriodYears) ? paybackPeriodYears : 0,
    co2ReductionKgPerYear,
  };
}

async function generateExcel(billData: BillData, solar: SolarRecommendation): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Solar Load Calculator");

  // === HEADER ===
  sheet.mergeCells("A1:F1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "ENERGYBAE — Solar Load Calculator";
  titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2C7A2C" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 36;

  sheet.mergeCells("A2:F2");
  const subtitleCell = sheet.getCell("A2");
  subtitleCell.value = "Electricity Bill Analysis & Solar System Recommendation";
  subtitleCell.font = { italic: true, size: 11, color: { argb: "FF555555" } };
  subtitleCell.alignment = { horizontal: "center" };
  sheet.getRow(2).height = 20;

  // Set column widths
  sheet.getColumn("A").width = 30;
  sheet.getColumn("B").width = 28;
  sheet.getColumn("C").width = 20;
  sheet.getColumn("D").width = 20;
  sheet.getColumn("E").width = 20;
  sheet.getColumn("F").width = 20;

  // === SECTION HEADER: Customer Info ===
  const addSectionHeader = (row: number, title: string) => {
    sheet.mergeCells(`A${row}:F${row}`);
    const cell = sheet.getCell(`A${row}`);
    cell.value = title;
    cell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a5276" } };
    cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    sheet.getRow(row).height = 24;
  };

  const addRow = (row: number, label: string, value: string | number, unit?: string, isBold?: boolean) => {
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
  };

  // Section 1: Customer Information
  addSectionHeader(4, "SECTION 1: Customer Information");
  addRow(5, "Consumer Name", billData.consumerName);
  addRow(6, "Consumer Number", billData.consumerNumber);
  addRow(7, "Meter Number", billData.meterNumber || "N/A");
  addRow(8, "Distribution Company", billData.distributionCompany || "N/A");
  addRow(9, "Billing Month", billData.billingMonth);
  addRow(10, "Tariff Category", billData.tariffCategory);

  // Section 2: Electricity Usage
  addSectionHeader(12, "SECTION 2: Electricity Usage");
  addRow(13, "Units Consumed", billData.unitsConsumed, "kWh");
  addRow(14, "Sanctioned Load", billData.sanctionedLoad, "kW");
  addRow(15, "Total Bill Amount", billData.totalBillAmount, "INR (₹)");
  addRow(16, "Cost per Unit", Math.round((billData.totalBillAmount / (billData.unitsConsumed || 1)) * 100) / 100, "₹/kWh");
  addRow(17, "Average Daily Consumption", Math.round((billData.unitsConsumed / 30) * 100) / 100, "kWh/day");

  // Section 3: Solar Recommendation
  addSectionHeader(19, "SECTION 3: Solar System Recommendation");
  addRow(20, "Recommended System Size", solar.recommendedSystemSizeKw, "kWp", true);
  addRow(21, "Estimated Monthly Savings", `₹ ${solar.estimatedMonthlySavings.toLocaleString("en-IN")}`, "", true);
  addRow(22, "Estimated Annual Savings", `₹ ${solar.estimatedAnnualSavings.toLocaleString("en-IN")}`, "", true);
  addRow(23, "Estimated Payback Period", solar.paybackPeriodYears, "years");
  addRow(24, "CO₂ Reduction", solar.co2ReductionKgPerYear.toLocaleString("en-IN"), "kg/year");

  // Section 4: Financial Summary
  addSectionHeader(26, "SECTION 4: Financial Summary");
  const systemCost = solar.recommendedSystemSizeKw * 60000;
  addRow(27, "Estimated System Cost", `₹ ${systemCost.toLocaleString("en-IN")}`, "(approx. ₹60,000/kWp installed)");
  addRow(28, "25-Year Savings", `₹ ${(solar.estimatedAnnualSavings * 25).toLocaleString("en-IN")}`, "(estimated)");
  addRow(29, "Net Benefit (25yr - Cost)", `₹ ${(solar.estimatedAnnualSavings * 25 - systemCost).toLocaleString("en-IN")}`, "");

  // Footer
  sheet.mergeCells("A31:F31");
  const footerCell = sheet.getCell("A31");
  footerCell.value = `Generated by Energybae Solar Load Calculator | www.energybae.in | energybae.co@gmail.com`;
  footerCell.font = { italic: true, size: 9, color: { argb: "FF888888" } };
  footerCell.alignment = { horizontal: "center" };

  sheet.mergeCells("A32:F32");
  const disclaimerCell = sheet.getCell("A32");
  disclaimerCell.value = "* Savings estimates are based on current tariff rates and 4.5 peak sun hours/day. Actual results may vary.";
  disclaimerCell.font = { italic: true, size: 8, color: { argb: "FFAAAAAA" } };
  disclaimerCell.alignment = { horizontal: "center" };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// POST /api/bill/process
router.post(
  "/bill/process",
  upload.single("file"),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "bad_request", message: "No file uploaded" });
        return;
      }

      req.log.info({ filename: file.originalname, mimetype: file.mimetype, size: file.size }, "Processing bill");

      let billData: BillData;

      if (file.mimetype === "application/pdf") {
        // For PDF: extract text via pdf-parse then use OpenAI text API
        const pdfParse = (await import("pdf-parse")).default;
        const pdfData = await pdfParse(file.buffer);
        const rawText = pdfData.text;

        if (!rawText || rawText.trim().length < 20) {
          // PDF has no extractable text (scanned PDF) — try OpenAI Vision
          // Convert PDF buffer to base64 and try with vision
          // For scanned PDFs, we'll tell the user to upload as image instead
          billData = await extractBillDataFromText(
            `[Scanned PDF with minimal text content. File: ${file.originalname}. Please note extraction may be limited.]`
          );
        } else {
          billData = await extractBillDataFromText(rawText);
        }
      } else {
        // Image: send directly to OpenAI Vision
        billData = await extractBillDataFromImage(file.buffer, file.mimetype);
      }

      const solarRecommendation = calculateSolarRecommendation(billData);
      const excelBuffer = await generateExcel(billData, solarRecommendation);

      const jobId = uuidv4();
      excelStore.set(jobId, excelBuffer);

      // Clean up old jobs after 1 hour
      setTimeout(() => excelStore.delete(jobId), 60 * 60 * 1000);

      req.log.info({ jobId }, "Bill processed successfully");

      res.json({
        jobId,
        extractedData: billData,
        solarRecommendation,
      });
    } catch (err) {
      logger.error({ err }, "Error processing bill");
      res.status(500).json({
        error: "processing_failed",
        message: err instanceof Error ? err.message : "Failed to process the electricity bill",
      });
    }
  }
);

// GET /api/bill/download/:jobId
router.get("/bill/download/:jobId", (req, res) => {
  const { jobId } = req.params;
  const excelBuffer = excelStore.get(jobId);

  if (!excelBuffer) {
    res.status(404).json({ error: "not_found", message: "Excel file not found or has expired" });
    return;
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="solar-load-calculator.xlsx"`);
  res.setHeader("Content-Length", excelBuffer.length);
  res.end(excelBuffer);
});

export default router;
