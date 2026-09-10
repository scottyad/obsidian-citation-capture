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
const aiSummaryInput = document.getElementById('ai-summary') as HTMLTextAreaElement;
const aiTagsInput = document.getElementById('ai-tags') as HTMLInputElement;
const aiStatusBadge = document.getElementById('ai-status-badge') as HTMLElement;
const formatSelect = document.getElementById('citation-format') as HTMLSelectElement;
const bridgeSelect = document.getElementById('bridge-mode') as HTMLSelectElement;
const overwriteToggle = document.getElementById('overwrite-toggle') as HTMLInputElement | null;
const btnRegenerateAi = document.getElementById('btn-regenerate-ai') as HTMLButtonElement | null;
const aiLoadingHint = document.getElementById('ai-loading-hint') as HTMLElement | null;
const btnSkipAi = document.getElementById('btn-skip-ai') as HTMLAnchorElement | null;
const btnCapture = document.getElementById('btn-capture') as HTMLButtonElement;
const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;

let isEnriching = false;
let enrichPromise: Promise<any> | null = null;

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

  if (aiSummaryInput) {
    aiSummaryInput.value = data.aiSummary || '';
  }
  if (aiTagsInput) {
    aiTagsInput.value = (data.tags && data.tags.length > 0) ? data.tags.join(', ') : '';
  }
  if (aiStatusBadge) {
    if (data.aiSummary) {
      aiStatusBadge.textContent = '✨ AI Generated';
      aiStatusBadge.style.color = '#a7f3d0';
      aiStatusBadge.style.borderColor = '#10b981';
      aiStatusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
    } else {
      aiStatusBadge.textContent = 'AI Ready';
      aiStatusBadge.style.color = '#c4b5fd';
      aiStatusBadge.style.borderColor = '#7c3aed';
      aiStatusBadge.style.background = 'rgba(124, 58, 237, 0.2)';
    }
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

  const tags = aiTagsInput?.value
    ? aiTagsInput.value.split(',').map(t => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean)
    : currentCitation.tags;

  return {
    ...currentCitation,
    title: titleInput.value.trim(),
    authors: authors.length > 0 ? authors : ['Anonymous'],
    year: yearInput.value.trim() ? parseInt(yearInput.value.trim(), 10) : undefined,
    citekey: citekeyInput.value.trim(),
    doi: doiInput.value.startsWith('10.') ? doiInput.value.trim() : currentCitation.doi,
    selectedText: selectionInput.value.trim() || undefined,
    aiSummary: aiSummaryInput?.value.trim() || currentCitation.aiSummary,
    tags
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
      if (overwriteToggle) {
        overwriteToggle.checked = currentSettings.overwriteExisting === true;
      }
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
    await runEnrichment();
  } catch (err: any) {
    console.warn('Extraction request failed:', err);
    setStatus('Scan limited. Ready.');
  }
}

async function runEnrichment() {
  if (!currentCitation) return;
  if (!currentCitation.doi && !currentCitation.arxivId && !currentCitation.pmid && !currentCitation.abstract) {
    setStatus('Ready to capture.');
    return;
  }

  isEnriching = true;
  setStatus('✨ Generating AI summary via Ollama...', true);
  if (aiStatusBadge) {
    aiStatusBadge.textContent = 'Summarizing...';
    aiStatusBadge.style.color = '#fed7aa';
    aiStatusBadge.style.borderColor = '#f97316';
    aiStatusBadge.style.background = 'rgba(249, 115, 22, 0.2)';
  }
  btnCapture.disabled = true;
  btnCapture.textContent = 'Generating AI Summary...';
  if (aiLoadingHint) {
    aiLoadingHint.classList.remove('hidden');
  }

  enrichPromise = chrome.runtime.sendMessage({
    type: 'PROCESS_AND_ENRICH',
    payload: { data: currentCitation }
  }).then(enrichRes => {
    if (enrichRes?.success && enrichRes.data) {
      currentCitation = enrichRes.data;
      populateForm(currentCitation!);
    }
  }).catch(err => {
    console.warn('Enrichment failed:', err);
  }).finally(() => {
    isEnriching = false;
    btnCapture.disabled = false;
    btnCapture.textContent = 'Capture to Obsidian';
    if (aiLoadingHint) {
      aiLoadingHint.classList.add('hidden');
    }
    if (currentCitation?.aiSummary) {
      setStatus('✨ AI summary & metadata ready.');
    } else {
      setStatus('Ready to capture.');
    }
  });

  await enrichPromise;
}

// Event Listeners
overwriteToggle?.addEventListener('change', async () => {
  if (currentSettings) {
    currentSettings.overwriteExisting = overwriteToggle.checked;
    await chrome.storage.sync.set({ settings: currentSettings });
  }
});

btnSkipAi?.addEventListener('click', (e) => {
  e.preventDefault();
  isEnriching = false;
  btnCapture.disabled = false;
  btnCapture.textContent = 'Capture to Obsidian';
  if (aiLoadingHint) {
    aiLoadingHint.classList.add('hidden');
  }
  setStatus('Ready to capture (AI skipped).');
});

btnRegenerateAi?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (isEnriching) return;
  if (currentCitation) {
    currentCitation.aiSummary = undefined;
    if (aiSummaryInput) aiSummaryInput.value = '';
    await runEnrichment();
  }
});

document.getElementById('capture-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentCitation || !currentSettings) return;

  if (isEnriching && enrichPromise) {
    setStatus('Waiting for AI summary to complete...', true);
    await enrichPromise;
  }

  const data = syncFormData();
  currentSettings.bridgeMode = bridgeSelect.value as any;
  if (overwriteToggle) {
    currentSettings.overwriteExisting = overwriteToggle.checked;
  }

  setStatus('Dispatching to Obsidian...', true);
  btnCapture.disabled = true;

  try {
    const result = await ObsidianBridge.dispatch(data, currentSettings);
    if (result.success) {
      await chrome.runtime.sendMessage({ type: 'RECORD_CAPTURE' });

      const directContainer = document.getElementById('direct-open-container');
      const directLink = document.getElementById('btn-direct-open') as HTMLAnchorElement;
      if (directContainer && directLink) {
        directLink.href = ObsidianBridge.buildOpenUri(data, currentSettings);
        directContainer.classList.remove('hidden');
      }

      setStatus('✓ Note captured to Obsidian!', false);
      btnCapture.disabled = false;
      btnCapture.textContent = 'Captured!';
      setTimeout(() => {
        btnCapture.textContent = 'Capture to Obsidian';
      }, 2500);
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
