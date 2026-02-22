# Launch guide (from scratch)

This guide walks from **0 → live website** on a **fresh DigitalOcean droplet** with your **Namecheap domain (faizansayshi.com)**.

The production setup in this repo uses:

- **Docker Compose** to run Postgres + FastAPI + workers
- **Caddy** as the reverse proxy that:
  - serves the React SPA
  - forwards `/api/backend/*` to the FastAPI container
  - automatically gets and renews TLS certificates from Let’s Encrypt

---

## 0) What you need ready

- A DigitalOcean droplet (Ubuntu 22.04/24.04 recommended)
- Domain: `faizansayshi.com` (Namecheap)
- Stripe account (if you want subscriptions enabled)
  - Stripe secret key
  - Stripe webhook secret
  - Stripe price IDs (monthly/yearly)

---

## 1) Point your domain to the droplet (Namecheap)

1. In DigitalOcean, copy your droplet’s **public IPv4** address.
2. In Namecheap → Domain List → **Manage** → **Advanced DNS**:
   - Add / set an **A record**:
     - Host: `@`
     - Value: `<YOUR_DROPLET_IP>`
     - TTL: Automatic
   - Add / set an **A record**:
     - Host: `www`
     - Value: `<YOUR_DROPLET_IP>`
     - TTL: Automatic

DNS propagation can take a little while. Caddy won’t be able to issue a TLS cert until the domain resolves to your droplet.

---

## 2) SSH into your droplet

From your local machine:

```bash
ssh root@<YOUR_DROPLET_IP>
```

(Or use a non-root user with sudo—either works.)

---

## 3) Install Docker + Compose plugin

On Ubuntu:

```bash
apt-get update
apt-get install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Verify:

```bash
docker --version
docker compose version
```

---

## 4) Upload or clone the project onto the droplet

Option A (recommended): **git clone** (if you have a repo)

```bash
cd /opt
git clone <YOUR_REPO_URL> insider-platform
cd insider-platform
```

Option B: **SCP the zip** from your laptop

1. Copy the zip to the droplet:

```bash
scp insider-platform.zip root@<YOUR_DROPLET_IP>:/opt/
```

2. Unzip:

```bash
cd /opt
apt-get install -y unzip
unzip insider-platform.zip -d insider-platform
cd insider-platform
```

---

## 5) Create your production `.env`

From the project root:

```bash
cp .env.example .env
nano .env
```

Minimum recommended edits before launching:

- `DOMAIN=faizansayshi.com`
- `CADDY_EMAIL=you@example.com`
- `POSTGRES_PASSWORD=<STRONG_PASSWORD>`
- `AUTH_JWT_SECRET=<LONG_RANDOM_SECRET>`
- `PUBLIC_APP_URL=https://faizansayshi.com`
- `AUTH_COOKIE_DOMAIN=.faizansayshi.com`
- `SEC_USER_AGENT=InsiderPlatform/0.1 (contact: you@yourdomain.com)`

If you want billing enabled:

- `STRIPE_SECRET_KEY=...`
- `STRIPE_WEBHOOK_SECRET=...`
- `STRIPE_PRICE_ID_MONTHLY=...`
- `STRIPE_PRICE_ID_YEARLY=...` (optional)

If you want price charts:

- `EODHD_API_KEY=...`

---

## 6) Start Postgres, initialize schema, then start everything

### 6.1 Start only the database

```bash
docker compose -f docker-compose.prod.yml up -d db
```

### 6.2 Initialize / migrate database tables (recommended)

Run the schema init inside the API container:

```bash
docker compose -f docker-compose.prod.yml run --rm api python scripts/init_db.py
```

Note: the API and workers also apply schema/migrations automatically on startup. Running this command is still recommended on first deploy (and after schema changes) so you can see any migration errors immediately.

### 6.3 Start the full stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Check containers:

```bash
docker compose -f docker-compose.prod.yml ps
```

Check logs (useful if something fails):

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=200 web
```

---

## 7) Verify the website is live

Once DNS has propagated:

- Visit: `https://faizansayshi.com`
- Try:
  - Sign up
  - Visit Pricing
  - If Stripe configured: subscribe
  - Visit `/app/tickers`

If TLS fails, it’s almost always one of:

- DNS still not pointed at the droplet
- Port 80/443 blocked by a firewall

---

## 8) Move your existing local Postgres data to the droplet (optional)

If your database currently lives on your laptop/server locally and you want that same data in production:

### 8.1 Dump locally

On your local machine:

```bash
pg_dump -Fc -U postgres -d insider_platform -f insider_platform.dump
```

### 8.2 Copy dump to the droplet

```bash
scp insider_platform.dump root@<YOUR_DROPLET_IP>:/opt/insider-platform/
```

### 8.3 Restore into the container

On the droplet:

1) Start db (if not already):

```bash
docker compose -f docker-compose.prod.yml up -d db
```

2) Copy dump into the db container:

```bash
DB_CID=$(docker compose -f docker-compose.prod.yml ps -q db)
docker cp insider_platform.dump ${DB_CID}:/tmp/insider_platform.dump
```

3) Restore:

```bash
docker exec -it ${DB_CID} pg_restore -U postgres -d insider_platform --clean --if-exists /tmp/insider_platform.dump
```

Then restart API/workers:

```bash
docker compose -f docker-compose.prod.yml restart api worker_api worker_compute
```

---

## 9) Configure Stripe Webhook (required for subscription state updates)

In Stripe Dashboard → Developers → Webhooks:

- Add endpoint:
  - URL: `https://faizansayshi.com/api/backend/billing/stripe/webhook`

Recommended events to select:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Copy the **Signing secret** into your `.env` as `STRIPE_WEBHOOK_SECRET`.

---

## 10) Common issues

### Login works, but `/app` always says “Subscription required”

- Stripe webhook not configured or not firing
- `PUBLIC_APP_URL` doesn’t match your real domain
- `STRIPE_WEBHOOK_SECRET` incorrect

Check API logs:

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=200 api
```

### Charts show “No price data”

- Missing `EODHD_API_KEY`

### Caddy TLS issues

- DNS not propagated yet
- Ports 80/443 blocked

---

## 11) Updating the site later

From the project directory on the droplet:

```bash
git pull

docker compose -f docker-compose.prod.yml up -d --build
```

---
