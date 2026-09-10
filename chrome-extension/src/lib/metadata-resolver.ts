import { CitationData } from '@obsidian-citation/shared';

export class MetadataResolver {
  private fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : fetch) {
    this.fetchFn = fetchFn;
  }

  /**
   * Fetch canonical BibTeX directly via DOI content negotiation
   */
  public async fetchBibTeXByDoi(doi: string): Promise<string> {
    const cleanDoi = this.cleanDoi(doi);
    try {
      const response = await this.fetchFn(`https://doi.org/${encodeURIComponent(cleanDoi)}`, {
        headers: {
          Accept: 'application/x-bibtex; charset=utf-8'
        }
      });
      if (response.ok) {
        const text = await response.text();
        if (text && text.trim().startsWith('@')) {
          return text.trim();
        }
      }
    } catch (err) {
      console.warn('DOI content negotiation failed for', cleanDoi, err);
    }
    return '';
  }

  /**
   * Enrich metadata using CrossRef REST API
   */
  public async enrichWithCrossRef(doi: string, data: CitationData): Promise<CitationData> {
    const cleanDoi = this.cleanDoi(doi);
    try {
      const res = await this.fetchFn(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`);
      if (!res.ok) return data;
      const json = await res.json();
      const work = json.message;
      if (!work) return data;

      if (work.title && work.title.length > 0 && (!data.title || data.title === 'Untitled Document')) {
        data.title = work.title[0];
      }

      if (work.author && Array.isArray(work.author) && data.authors[0] === 'Anonymous') {
        const authors = work.author.map((a: any) => {
          if (a.given && a.family) return `${a.given} ${a.family}`;
          return a.family || a.name || 'Unknown Author';
        });
        if (authors.length > 0) data.authors = authors;
      }

      const publishedYear = work.published?.['date-parts']?.[0]?.[0] ||
                            work['published-print']?.['date-parts']?.[0]?.[0] ||
                            work['published-online']?.['date-parts']?.[0]?.[0];
      if (publishedYear && !data.year) {
        data.year = publishedYear;
      }

      if (work['container-title'] && work['container-title'].length > 0) {
        data.journal = work['container-title'][0];
      }
      if (work.volume) data.volume = work.volume;
      if (work.issue) data.issue = work.issue;
      if (work.page) data.pages = work.page;
      if (work.publisher) data.publisher = work.publisher;

      if (work.abstract && !data.abstract) {
        // Strip JATS tags e.g. <jats:p>
        data.abstract = work.abstract.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      }
    } catch (err) {
      console.warn('CrossRef resolution error:', err);
    }
    return data;
  }

  /**
   * Enrich preprint metadata using arXiv Export API
   */
  public async enrichWithArxiv(arxivId: string, data: CitationData): Promise<CitationData> {
    const cleanId = arxivId.replace(/^arxiv:/i, '').replace(/v\d+$/, '');
    try {
      const res = await this.fetchFn(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(cleanId)}`);
      if (!res.ok) return data;
      const xmlText = await res.text();

      // Extract entry fields with regex for cross-environment compatibility (worker + node)
      const entryMatch = xmlText.match(/<entry>([\s\S]*?)<\/entry>/);
      if (entryMatch) {
        const entry = entryMatch[1];

        const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch) {
          data.title = titleMatch[1].replace(/\s+/g, ' ').trim();
        }

        const summaryMatch = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
        if (summaryMatch) {
          data.abstract = summaryMatch[1].replace(/\s+/g, ' ').trim();
        }

        const publishedMatch = entry.match(/<published[^>]*>(\d{4})/i);
        if (publishedMatch) {
          data.year = parseInt(publishedMatch[1], 10);
        }

        const authorMatches = Array.from(entry.matchAll(/<author[^>]*>[\s\S]*?<name[^>]*>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi));
        if (authorMatches.length > 0) {
          data.authors = authorMatches.map(m => m[1].trim());
        }

        const doiMatch = entry.match(/<(?:arxiv:)?doi[^>]*>([\s\S]*?)<\/(?:arxiv:)?doi>/i);
        if (doiMatch && !data.doi) {
          data.doi = this.cleanDoi(doiMatch[1].trim());
        }

        data.journal = 'arXiv preprint';
        data.arxivId = cleanId;
      }
    } catch (err) {
      console.warn('arXiv resolution error:', err);
    }
    return data;
  }

  /**
   * Enrich PubMed metadata using NCBI E-utilities
   */
  public async enrichWithPubMed(pmid: string, data: CitationData): Promise<CitationData> {
    try {
      const res = await this.fetchFn(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json`);
      if (!res.ok) return data;
      const json = await res.json();
      const article = json.result?.[pmid];
      if (article) {
        if (article.title) {
          data.title = article.title.replace(/\.$/, '');
        }
        if (article.authors && Array.isArray(article.authors)) {
          data.authors = article.authors.map((a: any) => a.name);
        }
        if (article.source) data.journal = article.source;
        if (article.pubdate) {
          const match = article.pubdate.match(/\d{4}/);
          if (match) data.year = parseInt(match[0], 10);
        }
        if (article.articleids) {
          const doiObj = article.articleids.find((id: any) => id.idtype === 'doi');
          if (doiObj?.value && !data.doi) {
            data.doi = this.cleanDoi(doiObj.value);
          }
        }
      }
    } catch (err) {
      console.warn('PubMed resolution error:', err);
    }
    return data;
  }

  /**
   * Full pipeline enrichment
   */
  public async enrich(citation: CitationData): Promise<CitationData> {
    const enriched = { ...citation };

    // 1. Resolve DOI if present
    if (enriched.doi) {
      const [bibtex, withCrossRef] = await Promise.all([
        this.fetchBibTeXByDoi(enriched.doi),
        this.enrichWithCrossRef(enriched.doi, enriched)
      ]);
      if (bibtex) withCrossRef.bibtex = bibtex;
      Object.assign(enriched, withCrossRef);
    }

    // 2. Resolve arXiv if preprint
    if (enriched.arxivId && (!enriched.doi || enriched.authors[0] === 'Anonymous')) {
      await this.enrichWithArxiv(enriched.arxivId, enriched);
    }

    // 3. Resolve PubMed if PMID available
    if (enriched.pmid && (!enriched.doi || enriched.authors[0] === 'Anonymous')) {
      await this.enrichWithPubMed(enriched.pmid, enriched);
    }

    // 4. Synthesize BibTeX if content negotiation did not yield one
    if (!enriched.bibtex) {
      enriched.bibtex = this.generateFallbackBibtex(enriched);
    }

    return enriched;
  }

  private generateFallbackBibtex(data: CitationData): string {
    const type = data.arxivId ? 'misc' : (data.journal ? 'article' : 'misc');
    const authorsStr = data.authors.join(' and ');
    let entry = `@${type}{${data.citekey},\n` +
      `  title = {${data.title}},\n` +
      `  author = {${authorsStr}},\n` +
      `  year = {${data.year || new Date().getFullYear()}}`;

    if (data.journal) entry += `,\n  journal = {${data.journal}}`;
    if (data.doi) entry += `,\n  doi = {${data.doi}}`;
    if (data.url) entry += `,\n  url = {${data.url}}`;
    if (data.volume) entry += `,\n  volume = {${data.volume}}`;
    if (data.pages) entry += `,\n  pages = {${data.pages}}`;
    if (data.arxivId) entry += `,\n  eprint = {${data.arxivId}},\n  archivePrefix = {arXiv}`;

    entry += '\n}';
    return entry;
  }

  private cleanDoi(doi: string): string {
    return doi
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
      .replace(/^doi:\s*/i, '')
      .trim();
  }
}
