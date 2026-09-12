# Citation Capture License Server — Setup Guide

## What You Just Got

A complete, production-ready local server for selling and validating Obsidian Citation Capture licenses.

## Quick Start (5 minutes)

```bash
# 1. Navigate to backend
cd citation_capture_obsidian/backend

# 2. Set up environment
cp .env.example .env
# Edit .env with your Stripe + Anthropic keys (optional for demo mode)

# 3. Start the server
./run.sh

# Server runs at http://localhost:8000
# Dashboard: http://localhost:8000/dashboard
# API Docs: http://localhost:8000/docs
```

## What's Included

| File | Purpose |
|------|---------|
| `server.py` | Main FastAPI application — licenses, Stripe, AI proxy |
| `database.py` | SQLite persistence with usage tracking |
| `.env.example` | Configuration template |
| `run.sh` | One-command startup script |
| `tests/test_server.py` | 13 automated tests (all passing ✅) |
| `citation-capture.service` | systemd unit for production |
| `Dockerfile` | Container deployment |
| `README.md` | Full documentation |

## API Endpoints

### Public (No Auth Required)
- `GET /` — Health check
- `GET /api/v1/license/verify` — Verify a license key
- `POST /api/v1/stripe/create-checkout-session` — Buy a license
- `POST /api/v1/stripe/webhook` — Stripe payment notifications

### Cloud AI (Requires Pro+/Lifetime License)
- `POST /api/v1/summarize` — AI summary of abstract
- `POST /api/v1/suggest-tags` — Research tag suggestions

### Admin (Requires `ADMIN_API_KEY`)
- `POST /admin/licenses/generate` — Batch create keys
- `GET /admin/licenses` — List all licenses
- `POST /admin/licenses/{key}/revoke` — Revoke a license
- `GET /admin/stats` — Usage analytics

## Selling Licenses — Three Ways

### 1. Stripe Integration (Automated)

Set in `.env`:
```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

Customer flow:
1. Extension calls `create-checkout-session`
2. Stripe handles payment
3. Webhook auto-generates license key
4. Key saved to SQLite database

### 2. Pre-Generated Keys (Gumroad / LemonSqueezy)

```bash
# Generate 100 Lifetime keys
npm run generate-keys -- --tier lifetime --count 100 --format csv --out lifetime_keys.csv

# Upload CSV to Gumroad as pre-generated keys
# Done — no server needed for sales
```

### 3. Manual Sales (Admin API)

```bash
# Generate a batch
curl -X POST http://localhost:8000/admin/licenses/generate \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tier": "lifetime", "count": 10}'
```

## Architecture

```
Chrome Extension / Obsidian Plugin
        │
        ├─ License Verification ──→ SQLite Database
        │
        └─ Cloud AI Request ─────→ Claude Haiku (Pro+/Lifetime only)
                                    │
                                    └─ Credit deducted from DB
```

## Production Deployment

### Option A: systemd (Recommended for local server)

```bash
sudo cp citation-capture.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable citation-capture
sudo systemctl start citation-capture
```

### Option B: Docker

```bash
docker build -t citation-capture .
docker run -d -p 8000:8000 --env-file .env citation-capture
```

### Option C: Reverse Proxy (nginx/caddy)

```nginx
server {
    listen 443 ssl;
    server_name licenses.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Testing

```bash
cd backend
source .venv/bin/activate
pytest tests/test_server.py -v
```

## Next Steps

1. **Set up Stripe** → Add live keys to `.env`
2. **Add Anthropic key** → For Cloud AI proxy
3. **Generate first keys** → `npm run key:lifetime`
4. **Update extension** → Point `cloudBackendUrl` to your server
5. **Test purchase flow** → Use Stripe test mode first

## Need Help?

- API docs live at `http://localhost:8000/docs`
- Dashboard at `http://localhost:8000/dashboard`
- All 13 tests pass before any commit
