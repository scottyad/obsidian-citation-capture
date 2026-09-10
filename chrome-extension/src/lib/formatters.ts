import { CitationData, CitationFormat } from '@obsidian-citation/shared';

export class CitationFormatter {
  public static format(data: CitationData, format: CitationFormat): string {
    switch (format) {
      case 'bibtex':
        return data.bibtex || this.toBibTeX(data);
      case 'apa':
        return this.toAPA(data);
      case 'mla':
        return this.toMLA(data);
      case 'chicago':
        return this.toChicago(data);
      case 'harvard':
        return this.toHarvard(data);
      case 'ieee':
        return this.toIEEE(data);
      case 'markdown':
      default:
        return this.toMarkdown(data);
    }
  }

  public static toAPA(data: CitationData): string {
    const authors = this.formatAuthorsAPA(data.authors);
    const year = data.year ? `(${data.year})` : '(n.d.)';
    const title = data.title.endsWith('.') ? data.title : `${data.title}.`;
    const journal = data.journal ? `*${data.journal}*` : '';
    const vol = data.volume ? `, *${data.volume}*` : '';
    const issue = data.issue ? `(${data.issue})` : '';
    const pages = data.pages ? `, ${data.pages}` : '';
    const doi = data.doi ? ` https://doi.org/${data.doi}` : (data.url ? ` ${data.url}` : '');

    return `${authors} ${year}. ${title} ${journal}${vol}${issue}${pages}.${doi}`.replace(/\s+/g, ' ').trim();
  }

  public static toMLA(data: CitationData): string {
    const authors = this.formatAuthorsMLA(data.authors);
    const title = `"${data.title}."`;
    const journal = data.journal ? `*${data.journal}*` : '';
    const vol = data.volume ? `, vol. ${data.volume}` : '';
    const issue = data.issue ? `, no. ${data.issue}` : '';
    const year = data.year ? `, ${data.year}` : '';
    const pages = data.pages ? `, pp. ${data.pages}` : '';
    const doi = data.doi ? `, https://doi.org/${data.doi}` : '';

    return `${authors}. ${title} ${journal}${vol}${issue}${year}${pages}${doi}.`.replace(/\s+/g, ' ').trim();
  }

  public static toChicago(data: CitationData): string {
    const authors = this.formatAuthorsChicago(data.authors);
    const year = data.year ? `${data.year}.` : 'n.d.';
    const title = `"${data.title}."`;
    const journal = data.journal ? `*${data.journal}*` : '';
    const vol = data.volume ? ` ${data.volume}` : '';
    const issue = data.issue ? `, no. ${data.issue}` : '';
    const pages = data.pages ? `: ${data.pages}` : '';
    const doi = data.doi ? ` https://doi.org/${data.doi}.` : '';

    return `${authors} ${year} ${title} ${journal}${vol}${issue}${pages}.${doi}`.replace(/\s+/g, ' ').trim();
  }

  public static toHarvard(data: CitationData): string {
    const authors = this.formatAuthorsHarvard(data.authors);
    const year = data.year ? `(${data.year})` : '(no date)';
    const title = `'${data.title}'`;
    const journal = data.journal ? `*${data.journal}*` : '';
    const vol = data.volume ? `, ${data.volume}` : '';
    const issue = data.issue ? `(${data.issue})` : '';
    const pages = data.pages ? `, pp. ${data.pages}` : '';
    const doi = data.doi ? `. Available at: https://doi.org/${data.doi}` : '';

    return `${authors} ${year} ${title}, ${journal}${vol}${issue}${pages}${doi}.`.replace(/\s+/g, ' ').trim();
  }

  public static toIEEE(data: CitationData): string {
    const authors = this.formatAuthorsIEEE(data.authors);
    const title = `"${data.title},"`;
    const journal = data.journal ? `*${data.journal}*` : '';
    const vol = data.volume ? `, vol. ${data.volume}` : '';
    const issue = data.issue ? `, no. ${data.issue}` : '';
    const pages = data.pages ? `, pp. ${data.pages}` : '';
    const year = data.year ? `, ${data.year}` : '';
    const doi = data.doi ? `, doi: ${data.doi}` : '';

    return `${authors}, ${title} ${journal}${vol}${issue}${pages}${year}${doi}.`.replace(/\s+/g, ' ').trim();
  }

  public static toBibTeX(data: CitationData): string {
    const type = data.arxivId ? 'misc' : (data.journal ? 'article' : 'misc');
    const authors = data.authors.join(' and ');
    return `@${type}{${data.citekey},
  title = {${data.title}},
  author = {${authors}},
  year = {${data.year || ''}},
  journal = {${data.journal || ''}},
  doi = {${data.doi || ''}},
  url = {${data.url || ''}}
}`.trim();
  }

  public static toMarkdown(data: CitationData): string {
    return `[${data.title}](${data.url || `https://doi.org/${data.doi}`}) (${data.authors[0] || 'Unknown'}, ${data.year || 'n.d.'})`;
  }

  private static formatAuthorsAPA(authors: string[]): string {
    if (!authors || authors.length === 0) return 'Anonymous';
    const formatted = authors.map(a => {
      const parts = a.trim().split(/\s+/);
      const last = parts.pop();
      const initials = parts.map(p => `${p[0]?.toUpperCase()}.`).join(' ');
      return initials ? `${last}, ${initials}` : `${last}`;
    });

    if (formatted.length === 1) return formatted[0];
    if (formatted.length === 2) return `${formatted[0]} & ${formatted[1]}`;
    return `${formatted.slice(0, -1).join(', ')}, & ${formatted[formatted.length - 1]}`;
  }

  private static formatAuthorsMLA(authors: string[]): string {
    if (!authors || authors.length === 0) return 'Anonymous';
    const firstParts = authors[0].trim().split(/\s+/);
    const firstLast = firstParts.pop();
    const firstFirst = firstParts.join(' ');
    const firstFormatted = firstFirst ? `${firstLast}, ${firstFirst}` : `${firstLast}`;

    if (authors.length === 1) return firstFormatted;
    if (authors.length === 2) return `${firstFormatted}, and ${authors[1]}`;
    return `${firstFormatted}, et al`;
  }

  private static formatAuthorsChicago(authors: string[]): string {
    return this.formatAuthorsMLA(authors);
  }

  private static formatAuthorsHarvard(authors: string[]): string {
    if (!authors || authors.length === 0) return 'Anonymous';
    return authors.join(', ');
  }

  private static formatAuthorsIEEE(authors: string[]): string {
    if (!authors || authors.length === 0) return 'Anonymous';
    const formatted = authors.map(a => {
      const parts = a.trim().split(/\s+/);
      const last = parts.pop();
      const initials = parts.map(p => `${p[0]?.toUpperCase()}.`).join(' ');
      return initials ? `${initials} ${last}` : `${last}`;
    });

    if (formatted.length === 1) return formatted[0];
    if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
    return `${formatted.slice(0, -1).join(', ')}, and ${formatted[formatted.length - 1]}`;
  }
}
