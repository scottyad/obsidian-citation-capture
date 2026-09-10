import { CitationData, ExtensionSettings } from '@obsidian-citation/shared';
import { MetadataResolver } from './lib/metadata-resolver';
import { AIEnhancer } from './lib/ai-enhancer';
import { LicenseManager } from './lib/license-manager';
import { ObsidianBridge, DEFAULT_TEMPLATE } from './lib/obsidian-bridge';

const resolver = new MetadataResolver();

const DEFAULT_SETTINGS: ExtensionSettings = {
  vaultName: 'ResearchVault',
  folderPath: 'Literature',
  bridgeMode: 'obsidian-uri',
  localRestPort: 27124,
  localRestToken: '',
  template: DEFAULT_TEMPLATE,
  citationFormat: 'bibtex',
  aiMode: 'auto',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.1:8b',
  cloudBackendUrl: 'https://api.citationcapture.com',
  byokProvider: 'anthropic',
  autoEnrich: true
};

async function getStoredSettings(): Promise<ExtensionSettings> {
  const data = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
}

function isWebTab(tab?: chrome.tabs.Tab): boolean {
  if (!tab || !tab.id) return false;
  if (!tab.url) return true; // If URL is stripped by permissions, still treat as valid tab
  return !tab.url.startsWith('chrome://') &&
         !tab.url.startsWith('chrome-extension://') &&
         !tab.url.startsWith('devtools://') &&
         !tab.url.startsWith('edge://') &&
         !tab.url.startsWith('about:');
}

async function getActiveWebTab(senderTab?: chrome.tabs.Tab, explicitTabId?: number): Promise<chrome.tabs.Tab | undefined> {
  // 0. If explicit tab ID provided
  if (explicitTabId) {
    try {
      const tab = await chrome.tabs.get(explicitTabId);
      if (tab?.id) return tab;
    } catch {}
  }

  // 1. If message came from a content script in a tab
  if (senderTab?.id && isWebTab(senderTab)) {
    return senderTab;
  }

  // 2. Try active tab in lastFocusedWindow (most common when DevTools or popup has focus)
  try {
    const lastFocused = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (lastFocused[0]?.id && isWebTab(lastFocused[0])) {
      return lastFocused[0];
    }
  } catch {}

  // 3. Try active tab in currentWindow
  try {
    const current = await chrome.tabs.query({ active: true, currentWindow: true });
    if (current[0]?.id && isWebTab(current[0])) {
      return current[0];
    }
  } catch {}

  // 4. Try any active tab across all windows
  try {
    const allActive = await chrome.tabs.query({ active: true });
    const webActive = allActive.find(isWebTab);
    if (webActive?.id) return webActive;
  } catch {}

  // 5. Fallback to any open web tab across browser
  try {
    const allTabs = await chrome.tabs.query({});
    const anyWeb = allTabs.find(isWebTab);
    if (anyWeb?.id) return anyWeb;
  } catch {}

  return undefined;
}

// Setup context menus on installation
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: 'capture-paper-to-obsidian',
    title: 'Capture Paper to Obsidian',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'capture-selection-to-obsidian',
    title: 'Capture Highlight & Citation to Obsidian',
    contexts: ['selection']
  });

  // Initialize settings if empty
  const stored = await chrome.storage.sync.get('settings');
  if (!stored.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
});

// Handle context menus
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_METADATA' });
    if (!response?.success) return;

    let citation: CitationData = response.result.data;
    if (info.menuItemId === 'capture-selection-to-obsidian' && info.selectionText) {
      citation.selectedText = info.selectionText;
    }

    const settings = await getStoredSettings();
    const license = await LicenseManager.getStatus();

    if (!license.canCapture) {
      console.warn('Capture blocked: Free quota limit reached.');
      return;
    }

    if (settings.autoEnrich) {
      citation = await resolver.enrich(citation);
    }

    await ObsidianBridge.dispatch(citation, settings);
    await LicenseManager.recordCapture();
  } catch (err) {
    console.error('Context menu capture failed:', err);
  }
});

// Message listener for popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'GET_SETTINGS': {
          const settings = await getStoredSettings();
          sendResponse({ success: true, settings });
          break;
        }

        case 'SAVE_SETTINGS': {
          await chrome.storage.sync.set({ settings: message.payload });
          sendResponse({ success: true });
          break;
        }

        case 'GET_LICENSE_STATUS': {
          const status = await LicenseManager.getStatus();
          sendResponse({ success: true, status });
          break;
        }

        case 'ACTIVATE_LICENSE': {
          const result = await LicenseManager.activateLicense(message.payload.key);
          sendResponse(result);
          break;
        }

        case 'PROCESS_AND_ENRICH': {
          let data: CitationData = message.payload.data;
          const settings = await getStoredSettings();
          const licenseStatus = await LicenseManager.getStatus();

          if (settings.autoEnrich) {
            data = await resolver.enrich(data);

            // Multi-tier AI enrichment (Auto-detected: Ollama, Cloud Haiku, or BYOK)
            try {
              const ai = new AIEnhancer();
              if (data.abstract && !data.aiSummary) {
                const summary = await ai.summarize(data.abstract, settings, licenseStatus);
                if (summary) {
                  data.aiSummary = summary;
                  if (licenseStatus.tier === 'pro_plus') {
                    await LicenseManager.deductCloudCredit();
                  }
                }
              }
              const tags = await ai.suggestTags(data.title, data.abstract, settings, licenseStatus);
              if (tags.length > 0) {
                data.tags = Array.from(new Set([...(data.tags || []), ...tags]));
              }
            } catch (aiErr) {
              console.warn('Optional AI enrichment skipped:', aiErr);
            }
          }

          sendResponse({ success: true, data });
          break;
        }

        case 'EXTRACT_PAGE_METADATA': {
          const tab = await getActiveWebTab(sender?.tab, message?.payload?.tabId);
          if (!tab?.id) {
            sendResponse({ success: false, error: 'No active academic tab found. Please open an academic paper in Chrome.' });
            break;
          }

          if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://') || tab.url?.startsWith('devtools://')) {
            sendResponse({ success: false, error: `Cannot extract from browser page (${tab.url}). Please navigate to an academic paper.` });
            break;
          }

          // 1. Try messaging existing content script first
          try {
            const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_METADATA' });
            if (response && response.success) {
              sendResponse(response);
              break;
            }
          } catch {
            // Content script was not injected on an already-open tab
          }

          // 2. Dynamically inject content.js and retry
          try {
            if (chrome.scripting) {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
              });
              await new Promise(r => setTimeout(r, 60));
              const retryResponse = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_METADATA' });
              sendResponse(retryResponse || { success: false, error: 'Extraction returned empty response' });
            } else {
              sendResponse({ success: false, error: 'Content script not injected and scripting API unavailable' });
            }
          } catch (injectErr: any) {
            sendResponse({ success: false, error: `Extraction error: ${injectErr.message}` });
          }
          break;
        }

        case 'GET_SELECTION': {
          const tab = await getActiveWebTab(sender?.tab, message?.payload?.tabId);
          if (!tab?.id) {
            sendResponse({ selection: '' });
            break;
          }
          try {
            const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' });
            sendResponse(response);
          } catch {
            sendResponse({ selection: '' });
          }
          break;
        }

        case 'RECORD_CAPTURE': {
          const status = await LicenseManager.recordCapture();
          sendResponse({ success: true, status });
          break;
        }

        case 'RESET_FREE_USAGE': {
          await LicenseManager.resetFreeUsage();
          const status = await LicenseManager.getStatus();
          sendResponse({ success: true, status });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (err: any) {
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // Keep channel open for async response
});
