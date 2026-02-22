# Insider Platform

A full-stack insider trading analysis dashboard.

- **Backend:** FastAPI + Postgres
- **Frontend:** Vite + React + React Router (static SPA)
- **Payments:** Stripe subscriptions (Checkout + Customer Portal + Webhooks)
- **Workers:** background ingestion + compute jobs

## Project layout

- `insider_platform/` – FastAPI app, DB layer, SEC ingestion, analytics, billing
- `scripts/` – run scripts + init DB
- `frontend/` – Vite/React SPA
- `deploy/` – production reverse proxy config (Caddy) + Dockerfile

## Quick start (local dev)

1) Copy environment file:

```bash
cp .env.example .env
```

2) Start Postgres:

```bash
docker compose up -d db
```

3) Initialize / migrate the database schema (recommended):

```bash
python scripts/init_db.py
```

Note: the API and workers will also run migrations automatically on startup, so this is mainly useful to migrate ahead of time.

4) Start the API:

```bash
python scripts/run_api.py
```

5) Start workers (optional but recommended):

```bash
python scripts/run_api_worker.py
python scripts/run_compute_worker.py
```

6) Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open the app at:

- Frontend: `http://localhost:5173`
- API: `http://localhost:8000`


## Backfill fundamentals (sector/beta)

If you add new fundamentals fields (like `sector` / `beta`) and want to populate them for existing tickers, you can enqueue market-cap/fundamentals jobs:

```bash
python scripts/enqueue_market_cap.py --all
```

Run with `--force` to refresh all tickers:

```bash
python scripts/enqueue_market_cap.py --all --force
```

## Production (Docker + Caddy)

Use `docker-compose.prod.yml`.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy will serve:

- Frontend (SPA)
- Reverse proxy API under `/api/backend/*`

See `LAUNCH_GUIDE.md` for a complete DigitalOcean + Namecheap deployment walkthrough.
