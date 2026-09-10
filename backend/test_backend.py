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
