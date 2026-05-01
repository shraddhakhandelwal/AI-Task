"""
Solar Load Calculator — Streamlit Web Application
Energybae | www.energybae.in

Run locally:
    streamlit run app.py

On Replit:
    Served at /python-app/ via workflow
"""

import io
import os
import streamlit as st
from solar_calculator import extract_bill_data, calculate_solar_recommendation, generate_excel

# ── Page Configuration ────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Solar Load Calculator — Energybae",
    page_icon="🌞",
    layout="centered",
)

# ── Header ────────────────────────────────────────────────────────────────────
st.markdown("## Energybae — Solar Load Calculator")
st.markdown(
    "Upload a customer electricity bill (PDF, JPG, or PNG). "
    "AI will extract the data and generate a ready-to-download Excel report."
)
st.divider()

# ── Check API key availability ────────────────────────────────────────────────
has_key = bool(
    os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY")
    or os.environ.get("OPENAI_API_KEY")
)

if not has_key:
    st.warning(
        "**OpenAI API key not found.**  \n"
        "Set `OPENAI_API_KEY` in your environment or run on Replit with AI Integrations enabled."
    )

# ── File Upload ───────────────────────────────────────────────────────────────
uploaded_file = st.file_uploader(
    "Upload electricity bill",
    type=["pdf", "jpg", "jpeg", "png"],
    help="Supports MSEDCL, BESCOM, TATA Power, CESC, and other Indian utilities.",
)

if uploaded_file is not None:
    st.success(f"File loaded: **{uploaded_file.name}** ({uploaded_file.size / 1024:.1f} KB)")

    if st.button("Extract Data & Generate Excel", type="primary", disabled=not has_key):

        # ── Step 1: Extract data ──────────────────────────────────────────────
        with st.spinner("Reading bill with AI... this takes 10–20 seconds"):
            try:
                file_bytes = uploaded_file.read()
                bill_data = extract_bill_data(file_bytes, uploaded_file.name)
            except Exception as e:
                st.error(f"Extraction failed: {e}")
                st.stop()

        # ── Step 2: Calculate solar recommendation ────────────────────────────
        solar = calculate_solar_recommendation(bill_data)

        # ── Step 3: Generate Excel ────────────────────────────────────────────
        with st.spinner("Building Excel report..."):
            try:
                excel_bytes = generate_excel(bill_data, solar)
            except Exception as e:
                st.error(f"Excel generation failed: {e}")
                st.stop()

        st.success("Done! Review the extracted data below and download your Excel report.")
        st.divider()

        # ── Display: Customer Info ────────────────────────────────────────────
        st.subheader("Customer Information")
        col1, col2 = st.columns(2)
        with col1:
            st.metric("Consumer Name", bill_data["consumer_name"])
            st.metric("Consumer Number", bill_data["consumer_number"])
            st.metric("Billing Month", bill_data["billing_month"])
        with col2:
            st.metric("Tariff Category", bill_data["tariff_category"])
            st.metric("Meter Number", bill_data.get("meter_number") or "N/A")
            st.metric("Distribution Company", bill_data.get("distribution_company") or "N/A")

        st.divider()

        # ── Display: Electricity Usage ────────────────────────────────────────
        st.subheader("Electricity Usage")
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Units Consumed", f"{bill_data['units_consumed']:,.0f} kWh")
        with col2:
            st.metric("Sanctioned Load", f"{bill_data['sanctioned_load']} kW")
        with col3:
            st.metric("Total Bill Amount", f"₹ {bill_data['total_bill_amount']:,.0f}")

        st.divider()

        # ── Display: Solar Recommendation ────────────────────────────────────
        st.subheader("Solar System Recommendation")
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric(
                "Recommended System Size",
                f"{solar['recommended_system_size_kw']} kWp",
            )
        with col2:
            st.metric(
                "Monthly Savings",
                f"₹ {solar['estimated_monthly_savings']:,}",
            )
        with col3:
            st.metric(
                "Payback Period",
                f"{solar['payback_period_years']} years",
            )

        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Annual Savings", f"₹ {solar['estimated_annual_savings']:,}")
        with col2:
            st.metric("System Cost (est.)", f"₹ {solar['system_cost_inr']:,}")
        with col3:
            st.metric("CO₂ Reduction", f"{solar['co2_reduction_kg_per_year']:,} kg/yr")

        st.divider()

        # ── Download Button ───────────────────────────────────────────────────
        st.download_button(
            label="Download Excel Report",
            data=excel_bytes,
            file_name=f"solar_load_calculator_{bill_data['consumer_number']}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            type="primary",
        )

        st.caption(
            "The Excel file contains customer info, usage data, solar recommendation, "
            "and a 25-year financial projection."
        )

# ── Footer ────────────────────────────────────────────────────────────────────
st.divider()
st.caption(
    "Energybae — Empowering People with Renewable Energy Solutions  \n"
    "www.energybae.in | energybae.co@gmail.com | +91 9112233120"
)
