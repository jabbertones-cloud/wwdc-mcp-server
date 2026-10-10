import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
const transport = new StdioClientTransport({command:process.execPath,args:[path.join(process.cwd(),'dist/index.js')],env:process.env});
const client = new Client({name:'aiscent-live-apple-research',version:'1.0.0'});
try{
  await client.connect(transport);
  const listed=await client.listTools();
  const names=new Set(listed.tools.map(t=>t.name));
  console.log('WWDC_MCP_CONNECTED',names.size,'TOOLS');
  const calls=[
    ['wwdc_export_status',{}],
    ['wwdc_search',{query:'SwiftUI NavigationSplitView sidebar macOS sidebar navigation labels HIG',kinds:['session','doc','hig'],limit:5,detail:'compact'}],
    ['wwdc_search',{query:'SwiftUI TabView selection navigation iOS tab bar content safe area',kinds:['session','doc','hig'],limit:5,detail:'compact'}],
    ['apple_hig_search',{query:'tab bars buttons navigation macOS sidebar',limit:5}],
    ['wwdc_search',{query:'String Catalog localization locale language regional fallback SwiftUI LocalizedStringResource',kinds:['session','doc','hig'],limit:5,detail:'compact'}],
  ];
  for(const [name,args] of calls){
    if(!names.has(name)){console.log('WWDC_TOOL_NOT_ADVERTISED',name);continue;}
    try{
      const result=await client.callTool({name,arguments:args});
      console.log('WWDC_TOOL',name,'QUERY',args.query||'status','IS_ERROR',Boolean(result.isError));
      for(const c of result.content||[])if(c.type==='text')console.log('RESULT',c.text.slice(0,11000));
    }catch(err){console.log('WWDC_TOOL_ERROR',name,String(err).slice(0,500));}
  }
}finally{await client.close();}
