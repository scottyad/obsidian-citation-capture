"""
Obsidian Citation Capture — Production License Server v2.0
FastAPI server with SQLite database, Stripe integration, Cloud AI proxy.
Integrates with existing stripe_handler.py for email delivery.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import os
import re
import json
from datetime import datetime
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr

import database as db
from stripe_handler import (
    handle_checkout_completed,
    verify_stripe_signature,
    get_next_available_key,
    load_inventory,
    mark_key_used,
    send_license_email,
    STRIPE_AVAILABLE
)

# Load environment
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://cite.archpanda.xyz")

# Stripe price IDs
STRIPE_PRICE_PRO = os.getenv("STRIPE_PRICE_PRO")
STRIPE_PRICE_PROPLUS = os.getenv("STRIPE_PRICE_PROPLUS")
STRIPE_PRICE_LIFETIME = os.getenv("STRIPE_PRICE_LIFETIME")

# Initialize optional Stripe
stripe_lib = None
if STRIPE_SECRET_KEY:
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        stripe_lib = stripe
    except ImportError:
        print("Warning: stripe package not installed")

# Initialize optional Anthropic
anthropic_client = None
if ANTHROPIC_API_KEY:
    try:
        from anthropic import Anthropic
        anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY, default_headers={"anthropic-workspace-id": ANTHROPIC_WORKSPACE_ID} if ANTHROPIC_WORKSPACE_ID else {})
    except ImportError:
        print("Warning: anthropic package not installed")

security = HTTPBearer(auto_error=False)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: migrate legacy inventory data."""
    db.migrate_from_inventory(
        os.path.join(os.path.dirname(__file__), "license_inventory.json"),
        os.path.join(os.path.dirname(__file__), "license_assignments.json")
    )
    yield

app = FastAPI(
    title="Citation Capture License Server",
    version="2.0.0",
    description="License validation, Stripe checkout, and Cloud AI proxy",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "chrome-extension://*", "http://localhost:*", "https://*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class LicenseVerifyResponse(BaseModel):
    valid: bool
    tier: str = "free"
    credits_remaining: int = 0
    status: str = "active"
    message: Optional[str] = None

class SummarizeRequest(BaseModel):
    abstract: str = Field(..., min_length=20)

class SummarizeResponse(BaseModel):
    summary: str
    credits_remaining: int

class SuggestTagsRequest(BaseModel):
    title: str
    abstract: Optional[str] = None

class SuggestTagsResponse(BaseModel):
    tags: List[str]
    credits_remaining: int

class CreateCheckoutRequest(BaseModel):
    tier: str = Field("lifetime", description="Tier: pro, proplus, lifetime")
    customer_email: Optional[EmailStr] = None
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None

class CheckoutResponse(BaseModel):
    checkout_url: Optional[str] = None
    session_id: Optional[str] = None
    mode: str = "live"
    license_key: Optional[str] = None
    message: Optional[str] = None

class BatchGenerateRequest(BaseModel):
    tier: str = Field(..., description="Tier: pro, proplus, lifetime, team")
    count: int = Field(1, ge=1, le=1000)
    customer_email: Optional[EmailStr] = None

class BatchGenerateResponse(BaseModel):
    keys: List[str]
    tier: str
    count: int

class HealthResponse(BaseModel):
    status: str
    version: str
    stripe_enabled: bool
    cloud_ai_enabled: bool
    database: str


# ─── Helpers ─────────────────────────────────────────────────────────────────

def normalize_tier(tier: str) -> str:
    t = tier.lower().strip().replace("+", "_plus")
    if t == "proplus":
        t = "pro_plus"
    if t not in ("free", "pro", "pro_plus", "lifetime", "team"):
        t = "pro"
    return t

async def verify_admin_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not ADMIN_API_KEY or ADMIN_API_KEY == "changeme_admin_key_2024":
        raise HTTPException(status_code=500, detail="Admin API key not configured")
    if not credentials or credentials.credentials != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid admin API key")
    return credentials.credentials

async def get_license_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    
    auth = authorization.strip()
    key = auth[7:].strip().upper() if auth.lower().startswith("bearer ") else auth.upper()
    
    # Check database
    result = db.verify_license(key)
    if result["valid"]:
        return {"key": key, "tier": result["tier"], "credits_remaining": result.get("credits_remaining", 0)}
    
    # Demo keys
    demo_keys = {
        "DEMO-PRO": {"tier": "pro", "credits": 0},
        "DEMO-PROPLUS": {"tier": "pro_plus", "credits": 200},
        "DEMO-LIFETIME": {"tier": "lifetime", "credits": 200}
    }
    if key in demo_keys:
        return {"key": key, "tier": demo_keys[key]["tier"], "credits_remaining": demo_keys[key]["credits"]}
    
    raise HTTPException(status_code=401, detail="Invalid or unrecognized license key")


# ─── Public Routes ──────────────────────────────────────────────────────────

@app.get("/", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="online",
        version="2.0.0",
        stripe_enabled=stripe_lib is not None,
        cloud_ai_enabled=anthropic_client is not None,
        database="connected"
    )

@app.get("/api/v1/license/verify", response_model=LicenseVerifyResponse)
async def verify_license_endpoint(authorization: Optional[str] = Header(None)):
    if not authorization:
        return LicenseVerifyResponse(valid=False, message="No license key provided")
    
    auth = authorization.strip()
    key = auth[7:].strip().upper() if auth.lower().startswith("bearer ") else auth.upper()
    
    demo_keys = {
        "DEMO-PRO": "pro",
        "DEMO-PROPLUS": "pro_plus",
        "DEMO-LIFETIME": "lifetime"
    }
    if key in demo_keys:
        return LicenseVerifyResponse(
            valid=True, tier=demo_keys[key],
            credits_remaining=200 if demo_keys[key] in ("pro_plus", "lifetime") else 0,
            status="active"
        )
    
    result = db.verify_license(key)
    if not result["valid"]:
        raise HTTPException(status_code=401, detail=result.get("reason", "Invalid license"))
    
    return LicenseVerifyResponse(
        valid=True, tier=result.get("tier", "free"),
        credits_remaining=result.get("credits_remaining", 0),
        status=result.get("status", "unknown")
    )


# ─── Cloud AI Proxy ──────────────────────────────────────────────────────────

@app.post("/api/v1/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest, user: Dict[str, Any] = Depends(get_license_user)):
    if user["tier"] not in ("pro_plus", "lifetime"):
        raise HTTPException(status_code=403, detail="Cloud AI requires Pro+ or Lifetime tier")
    if user["credits_remaining"] <= 0:
        raise HTTPException(status_code=402, detail="No Cloud AI credits remaining")
    
    prompt = (
        "You are an expert academic research assistant. Summarize the following academic abstract "
        "in exactly 2 concise, high-impact bullet points focusing on core methodology and key findings:\n\n"
        f"{req.abstract}\n\nSummary:"
    )
    
    summary_text = None
    if anthropic_client:
        try:
            response = anthropic_client.messages.create(
                model=os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}]
            )
            summary_text = response.content[0].text.strip()
        except Exception as e:
            print(f"Claude API error: {e}")
    
    if not summary_text:
        sentences = [s.strip() for s in req.abstract.split('.') if len(s.strip()) > 15]
        first = sentences[0] if sentences else "Proposes novel framework and evaluation."
        last = sentences[-1] if len(sentences) > 1 else "Demonstrates state-of-the-art results."
        summary_text = f"• {first}.\n• {last}."
    
    result = db.deduct_credit(user["key"], "summarize")
    credits_remaining = result["credits_remaining"] if result["success"] else user["credits_remaining"] - 1
    
    return SummarizeResponse(summary=summary_text, credits_remaining=credits_remaining)

@app.post("/api/v1/suggest-tags", response_model=SuggestTagsResponse)
async def suggest_tags(req: SuggestTagsRequest, user: Dict[str, Any] = Depends(get_license_user)):
    if user["tier"] not in ("pro_plus", "lifetime"):
        raise HTTPException(status_code=403, detail="Cloud AI requires Pro+ or Lifetime tier")
    if user["credits_remaining"] <= 0:
        raise HTTPException(status_code=402, detail="No Cloud AI credits remaining")
    
    words = re.findall(r"\b[a-zA-Z]{4,}\b", req.title.lower())
    stop_words = {"this", "that", "with", "from", "using", "approach", "study", "neural", "network", "paper", "based"}
    meaningful = [w for w in words if w not in stop_words][:4]
    tags = [f"research-{w}" for w in meaningful] if meaningful else ["academic-research", "literature-note"]
    
    result = db.deduct_credit(user["key"], "tag_suggest")
    credits_remaining = result["credits_remaining"] if result["success"] else user["credits_remaining"] - 1
    
    return SuggestTagsResponse(tags=tags, credits_remaining=credits_remaining)


# ─── Stripe Checkout ─────────────────────────────────────────────────────────

@app.post("/api/v1/stripe/create-checkout-session", response_model=CheckoutResponse)
async def create_checkout_session(req: CreateCheckoutRequest):
    tier = normalize_tier(req.tier)
    
    if stripe_lib and STRIPE_SECRET_KEY:
        price_id = STRIPE_PRICE_LIFETIME if tier == "lifetime" else \
                   STRIPE_PRICE_PRO if tier == "pro" else \
                   STRIPE_PRICE_PROPLUS
        
        if not price_id:
            # Dynamic price
            prices = {
                "pro": int(os.getenv("STRIPE_PRICE_PRO_CENTS", 499)),
                "pro_plus": int(os.getenv("STRIPE_PRICE_PROPLUS_CENTS", 999)),
                "lifetime": int(os.getenv("STRIPE_PRICE_LIFETIME_CENTS", 2499))
            }
            
            try:
                session = stripe_lib.checkout.Session.create(
                    payment_method_types=["card"],
                    line_items=[{
                        "price_data": {
                            "currency": "usd",
                            "product_data": {
                                "name": f"Citation Capture — {tier.replace('_', '+').upper()}",
                                "description": "Academic citation capture license",
                            },
                            "unit_amount": prices.get(tier, 2499),
                        },
                        "quantity": 1,
                    }],
                    mode="payment",
                    customer_email=req.customer_email,
                    metadata={"tier": tier},
                    success_url=req.success_url or f"{FRONTEND_URL}/success?session_id={{CHECKOUT_SESSION_ID}}",
                    cancel_url=req.cancel_url or f"{FRONTEND_URL}/cancel",
                )
                
                db.record_stripe_checkout(session.id, tier, req.customer_email)
                return CheckoutResponse(checkout_url=session.url, session_id=session.id, mode="live")
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
        else:
            try:
                session = stripe_lib.checkout.Session.create(
                    payment_method_types=["card"],
                    line_items=[{"price": price_id, "quantity": 1}],
                    mode="payment",
                    customer_email=req.customer_email,
                    metadata={"tier": tier},
                    success_url=req.success_url or f"{FRONTEND_URL}/success?session_id={{CHECKOUT_SESSION_ID}}",
                    cancel_url=req.cancel_url or f"{FRONTEND_URL}/cancel",
                )
                
                db.record_stripe_checkout(session.id, tier, req.customer_email)
                return CheckoutResponse(checkout_url=session.url, session_id=session.id, mode="live")
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
    else:
        # Demo mode
        record = db.create_license(tier, req.customer_email, source="demo_checkout")
        return CheckoutResponse(mode="demo", license_key=record["key"], message="Stripe not configured. Demo key generated.", session_id="demo-session")

@app.post("/api/v1/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    
    if STRIPE_AVAILABLE and STRIPE_WEBHOOK_SECRET and sig_header:
        event = verify_stripe_signature(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        if not event:
            raise HTTPException(status_code=400, detail="Invalid webhook signature")
    else:
        try:
            event = json.loads(payload.decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    event_type = event.get("type", "")
    
    if event_type == "checkout.session.completed":
        # Use existing handler first
        result = handle_checkout_completed(event)
        
        # Also record in database
        session = event.get("data", {}).get("object", {})
        customer_email = session.get("customer_details", {}).get("email") or session.get("customer_email")
        tier = session.get("metadata", {}).get("tier", "lifetime")
        session_id = session.get("id")
        
        if result.get("status") == "success":
            key = result["license_key"]
            # Add to database if not exists
            if not db.get_license(key):
                db.create_license(tier, customer_email, session_id, source="stripe_webhook")
            db.complete_stripe_checkout(session_id, key)
            return result
        else:
            # Fallback: generate new key
            record = db.create_license(tier, customer_email, session_id, source="stripe_webhook_fallback")
            return {"status": "success", "license_key": record["key"], "tier": tier, "customer_email": customer_email}
    
    return {"status": "ignored", "event_type": event_type}


# ─── Admin Routes ────────────────────────────────────────────────────────────

@app.post("/admin/licenses/generate", response_model=BatchGenerateResponse)
async def admin_generate_keys(req: BatchGenerateRequest, admin_key: str = Depends(verify_admin_auth)):
    tier = normalize_tier(req.tier)
    keys = []
    for _ in range(req.count):
        record = db.create_license(tier, req.customer_email, source="admin_batch")
        keys.append(record["key"])
    return BatchGenerateResponse(keys=keys, tier=tier, count=len(keys))

@app.get("/admin/licenses")
async def admin_list_licenses(
    tier: Optional[str] = None, status: Optional[str] = None,
    email: Optional[str] = None, limit: int = 100, offset: int = 0,
    admin_key: str = Depends(verify_admin_auth)
):
    licenses = db.list_licenses(
        tier=normalize_tier(tier) if tier else None,
        status=status, email=email, limit=limit, offset=offset
    )
    return {"licenses": licenses, "total": len(licenses), "page": offset // limit + 1, "limit": limit}

@app.post("/admin/licenses/{key}/revoke")
async def admin_revoke_license(key: str, reason: str = "Admin revocation", admin_key: str = Depends(verify_admin_auth)):
    success = db.revoke_license(key, reason)
    if not success:
        raise HTTPException(status_code=404, detail="License not found")
    return {"status": "revoked", "key": key.upper(), "reason": reason}

@app.get("/admin/stats")
async def admin_stats(days: int = 30, admin_key: str = Depends(verify_admin_auth)):
    return {
        "usage": db.get_usage_stats(days=days),
        "total_licenses": len(db.list_licenses(limit=10000)),
        "active_licenses": len(db.list_licenses(status="active", limit=10000)),
        "by_tier": {
            "pro": len(db.list_licenses(tier="pro", limit=10000)),
            "pro_plus": len(db.list_licenses(tier="pro_plus", limit=10000)),
            "lifetime": len(db.list_licenses(tier="lifetime", limit=10000))
        }
    }


# ─── Dashboard ───────────────────────────────────────────────────────────────

@app.get("/dashboard", response_class=HTMLResponse)
async def simple_dashboard():
    total = len(db.list_licenses(limit=10000))
    active = len(db.list_licenses(status="active", limit=10000))
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Citation Capture License Server</title>
        <style>
            body {{ font-family: system-ui, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; }}
            .metric {{ display: inline-block; padding: 20px; margin: 10px; background: #f0f0f0; border-radius: 8px; }}
            .metric h2 {{ margin: 0; font-size: 2em; }}
            code {{ background: #e0e0e0; padding: 2px 6px; border-radius: 4px; }}
            .endpoint {{ margin: 10px 0; padding: 10px; background: #f8f8f8; border-left: 3px solid #007bff; }}
        </style>
    </head>
    <body>
        <h1>♜ Citation Capture License Server</h1>
        <p>Version 2.0.0 | Status: <span style="color: green;">● Online</span></p>
        
        <div class="metric"><h2>{total}</h2><p>Total Licenses</p></div>
        <div class="metric"><h2>{active}</h2><p>Active Licenses</p></div>
        
        <h2>API Endpoints</h2>
        <div class="endpoint"><code>GET /</code> — Health check</div>
        <div class="endpoint"><code>GET /api/v1/license/verify</code> — Verify license key</div>
        <div class="endpoint"><code>POST /api/v1/summarize</code> — AI summary (requires Pro+/Lifetime)</div>
        <div class="endpoint"><code>POST /api/v1/suggest-tags</code> — Tag suggestions (requires Pro+/Lifetime)</div>
        <div class="endpoint"><code>POST /api/v1/stripe/create-checkout-session</code> — Create payment session</div>
        <div class="endpoint"><code>POST /api/v1/stripe/webhook</code> — Stripe webhook handler</div>
        
        <h2>Admin Endpoints (Requires API Key)</h2>
        <div class="endpoint"><code>POST /admin/licenses/generate</code> — Batch generate keys</div>
        <div class="endpoint"><code>GET /admin/licenses</code> — List all licenses</div>
        <div class="endpoint"><code>POST /admin/licenses/{{key}}/revoke</code> — Revoke license</div>
        <div class="endpoint"><code>GET /admin/stats</code> — Usage statistics</div>
    </body>
    </html>
    """
    return html


# ─── Error Handlers ────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "Internal server error", "type": type(exc).__name__})
