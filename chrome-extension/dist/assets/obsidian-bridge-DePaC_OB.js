const d=`---
citekey: "{{citekey}}"
title: "{{title}}"
authors: [{{authors_quoted}}]
year: {{year}}
{{#if_doi}}doi: "{{doi}}"{{/if_doi}}
url: "{{url}}"
tags:
{{tags_yaml}}
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
`;class f{static renderMarkdown(t,a=d){let e=a||d;const r=(t.title||"Untitled").replace(/"/g,'\\"'),o=t.authors.map(l=>`"${l}"`).join(", "),i=t.authors.join(", ");e=e.replace(/{{citekey}}/g,t.citekey||"paper"),e=e.replace(/{{title}}/g,r),e=e.replace(/{{authors_quoted}}/g,o),e=e.replace(/{{authors}}/g,i),e=e.replace(/{{year}}/g,String(t.year||"")),e=e.replace(/{{doi}}/g,t.doi||""),e=e.replace(/{{journal}}/g,t.journal||"Academic Paper"),e=e.replace(/{{url}}/g,t.url||""),e=e.replace(/{{abstract}}/g,(t.abstract||"").replace(/\n/g,`
> `)),e=e.replace(/{{aiSummary}}/g,(t.aiSummary||"").replace(/\n/g,`
> `)),e=e.replace(/{{bibtex}}/g,t.bibtex||""),e=e.replace(/{{selectedText}}/g,(t.selectedText||"").replace(/\n/g,`
> `));const n=["literature-note","academic"],s=(t.tags||[]).map(l=>l.trim().toLowerCase().replace(/^#/,"")).filter(Boolean),c=Array.from(new Set([...n,...s])),u=c.map(l=>`  - ${l}`).join(`
`),p=c.join(", ");return e=e.replace(/{{tags_yaml}}/g,u),e=e.replace(/{{tags}}/g,p),e.includes(`tags:
  - literature-note
  - academic
---`)?e=e.replace(`tags:
  - literature-note
  - academic
---`,`tags:
${u}
---`):e.includes(`tags:
  - literature-note
  - academic\r
---`)&&(e=e.replace(`tags:
  - literature-note
  - academic\r
---`,`tags:
${u}\r
---`)),e=e.replace(/{{#if_doi}}([\s\S]*?){{\/if_doi}}/g,t.doi?"$1":""),e=e.replace(/{{#if_selection}}([\s\S]*?){{\/if_selection}}/g,t.selectedText?"$1":""),e=e.replace(/{{#if_abstract}}([\s\S]*?){{\/if_abstract}}/g,t.abstract?"$1":""),e=e.replace(/{{#if_ai_summary}}([\s\S]*?){{\/if_ai_summary}}/g,t.aiSummary?"$1":""),e.trim()}static getTargetFilePath(t,a="Literature"){return`${a?`${a.replace(/^\/+|\/+$/g,"")}/`:""}@${t.citekey}.md`}static buildObsidianUri(t,a){const e=this.renderMarkdown(t,a.template),o=`${a.folderPath?`${a.folderPath.replace(/^\/+|\/+$/g,"")}/`:""}@${t.citekey}`,i=(a.vaultName||"").trim(),n=i?`vault=${encodeURIComponent(i)}&`:"",s=a.overwriteExisting?"&overwrite=true":"";return`obsidian://new?${n}file=${encodeURIComponent(o)}&content=${encodeURIComponent(e)}${s}`}static buildPluginUri(t,a){const e={action:"capture",data:t,settings:{folderPath:a.folderPath,vaultName:a.vaultName,template:a.template}};return`obsidian://citation?action=capture&data=${encodeURIComponent(JSON.stringify(e))}`}static async sendViaLocalRest(t,a,e=globalThis.fetch){const r=a.localRestPort||27124,o=a.localRestToken;if(!o)return{success:!1,message:"Local REST API token is required in Options."};const i=this.getTargetFilePath(t,a.folderPath),n=this.renderMarkdown(t,a.template),s=`https://127.0.0.1:${r}/vault/${encodeURIComponent(i)}`;try{const c=await e(s,{method:"PUT",headers:{Authorization:`Bearer ${o}`,"Content-Type":"text/markdown"},body:n});return c.ok?{success:!0,message:`Successfully wrote ${i} via Local REST API.`}:{success:!1,message:`REST API returned status ${c.status}: ${c.statusText}`}}catch(c){return{success:!1,message:`Failed to connect to Obsidian Local REST API: ${c.message}`}}}static async copyToClipboard(t){try{if(navigator.clipboard&&navigator.clipboard.writeText)return await navigator.clipboard.writeText(t),!0}catch(a){console.warn("Clipboard write failed:",a)}return!1}static async dispatch(t,a){switch(a.bridgeMode){case"local-rest":{const e=await this.sendViaLocalRest(t,a);return{success:e.success,mode:"local-rest",message:e.message}}case"plugin-protocol":{const e=this.buildPluginUri(t,a);return this.openUri(e),{success:!0,mode:"plugin-protocol",message:"Sent capture to Obsidian Companion Plugin.",uri:e}}case"clipboard":{const e=this.renderMarkdown(t,a.template),r=await this.copyToClipboard(e);return{success:r,mode:"clipboard",message:r?"Copied Markdown literature note to clipboard!":"Failed to copy to clipboard."}}case"obsidian-uri":default:{const e=this.buildObsidianUri(t,a);return this.openUri(e),{success:!0,mode:"obsidian-uri",message:"Created note via obsidian://new handler.",uri:e}}}}static buildOpenUri(t,a){const r=`${a.folderPath?`${a.folderPath.replace(/^\/+|\/+$/g,"")}/`:""}@${t.citekey}`,o=(a.vaultName||"").trim();return`obsidian://open?${o?`vault=${encodeURIComponent(o)}&`:""}file=${encodeURIComponent(r)}`}static openUri(t){if(typeof window<"u"&&window.document){let a=!1;try{const e=document.createElement("a");e.href=t,e.target="_self",e.style.display="none",document.body.appendChild(e),e.click(),a=!0,setTimeout(()=>{e.parentNode&&e.parentNode.removeChild(e)},1e3)}catch(e){console.warn("Anchor click error:",e)}if(!a)try{window.location.href=t}catch(e){console.warn("window.location.href error:",e)}}}}export{d as D,f as O};
