# ♜ Citation Capture License Server

Production-ready local server for selling and validating Obsidian Citation Capture licenses.

## Features

- ✅ **License Verification** — Validate Pro/Pro+/Lifetime keys from Chrome extension
- ✅ **Stripe Integration** — Automated checkout + webhook-driven license issuance
- ✅ **Cloud AI Proxy** — Claude Haiku summaries for Pro+/Lifetime subscribers
- ✅ **SQLite Database** — Persistent storage with usage tracking
- ✅ **Admin Dashboard** — Simple HTML dashboard at `/dashboard`
- ✅ **Admin API** — Batch generate, list, revoke licenses
- ✅ **Credit System** — Monthly 200-credit allowance for Cloud AI
- ✅ **Demo Mode** — Works without Stripe/Anthropic for testing

## Quick Start

```bash
cd backend

# 1. Create .env file
cp .env.example .env
# Edit .env with your Stripe and Anthropic keys

# 2. Run the server
./run.sh

# Server starts at http://localhost:8000
# Dashboard: http://localhost:8000/dashboard
# API Docs: http://localhost:8000/docs
```

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/api/v1/license/verify` | Verify license key (Bearer token) |
| `POST` | `/api/v1/summarize` | AI summary (requires Pro+/Lifetime) |
| `POST` | `/api/v1/suggest-tags` | Tag suggestions (requires Pro+/Lifetime) |
| `POST` | `/api/v1/stripe/create-checkout-session` | Create payment session |
| `POST` | `/api/v1/stripe/webhook` | Stripe webhook handler |

### Admin Endpoints (Requires `ADMIN_API_KEY`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/admin/licenses/generate` | Batch generate keys |
| `GET` | `/admin/licenses` | List all licenses |
| `POST` | `/admin/licenses/{key}/revoke` | Revoke a license |
| `GET` | `/admin/stats` | Usage statistics |

## Configuration

### Required for Payments

1. Create a [Stripe account](https://stripe.com)
2. Get API keys from Dashboard → Developers → API Keys
3. Create products in Dashboard → Product Catalog
4. Add price IDs to `.env`

### Required for Cloud AI

1. Get an [Anthropic API key](https://console.anthropic.com)
2. Add to `.env` as `ANTHROPIC_API_KEY`

### Optional: Gumroad/LemonSqueezy (No-Code)

```bash
# Generate batch of keys
node ../scripts/generate-license-keys.mjs --tier lifetime --count 100 --format csv --out lifetime_keys.csv
```

Upload CSV to Gumroad/LemonSqueezy as pre-generated keys.

## License Key Format

```
PRO-XXXX-XXXX-XXXX
PROPLUS-XXXX-XXXX-XXXX
LIFETIME-XXXX-XXXX-XXXX
TEAM-XXXX-XXXX-XXXX
```

Where `X` is any letter (excluding I, O) or digit (excluding 0, 1).

## Testing

```bash
# Run tests
pytest tests/test_server.py -v

# Test with curl
curl http://localhost:8000/api/v1/license/verify \
  -H "Authorization: Bearer DEMO-PROPLUS"
```

## Deployment

### Local Development
```bash
./run.sh
```

### Production (systemd)
```bash
# Create service file
sudo tee /etc/systemd/system/citation-capture.service << 'EOF'
[Unit]
Description=Citation Capture License Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/citation-capture/backend
EnvironmentFile=/opt/citation-capture/backend/.env
ExecStart=/opt/citation-capture/backend/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable citation-capture
sudo systemctl start citation-capture
```

### Docker (optional)
```bash
docker build -t citation-capture .
docker run -p 8000:8000 --env-file .env citation-capture
```

## Database

SQLite database stored at `data/licenses.db`. Back up regularly:

```bash
cp data/licenses.db data/licenses.db.backup.$(date +%Y%m%d)
```

## Security Notes

- Change `ADMIN_API_KEY` before production use
- Use HTTPS in production ( Stripe webhooks require it)
- Keep `.env` out of version control (already in `.gitignore`)
- Stripe webhook secret validates webhook authenticity
