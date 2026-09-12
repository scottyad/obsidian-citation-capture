"""
Tests for the production license server
"""

import pytest
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)

# Demo keys for testing
DEMO_PROPLUS = "DEMO-PROPLUS"
DEMO_LIFETIME = "DEMO-LIFETIME"
DEMO_PRO = "DEMO-PRO"


def test_health_check():
    """Server should report healthy status."""
    res = client.get("/")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    assert data["version"] == "2.0.0"


def test_verify_demo_proplus_license():
    """Demo Pro+ license should validate with credits."""
    res = client.get("/api/v1/license/verify", headers={"Authorization": f"Bearer {DEMO_PROPLUS}"})
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["tier"] == "pro_plus"
    assert data["credits_remaining"] == 200


def test_verify_demo_lifetime_license():
    """Demo Lifetime license should validate with credits."""
    res = client.get("/api/v1/license/verify", headers={"Authorization": f"Bearer {DEMO_LIFETIME}"})
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["tier"] == "lifetime"
    assert data["credits_remaining"] == 200


def test_verify_demo_pro_license():
    """Demo Pro license should validate without credits."""
    res = client.get("/api/v1/license/verify", headers={"Authorization": f"Bearer {DEMO_PRO}"})
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["tier"] == "pro"
    assert data["credits_remaining"] == 0


def test_verify_invalid_license():
    """Invalid license should return 401."""
    res = client.get("/api/v1/license/verify", headers={"Authorization": "Bearer INVALID-KEY-1234"})
    assert res.status_code == 401


def test_verify_no_license():
    """Missing license header should return helpful response."""
    res = client.get("/api/v1/license/verify")
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is False


def test_summarize_requires_proplus():
    """Summarize endpoint should require Pro+ or Lifetime."""
    # Pro user should be rejected
    res = client.post(
        "/api/v1/summarize",
        headers={"Authorization": f"Bearer {DEMO_PRO}"},
        json={"abstract": "This is a test abstract that is long enough to pass validation requirements for the test. It discusses machine learning and attention mechanisms in detail."}
    )
    assert res.status_code == 403


def test_summarize_with_proplus():
    """Pro+ user should get a summary."""
    res = client.post(
        "/api/v1/summarize",
        headers={"Authorization": f"Bearer {DEMO_PROPLUS}"},
        json={"abstract": "This is a test abstract that is long enough to pass validation requirements for the test. It discusses machine learning and attention mechanisms in detail."}
    )
    assert res.status_code == 200
    data = res.json()
    assert "summary" in data
    assert "credits_remaining" in data


def test_suggest_tags_with_lifetime():
    """Lifetime user should get tag suggestions."""
    res = client.post(
        "/api/v1/suggest-tags",
        headers={"Authorization": f"Bearer {DEMO_LIFETIME}"},
        json={"title": "Attention Is All You Need", "abstract": "Transformer networks"}
    )
    assert res.status_code == 200
    data = res.json()
    assert "tags" in data
    assert isinstance(data["tags"], list)
    assert len(data["tags"]) > 0


def test_create_checkout_session_demo():
    """Checkout should work in demo mode without Stripe."""
    res = client.post(
        "/api/v1/stripe/create-checkout-session",
        json={"tier": "lifetime", "customer_email": "test@example.com"}
    )
    assert res.status_code == 200
    data = res.json()
    assert "license_key" in data
    assert data["mode"] == "demo"
    assert data["license_key"].startswith("LIFETIME-")


def test_stripe_webhook_checkout_completed():
    """Webhook should create license on checkout completion."""
    mock_event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_mock_12345",
                "customer_details": {"email": "researcher@lab.org"},
                "metadata": {"tier": "lifetime"}
            }
        }
    }
    res = client.post("/api/v1/stripe/webhook", json=mock_event)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["license_key"].startswith("LIFETIME-")
    assert data["customer_email"] == "researcher@lab.org"
    
    # Verify the provisioned key
    key = data["license_key"]
    verify_res = client.get("/api/v1/license/verify", headers={"Authorization": f"Bearer {key}"})
    assert verify_res.status_code == 200
    assert verify_res.json()["valid"] is True


def test_dashboard_reachable():
    """Dashboard should be accessible."""
    res = client.get("/dashboard")
    assert res.status_code == 200
    assert "Citation Capture License Server" in res.text


def test_api_docs_reachable():
    """OpenAPI docs should be accessible."""
    res = client.get("/docs")
    assert res.status_code == 200
