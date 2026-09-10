const n=`---
citekey: "{{citekey}}"
title: "{{title}}"
authors: [{{authors_quoted}}]
year: {{year}}
{{#if_doi}}doi: "{{doi}}"{{/if_doi}}
url: "{{url}}"
tags:
  - literature-note
  - academic
---

# {{title}}

**Authors:** {{authors}}  
**Year:** {{year}}  
**Journal:** {{journal}}  
**Link:** [Source Page]({{url}})  
{{#if_doi}}**DOI:** [{{doi}}](https://doi.org/{{doi}}){{/if_doi}}

{{#if_ai_summary}}
## AI Executive Summary
> {{aiSummary}}
{{/if_ai_summary}}

{{#if_abstract}}
## Abstract
> {{abstract}}
{{/if_abstract}}

{{#if_selection}}
## Highlights & Notes
> {{selectedText}}
{{/if_selection}}

## Key Notes & Takeaways
- 

## Citation
\`\`\`bibtex
{{bibtex}}
\`\`\`
`;class d{static renderMarkdown(t,r=n){let e=r||n;const a=(t.title||"Untitled").replace(/"/g,'\\"'),o=t.authors.map(c=>`"${c}"`).join(", "),s=t.authors.join(", ");return e=e.replace(/{{citekey}}/g,t.citekey||"paper"),e=e.replace(/{{title}}/g,a),e=e.replace(/{{authors_quoted}}/g,o),e=e.replace(/{{authors}}/g,s),e=e.replace(/{{year}}/g,String(t.year||"")),e=e.replace(/{{doi}}/g,t.doi||""),e=e.replace(/{{journal}}/g,t.journal||"Academic Paper"),e=e.replace(/{{url}}/g,t.url||""),e=e.replace(/{{abstract}}/g,(t.abstract||"").replace(/\n/g,`
> `)),e=e.replace(/{{aiSummary}}/g,(t.aiSummary||"").replace(/\n/g,`
> `)),e=e.replace(/{{bibtex}}/g,t.bibtex||""),e=e.replace(/{{selectedText}}/g,(t.selectedText||"").replace(/\n/g,`
> `)),e=e.replace(/{{#if_doi}}([\s\S]*?){{\/if_doi}}/g,t.doi?"$1":""),e=e.replace(/{{#if_selection}}([\s\S]*?){{\/if_selection}}/g,t.selectedText?"$1":""),e=e.replace(/{{#if_abstract}}([\s\S]*?){{\/if_abstract}}/g,t.abstract?"$1":""),e=e.replace(/{{#if_ai_summary}}([\s\S]*?){{\/if_ai_summary}}/g,t.aiSummary?"$1":""),e.trim()}static getTargetFilePath(t,r="Literature"){return`${r?`${r.replace(/^\/+|\/+$/g,"")}/`:""}@${t.citekey}.md`}static buildObsidianUri(t,r){const e=this.renderMarkdown(t,r.template),o=`${r.folderPath?`${r.folderPath.replace(/^\/+|\/+$/g,"")}/`:""}@${t.citekey}`;return`obsidian://new?vault=${encodeURIComponent(r.vaultName||"Vault")}&file=${encodeURIComponent(o)}&content=${encodeURIComponent(e)}`}static buildPluginUri(t,r){const e={action:"capture",data:t,settings:{folderPath:r.folderPath,vaultName:r.vaultName,template:r.template}};return`obsidian://citation?action=capture&data=${encodeURIComponent(JSON.stringify(e))}`}static async sendViaLocalRest(t,r,e=globalThis.fetch){const a=r.localRestPort||27124,o=r.localRestToken;if(!o)return{success:!1,message:"Local REST API token is required in Options."};const s=this.getTargetFilePath(t,r.folderPath),c=this.renderMarkdown(t,r.template),l=`https://127.0.0.1:${a}/vault/${encodeURIComponent(s)}`;try{const i=await e(l,{method:"PUT",headers:{Authorization:`Bearer ${o}`,"Content-Type":"text/markdown"},body:c});return i.ok?{success:!0,message:`Successfully wrote ${s} via Local REST API.`}:{success:!1,message:`REST API returned status ${i.status}: ${i.statusText}`}}catch(i){return{success:!1,message:`Failed to connect to Obsidian Local REST API: ${i.message}`}}}static async copyToClipboard(t){try{if(navigator.clipboard&&navigator.clipboard.writeText)return await navigator.clipboard.writeText(t),!0}catch(r){console.warn("Clipboard write failed:",r)}return!1}static async dispatch(t,r){switch(r.bridgeMode){case"local-rest":{const e=await this.sendViaLocalRest(t,r);return{success:e.success,mode:"local-rest",message:e.message}}case"plugin-protocol":{const e=this.buildPluginUri(t,r);return this.openUri(e),{success:!0,mode:"plugin-protocol",message:"Sent capture to Obsidian Companion Plugin."}}case"clipboard":{const e=this.renderMarkdown(t,r.template),a=await this.copyToClipboard(e);return{success:a,mode:"clipboard",message:a?"Copied Markdown literature note to clipboard!":"Failed to copy to clipboard."}}case"obsidian-uri":default:{const e=this.buildObsidianUri(t,r);return this.openUri(e),{success:!0,mode:"obsidian-uri",message:"Created note via obsidian://new handler."}}}}static openUri(t){if(typeof window<"u"&&window.document){const r=document.createElement("a");r.href=t,r.style.display="none",document.body.appendChild(r),r.click(),setTimeout(()=>document.body.removeChild(r),500)}}}export{n as D,d as O};
