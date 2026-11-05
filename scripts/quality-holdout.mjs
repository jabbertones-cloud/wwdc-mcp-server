import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const db=process.env.WWDC_HOLDOUT_DB;
if(!db || !fs.existsSync(db)) throw Error('Set WWDC_HOLDOUT_DB to an existing, read-only Apple research corpus snapshot.');
const worktrees=[
  ['baseline',process.env.WWDC_BASELINE_ROOT],
  ['candidate',process.env.WWDC_CANDIDATE_ROOT??process.cwd()],
];
const jobs=[
  ['iPhone keyboard bug','swift_app_audit',{focus:'navigation',platforms:['iOS'],frameworks:['SwiftUI'],feature:'NavigationStack with search TextField and menu',symptom:'Keyboard covers menu on iPhone and will not dismiss',year_min:2024,limit:6,format:'json'}],
  ['macOS status-item bug','swift_app_audit',{focus:'macos',platforms:['macOS'],frameworks:['AppKit'],feature:'NSStatusItem menu bar control',symptom:'The status item menu does not open',year_min:2024,limit:6,format:'json'}],
  ['NavigationStack exact (2026)','wwdc_search',{query:'NavigationStack',year:2026,kinds:['session'],limit:5,format:'json'}],
  ['NavigationStack exact (2025)','wwdc_search',{query:'NavigationStack',year:2025,kinds:['session'],limit:5,format:'json'}],
  ['Search keyboard dismissal','wwdc_search',{query:'search keyboard dismiss',year_min:2024,kinds:['session'],limit:5,format:'json'}],
  ['Broad SwiftUI query','wwdc_search',{query:'SwiftUI',kinds:['session'],limit:5,format:'json'}],
  ['Typo query','wwdc_search',{query:'SwftUI navigatoin',kinds:['session'],limit:5,format:'json'}],
  ['Nonexistent symbol','wwdc_search',{query:'InventedUnicornNavigationView',kinds:['session'],limit:5,format:'json'}],
];
for(const [name,root] of worktrees) if(!root || !fs.existsSync(root+'/dist/index.js')) throw Error('Build and set '+name+' root; cannot benchmark missing executable.');
const report={captured_at:new Date().toISOString(),corpus_size_bytes:fs.statSync(db).size,results:{}};
for(const [name,root] of worktrees){
  const transport=new StdioClientTransport({command:process.execPath,args:[root+'/dist/index.js'],env:{...process.env,WWDC_MCP_DB:db,WWDC_SKIP_EMBEDDINGS:'1',NPM_CONFIG_UPDATE_NOTIFIER:'false'},stderr:'ignore'});
  const c=new Client({name:'appdev-adversarial-benchmark',version:'1.0'},{capabilities:{}});
  await c.connect(transport);
  report.results[name]={};
  for(const [label,tool,args] of jobs){
    const t=performance.now();
    const r=await c.callTool({name:tool,arguments:args});
    let d={};try{d=JSON.parse(r.content.find(p=>p.text)?.text??'{}')}catch{}
    const isAudit=tool==='swift_app_audit';
    report.results[name][label]={latency_ms:Math.round(performance.now()-t),error:r.isError===true,
      readiness:isAudit?d.summary?.readiness:d.judgment?.answer_readiness,
      band:isAudit?d.summary?.readiness_band:d.judgment?.relevance_band,
      caveats:isAudit?d.summary?.caveats:d.judgment?.caveats,
      total:isAudit?d.results?.sessions?.length:d.total,
      sources:isAudit?d.results?.sessions?.map(h=>({id:h.id,title:h.title})):d.hits?.map(h=>({id:h.id,title:h.title,band:h.judgment?.relevance_band})),
      doc_hints:isAudit?d.doc_hints?.map(h=>h.id):undefined,
      fallback:d.fallback,
    };
  }
  await c.close();
}
for(const [label] of jobs){console.log('CASE',label);for(const [name] of worktrees)console.log(name,JSON.stringify(report.results[name][label]).slice(0,1300))}
const base=report.results.baseline, candidate=report.results.candidate;
const failures=[];
if(base['iPhone keyboard bug'].readiness!=='ready_for_code_review') failures.push('baseline did not reproduce false readiness');
if(candidate['iPhone keyboard bug'].readiness==='ready_for_code_review' || candidate['iPhone keyboard bug'].band==='high') failures.push('iPhone bug still overclaims review readiness');
if(candidate['iPhone keyboard bug'].sources?.some(row=>/mac app|appkit|watchos/i.test(row.title))) failures.push('wrong-platform audit source');
if(candidate['NavigationStack exact (2026)'].total!==0) failures.push('exact symbol query broadened into unrelated session results');
if(!candidate['NavigationStack exact (2025)'].sources?.some(row=>row.id==='wwdc2025-275')) failures.push('known exact API citation lost');
if(candidate['Search keyboard dismissal'].sources?.[0]?.id!=='wwdc2026-292') failures.push('known keyboard dismissal evidence lost');
if(candidate['Typo query'].total!==0) failures.push('typo query must not fabricate matches');
report.verdict={pass:failures.length===0,failures};
const outfile=process.env.WWDC_HOLDOUT_REPORT??path.join(os.tmpdir(),`appdev-quality-benchmark-${process.pid}.json`);
fs.writeFileSync(outfile,JSON.stringify(report,null,2));
console.log('BENCHMARK_WRITTEN',outfile,'bytes',fs.statSync(outfile).size);
const metric={metric:'misleading_high_readiness_in_two_bug_audits',baseline:['iPhone keyboard bug','macOS status-item bug'].filter(x=>base[x].readiness==='ready_for_code_review').length,candidate:['iPhone keyboard bug','macOS status-item bug'].filter(x=>candidate[x].readiness==='ready_for_code_review').length,direction:'lower',failures};
console.log(JSON.stringify(metric));
if(failures.length) process.exitCode=1;
