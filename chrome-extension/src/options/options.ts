import { ExtensionSettings, LicenseStatus } from '@obsidian-citation/shared';
import { DEFAULT_TEMPLATE } from '../lib/obsidian-bridge';

// Elements
const vaultNameInput = document.getElementById('vault-name') as HTMLInputElement;
const folderPathInput = document.getElementById('folder-path') as HTMLInputElement;
const bridgeModeSelect = document.getElementById('bridge-mode') as HTMLSelectElement;
const restSettings = document.getElementById('rest-settings') as HTMLElement;
const restPortInput = document.getElementById('rest-port') as HTMLInputElement;
const restTokenInput = document.getElementById('rest-token') as HTMLInputElement;
const templateInput = document.getElementById('template') as HTMLTextAreaElement;
const btnResetTemplate = document.getElementById('btn-reset-template') as HTMLButtonElement;

// AI Elements
const aiModeSelect = document.getElementById('ai-mode') as HTMLSelectElement;
const cloudAiSettings = document.getElementById('cloud-ai-settings') as HTMLElement;
const cloudBackendUrlInput = document.getElementById('cloud-backend-url') as HTMLInputElement;
const cloudCreditsIndicator = document.getElementById('cloud-credits-indicator') as HTMLElement;
const ollamaSettings = document.getElementById('ollama-settings') as HTMLElement;
const ollamaUrlInput = document.getElementById('ollama-url') as HTMLInputElement;
const ollamaModelInput = document.getElementById('ollama-model') as HTMLInputElement;
const byokSettings = document.getElementById('byok-settings') as HTMLElement;
const byokProviderSelect = document.getElementById('byok-provider') as HTMLSelectElement;
const byokApiKeyInput = document.getElementById('byok-api-key') as HTMLInputElement;
const autoEnrichCheckbox = document.getElementById('auto-enrich') as HTMLInputElement;

const btnSave = document.getElementById('btn-save') as HTMLButtonElement;
const saveStatus = document.getElementById('save-status') as HTMLElement;

// License Elements
const tierDisplay = document.getElementById('license-tier-display') as HTMLElement;
const usageText = document.getElementById('license-usage-text') as HTMLElement;
const btnResetUsage = document.getElementById('btn-reset-usage') as HTMLButtonElement;
const licenseKeyInput = document.getElementById('license-key') as HTMLInputElement;
const btnActivate = document.getElementById('btn-activate-license') as HTMLButtonElement;
const licenseMessage = document.getElementById('license-message') as HTMLElement;

function updateBridgeUI() {
  if (bridgeModeSelect.value === 'local-rest') {
    restSettings.classList.remove('hidden');
  } else {
    restSettings.classList.add('hidden');
  }
}

function updateAIUI() {
  const mode = aiModeSelect.value;
  cloudAiSettings.classList.toggle('hidden', mode !== 'cloud');
  ollamaSettings.classList.toggle('hidden', mode !== 'ollama');
  byokSettings.classList.toggle('hidden', mode !== 'byok');
}

function updateLicenseUI(status: LicenseStatus) {
  const tierName = status.tier === 'pro_plus' ? 'PRO+ CLOUD AI' : `${status.tier.toUpperCase()} TIER`;
  tierDisplay.textContent = tierName;

  if (status.tier === 'pro_plus') {
    tierDisplay.style.background = 'linear-gradient(135deg, #3b82f6, #8b5cf6)';
    const credits = status.cloudCreditsRemaining ?? 200;
    usageText.textContent = `Unlimited captures active • ${credits} Cloud AI credits remaining this month`;
    cloudCreditsIndicator.textContent = `${credits} Cloud AI summaries remaining`;
  } else if (status.isPro) {
    tierDisplay.style.background = '#10b981';
    usageText.textContent = `Unlimited captures active (${status.tier})`;
    cloudCreditsIndicator.textContent = 'Upgrade to Pro+ for Cloud AI summaries';
  } else {
    tierDisplay.style.background = '#7c3aed';
    usageText.textContent = `Monthly Usage: ${status.monthlyUsage} / ${status.monthlyLimit} captures used`;
    cloudCreditsIndicator.textContent = 'Upgrade to Pro+ for Cloud AI summaries';
  }
}

async function loadSettings() {
  const [settingsRes, licenseRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }),
    chrome.runtime.sendMessage({ type: 'GET_LICENSE_STATUS' })
  ]);

  if (settingsRes?.success && settingsRes.settings) {
    const s: ExtensionSettings = settingsRes.settings;
    vaultNameInput.value = s.vaultName || 'ResearchVault';
    folderPathInput.value = s.folderPath || 'Literature';
    bridgeModeSelect.value = s.bridgeMode || 'obsidian-uri';
    restPortInput.value = String(s.localRestPort || 27124);
    restTokenInput.value = s.localRestToken || '';
    templateInput.value = s.template || DEFAULT_TEMPLATE;

    aiModeSelect.value = s.aiMode || 'auto';
    cloudBackendUrlInput.value = s.cloudBackendUrl || 'https://api.citationcapture.com';
    ollamaUrlInput.value = s.ollamaUrl || 'http://localhost:11434';
    ollamaModelInput.value = s.ollamaModel || 'llama3.1:8b';
    byokProviderSelect.value = s.byokProvider || 'anthropic';
    byokApiKeyInput.value = s.byokApiKey || '';
    autoEnrichCheckbox.checked = s.autoEnrich !== false;

    updateBridgeUI();
    updateAIUI();
  }

  if (licenseRes?.success && licenseRes.status) {
    updateLicenseUI(licenseRes.status);
  }
}

async function saveSettings() {
  const settings: ExtensionSettings = {
    vaultName: vaultNameInput.value.trim() || 'ResearchVault',
    folderPath: folderPathInput.value.trim() || 'Literature',
    bridgeMode: bridgeModeSelect.value as any,
    localRestPort: parseInt(restPortInput.value, 10) || 27124,
    localRestToken: restTokenInput.value.trim(),
    template: templateInput.value.trim() || DEFAULT_TEMPLATE,
    citationFormat: 'bibtex',
    aiMode: aiModeSelect.value as any,
    cloudBackendUrl: cloudBackendUrlInput.value.trim() || 'https://api.citationcapture.com',
    ollamaUrl: ollamaUrlInput.value.trim() || 'http://localhost:11434',
    ollamaModel: ollamaModelInput.value.trim() || 'llama3.1:8b',
    byokProvider: byokProviderSelect.value as any,
    byokApiKey: byokApiKeyInput.value.trim(),
    autoEnrich: autoEnrichCheckbox.checked
  };

  const res = await chrome.runtime.sendMessage({
    type: 'SAVE_SETTINGS',
    payload: settings
  });

  if (res?.success) {
    saveStatus.classList.remove('hidden');
    setTimeout(() => {
      saveStatus.classList.add('hidden');
    }, 2500);
  }
}

bridgeModeSelect.addEventListener('change', updateBridgeUI);
aiModeSelect.addEventListener('change', updateAIUI);

btnResetTemplate.addEventListener('click', () => {
  if (confirm('Reset template to default Obsidian literature note template?')) {
    templateInput.value = DEFAULT_TEMPLATE;
  }
});

btnSave.addEventListener('click', saveSettings);

btnActivate.addEventListener('click', async () => {
  const key = licenseKeyInput.value.trim();
  if (!key) {
    licenseMessage.textContent = 'Please enter a license key.';
    licenseMessage.style.color = '#ef4444';
    return;
  }

  licenseMessage.textContent = 'Verifying key...';
  licenseMessage.style.color = '#94a3b8';

  const res = await chrome.runtime.sendMessage({
    type: 'ACTIVATE_LICENSE',
    payload: { key }
  });

  if (res?.success) {
    licenseMessage.textContent = res.message;
    licenseMessage.style.color = '#10b981';
    updateLicenseUI(res.status);
  } else {
    licenseMessage.textContent = res?.message || 'Activation failed.';
    licenseMessage.style.color = '#ef4444';
  }
});

btnResetUsage?.addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'RESET_FREE_USAGE' });
  if (res?.success && res.status) {
    updateLicenseUI(res.status);
    licenseMessage.textContent = 'Usage counter reset to 0/10 captures.';
    licenseMessage.style.color = '#10b981';
  }
});

document.addEventListener('DOMContentLoaded', loadSettings);
