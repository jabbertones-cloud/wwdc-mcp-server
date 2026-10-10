import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(process.cwd(),'dist/index.js')],env:process.env});
const client=new Client({name:'aiscent-wwdc-research-followup',version:'1'});
try{
 await client.connect(transport);
 const calls=[
 ['wwdc_get_session',{id:'wwdc2025-323',include_transcript:true,transcript_chars:7500,include_chapters:true,include_related_docs:false,include_sample_code:false}],
 ['wwdc_get_session',{id:'wwdc2024-10147',include_transcript:true,transcript_chars:7500,include_chapters:true,include_related_docs:false,include_sample_code:false}],
 ['swift_app_audit',{focus:'navigation',platforms:['iOS','iPadOS','macOS'],frameworks:['SwiftUI'],feature:'TabView NavigationSplitView sidebar tab navigation',symptom:'disconnected onboarding action and overlapping tab bar',limit:5,year_min:2024}],
 ['swift_app_audit',{focus:'localization',platforms:['macOS','iOS'],frameworks:['SwiftUI','Foundation'],feature:'String Catalog and language regional fallback',symptom:'source localization key rendered untranslated in en-US',limit:5,year_min:2023}],
 ['apple_hig_search',{query:'Navigation',limit:7}],
 ['wwdc_search',{query:'localization',kinds:['session'],year_min:2023,limit:7}],
 ];
 for(const [name,args] of calls){
 try{let res=await client.callTool({name,arguments:args});console.log('===MCP',name,JSON.stringify(args),'IS_ERROR',!!res.isError);for(let c of res.content||[])if(c.type==='text')console.log(c.text.slice(0,13200));}catch(e){console.log('ERROR',name,String(e).slice(0,600));}
 }
}finally{await client.close();}
