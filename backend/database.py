"""
Obsidian Citation Capture — Production Database Layer
SQLite with persistent license storage, usage tracking, and audit logging.
"""

import os
import json
import sqlite3
import secrets
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List
from contextlib import contextmanager

DATABASE_PATH = os.getenv("DATABASE_URL", "sqlite:///data/licenses.db").replace("sqlite:///", "")

def ensure_db_dir():
    Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)

@contextmanager
def get_db():
    ensure_db_dir()
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    """Initialize database tables."""
    ensure_db_dir()
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS licenses (
                key TEXT PRIMARY KEY,
                tier TEXT NOT NULL CHECK(tier IN ('free', 'pro', 'pro_plus', 'lifetime', 'team')),
                status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked', 'expired')),
                credits_remaining INTEGER DEFAULT 0,
                credits_reset_day INTEGER DEFAULT 1,
                customer_email TEXT,
                customer_id TEXT,
                stripe_session_id TEXT,
                source TEXT DEFAULT 'manual',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                revoked_reason TEXT
            );

            CREATE TABLE IF NOT EXISTS usage_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_key TEXT NOT NULL,
                action TEXT NOT NULL CHECK(action IN ('capture', 'summarize', 'tag_suggest', 'verify', 'credit_reset')),
                credits_before INTEGER,
                credits_after INTEGER,
                metadata TEXT,
                ip_address TEXT,
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (license_key) REFERENCES licenses(key)
            );

            CREATE TABLE IF NOT EXISTS stripe_checkouts (
                session_id TEXT PRIMARY KEY,
                license_key TEXT,
                tier TEXT NOT NULL,
                customer_email TEXT,
                amount INTEGER,
                currency TEXT DEFAULT 'usd',
                status TEXT DEFAULT 'pending',
                paid_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (license_key) REFERENCES licenses(key)
            );

            CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(customer_email);
            CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
            CREATE INDEX IF NOT EXISTS idx_usage_logs_key ON usage_logs(license_key);
            CREATE INDEX IF NOT EXISTS idx_usage_logs_date ON usage_logs(created_at);
        """)
        conn.commit()

def migrate_from_json():
    """One-time migration from legacy licenses.json file."""
    legacy_file = Path(__file__).parent / "licenses.json"
    if not legacy_file.exists():
        return
    
    with open(legacy_file, "r") as f:
        legacy = json.load(f)
    
    with get_db() as conn:
        for key, data in legacy.items():
            tier = data.get("tier", "pro").lower().replace("+", "_plus")
            if tier == "proplus":
                tier = "pro_plus"
            
            conn.execute("""
                INSERT OR IGNORE INTO licenses 
                (key, tier, status, credits_remaining, customer_email, stripe_session_id, source, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                key,
                tier,
                data.get("status", "active"),
                data.get("credits", 0),
                data.get("customer_email"),
                data.get("stripe_session_id"),
                "migrated_json",
                data.get("created_at", datetime.now().isoformat())
            ))
        conn.commit()
    
    # Rename legacy file to backup
    legacy_file.rename(legacy_file.with_suffix(".json.bak"))
    print(f"Migrated {len(legacy)} licenses from JSON to SQLite")

def generate_license_key(tier: str = "lifetime") -> str:
    """Generate a cryptographically secure license key."""
    CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    
    normalized = tier.upper()
    if normalized not in ("PRO", "PROPLUS", "LIFETIME", "TEAM"):
        normalized = "LIFETIME"
    
    def chunk():
        return "".join(secrets.choice(CHARSET) for _ in range(4))
    
    return f"{normalized}-{chunk()}-{chunk()}-{chunk()}"

def create_license(
    tier: str,
    customer_email: Optional[str] = None,
    stripe_session_id: Optional[str] = None,
    source: str = "manual",
    credits: Optional[int] = None
) -> Dict[str, Any]:
    """Create a new license in the database."""
    key = generate_license_key(tier)
    
    normalized_tier = tier.lower().replace("+", "_plus")
    if normalized_tier == "proplus":
        normalized_tier = "pro_plus"
    
    if credits is None:
        credits = 200 if normalized_tier in ("pro_plus", "lifetime") else 0
    
    with get_db() as conn:
        conn.execute("""
            INSERT INTO licenses (key, tier, credits_remaining, customer_email, stripe_session_id, source)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (key, normalized_tier, credits, customer_email, stripe_session_id, source))
        conn.commit()
    
    return {
        "key": key,
        "tier": normalized_tier,
        "credits": credits,
        "status": "active",
        "customer_email": customer_email
    }

def get_license(key: str) -> Optional[Dict[str, Any]]:
    """Retrieve a license by key."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM licenses WHERE key = ?",
            (key.upper().strip(),)
        ).fetchone()
        
        if not row:
            return None
        
        return dict(row)

def verify_license(key: str) -> Dict[str, Any]:
    """Verify a license and check if it's valid for use."""
    license_data = get_license(key)
    
    if not license_data:
        return {"valid": False, "reason": "License not found"}
    
    if license_data["status"] == "revoked":
        return {"valid": False, "reason": "License has been revoked", "tier": license_data["tier"]}
    
    if license_data["status"] == "expired":
        return {"valid": False, "reason": "License has expired", "tier": license_data["tier"]}
    
    if license_data["expires_at"] and datetime.fromisoformat(license_data["expires_at"]) < datetime.now():
        return {"valid": False, "reason": "License has expired", "tier": license_data["tier"]}
    
    return {
        "valid": True,
        "tier": license_data["tier"],
        "credits_remaining": license_data["credits_remaining"],
        "status": license_data["status"]
    }

def deduct_credit(key: str, action: str = "summarize", metadata: Optional[Dict] = None) -> Dict[str, Any]:
    """Deduct a cloud credit from a license."""
    license_data = get_license(key)
    
    if not license_data:
        return {"success": False, "error": "License not found"}
    
    if license_data["credits_remaining"] <= 0:
        return {"success": False, "error": "No credits remaining"}
    
    new_credits = license_data["credits_remaining"] - 1
    
    with get_db() as conn:
        conn.execute(
            "UPDATE licenses SET credits_remaining = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?",
            (new_credits, key.upper().strip())
        )
        conn.execute("""
            INSERT INTO usage_logs (license_key, action, credits_before, credits_after, metadata)
            VALUES (?, ?, ?, ?, ?)
        """, (key.upper().strip(), action, license_data["credits_remaining"], new_credits, json.dumps(metadata or {})))
        conn.commit()
    
    return {"success": True, "credits_remaining": new_credits}

def reset_monthly_credits() -> int:
    """Reset credits for all eligible licenses (run on 1st of each month)."""
    with get_db() as conn:
        result = conn.execute("""
            UPDATE licenses 
            SET credits_remaining = 200, updated_at = CURRENT_TIMESTAMP
            WHERE tier IN ('pro_plus', 'lifetime') AND status = 'active'
        """)
        
        # Log the reset
        keys = conn.execute(
            "SELECT key FROM licenses WHERE tier IN ('pro_plus', 'lifetime') AND status = 'active'"
        ).fetchall()
        
        for row in keys:
            conn.execute("""
                INSERT INTO usage_logs (license_key, action, credits_before, credits_after)
                VALUES (?, 'credit_reset', 0, 200)
            """, (row["key"],))
        
        conn.commit()
        return result.rowcount

def revoke_license(key: str, reason: str = "Manual revocation") -> bool:
    """Revoke a license."""
    with get_db() as conn:
        result = conn.execute("""
            UPDATE licenses 
            SET status = 'revoked', revoked_reason = ?, updated_at = CURRENT_TIMESTAMP
            WHERE key = ?
        """, (reason, key.upper().strip()))
        conn.commit()
        return result.rowcount > 0

def list_licenses(
    tier: Optional[str] = None,
    status: Optional[str] = None,
    email: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """List licenses with optional filtering."""
    query = "SELECT * FROM licenses WHERE 1=1"
    params = []
    
    if tier:
        query += " AND tier = ?"
        params.append(tier)
    if status:
        query += " AND status = ?"
        params.append(status)
    if email:
        query += " AND customer_email LIKE ?"
        params.append(f"%{email}%")
    
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]

def get_usage_stats(key: Optional[str] = None, days: int = 30) -> Dict[str, Any]:
    """Get usage statistics for analytics."""
    with get_db() as conn:
        if key:
            rows = conn.execute("""
                SELECT action, COUNT(*) as count, SUM(credits_before - credits_after) as credits_used
                FROM usage_logs 
                WHERE license_key = ? AND created_at > datetime('now', ?)
                GROUP BY action
            """, (key.upper().strip(), f"-{days} days")).fetchall()
        else:
            rows = conn.execute("""
                SELECT action, COUNT(*) as count, SUM(credits_before - credits_after) as credits_used
                FROM usage_logs 
                WHERE created_at > datetime('now', ?)
                GROUP BY action
            """, (f"-{days} days",)).fetchall()
        
        return {row["action"]: {"count": row["count"], "credits_used": row["credits_used"] or 0} for row in rows}

def record_stripe_checkout(session_id: str, tier: str, email: Optional[str] = None, amount: Optional[int] = None) -> None:
    """Record a Stripe checkout session."""
    with get_db() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO stripe_checkouts (session_id, tier, customer_email, amount, status)
            VALUES (?, ?, ?, ?, 'pending')
        """, (session_id, tier, email, amount))
        conn.commit()

def complete_stripe_checkout(session_id: str, license_key: str) -> None:
    """Mark a Stripe checkout as completed and link license."""
    with get_db() as conn:
        conn.execute("""
            UPDATE stripe_checkouts 
            SET license_key = ?, status = 'completed', paid_at = CURRENT_TIMESTAMP
            WHERE session_id = ?
        """, (license_key, session_id))
        conn.commit()

# Initialize on import
init_db()
