#!/usr/bin/env node
/**
 * Obsidian Citation Capture — License Key Provisioning Utility
 * 
 * Generates cryptographically secure, format-compliant license keys
 * for distribution via LemonSqueezy, Gumroad, Stripe, or manual sales.
 * 
 * Format: [TIER]-[XXXX]-[XXXX]-[XXXX]
 * Supported Tiers: PRO, PROPLUS, LIFETIME, TEAM
 * 
 * Usage:
 *   node scripts/generate-license-keys.mjs --tier lifetime --count 10
 *   node scripts/generate-license-keys.mjs --tier proplus --count 50 --format csv --out keys.csv
 *   node scripts/generate-license-keys.mjs --tier pro --count 1
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const VALID_TIERS = {
  pro: 'PRO',
  proplus: 'PROPLUS',
  'pro+': 'PROPLUS',
  pro_plus: 'PROPLUS',
  lifetime: 'LIFETIME',
  team: 'TEAM'
};

// Base32 subset avoiding ambiguous characters (0 vs O, 1 vs I), fully matching [A-Z0-9]
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LICENSE_REGEX = /^(PRO|PROPLUS|LIFETIME|TEAM)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * Generate a single cryptographically secure license key
 */
export function generateKey(tier = 'LIFETIME') {
  const normalizedTier = VALID_TIERS[tier.toLowerCase()] || tier.toUpperCase();
  if (!['PRO', 'PROPLUS', 'LIFETIME', 'TEAM'].includes(normalizedTier)) {
    throw new Error(`Invalid tier "${tier}". Supported tiers: pro, proplus, lifetime, team`);
  }

  const chunk = () => {
    let segment = '';
    const randomBytes = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) {
      segment += CHARSET[randomBytes[i] % CHARSET.length];
    }
    return segment;
  };

  const key = `${normalizedTier}-${chunk()}-${chunk()}-${chunk()}`;
  if (!LICENSE_REGEX.test(key)) {
    throw new Error(`Generated key failed validation regex: ${key}`);
  }
  return key;
}

/**
 * Generate a unique batch of license keys
 */
export function generateBatch(tier = 'LIFETIME', count = 1) {
  const keys = new Set();
  while (keys.size < count) {
    keys.add(generateKey(tier));
  }
  return Array.from(keys);
}

// CLI entrypoint
function runCLI() {
  const args = process.argv.slice(2);
  let tier = 'LIFETIME';
  let count = 1;
  let format = 'plain';
  let outFile = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--tier' || arg === '-t') {
      tier = args[++i];
    } else if (arg === '--count' || arg === '-c' || arg === '-n') {
      count = parseInt(args[++i], 10) || 1;
    } else if (arg === '--format' || arg === '-f') {
      format = args[++i].toLowerCase();
    } else if (arg === '--out' || arg === '-o') {
      outFile = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Obsidian Citation Capture — License Key Generator

Options:
  -t, --tier <tier>       License tier: lifetime (default), proplus, pro, team
  -n, --count <number>    Number of keys to generate (default: 1)
  -f, --format <format>   Output format: plain (default), json, csv
  -o, --out <path>        Save generated keys to file
  -h, --help              Show this help message

Examples:
  node scripts/generate-license-keys.mjs --tier lifetime
  node scripts/generate-license-keys.mjs --tier proplus --count 25 --format csv --out gumroad_keys.csv
      `);
      process.exit(0);
    }
  }

  const keys = generateBatch(tier, count);
  const normalizedTier = VALID_TIERS[tier.toLowerCase()] || tier.toUpperCase();

  let outputText = '';
  if (format === 'json') {
    const records = keys.map((key) => ({
      key,
      tier: normalizedTier.toLowerCase(),
      created_at: new Date().toISOString(),
      cloud_credits_monthly: ['PROPLUS', 'LIFETIME'].includes(normalizedTier) ? 200 : 0
    }));
    outputText = JSON.stringify(records, null, 2);
  } else if (format === 'csv') {
    outputText = 'license_key,tier,cloud_credits_monthly\n' +
      keys.map((k) => `${k},${normalizedTier.toLowerCase()},${['PROPLUS', 'LIFETIME'].includes(normalizedTier) ? 200 : 0}`).join('\n');
  } else {
    outputText = keys.join('\n');
  }

  if (outFile) {
    const resolvedPath = path.resolve(process.cwd(), outFile);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, outputText + '\n', 'utf-8');
    console.log(`✓ Generated ${keys.length} ${normalizedTier} license key(s) -> saved to ${resolvedPath}`);
  } else {
    if (format === 'plain') {
      const isCloud = ['PROPLUS', 'LIFETIME'].includes(normalizedTier);
      const tierDesc = normalizedTier === 'LIFETIME'
        ? 'LIFETIME (Permanent Unlimited Captures + 200 Cloud AI Credits/mo)'
        : normalizedTier === 'PROPLUS'
        ? 'PRO+ (Monthly Subscription • Unlimited Captures + 200 Cloud AI Credits/mo)'
        : 'PRO (Unlimited Captures • Local Ollama / BYOK • No Cloud AI)';

      console.log(`\n========================================`);
      console.log(`🔑 TIER: ${tierDesc}`);
      console.log(`========================================`);
      if (count === 1) {
        console.log(`Key:    ${keys[0]}`);
      } else {
        console.log(`Keys (${keys.length}):\n`);
        keys.forEach((k, i) => console.log(`  ${i + 1}. ${k}`));
      }
      console.log(`========================================\n`);
    } else {
      console.log(outputText);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('generate-license-keys.mjs')) {
  runCLI();
}
