# Original User Request

## 2026-09-10T09:10:40Z

Build an academic citation-to-Obsidian Chrome extension (Manifest V3) that extracts bibliographic metadata from academic web pages, enriches it via academic APIs and canonical BibTeX resolution, and writes structured Markdown notes with YAML frontmatter directly into an Obsidian vault via either the Obsidian URI scheme or the Obsidian Local REST API.

Working directory: /home/thedemiurge/.gemini/antigravity/scratch/citation_capture_obsidian
Integrity mode: development

## Requirements

### R1. Academic Metadata Extraction Engine
Implement a content script scraping engine that extracts bibliographic metadata from active browser tabs.
- Extract authors, title, publication date/year, DOI, arXiv ID, journal title, abstract, and selected text highlights.
- Support standard academic metadata schemas in priority order: Highwire Press tags (`citation_*`), Dublin Core tags (`DC.*`), Open Graph / JSON-LD (`@type: ScholarlyArticle`), and URL pattern matching (arXiv IDs and DOI links).
- Generate a canonical citekey following the format `[firstAuthor][year][firstWord]`.

### R2. Background API Enrichment & Canonical BibTeX Resolution
Implement a Manifest V3 background service worker to resolve identifiers and enrich metadata asynchronously:
- Fetch canonical BibTeX directly via DOI content negotiation (`https://doi.org/{doi}` with `Accept: application/x-bibtex`).
- Resolve preprints via the arXiv API (`https://export.arxiv.org/api/query?id_list={id}`) and parse the XML entry for title, authors, published year, and summary.
- Query CrossRef REST API (`https://api.crossref.org/works/{doi}`) as a primary metadata fallback.

### R3. Markdown Templating Engine & Dual Obsidian Bridges
Provide a templating engine and dual dispatch mechanism to ingest captured literature notes into Obsidian:
- Interpolate template variables (`{{citekey}}`, `{{title}}`, `{{authors}}`, `{{authors_quoted}}`, `{{year}}`, `{{doi}}`, `{{url}}`, `{{abstract}}`, `{{bibtex}}`, `{{selectedText}}`) and evaluate conditional blocks (`{{#if_doi}}...{{/if_doi}}`, `{{#if_selection}}...{{/if_selection}}`).
- Format strict YAML frontmatter (tags, citekey, DOI, authors, aliases) and bibliography blocks.
- **Bridge Option A (Default)**: Dispatch via `obsidian://new` protocol handler (`obsidian://new?vault=...&file=...&content=...`).
- **Bridge Option B (Configurable)**: Dispatch silently via HTTPS to the Obsidian Local REST API (`PUT /vault/{filepath}` with bearer authentication).

### R4. User Interface & Configuration Persistence
- Provide an extension action popup displaying extracted title, citekey, and status, allowing users to review and edit values before triggering capture.
- Provide options/settings storage via `chrome.storage.sync` for target vault name, folder path (e.g., `Literature`), bridge method selection (URI vs Local REST API), Local REST API port and authorization token, and customizable note template string.

### R5. Build Packaging & Automated Verification Suite
- Provide a complete build setup (TypeScript targeting ES2022 bundled with Vite) producing an unpacked extension in `dist/` ready to load in Chrome (`manifest.json`, background service worker, content script, popup, options).
- Provide an automated test suite (unit and integration tests) that programmatically verifies metadata extraction on mock DOM fixtures, API enrichment parsers, template rendering, and protocol/REST URL generation.

## Acceptance Criteria

### Build & Extension Packaging
- [ ] `npm run build` compiles TypeScript in strict mode and bundles the extension into `dist/` without errors or warnings.
- [ ] `dist/manifest.json` conforms to Manifest V3 specifications with permissions `activeTab`, `storage`, `contextMenus` and necessary host permissions.

### Extraction & Parsing Verification
- [ ] Automated tests verify extraction of Highwire Press, Dublin Core, JSON-LD, and URL-based arXiv/DOI identifiers from mock HTML pages.
- [ ] Citekey generation correctly handles single authors, multiple authors, missing dates, and special characters.

### Enrichment & Templating Verification
- [ ] Automated tests verify DOI content negotiation response handling, arXiv XML parsing, and CrossRef fallback resolution.
- [ ] Template engine correctly substitutes all variables and properly evaluates conditional blocks.

### Obsidian Bridge Dispatch
- [ ] Protocol bridge correctly URL-encodes vault, path (`${folder}/@${citekey}`), and Markdown content for `obsidian://new`.
- [ ] Local REST API bridge formats the correct HTTP PUT request with headers (Authorization bearer token) and markdown body payload.
