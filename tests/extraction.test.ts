import { describe, it, expect } from 'vitest';
import { CitationExtractor } from '../chrome-extension/src/lib/citation-extractor';

describe('CitationExtractor', () => {
  it('extracts metadata from Highwire Press tags', () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="citation_title" content="Attention Is All You Need">
        <meta name="citation_author" content="Vaswani, Ashish">
        <meta name="citation_author" content="Shazeer, Noam">
        <meta name="citation_publication_date" content="2017/06/12">
        <meta name="citation_doi" content="10.48550/arXiv.1706.03762">
        <meta name="citation_journal_title" content="Advances in Neural Information Processing Systems">
        <meta name="citation_abstract" content="The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...">
      </head>
      <body></body>
      </html>
    `;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const mockWindow = {
      location: { href: 'https://arxiv.org/abs/1706.03762' },
      getSelection: () => null
    } as any;

    const extractor = new CitationExtractor(doc, mockWindow);
    const result = extractor.extract();

    expect(result.source).toBe('highwire');
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.data.title).toBe('Attention Is All You Need');
    expect(result.data.authors).toEqual(['Vaswani, Ashish', 'Shazeer, Noam']);
    expect(result.data.year).toBe(2017);
    expect(result.data.doi).toBe('10.48550/arXiv.1706.03762');
    expect(result.data.journal).toBe('Advances in Neural Information Processing Systems');
    expect(result.data.citekey).toBe('ashish2017attention');
  });

  it('extracts metadata from Dublin Core tags', () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="DC.title" content="Deep Residual Learning for Image Recognition">
        <meta name="DC.creator" content="Kaiming He">
        <meta name="DC.creator" content="Xiangyu Zhang">
        <meta name="DC.date" content="2016-12-10">
        <meta name="DC.identifier" content="doi:10.1109/CVPR.2016.90">
        <meta name="DC.description" content="Deeper neural networks are more difficult to train.">
      </head>
      <body></body>
      </html>
    `;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const mockWindow = {
      location: { href: 'https://ieeexplore.ieee.org/document/7780459' },
      getSelection: () => null
    } as any;

    const extractor = new CitationExtractor(doc, mockWindow);
    const result = extractor.extract();

    expect(result.source).toBe('dublincore');
    expect(result.data.title).toBe('Deep Residual Learning for Image Recognition');
    expect(result.data.authors).toEqual(['Kaiming He', 'Xiangyu Zhang']);
    expect(result.data.year).toBe(2016);
    expect(result.data.doi).toBe('10.1109/CVPR.2016.90');
    expect(result.data.citekey).toBe('he2016deep');
  });

  it('extracts metadata from JSON-LD ScholarlyArticle', () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "ScholarlyArticle",
          "headline": "Generative Adversarial Nets",
          "author": [
            { "@type": "Person", "name": "Ian Goodfellow" },
            { "@type": "Person", "name": "Jean Pouget-Abadie" }
          ],
          "datePublished": "2014-06-10",
          "identifier": "10.1145/3422622",
          "description": "We propose a new framework for estimating generative models via an adversarial process."
        }
        </script>
      </head>
      <body></body>
      </html>
    `;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const mockWindow = {
      location: { href: 'https://papers.nips.cc/paper/5423-generative-adversarial-nets' },
      getSelection: () => null
    } as any;

    const extractor = new CitationExtractor(doc, mockWindow);
    const result = extractor.extract();

    expect(result.source).toBe('jsonld');
    expect(result.data.title).toBe('Generative Adversarial Nets');
    expect(result.data.authors).toEqual(['Ian Goodfellow', 'Jean Pouget-Abadie']);
    expect(result.data.year).toBe(2014);
    expect(result.data.doi).toBe('10.1145/3422622');
    expect(result.data.citekey).toBe('goodfellow2014generative');
  });

  it('generates canonical citekey with robust fallbacks', () => {
    const extractor = new CitationExtractor();

    // Normal case
    expect(extractor.generateCitekey(['Albert Einstein'], 1905, 'On the Electrodynamics of Moving Bodies')).toBe('einstein1905electrodynamics');

    // Title with stop words
    expect(extractor.generateCitekey(['Alan Turing'], 1936, 'On Computable Numbers, with an Application to the Entscheidungsproblem')).toBe('turing1936computable');

    // Special characters in author name
    expect(extractor.generateCitekey(['Jean-Luc Picard'], 2024, 'Warp Drive Dynamics')).toBe('picard2024warp');

    // Anonymous author
    expect(extractor.generateCitekey([], 2020, 'Cryptographic Algorithms')).toBe('anonymous2020cryptographic');
  });
});
