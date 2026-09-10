import { CitationData, ExtensionSettings } from '@obsidian-citation/shared';

export const DEFAULT_TEMPLATE = `---
citekey: "{{citekey}}"
title: "{{title}}"
authors: [{{authors_quoted}}]
year: {{year}}
{{#if_doi}}doi: "{{doi}}"{{/if_doi}}
url: "{{url}}"
tags:
{{tags_yaml}}
---

# {{title}}

**Authors:** {{authors}}  
**Year:** {{year}}  
**Journal:** {{journal}}  
**Link:** [Source Page]({{url}})  
{{#if_doi}}**DOI:** [{{doi}}](https://doi.org/{{doi}}){{/if_doi}}

{{#if_ai_summary}}
## AI Executive Summary
> {{aiSummary}}
{{/if_ai_summary}}

{{#if_abstract}}
## Abstract
> {{abstract}}
{{/if_abstract}}

{{#if_selection}}
## Highlights & Notes
> {{selectedText}}
{{/if_selection}}

## Key Notes & Takeaways
- 

## Citation
\`\`\`bibtex
{{bibtex}}
\`\`\`
`;

export class ObsidianBridge {
  public static renderMarkdown(data: CitationData, template: string = DEFAULT_TEMPLATE): string {
    let output = template || DEFAULT_TEMPLATE;

    const safeTitle = (data.title || 'Untitled').replace(/"/g, '\\"');
    const authorsQuoted = data.authors.map(a => `"${a}"`).join(', ');
    const authorsFlat = data.authors.join(', ');

    output = output.replace(/{{citekey}}/g, data.citekey || 'paper');
    output = output.replace(/{{title}}/g, safeTitle);
    output = output.replace(/{{authors_quoted}}/g, authorsQuoted);
    output = output.replace(/{{authors}}/g, authorsFlat);
    output = output.replace(/{{year}}/g, String(data.year || ''));
    output = output.replace(/{{doi}}/g, data.doi || '');
    output = output.replace(/{{journal}}/g, data.journal || 'Academic Paper');
    output = output.replace(/{{url}}/g, data.url || '');
    output = output.replace(/{{abstract}}/g, (data.abstract || '').replace(/\n/g, '\n> '));
    output = output.replace(/{{aiSummary}}/g, (data.aiSummary || '').replace(/\n/g, '\n> '));
    output = output.replace(/{{bibtex}}/g, data.bibtex || '');
    output = output.replace(/{{selectedText}}/g, (data.selectedText || '').replace(/\n/g, '\n> '));

    const defaultTags = ['literature-note', 'academic'];
    const customTags = (data.tags || []).map(t => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean);
    const allTags = Array.from(new Set([...defaultTags, ...customTags]));
    const tagsYaml = allTags.map(t => `  - ${t}`).join('\n');
    const tagsInline = allTags.join(', ');

    output = output.replace(/{{tags_yaml}}/g, tagsYaml);
    output = output.replace(/{{tags}}/g, tagsInline);

    // If template has older hardcoded tags block, replace it so AI tags appear in frontmatter
    if (output.includes('tags:\n  - literature-note\n  - academic\n---')) {
      output = output.replace('tags:\n  - literature-note\n  - academic\n---', `tags:\n${tagsYaml}\n---`);
    } else if (output.includes('tags:\n  - literature-note\n  - academic\r\n---')) {
      output = output.replace('tags:\n  - literature-note\n  - academic\r\n---', `tags:\n${tagsYaml}\r\n---`);
    }

    // Handle conditionals
    output = output.replace(/{{#if_doi}}([\s\S]*?){{\/if_doi}}/g, data.doi ? '$1' : '');
    output = output.replace(/{{#if_selection}}([\s\S]*?){{\/if_selection}}/g, data.selectedText ? '$1' : '');
    output = output.replace(/{{#if_abstract}}([\s\S]*?){{\/if_abstract}}/g, data.abstract ? '$1' : '');
    output = output.replace(/{{#if_ai_summary}}([\s\S]*?){{\/if_ai_summary}}/g, data.aiSummary ? '$1' : '');

    return output.trim();
  }

  public static getTargetFilePath(data: CitationData, folderPath: string = 'Literature'): string {
    const folder = folderPath ? `${folderPath.replace(/^\/+|\/+$/g, '')}/` : '';
    return `${folder}@${data.citekey}.md`;
  }

  public static buildObsidianUri(data: CitationData, settings: ExtensionSettings): string {
    const content = this.renderMarkdown(data, settings.template);
    const folder = settings.folderPath ? `${settings.folderPath.replace(/^\/+|\/+$/g, '')}/` : '';
    // obsidian://new?file=...&content=... (without .md extension as per Obsidian URI spec)
    const file = `${folder}@${data.citekey}`;

    const vaultName = (settings.vaultName || '').trim();
    const vaultParam = vaultName ? `vault=${encodeURIComponent(vaultName)}&` : '';
    const overwriteParam = settings.overwriteExisting ? '&overwrite=true' : '';

    return `obsidian://new?${vaultParam}file=${encodeURIComponent(file)}&content=${encodeURIComponent(content)}${overwriteParam}`;
  }

  public static buildPluginUri(data: CitationData, settings: ExtensionSettings): string {
    const payload = {
      action: 'capture',
      data,
      settings: {
        folderPath: settings.folderPath,
        vaultName: settings.vaultName,
        template: settings.template
      }
    };

    return `obsidian://citation?action=capture&data=${encodeURIComponent(JSON.stringify(payload))}`;
  }

  public static async sendViaLocalRest(
    data: CitationData,
    settings: ExtensionSettings,
    fetchFn: typeof fetch = globalThis.fetch
  ): Promise<{ success: boolean; message: string }> {
    const port = settings.localRestPort || 27124;
    const token = settings.localRestToken;
    if (!token) {
      return { success: false, message: 'Local REST API token is required in Options.' };
    }

    const filePath = this.getTargetFilePath(data, settings.folderPath);
    const content = this.renderMarkdown(data, settings.template);
    const url = `https://127.0.0.1:${port}/vault/${encodeURIComponent(filePath)}`;

    try {
      const response = await fetchFn(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/markdown'
        },
        body: content
      });

      if (response.ok) {
        return { success: true, message: `Successfully wrote ${filePath} via Local REST API.` };
      }
      return { success: false, message: `REST API returned status ${response.status}: ${response.statusText}` };
    } catch (err: any) {
      return { success: false, message: `Failed to connect to Obsidian Local REST API: ${err.message}` };
    }
  }

  public static async copyToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
    return false;
  }

  public static async dispatch(
    data: CitationData,
    settings: ExtensionSettings
  ): Promise<{ success: boolean; mode: string; message: string; uri?: string }> {
    switch (settings.bridgeMode) {
      case 'local-rest': {
        const restResult = await this.sendViaLocalRest(data, settings);
        return { success: restResult.success, mode: 'local-rest', message: restResult.message };
      }

      case 'plugin-protocol': {
        const uri = this.buildPluginUri(data, settings);
        this.openUri(uri);
        return { success: true, mode: 'plugin-protocol', message: 'Sent capture to Obsidian Companion Plugin.', uri };
      }

      case 'clipboard': {
        const content = this.renderMarkdown(data, settings.template);
        const copied = await this.copyToClipboard(content);
        return {
          success: copied,
          mode: 'clipboard',
          message: copied ? 'Copied Markdown literature note to clipboard!' : 'Failed to copy to clipboard.'
        };
      }

      case 'obsidian-uri':
      default: {
        const uri = this.buildObsidianUri(data, settings);
        this.openUri(uri);
        return { success: true, mode: 'obsidian-uri', message: 'Created note via obsidian://new handler.', uri };
      }
    }
  }

  public static buildOpenUri(data: CitationData, settings: ExtensionSettings): string {
    const folder = settings.folderPath ? `${settings.folderPath.replace(/^\/+|\/+$/g, '')}/` : '';
    const file = `${folder}@${data.citekey}`;
    const vaultName = (settings.vaultName || '').trim();
    const vaultParam = vaultName ? `vault=${encodeURIComponent(vaultName)}&` : '';
    return `obsidian://open?${vaultParam}file=${encodeURIComponent(file)}`;
  }

  public static openUri(uri: string): void {
    if (typeof window !== 'undefined' && window.document) {
      let anchorClicked = false;
      try {
        const a = document.createElement('a');
        a.href = uri;
        a.target = '_self';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        anchorClicked = true;
        setTimeout(() => {
          if (a.parentNode) {
            a.parentNode.removeChild(a);
          }
        }, 1000);
      } catch (err) {
        console.warn('Anchor click error:', err);
      }

      // Only fallback to window.location.href if anchor click failed
      if (!anchorClicked) {
        try {
          window.location.href = uri;
        } catch (err) {
          console.warn('window.location.href error:', err);
        }
      }
    }
  }
}
