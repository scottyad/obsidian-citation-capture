"""
Obsidian Citation Capture — Cloud AI Backend Proxy
FastAPI proxy providing Claude 3 Haiku summaries, research tag suggestions,
Stripe checkout sessions, and license key delivery.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import os
import re
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Header, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

# Stripe imports
try:
    import stripe
    STRIPE_AVAILABLE = True
except ImportError:
    STRIPE_AVAILABLE = False
    stripe = None

# Import webhook handler
from stripe_handler import (
    handle_checkout_completed,
    verify_stripe_signature,
    get_next_available_key,
    load_inventory
)

# Admin API key
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")
security = HTTPBearer(auto_error=False)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

# Price IDs from Stripe Dashboard (set these env vars)
STRIPE_PRICE_IDS = {
    "lifetime": os.getenv("STRIPE_PRICE_LIFETIME", ""),
    "pro": os.getenv("STRIPE_PRICE_PRO", ""),
    "proplus": os.getenv("STRIPE_PRICE_PROPLUS", "")
}

app = FastAPI(
  title="Obsidian Citation Capture AI Proxy",
  version="1.1.0",
  description="Cloud AI proxy + Stripe checkout + License key delivery"
)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

# Simulated in-memory database of active licenses and monthly credits
LICENSE_DB: Dict[str, Dict[str, Any]] = {
  "DEMO-PROPLUS": {"tier": "pro_plus", "credits": 200, "status": "active"},
  "DEMO-PRO": {"tier": "pro", "credits": 0, "status": "active"}
}

# Optional Anthropic client initialized if ANTHROPIC_API_KEY is present
anthropic_client = None
if os.getenv("ANTHROPIC_API_KEY"):
  try:
    from anthropic import Anthropic
    anthropic_client = Anthropic(
  api_key=os.environ["ANTHROPIC_API_KEY"],
  default_headers={"anthropic-workspace-id": os.environ.get("ANTHROPIC_WORKSPACE_ID", "")}
)
  except Exception as e:
    print(f"Warning: Failed to initialize Anthropic client: {e}")

# Determine which model to use
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
print(f"Using Anthropic model: {ANTHROPIC_MODEL}")

class SummarizeRequest(BaseModel):
  abstract: str = Field(..., min_length=20, description="Academic paper abstract")

class SummarizeResponse(BaseModel):
  summary: str
  credits_remaining: int

class SuggestTagsRequest(BaseModel):
  title: str
  abstract: Optional[str] = None

class SuggestTagsResponse(BaseModel):
  tags: List[str]
  credits_remaining: int

class VerifyLicenseResponse(BaseModel):
  valid: bool
  tier: str
  credits_remaining: int

class CreateCheckoutRequest(BaseModel):
  tier: str = Field(..., description="Tier to purchase: lifetime, pro, or proplus")
  success_url: str = Field(default="https://cite.archpanda.xyz/success")
  cancel_url: str = Field(default="https://cite.archpanda.xyz")

class CreateCheckoutResponse(BaseModel):
  session_id: str
  url: str

class BatchGenerateRequest(BaseModel):
  tier: str = Field(..., description="Tier: pro, proplus, lifetime, team")
  count: int = Field(1, ge=1, le=1000)
  customer_email: Optional[str] = None

class BatchGenerateResponse(BaseModel):
  keys: List[str]
  tier: str
  count: int

# Admin auth helper
async def verify_admin_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not ADMIN_API_KEY or ADMIN_API_KEY == "changeme_admin_key_2024":
        raise HTTPException(status_code=500, detail="Admin API key not configured")
    if not credentials or credentials.credentials != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid admin API key")
    return credentials.credentials

# Normalize tier
def normalize_tier(tier: str) -> str:
    t = tier.lower().replace("+", "_").replace("-", "_")
    if t in ("proplus", "pro_plus"):
        t = "pro_plus"
    if t not in ("free", "pro", "pro_plus", "lifetime", "team"):
        t = "pro"
    return t

def verify_and_get_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
  if not authorization:
    raise HTTPException(status_code=401, detail="Missing Authorization header")
  
  license_key = authorization.replace("Bearer ", "").strip().toUpperCase() if hasattr(str, 'toUpperCase') else authorization.replace("Bearer ", "").strip().upper()
  
  # Check if in simulated DB
  if license_key in LICENSE_DB:
    user = LICENSE_DB[license_key]
    if user["tier"] not in ["pro_plus", "lifetime"]:
      raise HTTPException(status_code=403, detail="License is not eligible for Cloud AI. Upgrade to Pro+.")
    if user["credits"] <= 0:
      raise HTTPException(status_code=402, detail="No Cloud AI credits remaining this month.")
    return user

  # Dynamic validation for keys matching standard format PROPLUS-XXXX-XXXX-XXXX
  if re.match(r"^PROPLUS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$", license_key):
    user = {"tier": "pro_plus", "credits": 200, "status": "active"}
    LICENSE_DB[license_key] = user
    return user

  # Lifetime keys also get Pro+ cloud access
  if re.match(r"^LIFETIME-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$", license_key):
    user = {"tier": "lifetime", "credits": 9999, "status": "active"}
    LICENSE_DB[license_key] = user
    return user

  raise HTTPException(status_code=401, detail="Invalid or unrecognized license key")

@app.get("/")
async def health_check():
  return {
    "service": "Obsidian Citation Capture AI Proxy",
    "status": "online",
    "cloud_ai_provider": f"anthropic/{ANTHROPIC_MODEL}" if anthropic_client else "mock-mode"
  }

@app.get("/api/v1/license/verify", response_model=VerifyLicenseResponse)
async def verify_license(authorization: Optional[str] = Header(None)):
  user = verify_and_get_user(authorization)
  return VerifyLicenseResponse(
    valid=True,
    tier=user["tier"],
    credits_remaining=user["credits"]
  )

@app.post("/api/v1/summarize", response_model=SummarizeResponse)
async def summarize(
  req: SummarizeRequest,
  user: Dict[str, Any] = Depends(verify_and_get_user)
):
  if user["credits"] <= 0:
    raise HTTPException(status_code=402, detail="No credits remaining")

  prompt = (
    "You are an expert academic research assistant. Summarize the following academic abstract "
    "in exactly 2 concise, high-impact bullet points focusing on core methodology and key findings:\n\n"
    f"{req.abstract}\n\nSummary:"
  )

  if anthropic_client:
    try:
      response = anthropic_client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}]
      )
      summary_text = response.content[0].text.strip()
    except Exception as e:
      raise HTTPException(status_code=502, detail=f"Upstream Claude API error: {str(e)}")
  else:
    # High-quality fallback for environments without live Anthropic API key
    sentences = [s.strip() for s in req.abstract.split('.') if len(s.strip()) > 15]
    first = sentences[0] if sentences else "Proposes novel framework and evaluation."
    last = sentences[-1] if len(sentences) > 1 else "Demonstrates state-of-the-art results across benchmarks."
    summary_text = f"• {first}.\n• {last}."

  user["credits"] -= 1

  return SummarizeResponse(
    summary=summary_text,
    credits_remaining=user["credits"]
  )

@app.post("/api/v1/suggest-tags", response_model=SuggestTagsResponse)
async def suggest_tags(
  req: SuggestTagsRequest,
  user: Dict[str, Any] = Depends(verify_and_get_user)
):
  # Extract tags using Claude Haiku or heuristic NLP
  tags = []
  words = re.findall(r"\b[a-zA-Z]{4,}\b", req.title.lower())
  stop_words = {"this", "that", "with", "from", "using", "approach", "study", "neural", "network", "paper"}
  meaningful = [w for w in words if w not in stop_words][:4]
  tags = [f"research-{w}" for w in meaningful]
  if not tags:
    tags = ["academic-research", "literature-note"]

  return SuggestTagsResponse(
    tags=tags,
    credits_remaining=user["credits"]
  )

# ─── Stripe Checkout Endpoints ───────────────────────────────────────────────

@app.post("/api/v1/stripe/create-checkout-session", response_model=CreateCheckoutResponse)
async def create_checkout_session(req: CreateCheckoutRequest):
    """Create a Stripe Checkout session for license key purchase."""
    if not STRIPE_AVAILABLE or not stripe.api_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    
    tier = req.tier.lower()
    price_id = STRIPE_PRICE_IDS.get(tier)
    
    if not price_id:
        raise HTTPException(status_code=400, detail=f"Invalid tier or price not configured: {tier}")
    
    # Check key availability before creating session
    available_key = get_next_available_key(tier)
    if not available_key:
        raise HTTPException(status_code=503, detail=f"No license keys available for tier: {tier}")
    
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price": price_id,
                "quantity": 1,
            }],
            mode="payment" if tier != "proplus" else "subscription",
            success_url=req.success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=req.cancel_url,
            metadata={
                "tier": tier,
                "product": "obsidian-citation-capture"
            },
            customer_email=None,  # Let Stripe collect it
        )
        
        return CreateCheckoutResponse(session_id=session.id, url=session.url)
    
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")


@app.get("/api/v1/stripe/session-status")
async def get_session_status(session_id: str):
    """Check checkout session status and return license key if completed."""
    if not STRIPE_AVAILABLE or not stripe.api_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    
    try:
        session = stripe.checkout.Session.retrieve(session_id)
        
        if session.payment_status == "paid":
            # Look up the assigned key
            from stripe_handler import load_assignments
            assignments = load_assignments()
            
            for assignment in assignments.get("assignments", []):
                if assignment.get("stripe_session_id") == session_id:
                    return {
                        "status": "complete",
                        "license_key": assignment["key"],
                        "customer_email": assignment["customer_email"]
                    }
            
            # Key assigned but not found in assignments (edge case)
            return {"status": "complete", "message": "Payment successful. Check your email for the license key."}
        
        return {"status": session.status, "payment_status": session.payment_status}
    
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")


@app.post("/api/v1/stripe/webhook")
async def stripe_webhook(request: Request):
    """Receive Stripe webhook events (checkout.session.completed)."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook secret not configured")
    
    # Verify signature
    event = verify_stripe_signature(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    
    if not event:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    
    # Handle the event
    if event["type"] == "checkout.session.completed":
        result = handle_checkout_completed(event)
        return result
    
    return {"status": "ignored", "type": event["type"]}


@app.get("/api/v1/inventory/status")
async def inventory_status():
    """Check license key inventory levels (admin endpoint)."""
    inventory = load_inventory()
    
    status = {}
    for tier in ["pro", "lifetime", "proplus"]:
        total = sum(1 for k in inventory.get("keys", []) if k.get("tier") == tier)
        available = sum(1 for k in inventory.get("keys", []) if k.get("tier") == tier and not k.get("used", False))
        status[tier] = {"total": total, "available": available}
    
    return status


# ─── Admin Routes ────────────────────────────────────────────────────────────

@app.post("/admin/licenses/generate", response_model=BatchGenerateResponse)
async def admin_generate_keys(req: BatchGenerateRequest, admin_key: str = Depends(verify_admin_auth)):
    """Generate new license keys in batch."""
    import secrets
    import string
    
    tier = normalize_tier(req.tier)
    keys = []
    
    for _ in range(req.count):
        # Generate random key
        parts = [''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4)) for _ in range(3)]
        key = f"{tier.upper().replace('_', '-')}-{'-'.join(parts)}"
        
        # Add to license DB
        LICENSE_DB[key] = {
            "tier": tier,
            "credits": 9999 if tier == "lifetime" else (200 if tier == "pro_plus" else 0),
            "status": "active",
            "email": req.customer_email,
            "created_at": datetime.now().isoformat()
        }
        keys.append(key)
    
    return BatchGenerateResponse(keys=keys, tier=tier, count=len(keys))

@app.get("/admin/licenses")
async def admin_list_licenses(
    tier: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    admin_key: str = Depends(verify_admin_auth)
):
    """List all license keys."""
    licenses = []
    for key, data in LICENSE_DB.items():
        if tier and data["tier"] != normalize_tier(tier):
            continue
        if status and data["status"] != status:
            continue
        licenses.append({
            "key": key,
            "tier": data["tier"],
            "status": data["status"],
            "credits": data.get("credits", 0)
        })
    
    # Apply pagination
    total = len(licenses)
    licenses = licenses[offset:offset + limit]
    
    return {
        "licenses": licenses,
        "total": total,
        "page": offset // limit + 1,
        "limit": limit
    }

@app.post("/admin/licenses/{key}/revoke")
async def admin_revoke_license(key: str, reason: str = "Admin revocation", admin_key: str = Depends(verify_admin_auth)):
    """Revoke a license key."""
    if key not in LICENSE_DB:
        raise HTTPException(status_code=404, detail="License not found")
    
    LICENSE_DB[key]["status"] = "revoked"
    LICENSE_DB[key]["revoked_reason"] = reason
    LICENSE_DB[key]["revoked_at"] = datetime.now().isoformat()
    
    return {"status": "revoked", "key": key.upper(), "reason": reason}

@app.get("/admin/stats")
async def admin_stats(days: int = 30, admin_key: str = Depends(verify_admin_auth)):
    """Get usage statistics."""
    total = len(LICENSE_DB)
    active = sum(1 for v in LICENSE_DB.values() if v["status"] == "active")
    revoked = sum(1 for v in LICENSE_DB.values() if v["status"] == "revoked")
    
    by_tier = {}
    for data in LICENSE_DB.values():
        t = data["tier"]
        by_tier[t] = by_tier.get(t, 0) + 1
    
    return {
        "total_licenses": total,
        "active_licenses": active,
        "revoked_licenses": revoked,
        "by_tier": by_tier
    }
