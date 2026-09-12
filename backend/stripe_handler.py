"""
Obsidian Citation Capture — Stripe Checkout & Webhook Integration

Handles:
1. Creating Stripe Checkout sessions for Pro, Pro+, and Lifetime licenses.
2. Listening to Stripe webhooks (`checkout.session.completed`).
3. Generating and assigning a valid license key upon payment.
4. Persisting keys in `backend/licenses.json` so they survive server restarts.
"""

import os
import json
import secrets
import re
from pathlib import Path
from typing import Dict, Any, Optional

# Persistent licenses database path
LICENSES_FILE = Path(__file__).parent / "licenses.json"

VALID_TIERS = {
  "pro": "PRO",
  "proplus": "PROPLUS",
  "pro+": "PROPLUS",
  "pro_plus": "PROPLUS",
  "lifetime": "LIFETIME",
  "team": "TEAM"
}

CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
LICENSE_REGEX = re.compile(r"^(PRO|PROPLUS|LIFETIME|TEAM)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$")

def generate_license_key(tier: str = "LIFETIME") -> str:
  normalized = VALID_TIERS.get(tier.lower(), tier.upper())
  if normalized not in ("PRO", "PROPLUS", "LIFETIME", "TEAM"):
    normalized = "LIFETIME"

  def chunk():
    return "".join(secrets.choice(CHARSET) for _ in range(4))

  return f"{normalized}-{chunk()}-{chunk()}-{chunk()}"

def load_persistent_licenses() -> Dict[str, Dict[str, Any]]:
  if LICENSES_FILE.exists():
    try:
      with open(LICENSES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)
    except Exception as e:
      print(f"Warning: Could not read {LICENSES_FILE}: {e}")
  return {}

def save_persistent_license(key: str, data: Dict[str, Any]) -> None:
  current = load_persistent_licenses()
  current[key] = data
  try:
    with open(LICENSES_FILE, "w", encoding="utf-8") as f:
      json.dump(current, f, indent=2)
  except Exception as e:
    print(f"Warning: Could not write to {LICENSES_FILE}: {e}")

def issue_license_for_customer(email: str, tier: str, stripe_session_id: Optional[str] = None) -> Dict[str, Any]:
  normalized_tier = tier.lower().replace("+", "_plus").replace("proplus", "pro_plus")
  key = generate_license_key(tier)
  credits = 200 if normalized_tier in ("pro_plus", "lifetime") else 0

  record = {
    "key": key,
    "tier": normalized_tier,
    "credits": credits,
    "status": "active",
    "customer_email": email,
    "stripe_session_id": stripe_session_id
  }

  save_persistent_license(key, record)
  return record
