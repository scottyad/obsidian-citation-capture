import { App, TFile, normalizePath } from 'obsidian';
import { CitationData } from '@obsidian-citation/shared';
import { PluginSettings } from './settings';

export class VaultWriter {
  private app: App;
  private settings: PluginSettings;

  constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.settings = settings;
  }

  public async saveCitation(data: CitationData, customFolder?: string): Promise<TFile> {
    const folderPath = normalizePath(customFolder || this.settings.inboxFolder);
    await this.ensureFolderExists(folderPath);

    const baseName = `@${data.citekey}`;
    const filePath = normalizePath(`${folderPath}/${baseName}.md`);

    const existingFile = this.app.vault.getAbstractFileByPath(filePath);

    if (existingFile instanceof TFile) {
      return await this.handleDuplicate(existingFile, data, folderPath, baseName);
    }

    const content = this.renderMarkdown(data);
    return await this.app.vault.create(filePath, content);
  }

  private async handleDuplicate(
    existingFile: TFile,
    data: CitationData,
    folderPath: string,
    baseName: string
  ): Promise<TFile> {
    switch (this.settings.duplicateAction) {
      case 'update': {
        const newContent = this.renderMarkdown(data);
        await this.app.vault.modify(existingFile, newContent);
        return existingFile;
      }

      case 'create_copy': {
        const timestamp = Date.now();
        const copyPath = normalizePath(`${folderPath}/${baseName}-${timestamp}.md`);
        const content = this.renderMarkdown(data);
        return await this.app.vault.create(copyPath, content);
      }

      case 'append_highlight':
      default: {
        if (data.selectedText) {
          const original = await this.app.vault.read(existingFile);
          const excerptSection = `\n\n> [!quote] Captured Excerpt (${new Date().toLocaleDateString()})\n> ${data.selectedText.replace(/\n/g, '\n> ')}\n`;
          await this.app.vault.modify(existingFile, original + excerptSection);
        }
        return existingFile;
      }
    }
  }

  private async ensureFolderExists(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        try {
          await this.app.vault.createFolder(current);
        } catch {
          // Ignore if exists
        }
      }
    }
  }

  public renderMarkdown(data: CitationData): string {
    const authorsQuoted = data.authors.map(a => `"${a}"`).join(', ');
    const authorsFlat = data.authors.join(', ');
    const cleanTitle = data.title.replace(/"/g, '\\"');

    const lines: string[] = [
      '---',
      `citekey: "${data.citekey}"`,
      `title: "${cleanTitle}"`,
      `authors: [${authorsQuoted}]`,
      `year: ${data.year || ''}`,
      data.doi ? `doi: "${data.doi}"` : null,
      data.journal ? `journal: "${data.journal}"` : null,
      `url: "${data.url}"`,
      'tags:',
      '  - literature-note',
      '  - academic',
      '---',
      '',
      `# ${data.title}`,
      '',
      `**Authors:** ${authorsFlat}  `,
      `**Year:** ${data.year || 'n.d.'}  `,
      `**Journal:** ${data.journal || 'Academic publication'}  `,
      `**Link:** [Original Document](${data.url})  `,
      data.doi ? `**DOI:** [${data.doi}](https://doi.org/${data.doi})  ` : null,
      ''
    ].filter(line => line !== null) as string[];

    if (data.aiSummary) {
      lines.push('## AI Executive Summary', `> ${data.aiSummary.replace(/\n/g, '\n> ')}`, '');
    }

    if (data.abstract) {
      lines.push('## Abstract', `> ${data.abstract.replace(/\n/g, '\n> ')}`, '');
    }

    if (data.selectedText) {
      lines.push('## Highlights & Notes', `> ${data.selectedText.replace(/\n/g, '\n> ')}`, '');
    }

    lines.push(
      '## Key Takeaways & Thoughts',
      '- ',
      '',
      '## Citation',
      '```bibtex',
      data.bibtex || `@misc{${data.citekey},\n  title={${data.title}},\n  author={${authorsFlat}}\n}`,
      '```'
    );

    return lines.join('\n');
  }
}
