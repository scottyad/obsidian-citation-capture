import { CitationExtractor } from './lib/citation-extractor';

const extractor = new CitationExtractor(document, window);

// 1. Expose in isolated world
if (typeof window !== 'undefined') {
  (window as any).__extractCitation = () => extractor.extract();
}

// 2. Expose in page's main world so running __extractCitation() in the default 'top' console works
try {
  const script = document.createElement('script');
  script.textContent = `
    window.__extractCitation = function() {
      window.postMessage({ type: '__OBSIDIAN_EXTRACT_TRIGGER__' }, '*');
      return "Extracting metadata... (check output below)";
    };
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();

  window.addEventListener('message', (event) => {
    if (event.source === window && event.data?.type === '__OBSIDIAN_EXTRACT_TRIGGER__') {
      const result = extractor.extract();
      console.log('%c[Obsidian Citation Capture] Extracted Metadata:', 'color: #7c3aed; font-weight: bold; font-size: 13px;', result);
    }
  });
} catch {
  // Ignore in strict CSP environments
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'EXTRACT_PAGE_METADATA') {
    try {
      const result = extractor.extract();
      sendResponse({ success: true, result });
    } catch (err: any) {
      sendResponse({ success: false, error: err.message });
    }
    return false;
  }

  if (request.type === 'DISPATCH_URI') {
    try {
      const a = document.createElement('a');
      a.href = request.uri;
      a.target = '_self';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 1000);
      sendResponse({ success: true });
    } catch (err: any) {
      try {
        window.location.href = request.uri;
        sendResponse({ success: true });
      } catch (err2: any) {
        sendResponse({ success: false, error: err2.message });
      }
    }
    return false;
  }

  if (request.type === 'GET_SELECTION') {
    const selection = window.getSelection()?.toString().trim() || '';
    sendResponse({ selection });
    return false;
  }

  return false;
});
