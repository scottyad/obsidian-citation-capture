"""
Tests for FastAPI Claude AI backend proxy
"""

from fastapi.testclient import TestClient
from main import app, LICENSE_DB

client = TestClient(app)

def test_health_check():
  res = client.get("/")
  assert res.status_code == 200
  data = res.json()
  assert data["status"] == "online"

def test_verify_license_success():
  res = client.get("/api/v1/license/verify", headers={"Authorization": "Bearer DEMO-PROPLUS"})
  assert res.status_code == 200
  data = res.json()
  assert data["valid"] is True
  assert data["tier"] == "pro_plus"
  assert data["credits_remaining"] > 0

def test_verify_license_invalid():
  res = client.get("/api/v1/license/verify", headers={"Authorization": "Bearer BAD-KEY"})
  assert res.status_code == 401

def test_summarize_success_and_credit_deduction():
  initial_credits = LICENSE_DB["DEMO-PROPLUS"]["credits"]
  res = client.post(
    "/api/v1/summarize",
    headers={"Authorization": "Bearer DEMO-PROPLUS"},
    json={"abstract": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks in an encoder-decoder configuration. We propose a new simple network architecture based solely on attention mechanisms."}
  )
  assert res.status_code == 200
  data = res.json()
  assert "summary" in data
  assert data["credits_remaining"] == initial_credits - 1

def test_suggest_tags():
  res = client.post(
    "/api/v1/suggest-tags",
    headers={"Authorization": "Bearer DEMO-PROPLUS"},
    json={"title": "Attention Is All You Need", "abstract": "Transformer networks"}
  )
  assert res.status_code == 200
  data = res.json()
  assert isinstance(data["tags"], list)
  assert len(data["tags"]) > 0

def test_stripe_create_checkout_session():
  res = client.post(
    "/api/v1/stripe/create-checkout-session",
    json={"tier": "lifetime", "customer_email": "scholar@university.edu"}
  )
  assert res.status_code == 200
  data = res.json()
  assert "license_key" in data or "checkout_url" in data

def test_stripe_webhook_provisions_key():
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

  # Verify the provisioned key can immediately be verified
  key = data["license_key"]
  verify_res = client.get("/api/v1/license/verify", headers={"Authorization": f"Bearer {key}"})
  assert verify_res.status_code == 200
  assert verify_res.json()["tier"] == "lifetime"
