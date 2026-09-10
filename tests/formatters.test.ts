import { describe, it, expect } from 'vitest';
import { CitationFormatter } from '../chrome-extension/src/lib/formatters';
import { CitationData } from '@obsidian-citation/shared';

describe('CitationFormatter', () => {
  const samplePaper: CitationData = {
    title: 'Attention Is All You Need',
    authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'],
    year: 2017,
    journal: 'Advances in Neural Information Processing Systems',
    volume: '30',
    pages: '5998-6008',
    doi: '10.48550/arXiv.1706.03762',
    url: 'https://arxiv.org/abs/1706.03762',
    citekey: 'vaswani2017attention',
    capturedAt: '2024-01-01T00:00:00.000Z'
  };

  it('formats into APA style', () => {
    const apa = CitationFormatter.toAPA(samplePaper);
    expect(apa).toContain('Vaswani, A., Shazeer, N., & Parmar, N.');
    expect(apa).toContain('(2017)');
    expect(apa).toContain('Attention Is All You Need.');
    expect(apa).toContain('*Advances in Neural Information Processing Systems*');
    expect(apa).toContain('https://doi.org/10.48550/arXiv.1706.03762');
  });

  it('formats into MLA style', () => {
    const mla = CitationFormatter.toMLA(samplePaper);
    expect(mla).toContain('Vaswani, Ashish, et al.');
    expect(mla).toContain('"Attention Is All You Need."');
    expect(mla).toContain('*Advances in Neural Information Processing Systems*');
    expect(mla).toContain('2017');
    expect(mla).toContain('https://doi.org/10.48550/arXiv.1706.03762');
  });

  it('formats into IEEE style', () => {
    const ieee = CitationFormatter.toIEEE(samplePaper);
    expect(ieee).toContain('A. Vaswani, N. Shazeer, and N. Parmar');
    expect(ieee).toContain('"Attention Is All You Need,"');
    expect(ieee).toContain('doi: 10.48550/arXiv.1706.03762');
  });

  it('formats into BibTeX style', () => {
    const bibtex = CitationFormatter.toBibTeX(samplePaper);
    expect(bibtex.startsWith('@article{vaswani2017attention,')).toBe(true);
    expect(bibtex).toContain('author = {Ashish Vaswani and Noam Shazeer and Niki Parmar}');
    expect(bibtex).toContain('doi = {10.48550/arXiv.1706.03762}');
  });
});
