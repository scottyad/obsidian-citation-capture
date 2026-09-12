#!/usr/bin/env python3
"""
Obsidian Citation Capture — License Key Provisioning Utility (Python)

Generates cryptographically secure, format-compliant license keys
compatible with Obsidian Citation Capture backend proxy & Chrome extension.

Usage:
  python backend/issue_licenses.py --tier lifetime --count 5
  python backend/issue_licenses.py --tier proplus --format json
  python backend/issue_licenses.py --tier pro --count 100 --format csv --out keys.csv
"""

import sys
import secrets
import argparse
import json
import re

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

def generate_key(tier: str = "LIFETIME") -> str:
  normalized = VALID_TIERS.get(tier.lower(), tier.upper())
  if normalized not in ("PRO", "PROPLUS", "LIFETIME", "TEAM"):
    raise ValueError(f"Invalid tier: {tier}. Choose from pro, proplus, lifetime, team.")

  def chunk():
    return "".join(secrets.choice(CHARSET) for _ in range(4))

  key = f"{normalized}-{chunk()}-{chunk()}-{chunk()}"
  if not LICENSE_REGEX.match(key):
    raise ValueError(f"Generated key failed regex: {key}")
  return key

def generate_batch(tier: str = "LIFETIME", count: int = 1) -> list:
  keys = set()
  while len(keys) < count:
    keys.add(generate_key(tier))
  return sorted(list(keys))

def main():
  parser = argparse.ArgumentParser(description="Issue license keys for Obsidian Citation Capture")
  parser.add_argument("-t", "--tier", default="lifetime", help="License tier: lifetime, proplus, pro, team")
  parser.add_argument("-n", "--count", type=int, default=1, help="Number of keys to generate")
  parser.add_argument("-f", "--format", choices=["plain", "json", "csv"], default="plain", help="Output format")
  parser.add_argument("-o", "--out", help="Output file path")

  args = parser.parse_args()
  tier = VALID_TIERS.get(args.tier.lower(), args.tier.upper())
  keys = generate_batch(tier, args.count)

  if args.format == "json":
    records = [
      {
        "key": k,
        "tier": tier.lower(),
        "cloud_credits_monthly": 200 if tier in ("PROPLUS", "LIFETIME") else 0
      }
      for k in keys
    ]
    output = json.dumps(records, indent=2)
  elif args.format == "csv":
    lines = ["license_key,tier,cloud_credits_monthly"]
    credits = 200 if tier in ("PROPLUS", "LIFETIME") else 0
    lines.extend(f"{k},{tier.lower()},{credits}" for k in keys)
    output = "\n".join(lines)
  else:
    output = "\n".join(keys)

  if args.out:
    with open(args.out, "w", encoding="utf-8") as f:
      f.write(output + "\n")
    print(f"✓ Generated {len(keys)} {tier} key(s) -> saved to {args.out}")
  else:
    if args.format == "plain":
      tier_desc = (
        "LIFETIME (Permanent Unlimited Captures + 200 Cloud AI Credits/mo)" if tier == "LIFETIME"
        else "PRO+ (Monthly Subscription • Unlimited Captures + 200 Cloud AI Credits/mo)" if tier == "PROPLUS"
        else "PRO (Unlimited Captures • Local Ollama / BYOK • No Cloud AI)"
      )
      print("\n========================================")
      print(f"🔑 TIER: {tier_desc}")
      print("========================================")
      if len(keys) == 1:
        print(f"Key:    {keys[0]}")
      else:
        print(f"Keys ({len(keys)}):\n")
        for i, k in enumerate(keys, 1):
          print(f"  {i}. {k}")
      print("========================================\n")
    else:
      print(output)

if __name__ == "__main__":
  main()
