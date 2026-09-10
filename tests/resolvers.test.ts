import { describe, it, expect, vi } from 'vitest';
import { MetadataResolver } from '../chrome-extension/src/lib/metadata-resolver';
import { CitationData } from '@obsidian-citation/shared';

describe('MetadataResolver', () => {
  it('fetches BibTeX via DOI content negotiation', async () => {
    const mockBibtex = `@article{vaswani2017attention,
  title={Attention is all you need},
  author={Vaswani, Ashish and Shazeer, Noam},
  year={2017}
}`;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockBibtex
    });

    const resolver = new MetadataResolver(mockFetch as any);
    const bibtex = await resolver.fetchBibTeXByDoi('10.48550/arXiv.1706.03762');

    expect(bibtex).toBe(mockBibtex);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://doi.org/10.48550%2FarXiv.1706.03762',
      expect.objectContaining({
        headers: { Accept: 'application/x-bibtex; charset=utf-8' }
      })
    );
  });

  it('enriches metadata with CrossRef REST API', async () => {
    const mockCrossRefResponse = {
      message: {
        title: ['Attention Is All You Need'],
        author: [
          { given: 'Ashish', family: 'Vaswani' },
          { given: 'Noam', family: 'Shazeer' }
        ],
        published: { 'date-parts': [[2017, 6, 12]] },
        'container-title': ['Advances in Neural Information Processing Systems'],
        volume: '30',
        page: '5998-6008',
        abstract: '<jats:p>The dominant sequence transduction models are based on complex recurrent networks.</jats:p>'
      }
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCrossRefResponse
    });

    const resolver = new MetadataResolver(mockFetch as any);
    const initialData: CitationData = {
      title: 'Untitled Document',
      authors: ['Anonymous'],
      url: 'https://doi.org/10.48550/arXiv.1706.03762',
      doi: '10.48550/arXiv.1706.03762',
      citekey: 'vaswani2017attention',
      capturedAt: '2024-01-01T00:00:00.000Z'
    };

    const enriched = await resolver.enrichWithCrossRef('10.48550/arXiv.1706.03762', initialData);

    expect(enriched.title).toBe('Attention Is All You Need');
    expect(enriched.authors).toEqual(['Ashish Vaswani', 'Noam Shazeer']);
    expect(enriched.year).toBe(2017);
    expect(enriched.journal).toBe('Advances in Neural Information Processing Systems');
    expect(enriched.abstract).toBe('The dominant sequence transduction models are based on complex recurrent networks.');
  });

  it('enriches metadata with arXiv API XML response', async () => {
    const mockArxivXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>Attention Is All You Need</title>
          <summary>The dominant sequence transduction models are based on attention.</summary>
          <published>2017-06-12T17:57:34Z</published>
          <author><name>Ashish Vaswani</name></author>
          <author><name>Noam Shazeer</name></author>
          <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.48550/arXiv.1706.03762</arxiv:doi>
        </entry>
      </feed>
    `;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockArxivXml
    });

    const resolver = new MetadataResolver(mockFetch as any);
    const initialData: CitationData = {
      title: 'Untitled',
      authors: ['Anonymous'],
      url: 'https://arxiv.org/abs/1706.03762',
      arxivId: '1706.03762',
      citekey: 'vaswani2017attention',
      capturedAt: '2024-01-01T00:00:00.000Z'
    };

    const enriched = await resolver.enrichWithArxiv('1706.03762', initialData);

    expect(enriched.title).toBe('Attention Is All You Need');
    expect(enriched.authors).toEqual(['Ashish Vaswani', 'Noam Shazeer']);
    expect(enriched.year).toBe(2017);
    expect(enriched.doi).toBe('10.48550/arXiv.1706.03762');
    expect(enriched.abstract).toBe('The dominant sequence transduction models are based on attention.');
  });
});
