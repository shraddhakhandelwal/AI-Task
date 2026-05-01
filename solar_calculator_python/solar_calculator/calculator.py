"""
Solar system size and savings calculator.
Based on standard solar energy estimation formulas for India.
"""

import math


# Constants
PEAK_SUN_HOURS = 4.5          # Average peak sun hours per day in India
SOLAR_GENERATION_FACTOR = 4.0  # Units generated per kW per day (conservative)
SYSTEM_COST_PER_KWP = 60_000   # INR per kWp installed (approximate)
GRID_EMISSION_FACTOR = 0.82    # kg CO₂ per kWh (India grid, CEA 2023)
SYSTEM_LIFE_YEARS = 25         # Standard solar panel life


def calculate_solar_recommendation(bill_data: dict) -> dict:
    """
    Calculate solar system recommendations from extracted bill data.

    Args:
        bill_data: dict from extract_bill_data()

    Returns:
        dict with solar recommendation fields
    """
    units_consumed: float = bill_data.get("units_consumed", 0) or 0
    total_bill_amount: float = bill_data.get("total_bill_amount", 0) or 0
    sanctioned_load: float = bill_data.get("sanctioned_load", 0) or 0

    # ── System Size ──────────────────────────────────────────────────────────
    daily_units = units_consumed / 30
    size_by_consumption = daily_units / PEAK_SUN_HOURS          # kW
    size_by_load = sanctioned_load * 0.8                         # 80% of sanctioned load

    raw_size = max(size_by_consumption, size_by_load)
    # Round up to nearest 0.5 kWp
    recommended_kw = math.ceil(raw_size * 2) / 2 if raw_size > 0 else 1.0

    # ── Savings ──────────────────────────────────────────────────────────────
    cost_per_unit = (total_bill_amount / units_consumed) if units_consumed > 0 else 7.0

    monthly_generation = recommended_kw * SOLAR_GENERATION_FACTOR * 30
    covered_units = min(monthly_generation, units_consumed)
    monthly_savings = round(covered_units * cost_per_unit)
    annual_savings = monthly_savings * 12

    # ── Financial ────────────────────────────────────────────────────────────
    system_cost = recommended_kw * SYSTEM_COST_PER_KWP
    payback_years = round((system_cost / annual_savings), 1) if annual_savings > 0 else 0.0

    # ── Environment ──────────────────────────────────────────────────────────
    annual_generation = monthly_generation * 12
    co2_reduction_kg = round(annual_generation * GRID_EMISSION_FACTOR)

    return {
        "recommended_system_size_kw": recommended_kw,
        "estimated_monthly_savings": monthly_savings,
        "estimated_annual_savings": annual_savings,
        "payback_period_years": payback_years,
        "co2_reduction_kg_per_year": co2_reduction_kg,
        # Extra detail for notebook / UI display
        "system_cost_inr": round(system_cost),
        "lifetime_savings_inr": annual_savings * SYSTEM_LIFE_YEARS,
        "net_benefit_inr": (annual_savings * SYSTEM_LIFE_YEARS) - system_cost,
        "daily_units": round(daily_units, 2),
        "monthly_generation_kwh": round(monthly_generation, 1),
        "cost_per_unit": round(cost_per_unit, 2),
    }
