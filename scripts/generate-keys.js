#!/usr/bin/env node
/**
 * License Key Generator for Obsidian Citation Capture
 * Generates batches of keys for Stripe inventory
 *
 * Usage:
 *   node scripts/generate-keys.js --tier lifetime --count 100 --format csv --out lifetime_keys.csv
 *   node scripts/generate-keys.js --tier pro --count 50
 *   node scripts/generate-keys.js --tier proplus --count 200 --format json --out proplus_keys.json
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TIERS = {
  pro: {
    prefix: 'PRO',
    segments: 3,
    segmentLength: 4,
    description: 'Pro (Unlimited Captures • Local Ollama / BYOK)'
  },
  lifetime: {
    prefix: 'LIFETIME',
    segments: 3,
    segmentLength: 4,
    description: 'Lifetime (Permanent Unlimited + 200 Cloud AI Credits/mo)'
  },
  proplus: {
    prefix: 'PROPLUS',
    segments: 3,
    segmentLength: 4,
    description: 'Pro+ (Monthly Subscription • Unlimited + 200 Cloud AI Credits/mo)'
  }
};

function generateSegment(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}

function generateKey(tier) {
  const config = TIERS[tier];
  if (!config) throw new Error(`Unknown tier: ${tier}. Use: pro, lifetime, proplus`);

  const segments = [];
  for (let i = 0; i < config.segments; i++) {
    segments.push(generateSegment(config.segmentLength));
  }
  return `${config.prefix}-${segments.join('-')}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    tier: 'lifetime',
    count: 10,
    format: 'csv',
    out: null,
    used: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--tier': options.tier = args[++i]; break;
      case '--count': options.count = parseInt(args[++i]); break;
      case '--format': options.format = args[++i]; break;
      case '--out': options.out = args[++i]; break;
      case '--used': options.used = true; break;
    }
  }
  return options;
}

function main() {
  const opts = parseArgs();
  const config = TIERS[opts.tier];

  if (!config) {
    console.error(`Error: Unknown tier "${opts.tier}"`);
    console.error('Valid tiers: pro, lifetime, proplus');
    process.exit(1);
  }

  const keys = [];
  for (let i = 0; i < opts.count; i++) {
    keys.push({
      key: generateKey(opts.tier),
      tier: opts.tier,
      created: new Date().toISOString(),
      used: opts.used
    });
  }

  // Output
  if (opts.format === 'csv') {
    const csv = ['key,tier,created,used', ...keys.map(k => `${k.key},${k.tier},${k.created},${k.used}`)].join('\n');
    if (opts.out) {
      fs.writeFileSync(opts.out, csv);
      console.log(`✅ Generated ${opts.count} ${opts.tier} keys → ${path.resolve(opts.out)}`);
    } else {
      console.log(csv);
    }
  } else if (opts.format === 'json') {
    const json = JSON.stringify(keys, null, 2);
    if (opts.out) {
      fs.writeFileSync(opts.out, json);
      console.log(`✅ Generated ${opts.count} ${opts.tier} keys → ${path.resolve(opts.out)}`);
    } else {
      console.log(json);
    }
  } else {
    // Pretty print
    console.log(`\n========================================`);
    console.log(`🔑 ${config.description}`);
    console.log(`========================================`);
    keys.forEach((k, i) => {
      console.log(`${i + 1}. ${k.key}`);
    });
    console.log(`\nTotal: ${opts.count} keys generated`);
  }
}

main();
