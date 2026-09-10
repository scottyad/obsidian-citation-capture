export type CitationFormat = 'bibtex' | 'apa' | 'mla' | 'chicago' | 'harvard' | 'ieee' | 'markdown';
export type BridgeMode = 'obsidian-uri' | 'plugin-protocol' | 'local-rest' | 'clipboard';
export type LicenseTier = 'free' | 'pro' | 'pro_plus' | 'lifetime' | 'team';
export type AIProviderMode = 'auto' | 'ollama' | 'cloud' | 'byok' | 'none';
export type BYOKProvider = 'anthropic' | 'openai' | 'gemini';
export interface CitationData {
    title: string;
    authors: string[];
    year?: number | string;
    doi?: string;
    pmid?: string;
    arxivId?: string;
    journal?: string;
    volume?: string;
    issue?: string;
    pages?: string;
    publisher?: string;
    url: string;
    pdfUrl?: string;
    abstract?: string;
    bibtex?: string;
    selectedText?: string;
    citekey: string;
    capturedAt: string;
    tags?: string[];
    aiSummary?: string;
}
export interface ExtensionSettings {
    vaultName: string;
    folderPath: string;
    bridgeMode: BridgeMode;
    localRestPort: number;
    localRestToken: string;
    template: string;
    citationFormat: CitationFormat;
    aiMode: AIProviderMode;
    ollamaUrl: string;
    ollamaModel: string;
    cloudBackendUrl: string;
    byokProvider: BYOKProvider;
    byokApiKey?: string;
    byokModel?: string;
    autoEnrich: boolean;
    licenseKey?: string;
}
export interface LicenseStatus {
    tier: LicenseTier;
    isPro: boolean;
    monthlyUsage: number;
    monthlyLimit: number;
    canCapture: boolean;
    lastResetMonth: string;
    licenseKey?: string;
    cloudCreditsRemaining?: number;
}
export interface BridgePayload {
    action: 'capture' | 'append_highlight' | 'status_check';
    data: CitationData;
    settings?: {
        folderPath?: string;
        vaultName?: string;
        template?: string;
    };
}
export interface ExtractionResult {
    data: CitationData;
    source: 'highwire' | 'dublincore' | 'jsonld' | 'opengraph' | 'heuristic' | 'url';
    confidence: number;
}
//# sourceMappingURL=types.d.ts.map