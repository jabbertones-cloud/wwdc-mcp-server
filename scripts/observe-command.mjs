#!/usr/bin/env node
import {spawn} from "node:child_process";import fs from "node:fs";import path from "node:path";import crypto from "node:crypto";
const [,,name,...cmd]=process.argv;if(!name||!cmd.length){console.error("usage: observe-command <name> <command...>");process.exit(2)}
const started=new Date(),t=Date.now();const child=spawn(cmd[0],cmd.slice(1),{stdio:"inherit",env:process.env});
child.on("exit",(code,signal)=>{const ended=new Date(),repo=path.basename(process.cwd()),status=code===0?"passed":"failed";
 const raw=JSON.stringify({repo,name,started:started.toISOString(),ended:ended.toISOString(),code,signal});
 const row={schemaVersion:"experiment-observation.v1",observationId:crypto.createHash("sha256").update(raw).digest("hex").slice(0,32),
 source:{system:"generic",artifact:path.join(process.cwd(),".artifacts","experiment-observations.v1.jsonl"),producer:repo},
 experiment:{kind:"test",name,campaign:repo,scenario:name},
 timing:{observedAt:ended.toISOString(),startedAt:started.toISOString(),endedAt:ended.toISOString(),durationMs:Date.now()-t},
 outcome:{status,exitCode:code??undefined,failureClass:status==="failed"?"command_failure":undefined},
 provenance:{integrity:"observed",command:cmd.join(" ")},metadata:{signal:signal??null}};
 const out=path.join(process.cwd(),".artifacts","experiment-observations.v1.jsonl");fs.mkdirSync(path.dirname(out),{recursive:true});fs.appendFileSync(out,JSON.stringify(row)+"\n");process.exit(code??1);
});
