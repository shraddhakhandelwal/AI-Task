"""
AI-powered electricity bill data extractor.
Supports PDF (text-based) and image (JPG/PNG) inputs.
Uses OpenAI GPT with vision capabilities.
"""

import os
import json
import base64
import re
from typing import Optional
import openai

# Initialise OpenAI client — works with Replit AI Integrations env vars
# or a standard OPENAI_API_KEY for local use.
def _get_openai_client() -> openai.OpenAI:
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")

    if not api_key:
        raise ValueError(
            "No OpenAI API key found. Set OPENAI_API_KEY (local) "
            "or use Replit AI Integrations (AI_INTEGRATIONS_OPENAI_API_KEY)."
        )

    kwargs = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url

    return openai.OpenAI(**kwargs)


EXTRACTION_PROMPT = """You are an expert at reading Indian electricity bills from utilities like MSEDCL, BESCOM, TATA Power, CESC, etc.

Extract ONLY these fields from the bill:
- Consumer Name
- Consumer Number / Account Number  
- Billing Month (format: "Month YYYY", e.g., "March 2025")
- Units Consumed in kWh — total units this billing period (look for "Units consumed", "Total units", "Net units")
- Sanctioned Load in kW — contracted/maximum allowed load (look for "Sanctioned load", "Connected load", "Contract demand")
- Tariff Category — tariff slab or category code (e.g., LT-I, LT-II, HT, Domestic, Commercial, Industrial)
- Total Bill Amount in INR — the final payable amount
- Meter Number — meter serial number if visible
- Distribution Company — name of the electricity provider (e.g., MSEDCL, BESCOM, TATA Power)

Rules:
- Return ONLY a valid JSON object, no explanation, no markdown
- Use null for fields you cannot find
- Numbers must be numeric (not strings)
- If "units consumed" appears multiple times, use the NET or TOTAL value

JSON format:
{
  "consumer_name": "",
  "consumer_number": "",
  "billing_month": "",
  "units_consumed": 0,
  "sanctioned_load": 0,
  "tariff_category": "",
  "total_bill_amount": 0,
  "meter_number": null,
  "distribution_company": null
}"""


def _parse_ai_response(content: str) -> dict:
    """Extract JSON from AI response, handling code blocks and extra text."""
    # Try direct JSON parse first
    try:
        return json.loads(content.strip())
    except json.JSONDecodeError:
        pass

    # Extract JSON from code blocks
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Find the first {...} block
    match = re.search(r"\{[\s\S]*\}", content)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON from AI response:\n{content}")


def _sanitise(raw: dict) -> dict:
    """Convert and sanitise the parsed fields."""
    def to_float(val, default=0.0) -> float:
        try:
            return float(str(val).replace(",", "").strip())
        except (TypeError, ValueError):
            return default

    return {
        "consumer_name": str(raw.get("consumer_name") or "Unknown"),
        "consumer_number": str(raw.get("consumer_number") or "Unknown"),
        "billing_month": str(raw.get("billing_month") or "Unknown"),
        "units_consumed": to_float(raw.get("units_consumed")),
        "sanctioned_load": to_float(raw.get("sanctioned_load")),
        "tariff_category": str(raw.get("tariff_category") or "Unknown"),
        "total_bill_amount": to_float(raw.get("total_bill_amount")),
        "meter_number": str(raw["meter_number"]) if raw.get("meter_number") else None,
        "distribution_company": str(raw["distribution_company"]) if raw.get("distribution_company") else None,
    }


def extract_from_pdf(pdf_bytes: bytes) -> dict:
    """Extract bill data from a PDF file (text-based)."""
    import pdfplumber

    # Extract text from all pages
    raw_text = ""
    with pdfplumber.open(pdf_bytes if hasattr(pdf_bytes, "read") else __import__("io").BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                raw_text += text + "\n"

    if not raw_text.strip() or len(raw_text.strip()) < 30:
        raise ValueError(
            "The PDF appears to be scanned (no extractable text). "
            "Please convert it to an image (JPG/PNG) and upload that instead."
        )

    client = _get_openai_client()
    response = client.chat.completions.create(
        model="gpt-4o",  # fallback-compatible model name
        max_tokens=1024,
        messages=[
            {"role": "user", "content": f"{EXTRACTION_PROMPT}\n\nElectricity bill text:\n{raw_text}"}
        ],
    )

    content = response.choices[0].message.content or "{}"
    raw = _parse_ai_response(content)
    return _sanitise(raw)


def extract_from_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """Extract bill data from an image using OpenAI Vision."""
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"

    client = _get_openai_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": EXTRACTION_PROMPT},
                ],
            }
        ],
    )

    content = response.choices[0].message.content or "{}"
    raw = _parse_ai_response(content)
    return _sanitise(raw)


def extract_bill_data(file_bytes: bytes, filename: str) -> dict:
    """
    Main entry point. Detect file type and extract bill data.

    Args:
        file_bytes: Raw bytes of the uploaded file.
        filename:   Original filename (used to determine type).

    Returns:
        dict with keys: consumer_name, consumer_number, billing_month,
        units_consumed, sanctioned_load, tariff_category,
        total_bill_amount, meter_number, distribution_company
    """
    lower = filename.lower()

    if lower.endswith(".pdf"):
        return extract_from_pdf(file_bytes)
    elif lower.endswith((".jpg", ".jpeg")):
        return extract_from_image(file_bytes, "image/jpeg")
    elif lower.endswith(".png"):
        return extract_from_image(file_bytes, "image/png")
    else:
        raise ValueError(f"Unsupported file type: {filename}. Use PDF, JPG, or PNG.")
