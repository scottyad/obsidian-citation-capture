"""
Stripe Webhook Handler for Obsidian Citation Capture
Handles checkout.session.completed events and assigns license keys.
"""

import os
import json
import re
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any, Optional
from datetime import datetime

# Stripe imports (install with: pip install stripe)
try:
    import stripe
    STRIPE_AVAILABLE = True
except ImportError:
    STRIPE_AVAILABLE = False
    print("Warning: stripe package not installed. Run: pip install stripe")

# License key inventory file
LICENSE_INVENTORY_FILE = os.path.join(os.path.dirname(__file__), "license_inventory.json")
LICENSE_ASSIGNMENTS_FILE = os.path.join(os.path.dirname(__file__), "license_assignments.json")

# Key format regex
KEY_PATTERNS = {
    "pro": r"^PRO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$",
    "lifetime": r"^LIFETIME-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$",
    "proplus": r"^PROPLUS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$"
}

# Credit allocation per tier
TIER_CREDITS = {
    "pro": 0,
    "lifetime": 9999,
    "proplus": 200
}


def load_inventory() -> Dict[str, Any]:
    """Load the license key inventory from disk."""
    if os.path.exists(LICENSE_INVENTORY_FILE):
        with open(LICENSE_INVENTORY_FILE, 'r') as f:
            return json.load(f)
    return {"keys": []}


def save_inventory(inventory: Dict[str, Any]):
    """Save the license key inventory to disk."""
    with open(LICENSE_INVENTORY_FILE, 'w') as f:
        json.dump(inventory, f, indent=2)


def load_assignments() -> Dict[str, Any]:
    """Load the license key assignments from disk."""
    if os.path.exists(LICENSE_ASSIGNMENTS_FILE):
        with open(LICENSE_ASSIGNMENTS_FILE, 'r') as f:
            return json.load(f)
    return {"assignments": []}


def save_assignments(assignments: Dict[str, Any]):
    """Save the license key assignments to disk."""
    with open(LICENSE_ASSIGNMENTS_FILE, 'w') as f:
        json.dump(assignments, f, indent=2)


def get_next_available_key(tier: str) -> Optional[str]:
    """Get the next unused key for a given tier."""
    inventory = load_inventory()
    tier = tier.lower().replace("_", "").replace("+", "plus")
    
    for key_entry in inventory.get("keys", []):
        if key_entry.get("tier") == tier and not key_entry.get("used", False):
            return key_entry["key"]
    
    return None


def mark_key_used(key: str, customer_email: str, stripe_session_id: str):
    """Mark a key as used and record the assignment."""
    inventory = load_inventory()
    
    for key_entry in inventory.get("keys", []):
        if key_entry["key"] == key:
            key_entry["used"] = True
            key_entry["assigned_at"] = datetime.utcnow().isoformat()
            key_entry["customer_email"] = customer_email
            key_entry["stripe_session_id"] = stripe_session_id
            break
    
    save_inventory(inventory)
    
    # Record assignment
    assignments = load_assignments()
    assignments["assignments"].append({
        "key": key,
        "customer_email": customer_email,
        "stripe_session_id": stripe_session_id,
        "assigned_at": datetime.utcnow().isoformat()
    })
    save_assignments(assignments)


def send_license_email(to_email: str, license_key: str, tier: str):
    """Send the license key to the customer via email."""
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    
    if not smtp_user or not smtp_pass:
        print(f"Warning: SMTP not configured. Cannot email key to {to_email}")
        return False
    
    tier_display = tier.upper().replace("PLUS", "+")
    
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Your Obsidian Citation Capture {tier_display} License Key"
    msg["From"] = smtp_user
    msg["To"] = to_email
    
    text_body = f"""Thank you for purchasing Obsidian Citation Capture!

Your license key: {license_key}
Tier: {tier_display}

To activate:
1. Open the Obsidian Citation Capture extension
2. Click the settings icon
3. Paste your key and click "Activate"

Enjoy unlimited captures and AI-powered summaries!

— Scott @ ArchPanda
"""
    
    html_body = f"""<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
<h2 style="color:#e94560;">Thank you for your purchase!</h2>
<p>Your Obsidian Citation Capture <strong>{tier_display}</strong> license key is ready:</p>
<div style="background:#16213e;padding:20px;border-radius:8px;margin:20px 0;text-align:center;">
<code style="font-size:1.3em;color:#e94560;">{license_key}</code>
</div>
<h3>How to activate:</h3>
<ol>
<li>Open the Obsidian Citation Capture extension</li>
<li>Click the settings icon</li>
<li>Paste your key and click "Activate"</li>
</ol>
<p style="color:#666;">Enjoy unlimited captures and AI-powered summaries!</p>
<p>— Scott @ <a href="https://archpanda.xyz" style="color:#e94560;">ArchPanda</a></p>
</body></html>"""
    
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))
    
    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, to_email, msg.as_string())
        print(f"License email sent to {to_email}")
        return True
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")
        return False


def handle_checkout_completed(event_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process a Stripe checkout.session.completed event."""
    if not STRIPE_AVAILABLE:
        return {"status": "error", "message": "Stripe package not installed"}
    
    session = event_data.get("data", {}).get("object", {})
    
    customer_email = session.get("customer_details", {}).get("email")
    if not customer_email:
        customer_email = session.get("customer_email")
    
    session_id = session.get("id")
    
    # Get tier from metadata
    metadata = session.get("metadata", {})
    tier = metadata.get("tier", "lifetime")  # Default to lifetime if not specified
    
    # Get the next available key
    license_key = get_next_available_key(tier)
    
    if not license_key:
        return {
            "status": "error",
            "message": f"No available keys for tier: {tier}",
            "customer_email": customer_email,
            "session_id": session_id
        }
    
    # Mark key as used
    mark_key_used(license_key, customer_email, session_id)
    
    # Send email
    email_sent = send_license_email(customer_email, license_key, tier)
    
    return {
        "status": "success",
        "license_key": license_key,
        "tier": tier,
        "customer_email": customer_email,
        "session_id": session_id,
        "email_sent": email_sent
    }


def verify_stripe_signature(payload: bytes, sig_header: str, webhook_secret: str) -> Optional[Dict[str, Any]]:
    """Verify the Stripe webhook signature."""
    if not STRIPE_AVAILABLE:
        return None
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, webhook_secret
        )
        return event
    except ValueError:
        # Invalid payload
        return None
    except stripe.error.SignatureVerificationError:
        # Invalid signature
        return None
