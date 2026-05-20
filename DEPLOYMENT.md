# Deploying to Vercel via GitHub

This guide walks you through pushing the project to GitHub and deploying it live on Vercel in under 10 minutes.

---

## What gets deployed

| Part | Platform | Notes |
|---|---|---|
| React frontend (Solar Calculator UI) | Vercel (static) | Built with Vite |
| Express API (`/api/*`) | Vercel (serverless) | `api/index.js` |
| Python Streamlit app | ❌ Not on Vercel | Vercel doesn't support Streamlit |

> The Python notebook (`solar_load_calculator.ipynb`) is a separate deliverable for Google Colab — it doesn't need to be deployed.

---

## Before you start

You need:
- A [GitHub](https://github.com) account
- A [Vercel](https://vercel.com) account (free tier is fine)
- An [OpenAI API key](https://platform.openai.com/api-keys) — the deployed app uses **GPT-4o** (standard OpenAI, not Replit-specific)

---

## Step 1 — Push the code to GitHub

### Option A: Using GitHub Desktop (easiest)
1. Download [GitHub Desktop](https://desktop.github.com/) and sign in
2. Click **File → Add Local Repository** and pick this project folder
3. If prompted to "Initialize repository", click that button
4. Click **Publish repository** in the top bar
5. Name it `solar-load-calculator` (or anything you like), keep it **Public** or **Private**
6. Click **Publish Repository**

### Option B: Using the GitHub website + Git CLI
```bash
# 1. Create a new repo at https://github.com/new
#    Name it: solar-load-calculator
#    Do NOT add README/gitignore (the project already has one)

# 2. In your terminal, inside this project folder:
git init
git add .
git commit -m "Initial commit: Solar Load Calculator"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/solar-load-calculator.git
git push -u origin main
```

---

## Step 2 — Import to Vercel

1. Go to **[vercel.com/new](https://vercel.com/new)** and sign in
2. Click **"Import Git Repository"**
3. Find your `solar-load-calculator` repo and click **Import**
4. Vercel will auto-detect the settings from `vercel.json` — **do not change them**:
   - Build Command: `pnpm --filter @workspace/solar-calculator run build`
   - Output Directory: `artifacts/solar-calculator/dist/public`
   - Install Command: `pnpm install --frozen-lockfile`
5. **Do not click Deploy yet** — go to Step 3 first

---

## Step 3 — Set the OpenAI API key

Still on the Vercel import page:

1. Expand **"Environment Variables"**
2. Add one variable:

| Name | Value |
|---|---|
| `OPENAI_API_KEY` | `sk-...your key here...` |

3. Now click **Deploy**

> Get your API key from: https://platform.openai.com/api-keys  
> GPT-4o is used. Make sure your OpenAI account has GPT-4o access.

---

## Step 4 — Wait for the build (~2 minutes)

Vercel will:
1. Install dependencies with pnpm
2. Build the React frontend
3. Deploy the `api/index.js` serverless function

When done, you'll see a live URL like:  
`https://solar-load-calculator-xyz.vercel.app`

Click it — your app is live!

---

## Step 5 — Future updates

Every time you push new code to the `main` branch on GitHub, Vercel automatically rebuilds and re-deploys. No manual steps needed.

```bash
git add .
git commit -m "Update: description of change"
git push
```

---

## Troubleshooting

### Build fails with "PORT is required"
This shouldn't happen — `vercel.json` sets `PORT=3000` and `BASE_PATH=/` as build env vars.  
If it does, add them manually in Vercel → Project Settings → Environment Variables → Scope: **Build**.

### API returns "OPENAI_API_KEY is not configured"
Go to Vercel → Project → Settings → Environment Variables and make sure `OPENAI_API_KEY` is set.  
After adding/changing env vars, redeploy: Vercel → Deployments → click the latest → Redeploy.

### Bill processing takes >10 seconds
Vercel Hobby plan serverless functions time out at **10 seconds**.  
If AI extraction is slow, upgrade to **Vercel Pro** (60-second timeout) or use a larger/faster OpenAI model.

### Excel download says "not found"
This can happen if the serverless function that stored the job data and the one serving the download are different warm instances.  
Fix: process the bill again and download immediately after the results appear.

---

## Architecture on Vercel

```
Browser
  │
  ├── GET /          → Vercel Static (Vite build from artifacts/solar-calculator/dist/public)
  ├── GET /assets/*  → Vercel Static
  │
  └── /api/*         → Vercel Serverless Function (api/index.js)
        ├── POST /api/bill/process    → AI extraction + solar calc
        ├── GET  /api/bill/download/:jobId → Excel download
        └── GET  /api/healthz         → health check
```

---

*Built by Energybae | www.energybae.in | energybae.co@gmail.com*
