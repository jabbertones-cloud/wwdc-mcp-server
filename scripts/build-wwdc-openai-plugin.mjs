#!/usr/bin/env node
/** Builds the NEXT WWDC public plugin ZIP; never uploads/cancels an in-review release. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
execFileSync(process.execPath,[path.join(ROOT,'scripts','validate-wwdc-openai-plugin.mjs')],{stdio:'inherit'});
const dir=path.join(ROOT,'openai-public-plugin');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'plugin.json'),'utf8'));
const version=manifest.version;
const args=process.argv.slice(2);
const opt=args.indexOf('--out');
const target=opt>=0?path.resolve(args[opt+1]):path.join(ROOT,'_artifacts',`wwdc-openai-plugin-${version}-candidate.zip`);
assert.ok(!target.startsWith(dir+path.sep),'ZIP output must not be inside source directory');
fs.mkdirSync(path.dirname(target),{recursive:true});
const allow=['plugin.json','.agent-plugin/plugin.json','mcp.json','README.txt','icon.png','composer-icon.png','assets/icon.png','assets/composer-icon.png'];
assert.equal(allow.length,new Set(allow).size);
const names=allow.sort();
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wwdc-openai-zip-'));
try {
 for(const name of names){
  const source=path.join(dir,name), dest=path.join(tmp,name);
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);
 }
 fs.rmSync(target,{force:true});
 execFileSync('zip',['-q','-X',target,...names],{cwd:tmp,stdio:'pipe'});
 const entries=execFileSync('unzip',['-Z','-1',target],{encoding:'utf8'}).trim().split('\n').sort();
 assert.deepEqual(entries,names,'only allowlisted public files may enter ZIP');
 execFileSync('unzip',['-t',target],{stdio:'pipe'});
 const sha=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
 console.log(`[plugin:zip] ${target}`);
 console.log(`[plugin:zip] bytes=${fs.statSync(target).size} SHA256=${sha}`);
 console.log(`[plugin:zip] name=${manifest.name}, version=${version}, files=${entries.length}, submitted=false`);
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
