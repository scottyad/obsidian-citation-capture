import { App, PluginSettingTab, Setting } from 'obsidian';
import type CitationCapturePlugin from '../main';

export interface PluginSettings {
  inboxFolder: string;
  duplicateAction: 'update' | 'append_highlight' | 'create_copy';
  openAfterCapture: boolean;
  tagPrefix: string;
}

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
  inboxFolder: 'Literature',
  duplicateAction: 'append_highlight',
  openAfterCapture: true,
  tagPrefix: 'literature-note'
};

export class CitationSettingTab extends PluginSettingTab {
  plugin: CitationCapturePlugin;

  constructor(app: App, plugin: CitationCapturePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Citation Capture Plugin Settings' });

    new Setting(containerEl)
      .setName('Literature Notes Folder')
      .setDesc('Vault folder path where captured literature notes will be stored.')
      .addText(text => text
        .setPlaceholder('Literature')
        .setValue(this.plugin.settings.inboxFolder)
        .onChange(async (value) => {
          this.plugin.settings.inboxFolder = value.trim() || 'Literature';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Duplicate Resolution')
      .setDesc('Behavior when capturing a citation with an existing citekey or DOI.')
      .addDropdown(drop => drop
        .addOption('append_highlight', 'Append new quotes & highlights to existing note')
        .addOption('update', 'Overwrite entire note with latest metadata')
        .addOption('create_copy', 'Create separate note with timestamp suffix')
        .setValue(this.plugin.settings.duplicateAction)
        .onChange(async (value: any) => {
          this.plugin.settings.duplicateAction = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Open Note After Capture')
      .setDesc('Automatically open the captured literature note in a new tab.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.openAfterCapture)
        .onChange(async (value) => {
          this.plugin.settings.openAfterCapture = value;
          await this.plugin.saveSettings();
        }));
  }
}
