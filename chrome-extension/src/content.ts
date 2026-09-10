import { CitationExtractor } from './lib/citation-extractor';

const extractor = new CitationExtractor(document, window);

// Expose directly on window for rapid debugging & console verification
if (typeof window !== 'undefined') {
  (window as any).__extractCitation = () => extractor.extract();
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

  if (request.type === 'GET_SELECTION') {
    const selection = window.getSelection()?.toString().trim() || '';
    sendResponse({ selection });
    return false;
  }

  return false;
});
