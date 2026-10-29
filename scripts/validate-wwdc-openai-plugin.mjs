#!/usr/bin/env node
/** Validate the historical private WWDC plugin and the public submission candidate.
 * Optional --live probes only the existing public read-only production MCP.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const load=(p)=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const privateDir='chatgpt-direct-plugin';
const publicDir='openai-public-plugin';
const privateManifest=load(privateDir+'/.codex-plugin/plugin.json');
const publicManifest=load(publicDir+'/plugin.json');
const mirror=load(publicDir+'/.agent-plugin/plugin.json');
const publicMcp=load(publicDir+'/mcp.json');
const privateMcp=load(privateDir+'/.mcp.json');
const HTTPS=(s)=>{assert.equal(typeof s,'string');const u=new URL(s);assert.equal(u.protocol,'https:');assert.ok(!u.username&&!u.password);return u;};
function validateInterface(o){
 assert.ok(o&&typeof o==='object');
 for(const key of ['displayName','shortDescription','longDescription','developerName','category']){
  assert.ok(typeof o[key]==='string'&&o[key].trim(),`required interface field ${key}`);
 }
 assert.ok([...o.displayName].length<=30,'displayName <=30 characters');
 assert.ok([...o.shortDescription].length<=30,'shortDescription <=30 characters');
 assert.ok(!/[\r\n\t]/.test(o.shortDescription),'shortDescription must be single-line');
 assert.ok([...o.longDescription].length<=4000,'longDescription <=4000 characters');
 assert.ok([...o.developerName].length<=80,'developerName <=80 characters');
 assert.equal(o.category,'Developer Tools','category must match existing verified dashboard category');
 assert.ok(Array.isArray(o.capabilities)&&o.capabilities.length<=20);
 for(const c of o.capabilities)assert.ok(typeof c==='string'&&[...c].length<=120);
 for(const field of ['websiteURL','supportURL','privacyPolicyURL','termsOfServiceURL'])HTTPS(o[field]);
 assert.ok(o.websiteURL.includes('wwdcmcp.smatdesigns.com'),'use a working public website rather than the MCP 404 root');
}
function assertAligned(x){
 const root=x.interface, ext=x.extensions?.['com.openai']?.interface;
 validateInterface(root);validateInterface(ext);
 for(const k of ['displayName','shortDescription','category','developerName','websiteURL','supportURL','privacyPolicyURL','termsOfServiceURL'])assert.equal(root[k],ext[k],`root/extension mismatch: ${k}`);
}
assert.equal(privateManifest.name,'smat-wwdc-direct','preserve historical private plugin identity');
assert.equal(privateManifest.version,'0.1.0','preserve historical private plugin version');
assertAligned(privateManifest);
assert.equal(privateManifest.interface.shortDescription,'Apple developer evidence');
assert.equal(privateMcp.mcpServers.wwdc.url,'https://wwdc-mcp.smatdesigns.com/mcp');
assert.equal(publicManifest.name,'wwdc-apple-developer','preserve existing public plugin identity');
assert.equal(publicManifest.version,'0.2.6','this is a NEXT version candidate, not submitted 0.2.5');
assertAligned(publicManifest);
assert.deepEqual(publicManifest,mirror,'root and agent plugin manifest copies must agree');
assert.deepEqual(publicManifest.interface,publicManifest.extensions['com.openai'].interface,'public interfaces must not diverge');
assert.equal(publicManifest.interface.displayName,'WWDC');
assert.equal(publicManifest.interface.shortDescription,'Apple developer evidence');
assert.equal(publicMcp.mcpServers.wwdc.url,'https://wwdc-mcp.smatdesigns.com/mcp');
assert.equal(publicMcp.mcpServers.wwdc.extensions['com.openai'].auth.type,'none');
const ext=publicManifest.extensions['com.openai'];
assert.equal(ext.review.commerce,false);
HTTPS(ext.review.demo_recording_url);
const positives=ext.review.test_cases.positive;
const negatives=ext.review.test_cases.negative;
assert.equal(positives.length,5,'initial public submission requires exactly five positive reviewer cases');
assert.equal(negatives.length,3,'initial public submission requires exactly three negative reviewer cases');
for(const c of [...positives,...negatives]){
 for(const f of ['description','prompt','expected_behavior'])assert.ok(typeof c[f]==='string'&&c[f].trim(),`missing ${f}`);
}
for(const c of positives)assert.ok(typeof c.tools_triggered==='string'&&c.tools_triggered.trim(),'positive test must name the actual tool');
for(const c of negatives)assert.ok(/refuse|cannot|do not|not able|no write|read-only/i.test(c.expected_behavior),'negative expected behavior must enforce boundaries');
const translations=ext.publication.translations;
assert.equal(Object.keys(translations).length,38,'preserve 38 translated listings');
for(const [lang,item] of Object.entries(translations)){
 assert.ok(lang&&/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(lang));
 assert.ok(typeof item.subtitle==='string'&&item.subtitle.trim()&&!/[\r\n\t]/.test(item.subtitle));
 assert.ok([...item.subtitle].length<=30,`overlong locale subtitle ${lang}: ${[...item.subtitle].length}`);
 assert.ok(typeof item.description==='string'&&item.description.trim());
 assert.ok([...item.description].length<=4000,`overlong locale description ${lang}`);
}
const needed=['plugin.json','.agent-plugin/plugin.json','mcp.json','assets/icon.png','assets/composer-icon.png','icon.png','composer-icon.png','README.txt'];
for(const f of needed){const p=path.join(ROOT,publicDir,f);assert.ok(fs.statSync(p).size>0,`missing asset ${f}`)}
for(const f of ['assets/icon.png','assets/composer-icon.png','icon.png','composer-icon.png']){
 const data=fs.readFileSync(path.join(ROOT,publicDir,f));
 assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a',`invalid PNG ${f}`);
 const width=data.readUInt32BE(16),height=data.readUInt32BE(20);
 assert.ok(width>=128&&height>=128&&width===height,`square artwork required ${f}`);
}
assert.ok(!JSON.stringify(publicManifest).includes('test_credentials'),'do not include credentials in submission metadata');
assert.ok(!JSON.stringify(publicManifest).includes('reviewer_instructions'),'reviewer instructions must use dashboard');
// Assert the validator actually detects the originally reported regressions.
for(const bad of ['x'.repeat(31),'\tinvalid']){
 assert.throws(()=>validateInterface({...publicManifest.interface,shortDescription:bad}));
}
assert.throws(()=>assertAligned({...publicManifest,extensions:{'com.openai':{interface:{...publicManifest.interface,category:'Other'}}}}));
console.log('[plugin] private metadata aligned; public candidate 0.2.6 validated; 38 locales, 5+3 reviewer cases and artwork verified');
if(process.argv.includes('--live')){
 const server=publicMcp.mcpServers.wwdc.url;
 const post=async(method,params,id=1)=>{
  const r=await fetch(server,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(20000)});
  assert.equal(r.status,200,`${method} HTTP ${r.status}`);
  const raw=await r.text();
  let response;try{response=JSON.parse(raw)}catch{const data=raw.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim()).join('');response=JSON.parse(data)}
  assert.ok(!response.error,`${method} error ${JSON.stringify(response.error)}`);
  return response.result;
 };
 const list=(await post('tools/list',{},1)).tools;
 assert.equal(list.length,45,'live WWDC MCP should expose exactly 45 tools');
 const names=new Set(list.map(t=>t.name));
 for(const t of list){
  assert.ok(t.description?.trim(),`tool description missing: ${t.name}`);
  assert.equal(t.annotations?.readOnlyHint,true,`${t.name} missing readOnlyHint`);
  assert.equal(t.annotations?.destructiveHint,false,`${t.name} destructive`);
 }
 for(const c of positives)assert.ok(names.has(c.tools_triggered),`review references nonexistent tool: ${c.tools_triggered}`);
 const inputs={
  wwdc_ingest_status:{limit:3,format:'json'},
  wwdc_list_years:{format:'json'},
  wwdc_search:{query:'SwiftUI performance',year:2026,kinds:['session'],limit:5,format:'json'},
  appstore_guidelines_search:{query:'in-app purchases subscriptions',limit:5,format:'json'},
  wwdc_security_manifest:{format:'json'},
 };
 for(const c of positives){
  const name=c.tools_triggered;
  const result=await post('tools/call',{name,arguments:inputs[name]},2);
  assert.ok(!result.isError,`live reviewer tool failed: ${name}`);
  const text=(result.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
  assert.ok(text.length>10,`empty reviewer response: ${name}`);
  const json=JSON.parse(text);
  if(name==='wwdc_search'||name==='appstore_guidelines_search')assert.ok(json.hits.length>0,`${name} no indexed evidence`);
  if(name==='wwdc_list_years')assert.ok(json.years.some(x=>x.year===2026));
  if(name==='wwdc_security_manifest')assert.equal(json.tool_count,45);
  if(name==='wwdc_ingest_status')assert.ok(json.status?.length>0);
  console.log(`[plugin:live] ${name} passed`);
 }
 for(const url of [publicManifest.interface.websiteURL,publicManifest.interface.supportURL,publicManifest.interface.privacyPolicyURL,publicManifest.interface.termsOfServiceURL,ext.review.demo_recording_url]){
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200,`${url} HTTP ${response.status}`);
  if(url.endsWith('.mp4'))assert.ok(response.headers.get('content-type')?.startsWith('video/mp4'),'demo must be video/mp4');
  else assert.ok(response.headers.get('content-type')?.startsWith('text/html'),`legal/website must be HTML ${url}`);
  console.log(`[plugin:live] ${url} HTTP 200`);
  await response.body?.cancel();
 }
 console.log('[plugin:live] 45/45 read-only tools, 5 reviewer tool calls, and public URLs verified');
}
