# Obsidian Citation Capture v1.0.0

## 🚀 Features

- **One-click capture** from any academic paper (arXiv, PubMed, Nature, ScienceDirect, etc.)
- **Auto-extract metadata** — title, authors, year, DOI, journal, abstract
- **BibTeX generation** via CrossRef content negotiation
- **AI summaries** via local Ollama (free) or cloud Claude (Pro+)
- **Direct Obsidian integration** — creates formatted literature notes instantly
- **Zero API keys** for core features
- **Privacy-first** — local processing, no data collection

## 📦 What's Included

| Component | Description |
|-----------|-------------|
| `chrome-extension/` | Browser extension (Manifest V3) |
| `obsidian-plugin/` | Obsidian companion plugin |
| `backend/` | Optional FastAPI + Claude backend (Pro+) |

## 🎯 Quick Start

### Chrome Extension (Required)
1. Download `obsidian-citation-capture.zip` from Releases
2. Go to `chrome://extensions/` → Enable Developer Mode
3. Click "Load unpacked" → Select the `chrome-extension/dist` folder
4. Pin the extension to your toolbar

### Obsidian Plugin (Optional but Recommended)
1. Copy `obsidian-plugin/` to `.obsidian/plugins/citation-capture/`
2. Enable in Obsidian Settings → Community Plugins

### Usage
1. Visit any academic paper
2. Click the extension icon
3. Review extracted metadata
4. Click "Capture to Obsidian"
5. File appears in your vault!

## 💰 Pricing

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 10 captures/month, core features |
| **Pro** | $4.99/mo | Unlimited captures, local AI (Ollama) |
| **Pro+** | $9.99/mo | Unlimited + Claude cloud AI summaries |
| **Lifetime** | $24.99 | Pro+ features, one-time payment |

## 🔧 Tech Stack

- TypeScript + Vite (Chrome extension)
- Obsidian API (plugin)
- FastAPI + Claude (backend)
- CrossRef / OpenAlex / PubMed (metadata APIs)

## 📄 License

MIT License — See LICENSE file

## 🙏 Credits

Built by Scott (thedemiurge) with help from Architect ♜
