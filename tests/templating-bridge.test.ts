import { describe, it, expect, vi } from 'vitest';
import { ObsidianBridge, DEFAULT_TEMPLATE } from '../chrome-extension/src/lib/obsidian-bridge';
import { CitationData, ExtensionSettings } from '@obsidian-citation/shared';

describe('ObsidianBridge', () => {
  const sampleData: CitationData = {
    title: 'Attention Is All You Need',
    authors: ['Ashish Vaswani', 'Noam Shazeer'],
    year: 2017,
    doi: '10.48550/arXiv.1706.03762',
    journal: 'NeurIPS',
    url: 'https://arxiv.org/abs/1706.03762',
    abstract: 'The dominant sequence transduction models are based on attention.',
    bibtex: '@article{vaswani2017attention, title={Attention is all you need}}',
    selectedText: 'Attention mechanisms have become an integral part of compelling sequence modeling.',
    aiSummary: '• Introduces transformer architecture\n• Dispenses with recurrence and convolutions',
    citekey: 'vaswani2017attention',
    capturedAt: '2024-01-01T00:00:00.000Z'
  };

  const sampleSettings: ExtensionSettings = {
    vaultName: 'ResearchVault',
    folderPath: 'Literature/AI',
    bridgeMode: 'obsidian-uri',
    localRestPort: 27124,
    localRestToken: 'secret-test-token',
    template: DEFAULT_TEMPLATE,
    citationFormat: 'bibtex',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.1:8b',
    autoEnrich: true
  };

  it('renders Markdown with YAML frontmatter and conditional sections', () => {
    const md = ObsidianBridge.renderMarkdown(sampleData, DEFAULT_TEMPLATE);

    expect(md).toContain('citekey: "vaswani2017attention"');
    expect(md).toContain('title: "Attention Is All You Need"');
    expect(md).toContain('authors: ["Ashish Vaswani", "Noam Shazeer"]');
    expect(md).toContain('doi: "10.48550/arXiv.1706.03762"');
    expect(md).toContain('  - literature-note\n  - academic');
    expect(md).toContain('## AI Executive Summary');
    expect(md).toContain('> • Introduces transformer architecture');
    expect(md).toContain('## Highlights & Notes');
    expect(md).toContain('> Attention mechanisms have become an integral part');
    expect(md).toContain('```bibtex\n@article{vaswani2017attention');
  });

  it('interpolates AI tags into frontmatter', () => {
    const dataWithTags: CitationData = {
      ...sampleData,
      tags: ['transformers', 'deep-learning']
    };

    const md = ObsidianBridge.renderMarkdown(dataWithTags, DEFAULT_TEMPLATE);
    expect(md).toContain('  - literature-note\n  - academic\n  - transformers\n  - deep-learning');
  });

  it('builds valid obsidian://open URI to navigate directly to captured note', () => {
    const openUri = ObsidianBridge.buildOpenUri(sampleData, sampleSettings);
    expect(openUri).toBe('obsidian://open?vault=ResearchVault&file=Literature%2FAI%2F%40vaswani2017attention');
  });

  it('omits conditional blocks when fields are absent', () => {
    const dataWithoutDoiOrSelection: CitationData = {
      ...sampleData,
      doi: undefined,
      selectedText: undefined,
      aiSummary: undefined
    };

    const md = ObsidianBridge.renderMarkdown(dataWithoutDoiOrSelection, DEFAULT_TEMPLATE);

    expect(md).not.toContain('**DOI:**');
    expect(md).not.toContain('## Highlights & Notes');
    expect(md).not.toContain('## AI Executive Summary');
  });

  it('builds valid obsidian://new URI with proper URL encoding', () => {
    const uri = ObsidianBridge.buildObsidianUri(sampleData, sampleSettings);

    expect(uri.startsWith('obsidian://new?')).toBe(true);
    const params = new URLSearchParams(uri.replace('obsidian://new?', ''));
    expect(params.get('vault')).toBe('ResearchVault');
    expect(params.get('file')).toBe('Literature/AI/@vaswani2017attention');
    expect(params.get('content')).toContain('# Attention Is All You Need');
  });

  it('omits vault parameter when vaultName is empty to target active vault', () => {
    const uri = ObsidianBridge.buildObsidianUri(sampleData, { ...sampleSettings, vaultName: '' });

    expect(uri.startsWith('obsidian://new?')).toBe(true);
    const params = new URLSearchParams(uri.replace('obsidian://new?', ''));
    expect(params.get('vault')).toBeNull();
    expect(params.get('file')).toBe('Literature/AI/@vaswani2017attention');
    expect(params.get('overwrite')).toBeNull(); // Default: safe duplicate (@key 1.md)
  });

  it('adds overwrite=true when overwriteExisting is enabled', () => {
    const uri = ObsidianBridge.buildObsidianUri(sampleData, { ...sampleSettings, overwriteExisting: true });

    expect(uri.startsWith('obsidian://new?')).toBe(true);
    const params = new URLSearchParams(uri.replace('obsidian://new?', ''));
    expect(params.get('overwrite')).toBe('true');
  });

  it('builds valid obsidian://citation companion plugin URI', () => {
    const uri = ObsidianBridge.buildPluginUri(sampleData, sampleSettings);

    expect(uri.startsWith('obsidian://citation?')).toBe(true);
    const params = new URLSearchParams(uri.replace('obsidian://citation?', ''));
    expect(params.get('action')).toBe('capture');
    const parsedPayload = JSON.parse(params.get('data') || '{}');
    expect(parsedPayload.data.citekey).toBe('vaswani2017attention');
    expect(parsedPayload.settings.folderPath).toBe('Literature/AI');
  });

  it('sends PUT request to Obsidian Local REST API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200
    });

    const result = await ObsidianBridge.sendViaLocalRest(sampleData, sampleSettings, mockFetch as any);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://127.0.0.1:27124/vault/Literature%2FAI%2F%40vaswani2017attention.md',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          Authorization: 'Bearer secret-test-token',
          'Content-Type': 'text/markdown'
        }
      })
    );
  });
});
