# Obsidian Citation Capture

> Direct browser-to-vault academic citation ingestion for Chrome and Obsidian with Zero-Configuration AI metadata resolution.

---

## Architecture Overview

Obsidian Citation Capture bridges web-based academic research directly into an Obsidian vault without intermediate reference managers.

```
┌──────────────────────────────────────────────────────────────┐
│ Chrome Browser (Manifest V3)                                 │
│  ┌────────────────────────┐      ┌─────────────────────────┐ │
│  │ Active Academic Tab    │      │ Background Service      │ │
│  │ (arXiv, Nature, etc.)  │      │ Worker                  │ │
│  │                        │ Msg  │                         │ │
│  │ 1. Extract Meta Tags   ├─────►│ 2. Query CrossRef /     │ │
│  │    & Selection Quotes  │      │    arXiv / PubMed       │ │
│  │                        │      │ 3. Fetch Content-       │ │
│  └────────────────────────┘      │    Negotiated BibTeX    │ │
│                                  │ 4. Multi-Tier AI        │ │
│                                  └────────────┬────────────┘ │
└───────────────────────────────────────────────┼──────────────┘
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 │                                                             │
         Option A: Native Protocol                       Option B: Companion Plugin
                 ▼                                                             ▼
  ┌───────────────────────────────┐                             ┌───────────────────────────────┐
  │ obsidian://new URI            │                             │ obsidian://citation Protocol  │
  │ - Zero dependencies           │                             │ - Duplicate detection         │
  │ - Instant note creation       │                             │ - Quote append mode           │
  │ - Native Obsidian support     │                             │ - Vault-aware organization    │
  └──────────────┬────────────────┘                             └──────────────┬────────────────┘
                 │                                                             │
                 └──────────────────────────────┬──────────────────────────────┘
                                                ▼
                   ┌──────────────────────────────────────────────┐
                   │ Obsidian Vault (`Literature/@citekey.md`)    │
                   │ - Strict YAML Frontmatter                    │
                   │ - Formatted BibTeX Block                     │
                   │ - Abstract, Highlights & AI Summaries        │
                   └──────────────────────────────────────────────┘
```

---

## Zero User Configuration API Key Architecture

| Feature Tier | AI Engine | Requires User Keys? | Economics |
|---|---|---|---|
| **Free (Core)** | None (CrossRef, arXiv, PubMed) | **NO** — 100% free public APIs | Free forever |
| **Pro (Local AI)** | Local Ollama instance | **NO** — Auto-detects `localhost:11434` | $4.99/mo or $24.99 Lifetime |
| **Pro+ (Cloud AI)** | Claude 3 Haiku via Backend Proxy | **NO** — User only provides License Key | $9.99/mo (200 summaries, ~$0.05 Claude cost) |
| **BYOK (Power Users)** | Anthropic, OpenAI, or Gemini | **Optional** — Stored client-side only | User pays provider directly |

**Golden Rule:** User installs → Clicks extension icon → Works immediately. Zero keys, zero setup, zero friction.

---

## Monorepo Structure

```
citation_capture_obsidian/
├── shared/                     # Shared TypeScript data models & contracts
│   ├── src/types.ts
│   └── package.json
├── chrome-extension/           # Manifest V3 Chrome Extension
│   ├── manifest.json
│   ├── public/icons/           # 16x16, 48x48, 128x128 pixel icons
│   ├── src/
│   │   ├── background.ts       # Service worker (APIs, enrichment, context menus)
│   │   ├── content.ts          # DOM scraper & quote extractor
│   │   ├── popup/              # Capture UI with quota display & format picker
│   │   ├── options/            # Settings, templates, zero-config AI, license
│   │   └── lib/
│   │       ├── citation-extractor.ts # Highwire, Dublin Core, JSON-LD, URL regex
│   │       ├── metadata-resolver.ts  # CrossRef, arXiv, PubMed, DOI BibTeX
│   │       ├── formatters.ts         # APA, MLA, Chicago, IEEE, BibTeX
│   │       ├── obsidian-bridge.ts    # URI, plugin protocol, Local REST
│   │       ├── license-manager.ts    # Free quota & Pro/Pro+/Lifetime gating
│   │       └── ai-enhancer.ts        # Zero-config auto-detection, Ollama, Cloud, BYOK
│   └── dist/                   # Bundled extension ready for Chrome
├── backend/                    # Cloud AI Backend Proxy (FastAPI + Claude Haiku)
│   ├── main.py                 # Token auth, rate limits, credit deduction
│   ├── requirements.txt
│   └── test_backend.py
├── obsidian-plugin/            # Obsidian Community Plugin
│   ├── manifest.json
│   ├── main.ts                 # obsidian://citation protocol handler
│   ├── src/
│   │   ├── vault-writer.ts     # Markdown generation & duplicate resolver
│   │   └── settings.ts         # Vault folder & duplicate preferences
│   ├── main.js                 # Compiled plugin bundle
│   └── styles.css
├── tests/                      # Automated Vitest test suite (25 tests)
│   ├── extraction.test.ts
│   ├── resolvers.test.ts
│   ├── templating-bridge.test.ts
│   ├── license-manager.test.ts
│   ├── formatters.test.ts
│   └── ai-enhancer.test.ts
└── package.json                # npm workspaces root
```

---

## Quickstart & Installation

### 1. Build the Monorepo
```bash
npm install
npm run build
npm test
```

### 2. (Optional) Run the Cloud AI Backend Proxy
```bash
cd backend
# Set your Anthropic API Key (or leave unset to run in high-fidelity mock mode)
export ANTHROPIC_API_KEY="sk-ant-..."
uv run --with fastapi --with uvicorn --with pydantic --with anthropic uvicorn main:app --reload --port 8000
```

### 3. Load Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the upper right.
3. Click **Load unpacked**.
4. Select the directory:
   `/home/thedemiurge/.gemini/antigravity/scratch/citation_capture_obsidian/chrome-extension/dist`

### 4. (Optional) Install Obsidian Companion Plugin
*Note: You can use the extension immediately without any plugin via native `obsidian://new`!*

To enable advanced duplicate detection and background sync:
1. Locate your Obsidian vault directory.
2. Create folder: `<vault>/.obsidian/plugins/obsidian-citation-capture/`
3. Copy `obsidian-plugin/main.js`, `obsidian-plugin/manifest.json`, and `obsidian-plugin/styles.css` into that folder.
4. In Obsidian: **Settings** → **Community Plugins** → Enable **Obsidian Citation Capture**.

---

## Product Tiers & Demo License Keys

| Tier | Price | Monthly Captures | AI Summaries | Sync Bridge |
|---|---|---|---|---|
| **Free** | $0 | 10 / mo | None | Native URI + Clipboard |
| **Pro** | $4.99/mo | Unlimited | Local Ollama (`llama3.1:8b`) | Native URI + Plugin + REST |
| **Pro+ (Cloud AI)** | $9.99/mo | Unlimited | Claude Haiku (200 cloud credits) | Native URI + Plugin + REST |
| **Lifetime** | $24.99 one-time | Unlimited | Local Ollama + BYOK | Native URI + Plugin + REST |

### Demo License Keys for Testing
You can activate testing tiers in the Extension **Options** page using:
- `DEMO-PRO`: Unlocks unlimited captures and local Ollama.
- `DEMO-PROPLUS`: Unlocks unlimited captures and 200 Cloud AI summaries.
- `DEMO-LIFETIME`: Unlocks Lifetime Pro access.
- Or any keys matching `PRO-XXXX-...`, `PROPLUS-XXXX-...`, or `LIFETIME-XXXX-...`.

---

## Running Verification Tests

```bash
# Run JavaScript/TypeScript Vitest suite (25 tests)
npm test

# Run Python Backend tests (5 tests)
cd backend && uv run --with fastapi --with pydantic --with pytest --with httpx pytest test_backend.py
```
