import { ExtensionSettings, LicenseStatus } from '@obsidian-citation/shared';

export class AIEnhancer {
  private fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : fetch) {
    this.fetchFn = fetchFn;
  }

  /**
   * Determine which provider to use given user settings and license status
   */
  public async resolveProvider(
    settings: ExtensionSettings,
    licenseStatus?: LicenseStatus
  ): Promise<'ollama' | 'cloud' | 'byok' | 'none'> {
    if (settings.aiMode === 'none') return 'none';
    if (settings.aiMode === 'ollama') return 'ollama';
    if (settings.aiMode === 'cloud') return 'cloud';
    if (settings.aiMode === 'byok') return 'byok';

    // 'auto' mode: Zero user configuration decision tree
    // 1. Pro+ Cloud subscription with remaining credits takes precedence for quality & speed
    if (licenseStatus?.tier === 'pro_plus' && (licenseStatus.cloudCreditsRemaining ?? 0) > 0) {
      return 'cloud';
    }

    // 2. Check if local Ollama is active
    const isOllamaUp = await this.isOllamaAvailable(settings.ollamaUrl);
    if (isOllamaUp) {
      return 'ollama';
    }

    // 3. Check if user configured a personal BYOK key
    if (settings.byokApiKey && settings.byokApiKey.trim().length > 0) {
      return 'byok';
    }

    // Default: gracefully skip AI without blocking capture
    return 'none';
  }

  public async isOllamaAvailable(endpoint: string = 'http://localhost:11434'): Promise<boolean> {
    try {
      const url = `${endpoint.replace(/\/+$/, '')}/api/tags`;
      const res = await this.fetchFn(url, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async getOllamaModels(endpoint: string = 'http://localhost:11434'): Promise<string[]> {
    try {
      const url = `${endpoint.replace(/\/+$/, '')}/api/tags`;
      const res = await this.fetchFn(url, { method: 'GET' });
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data?.models)) return [];
      return data.models.map((m: any) => m.name || m.model).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Summarize an academic abstract into 2 high-impact bullet points
   */
  public async summarize(
    abstract: string,
    settings: ExtensionSettings,
    licenseStatus?: LicenseStatus
  ): Promise<string | undefined> {
    if (!abstract || abstract.length < 50) return undefined;

    const provider = await this.resolveProvider(settings, licenseStatus);

    switch (provider) {
      case 'cloud':
        return await this.summarizeCloud(abstract, settings, licenseStatus);
      case 'ollama':
        return await this.summarizeOllama(abstract, settings);
      case 'byok':
        return await this.summarizeBYOK(abstract, settings);
      case 'none':
      default:
        return undefined;
    }
  }

  /**
   * Suggest 3-5 research tags for note classification
   */
  public async suggestTags(
    title: string,
    abstract: string | undefined,
    settings: ExtensionSettings,
    licenseStatus?: LicenseStatus
  ): Promise<string[]> {
    const provider = await this.resolveProvider(settings, licenseStatus);

    switch (provider) {
      case 'cloud':
        return await this.suggestTagsCloud(title, abstract, settings, licenseStatus);
      case 'ollama':
        return await this.suggestTagsOllama(title, abstract, settings);
      case 'byok':
        return await this.suggestTagsBYOK(title, abstract, settings);
      case 'none':
      default:
        return [];
    }
  }

  // --- 1. Cloud AI Backend Proxy (Pro+ Claude Haiku) ---
  private async summarizeCloud(
    abstract: string,
    settings: ExtensionSettings,
    licenseStatus?: LicenseStatus
  ): Promise<string | undefined> {
    const backend = settings.cloudBackendUrl.replace(/\/+$/, '');
    const token = licenseStatus?.licenseKey || settings.licenseKey || '';

    try {
      const res = await this.fetchFn(`${backend}/api/v1/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ abstract })
      });

      if (!res.ok) return undefined;
      const json = await res.json();
      return json.summary?.trim();
    } catch (err) {
      console.warn('Cloud AI proxy request failed:', err);
      return undefined;
    }
  }

  private async suggestTagsCloud(
    title: string,
    abstract: string | undefined,
    settings: ExtensionSettings,
    licenseStatus?: LicenseStatus
  ): Promise<string[]> {
    const backend = settings.cloudBackendUrl.replace(/\/+$/, '');
    const token = licenseStatus?.licenseKey || settings.licenseKey || '';

    try {
      const res = await this.fetchFn(`${backend}/api/v1/suggest-tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title, abstract })
      });

      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.tags) ? json.tags : [];
    } catch {
      return [];
    }
  }

  // --- 2. Local Ollama (Pro - Keyless, Private) ---
  private async resolveOllamaModel(endpoint: string, preferredModel?: string): Promise<string> {
    const fallback = preferredModel || 'llama3.2:1b';
    try {
      const models = await this.getOllamaModels(endpoint);
      if (models.length === 0) return fallback;
      if (preferredModel && models.includes(preferredModel)) return preferredModel;
      // Search for known fast lightweight models
      const match = models.find(m => m.includes('llama3.2') || m.includes('phi') || m.includes('gemma') || m.includes('qwen') || m.includes('llama'));
      return match || models[0];
    } catch {
      return fallback;
    }
  }

  private async summarizeOllama(abstract: string, settings: ExtensionSettings): Promise<string | undefined> {
    const endpoint = settings.ollamaUrl.replace(/\/+$/, '');
    const model = await this.resolveOllamaModel(endpoint, settings.ollamaModel);
    const prompt = `You are an expert academic research assistant. Summarize the following academic abstract in 2 concise, high-impact bullet points focusing on core methodology and key findings:\n\n${abstract}\n\nSummary:`;

    try {
      const res = await this.fetchFn(`${endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false })
      });

      if (!res.ok) return undefined;
      const json = await res.json();
      return json.response?.trim();
    } catch (err) {
      console.warn('Local Ollama generation error:', err);
      return undefined;
    }
  }

  private async suggestTagsOllama(title: string, abstract: string | undefined, settings: ExtensionSettings): Promise<string[]> {
    const endpoint = settings.ollamaUrl.replace(/\/+$/, '');
    const model = await this.resolveOllamaModel(endpoint, settings.ollamaModel);
    const prompt = `Suggest 3 to 5 lowercase hyphenated research tags (e.g., machine-learning, neuroscience) for this paper. Return ONLY a JSON array of strings.\nTitle: ${title}\nAbstract: ${abstract || ''}\nJSON:`;

    try {
      const res = await this.fetchFn(`${endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, format: 'json' })
      });

      if (!res.ok) return [];
      const json = await res.json();
      const parsed = JSON.parse(json.response || '[]');
      return Array.isArray(parsed) ? parsed.map(t => String(t).toLowerCase().replace(/[^a-z0-9-]/g, '')) : [];
    } catch {
      return [];
    }
  }

  // --- 3. Bring Your Own Key (BYOK - Direct Client-side) ---
  private async summarizeBYOK(abstract: string, settings: ExtensionSettings): Promise<string | undefined> {
    const key = settings.byokApiKey?.trim();
    if (!key) return undefined;

    if (settings.byokProvider === 'anthropic') {
      try {
        const res = await this.fetchFn('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: settings.byokModel || 'claude-3-haiku-20240307',
            max_tokens: 300,
            messages: [{ role: 'user', content: `Summarize this academic abstract in 2 bullet points:\n\n${abstract}` }]
          })
        });

        if (!res.ok) return undefined;
        const json = await res.json();
        return json.content?.[0]?.text?.trim();
      } catch (err) {
        console.warn('BYOK Anthropic call failed:', err);
        return undefined;
      }
    }

    if (settings.byokProvider === 'openai') {
      try {
        const res = await this.fetchFn('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`
          },
          body: JSON.stringify({
            model: settings.byokModel || 'gpt-4o-mini',
            messages: [{ role: 'user', content: `Summarize this academic abstract in 2 bullet points:\n\n${abstract}` }]
          })
        });

        if (!res.ok) return undefined;
        const json = await res.json();
        return json.choices?.[0]?.message?.content?.trim();
      } catch (err) {
        console.warn('BYOK OpenAI call failed:', err);
        return undefined;
      }
    }

    if (settings.byokProvider === 'gemini') {
      try {
        const model = settings.byokModel || 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const res = await this.fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Summarize this academic abstract in 2 bullet points:\n\n${abstract}` }] }]
          })
        });

        if (!res.ok) return undefined;
        const json = await res.json();
        return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      } catch (err) {
        console.warn('BYOK Gemini call failed:', err);
        return undefined;
      }
    }

    return undefined;
  }

  private async suggestTagsBYOK(title: string, abstract: string | undefined, settings: ExtensionSettings): Promise<string[]> {
    const key = settings.byokApiKey?.trim();
    if (!key) return [];

    const prompt = `Suggest 3 to 5 lowercase hyphenated research tags (e.g., machine-learning) for this paper. Return ONLY a JSON array of strings: ["tag-1", "tag-2"].\nTitle: ${title}\nAbstract: ${abstract || ''}`;

    try {
      if (settings.byokProvider === 'anthropic') {
        const res = await this.fetchFn('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: settings.byokModel || 'claude-3-haiku-20240307',
            max_tokens: 150,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        if (!res.ok) return [];
        const json = await res.json();
        const text = json.content?.[0]?.text || '[]';
        const match = text.match(/\[[\s\S]*?\]/);
        return match ? JSON.parse(match[0]) : [];
      }

      if (settings.byokProvider === 'openai') {
        const res = await this.fetchFn('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`
          },
          body: JSON.stringify({
            model: settings.byokModel || 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }]
          })
        });
        if (!res.ok) return [];
        const json = await res.json();
        const text = json.choices?.[0]?.message?.content || '[]';
        const match = text.match(/\[[\s\S]*?\]/);
        return match ? JSON.parse(match[0]) : [];
      }
    } catch {
      return [];
    }

    return [];
  }
}
