import { CitationData, CitationFormat, ExtensionSettings, LicenseStatus } from '@obsidian-citation/shared';
import { ObsidianBridge } from '../lib/obsidian-bridge';
import { CitationFormatter } from '../lib/formatters';

let currentCitation: CitationData | null = null;
let currentSettings: ExtensionSettings | null = null;
let currentLicense: LicenseStatus | null = null;

// UI Elements
const statusText = document.getElementById('status-text') as HTMLElement;
const spinner = document.getElementById('spinner') as HTMLElement;
const tierBadge = document.getElementById('tier-badge') as HTMLElement;
const quotaWarning = document.getElementById('quota-warning') as HTMLElement;
const quotaCounter = document.getElementById('quota-counter') as HTMLElement;
const upgradeLink = document.getElementById('upgrade-link') as HTMLAnchorElement;
const openOptions = document.getElementById('open-options') as HTMLAnchorElement;

const titleInput = document.getElementById('title') as HTMLInputElement;
const authorsInput = document.getElementById('authors') as HTMLInputElement;
const yearInput = document.getElementById('year') as HTMLInputElement;
const citekeyInput = document.getElementById('citekey') as HTMLInputElement;
const doiInput = document.getElementById('doi') as HTMLInputElement;
const selectionInput = document.getElementById('selection') as HTMLTextAreaElement;
const selectionGroup = document.getElementById('selection-group') as HTMLElement;
const formatSelect = document.getElementById('citation-format') as HTMLSelectElement;
const bridgeSelect = document.getElementById('bridge-mode') as HTMLSelectElement;
const btnCapture = document.getElementById('btn-capture') as HTMLButtonElement;
const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;

function setStatus(text: string, loading: boolean = false) {
  statusText.textContent = text;
  if (loading) {
    spinner.classList.remove('hidden');
  } else {
    spinner.classList.add('hidden');
  }
}

function updateLicenseUI(status: LicenseStatus) {
  currentLicense = status;
  if (status.isPro) {
    tierBadge.textContent = status.tier.toUpperCase();
    tierBadge.className = 'badge badge-pro';
    quotaCounter.textContent = 'Unlimited Captures (Pro)';
    quotaWarning.classList.add('hidden');
    btnCapture.disabled = false;
  } else {
    tierBadge.textContent = 'Free Tier';
    tierBadge.className = 'badge badge-free';
    const remaining = Math.max(0, status.monthlyLimit - status.monthlyUsage);
    quotaCounter.textContent = `Usage: ${status.monthlyUsage}/${status.monthlyLimit} (${remaining} left)`;

    if (!status.canCapture) {
      quotaWarning.classList.remove('hidden');
      btnCapture.disabled = true;
      btnCapture.textContent = 'Quota Exceeded';
    } else {
      quotaWarning.classList.add('hidden');
      btnCapture.disabled = false;
      btnCapture.textContent = 'Capture to Obsidian';
    }
  }
}

function populateForm(data: CitationData) {
  titleInput.value = data.title || '';
  authorsInput.value = data.authors.join(', ') || '';
  yearInput.value = data.year ? String(data.year) : '';
  citekeyInput.value = data.citekey || '';
  doiInput.value = data.doi || data.arxivId || data.pmid || '';

  if (data.selectedText) {
    selectionInput.value = data.selectedText;
    selectionGroup.style.display = 'block';
  } else {
    selectionGroup.style.display = 'none';
  }
}

function syncFormData(): CitationData {
  if (!currentCitation) {
    throw new Error('No citation initialized');
  }

  const authors = authorsInput.value
    .split(',')
    .map(a => a.trim())
    .filter(Boolean);

  return {
    ...currentCitation,
    title: titleInput.value.trim(),
    authors: authors.length > 0 ? authors : ['Anonymous'],
    year: yearInput.value.trim() ? parseInt(yearInput.value.trim(), 10) : undefined,
    citekey: citekeyInput.value.trim(),
    doi: doiInput.value.startsWith('10.') ? doiInput.value.trim() : currentCitation.doi,
    selectedText: selectionInput.value.trim() || undefined
  };
}

async function init() {
  setStatus('Scanning tab metadata...', true);

  // 1. Fetch license status and settings in parallel
  const [licenseRes, settingsRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_LICENSE_STATUS' }),
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
  ]);

  if (licenseRes?.success) {
    updateLicenseUI(licenseRes.status);
  }
  if (settingsRes?.success) {
    currentSettings = settingsRes.settings;
    if (currentSettings) {
      formatSelect.value = currentSettings.citationFormat || 'bibtex';
      bridgeSelect.value = currentSettings.bridgeMode || 'obsidian-uri';
    }
  }

  // 2. Request metadata extraction via background service worker
  try {
    const extractRes = await chrome.runtime.sendMessage({ type: 'EXTRACT_PAGE_METADATA' });
    if (!extractRes?.success || !extractRes.result?.data) {
      setStatus(extractRes?.error || 'Could not extract metadata from this page.');
      return;
    }

    currentCitation = extractRes.result.data;
    populateForm(currentCitation!);

    // 3. Background enrichment (BibTeX, CrossRef, arXiv, AI)
    if (currentCitation!.doi || currentCitation!.arxivId || currentCitation!.pmid) {
      setStatus('Enriching via academic APIs...', true);
      const enrichRes = await chrome.runtime.sendMessage({
        type: 'PROCESS_AND_ENRICH',
        payload: { data: currentCitation }
      });

      if (enrichRes?.success && enrichRes.data) {
        currentCitation = enrichRes.data;
        populateForm(currentCitation!);
      }
    }

    setStatus('Ready to capture.');
  } catch (err: any) {
    console.warn('Extraction request failed:', err);
    setStatus('Scan limited. Ready.');
  }
}

// Event Listeners
document.getElementById('capture-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentCitation || !currentSettings) return;

  const data = syncFormData();
  currentSettings.bridgeMode = bridgeSelect.value as any;

  setStatus('Dispatching to Obsidian...', true);
  btnCapture.disabled = true;

  try {
    const result = await ObsidianBridge.dispatch(data, currentSettings);
    if (result.success) {
      await chrome.runtime.sendMessage({ type: 'RECORD_CAPTURE' });
      setStatus('Saved! Note created.', false);
      setTimeout(() => window.close(), 600);
    } else {
      setStatus(`Error: ${result.message}`, false);
      btnCapture.disabled = false;
    }
  } catch (err: any) {
    setStatus(`Dispatch failed: ${err.message}`, false);
    btnCapture.disabled = false;
  }
});

btnCopy.addEventListener('click', async () => {
  if (!currentCitation) return;
  const data = syncFormData();
  const format = formatSelect.value as CitationFormat;
  const formatted = CitationFormatter.format(data, format);

  const copied = await ObsidianBridge.copyToClipboard(formatted);
  if (copied) {
    const originalText = btnCopy.textContent;
    btnCopy.textContent = 'Copied!';
    setTimeout(() => {
      btnCopy.textContent = originalText;
    }, 1200);
  }
});

openOptions.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

upgradeLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.addEventListener('DOMContentLoaded', init);
