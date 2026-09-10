import { Plugin, Notice, WorkspaceLeaf } from 'obsidian';
import { CitationData, BridgePayload } from '@obsidian-citation/shared';
import { PluginSettings, DEFAULT_PLUGIN_SETTINGS, CitationSettingTab } from './src/settings';
import { VaultWriter } from './src/vault-writer';

export default class CitationCapturePlugin extends Plugin {
  settings: PluginSettings;
  vaultWriter: VaultWriter;

  async onload() {
    await this.loadSettings();
    this.vaultWriter = new VaultWriter(this.app, this.settings);

    // Register Obsidian Protocol Handler: obsidian://citation?action=capture&data=...
    this.registerObsidianProtocolHandler('citation', async (params) => {
      try {
        if (!params.data) {
          new Notice('Citation Capture: Received empty protocol payload.');
          return;
        }

        const payloadStr = decodeURIComponent(params.data);
        const payload: BridgePayload = JSON.parse(payloadStr);

        if (payload.action === 'capture' && payload.data) {
          await this.handleIncomingCitation(payload.data, payload.settings?.folderPath);
        } else {
          new Notice(`Citation Capture: Unsupported action "${payload.action}".`);
        }
      } catch (err: any) {
        console.error('Failed to handle incoming citation protocol URI:', err);
        new Notice(`Citation Capture Error: ${err.message}`);
      }
    });

    // Add ribbon icon to open literature folder
    this.addRibbonIcon('book-open', 'Citation Capture: Open Literature', () => {
      new Notice(`Literature notes are stored in: ${this.settings.inboxFolder}`);
    });

    // Add settings tab
    this.addSettingTab(new CitationSettingTab(this.app, this));
  }

  async handleIncomingCitation(data: CitationData, customFolder?: string) {
    try {
      const file = await this.vaultWriter.saveCitation(data, customFolder);
      new Notice(`Captured: ${file.basename}`);

      if (this.settings.openAfterCapture) {
        const leaf = this.app.workspace.getLeaf(true);
        if (leaf) {
          await leaf.openFile(file);
        }
      }
    } catch (err: any) {
      console.error('Failed to save citation file:', err);
      new Notice(`Failed to save citation: ${err.message}`);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_PLUGIN_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.vaultWriter = new VaultWriter(this.app, this.settings);
  }
}
