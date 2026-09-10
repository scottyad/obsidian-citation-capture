import { CitationData, ExtractionResult } from '@obsidian-citation/shared';

export class CitationExtractor {
  private doc: Document;
  private win: Window | null;

  constructor(doc: Document = document, win: Window | null = typeof window !== 'undefined' ? window : null) {
    this.doc = doc;
    this.win = win;
  }

  public extract(): ExtractionResult {
    const url = this.win?.location?.href || '';
    const selectedText = this.win?.getSelection()?.toString().trim() || undefined;

    // 1. Check Highwire Press
    const highwireData = this.extractHighwire();
    if (highwireData.title && (highwireData.doi || highwireData.authors.length > 0)) {
      const data = this.assembleData(highwireData, url, selectedText);
      return { data, source: 'highwire', confidence: 0.95 };
    }

    // 2. Check Dublin Core
    const dcData = this.extractDublinCore();
    if (dcData.title && (dcData.doi || dcData.authors.length > 0)) {
      const data = this.assembleData(dcData, url, selectedText);
      return { data, source: 'dublincore', confidence: 0.90 };
    }

    // 3. Check JSON-LD / Schema.org
    const jsonLdData = this.extractJsonLd();
    if (jsonLdData.title && (jsonLdData.authors.length > 0 || jsonLdData.doi)) {
      const data = this.assembleData(jsonLdData, url, selectedText);
      return { data, source: 'jsonld', confidence: 0.85 };
    }

    // 4. Check Open Graph & Heuristic Page Scraping
    const ogData = this.extractOpenGraphAndHeuristics();
    const data = this.assembleData(ogData, url, selectedText);
    return {
      data,
      source: data.doi || data.arxivId ? 'url' : 'heuristic',
      confidence: data.doi ? 0.75 : 0.5
    };
  }

  private extractHighwire(): Partial<CitationData> & { authors: string[] } {
    const authors = this.extractAllMeta('citation_author');
    const title = this.extractMeta('citation_title');
    const rawDate = this.extractMeta('citation_publication_date') || this.extractMeta('citation_date');
    const year = this.extractYear(rawDate);
    let doi = this.extractMeta('citation_doi');
    if (doi) doi = this.cleanDoi(doi);

    const journal = this.extractMeta('citation_journal_title');
    const volume = this.extractMeta('citation_volume');
    const issue = this.extractMeta('citation_issue');
    const pages = this.extractMeta('citation_firstpage');
    const abstract = this.extractMeta('citation_abstract');
    const pdfUrl = this.extractMeta('citation_pdf_url');

    return {
      title,
      authors,
      year,
      doi,
      journal,
      volume,
      issue,
      pages,
      abstract,
      pdfUrl
    };
  }

  private extractDublinCore(): Partial<CitationData> & { authors: string[] } {
    const authors = this.extractAllMeta('DC.creator') || this.extractAllMeta('dc.creator');
    const title = this.extractMeta('DC.title') || this.extractMeta('dc.title');
    const rawDate = this.extractMeta('DC.date') || this.extractMeta('dc.date');
    const year = this.extractYear(rawDate);
    let identifier = this.extractMeta('DC.identifier') || this.extractMeta('dc.identifier');
    let doi: string | undefined;
    if (identifier) {
      if (identifier.startsWith('doi:')) identifier = identifier.replace(/^doi:/i, '');
      if (identifier.startsWith('10.')) doi = this.cleanDoi(identifier);
    }

    const journal = this.extractMeta('DC.source') || this.extractMeta('dc.source');
    const abstract = this.extractMeta('DC.description') || this.extractMeta('dc.description');

    return {
      title,
      authors,
      year,
      doi,
      journal,
      abstract
    };
  }

  private extractJsonLd(): Partial<CitationData> & { authors: string[] } {
    const scripts = this.doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of Array.from(scripts)) {
      try {
        const raw = JSON.parse(script.textContent || '{}');
        const items = Array.isArray(raw) ? raw : [raw];

        for (const item of items) {
          const type = item['@type'];
          if (type === 'ScholarlyArticle' || type === 'Article' || type === 'MedicalScholarlyArticle' || type === 'TechArticle') {
            const title = item.headline || item.name;
            const authors: string[] = [];
            if (Array.isArray(item.author)) {
              item.author.forEach((a: any) => {
                if (typeof a === 'string') authors.push(a);
                else if (a.name) authors.push(a.name);
                else if (a.givenName && a.familyName) authors.push(`${a.givenName} ${a.familyName}`);
              });
            } else if (item.author?.name) {
              authors.push(item.author.name);
            }

            const rawDate = item.datePublished || item.dateCreated;
            const year = this.extractYear(rawDate);
            let doi: string | undefined;
            if (item.identifier) {
              const id = typeof item.identifier === 'string' ? item.identifier : item.identifier.value;
              if (id && id.includes('10.')) doi = this.cleanDoi(id);
            }

            const journal = item.isPartOf?.name || item.publication?.name;
            const abstract = item.description || item.abstract;

            return {
              title,
              authors,
              year,
              doi,
              journal,
              abstract
            };
          }
        }
      } catch {
        // Continue to next script
      }
    }
    return { authors: [] };
  }

  private extractOpenGraphAndHeuristics(): Partial<CitationData> & { authors: string[] } {
    const title = this.extractMeta('og:title') || this.doc.title || 'Untitled';
    const abstract = this.extractMeta('og:description') || this.extractMeta('description');
    const authors: string[] = [];

    // Check page text for DOI regex: 10.xxxx/xxxx
    const bodyText = this.doc.body?.innerText || '';
    const doiMatch = bodyText.match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/);
    const doi = doiMatch ? this.cleanDoi(doiMatch[0]) : undefined;

    return {
      title,
      authors,
      doi,
      abstract
    };
  }

  private assembleData(
    partial: Partial<CitationData> & { authors: string[] },
    url: string,
    selectedText?: string
  ): CitationData {
    let doi = partial.doi;
    let arxivId = partial.arxivId;
    let pmid = partial.pmid;

    // Detect arXiv ID from URL
    const arxivUrlMatch = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i);
    if (arxivUrlMatch) {
      arxivId = arxivUrlMatch[1];
    }

    // Detect DOI from URL
    const doiUrlMatch = url.match(/doi\.org\/(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i);
    if (doiUrlMatch) {
      doi = this.cleanDoi(doiUrlMatch[1]);
    }

    // Detect PubMed ID from URL
    const pmidUrlMatch = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
    if (pmidUrlMatch) {
      pmid = pmidUrlMatch[1];
    }

    const title = (partial.title || this.doc.title || 'Untitled Document')
      .replace(/\s+/g, ' ')
      .trim();

    const year = partial.year || new Date().getFullYear();
    const authors = partial.authors && partial.authors.length > 0 ? partial.authors : ['Anonymous'];
    const citekey = this.generateCitekey(authors, year, title);

    return {
      title,
      authors,
      year,
      doi,
      arxivId,
      pmid,
      journal: partial.journal,
      volume: partial.volume,
      issue: partial.issue,
      pages: partial.pages,
      publisher: partial.publisher,
      url: url || (doi ? `https://doi.org/${doi}` : ''),
      pdfUrl: partial.pdfUrl,
      abstract: partial.abstract?.replace(/\s+/g, ' ').trim(),
      selectedText,
      citekey,
      capturedAt: new Date().toISOString(),
      tags: ['literature-note', 'academic']
    };
  }

  public generateCitekey(authors: string[], year: number | string, title: string): string {
    let authorPart = 'anonymous';
    if (authors && authors.length > 0 && authors[0]) {
      const parts = authors[0].trim().split(/\s+/);
      const lastName = parts[parts.length - 1];
      authorPart = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!authorPart) authorPart = 'author';
    }

    const yearStr = String(year).match(/\d{4}/)?.[0] || String(new Date().getFullYear());

    // First significant word of title (ignore articles: a, an, the, on, in, for)
    const stopWords = new Set(['a', 'an', 'the', 'on', 'in', 'for', 'of', 'and', 'with', 'to', 'at']);
    const words = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopWords.has(w));

    const firstWord = words.length > 0 ? words[0] : 'paper';

    return `${authorPart}${yearStr}${firstWord}`;
  }

  private extractMeta(name: string): string | undefined {
    const el = this.doc.querySelector(`meta[name="${name}" i], meta[property="${name}" i]`);
    return el ? el.getAttribute('content')?.trim() || undefined : undefined;
  }

  private extractAllMeta(name: string): string[] {
    const elements = this.doc.querySelectorAll(`meta[name="${name}" i], meta[property="${name}" i]`);
    return Array.from(elements)
      .map(el => el.getAttribute('content')?.trim())
      .filter((content): content is string => Boolean(content && content.length > 0));
  }

  private extractYear(rawDate?: string | null): number | undefined {
    if (!rawDate) return undefined;
    const match = rawDate.match(/\b(19\d\d|20\d\d)\b/);
    return match ? parseInt(match[0], 10) : undefined;
  }

  private cleanDoi(doi: string): string {
    return doi
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
      .replace(/^doi:\s*/i, '')
      .replace(/[.,;:)\]]+$/, '')
      .trim();
  }
}
