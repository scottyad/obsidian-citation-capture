import { describe, it, expect, vi } from 'vitest';
import { AIEnhancer } from '../chrome-extension/src/lib/ai-enhancer';
import { ExtensionSettings, LicenseStatus } from '@obsidian-citation/shared';

describe('AIEnhancer Multi-Provider & Zero-Config Architecture', () => {
  const baseSettings: ExtensionSettings = {
    vaultName: 'ResearchVault',
    folderPath: 'Literature',
    bridgeMode: 'obsidian-uri',
    localRestPort: 27124,
    localRestToken: '',
    template: '',
    citationFormat: 'bibtex',
    aiMode: 'auto',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.1:8b',
    cloudBackendUrl: 'https://obsidian-citation-capture.onrender.com',
    byokProvider: 'anthropic',
    autoEnrich: true
  };

  const sampleAbstract = 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, an architecture based solely on attention mechanisms.';

  it('resolves to cloud AI when user has active Pro+ subscription with remaining credits', async () => {
    const mockFetch = vi.fn();
    const enhancer = new AIEnhancer(mockFetch as any);

    const proPlusLicense: LicenseStatus = {
      tier: 'pro_plus',
      isPro: true,
      monthlyUsage: 5,
      monthlyLimit: Infinity,
      canCapture: true,
      lastResetMonth: '2024-01',
      licenseKey: 'PROPLUS-A1B2-C3D4-E5F6',
      cloudCreditsRemaining: 150
    };

    const provider = await enhancer.resolveProvider(baseSettings, proPlusLicense);
    expect(provider).toBe('cloud');
  });

  it('routes to cloud AI proxy and returns summary with Bearer license key', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: '• Introduces Transformer architecture.\n• Relies entirely on attention.',
        credits_remaining: 149
      })
    });

    const enhancer = new AIEnhancer(mockFetch as any);
    const proPlusLicense: LicenseStatus = {
      tier: 'pro_plus',
      isPro: true,
      monthlyUsage: 5,
      monthlyLimit: Infinity,
      canCapture: true,
      lastResetMonth: '2024-01',
      licenseKey: 'PROPLUS-A1B2-C3D4-E5F6',
      cloudCreditsRemaining: 150
    };

    const summary = await enhancer.summarize(sampleAbstract, baseSettings, proPlusLicense);

    expect(summary).toContain('Introduces Transformer architecture');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://obsidian-citation-capture.onrender.com/api/v1/summarize',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer PROPLUS-A1B2-C3D4-E5F6'
        })
      })
    );
  });

  it('auto-detects and falls back to local Ollama when Pro+ is absent and Ollama is online', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/tags')) {
        return { ok: true };
      }
      if (url.includes('/api/generate')) {
        return {
          ok: true,
          json: async () => ({ response: '• Local Ollama generated summary.' })
        };
      }
      return { ok: false };
    });

    const enhancer = new AIEnhancer(mockFetch as any);
    const freeLicense: LicenseStatus = {
      tier: 'free',
      isPro: false,
      monthlyUsage: 2,
      monthlyLimit: 10,
      canCapture: true,
      lastResetMonth: '2024-01'
    };

    const provider = await enhancer.resolveProvider(baseSettings, freeLicense);
    expect(provider).toBe('ollama');

    const summary = await enhancer.summarize(sampleAbstract, baseSettings, freeLicense);
    expect(summary).toBe('• Local Ollama generated summary.');
  });

  it('gracefully returns undefined when no AI provider is reachable without blocking capture', async () => {
    // Both Ollama and Cloud fail/unreachable, no BYOK key
    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
    const enhancer = new AIEnhancer(mockFetch as any);

    const freeLicense: LicenseStatus = {
      tier: 'free',
      isPro: false,
      monthlyUsage: 2,
      monthlyLimit: 10,
      canCapture: true,
      lastResetMonth: '2024-01'
    };

    const summary = await enhancer.summarize(sampleAbstract, baseSettings, freeLicense);
    expect(summary).toBeUndefined(); // Zero error thrown, seamless pass-through!
  });

  it('uses BYOK direct call when configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: '• Anthropic direct BYOK summary.' }]
      })
    });

    const enhancer = new AIEnhancer(mockFetch as any);
    const byokSettings: ExtensionSettings = {
      ...baseSettings,
      aiMode: 'byok',
      byokProvider: 'anthropic',
      byokApiKey: 'sk-ant-api03-test-key'
    };

    const summary = await enhancer.summarize(sampleAbstract, byokSettings);
    expect(summary).toBe('• Anthropic direct BYOK summary.');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-api03-test-key'
        })
      })
    );
  });

  it('resolves Lifetime license to cloud AI in auto mode and defaults credits to 200', async () => {
    const mockFetch = vi.fn();
    const enhancer = new AIEnhancer(mockFetch as any);

    const lifetimeLicense: LicenseStatus = {
      tier: 'lifetime',
      isPro: true,
      monthlyUsage: 1,
      monthlyLimit: Infinity,
      canCapture: true,
      lastResetMonth: '2024-01',
      licenseKey: 'LIFETIME-A1B2-C3D4-E5F6'
      // cloudCreditsRemaining is undefined; should default to 200
    };

    const provider = await enhancer.resolveProvider(baseSettings, lifetimeLicense);
    expect(provider).toBe('cloud');
  });

  it('normalizes DEMO-LIFETIME to LIFETIME-DEMO-0000-0000 for cloud proxy calls', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: '• Lifetime summary via Claude proxy.\n• Fully verified.',
        credits_remaining: 199
      })
    });

    const enhancer = new AIEnhancer(mockFetch as any);
    const lifetimeLicense: LicenseStatus = {
      tier: 'lifetime',
      isPro: true,
      monthlyUsage: 0,
      monthlyLimit: Infinity,
      canCapture: true,
      lastResetMonth: '2024-01',
      licenseKey: 'DEMO-LIFETIME',
      cloudCreditsRemaining: 200
    };

    const cloudSettings: ExtensionSettings = {
      ...baseSettings,
      aiMode: 'cloud'
    };

    const summary = await enhancer.summarize(sampleAbstract, cloudSettings, lifetimeLicense);
    expect(summary).toContain('Lifetime summary via Claude proxy');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://obsidian-citation-capture.onrender.com/api/v1/summarize',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer LIFETIME-DEMO-0000-0000'
        })
      })
    );
  });

  it('falls back gracefully to executive summary when cloud proxy returns 502 or is down', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ detail: 'Upstream Claude API error' })
    });

    const enhancer = new AIEnhancer(mockFetch as any);
    const lifetimeLicense: LicenseStatus = {
      tier: 'lifetime',
      isPro: true,
      monthlyUsage: 0,
      monthlyLimit: Infinity,
      canCapture: true,
      lastResetMonth: '2024-01',
      licenseKey: 'DEMO-LIFETIME',
      cloudCreditsRemaining: 200
    };

    const cloudSettings: ExtensionSettings = {
      ...baseSettings,
      aiMode: 'cloud'
    };

    const summary = await enhancer.summarize(sampleAbstract, cloudSettings, lifetimeLicense);
    expect(summary).toBeDefined();
    expect(summary).toContain('•');
  });
});
