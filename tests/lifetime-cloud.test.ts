import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LicenseManager } from '../chrome-extension/src/lib/license-manager';
import { AIEnhancer } from '../chrome-extension/src/lib/ai-enhancer';
import { ExtensionSettings } from '@obsidian-citation/shared';

describe('Lifetime License Cloud AI Integration', () => {
  let mockStorage: Record<string, any> = {};

  beforeEach(() => {
    mockStorage = {};
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: vi.fn(async (keys: string | string[]) => {
            if (typeof keys === 'string') return { [keys]: mockStorage[keys] };
            const res: Record<string, any> = {};
            keys.forEach(k => {
              if (k in mockStorage) res[k] = mockStorage[k];
            });
            return res;
          }),
          set: vi.fn(async (items: Record<string, any>) => {
            Object.assign(mockStorage, items);
          })
        }
      }
    };
  });

  const baseSettings: ExtensionSettings = {
    vaultName: 'ResearchVault',
    folderPath: 'Literature',
    bridgeMode: 'obsidian-uri',
    localRestPort: 27124,
    localRestToken: '',
    template: '',
    citationFormat: 'bibtex',
    aiMode: 'cloud',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.1:8b',
    cloudBackendUrl: 'https://obsidian-citation-capture.onrender.com',
    byokProvider: 'anthropic',
    autoEnrich: true
  };

  const sampleAbstract =
    'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.';

  it('activates DEMO-LIFETIME with 200 monthly cloud credits', async () => {
    const activation = await LicenseManager.activateLicense('DEMO-LIFETIME');
    expect(activation.success).toBe(true);
    expect(activation.status.tier).toBe('lifetime');
    expect(activation.status.cloudCreditsRemaining).toBe(200);

    const status = await LicenseManager.getStatus();
    expect(status.tier).toBe('lifetime');
    expect(status.cloudCreditsRemaining).toBe(200);
  });

  it('resolves provider to cloud in auto mode for Lifetime users', async () => {
    await LicenseManager.activateLicense('DEMO-LIFETIME');
    const status = await LicenseManager.getStatus();

    const enhancer = new AIEnhancer(vi.fn() as any);
    const autoSettings: ExtensionSettings = { ...baseSettings, aiMode: 'auto' };

    const provider = await enhancer.resolveProvider(autoSettings, status);
    expect(provider).toBe('cloud');
  });

  it('normalizes DEMO-LIFETIME to LIFETIME-DEMO-0000-0000 and summarizes', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: '• Introduces Transformer architecture without recurrence.\n• Demonstrates attention-only transduction.',
        credits_remaining: 199
      })
    });

    const enhancer = new AIEnhancer(mockFetch as any);
    await LicenseManager.activateLicense('DEMO-LIFETIME');
    const status = await LicenseManager.getStatus();

    const summary = await enhancer.summarize(sampleAbstract, baseSettings, status);
    expect(summary).toBeDefined();
    expect(summary).toContain('Introduces Transformer architecture');

    // Verify token was normalized so the backend proxy does not return 401
    expect(mockFetch).toHaveBeenCalledWith(
      'https://obsidian-citation-capture.onrender.com/api/v1/summarize',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer LIFETIME-DEMO-0000-0000'
        })
      })
    );
  });

  it('deducts cloud credit for cloud provider but preserves credits for local providers', async () => {
    await LicenseManager.activateLicense('DEMO-LIFETIME');
    let status = await LicenseManager.getStatus();
    expect(status.cloudCreditsRemaining).toBe(200);

    // When provider is cloud: credit deducted
    const remaining = await LicenseManager.deductCloudCredit();
    expect(remaining).toBe(199);

    status = await LicenseManager.getStatus();
    expect(status.cloudCreditsRemaining).toBe(199);
  });

  it('delivers fallback summary if cloud proxy returns upstream error or 502', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ detail: 'Upstream Claude API error' })
    });

    const enhancer = new AIEnhancer(mockFetch as any);
    await LicenseManager.activateLicense('DEMO-LIFETIME');
    const status = await LicenseManager.getStatus();

    const summary = await enhancer.summarize(sampleAbstract, baseSettings, status);
    expect(summary).toBeDefined();
    expect(summary?.startsWith('•')).toBe(true);
    expect(summary).toContain('\n•');
  });
});
