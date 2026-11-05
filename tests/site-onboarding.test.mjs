import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {load} from 'cheerio';

const html = fs.readFileSync(new URL('../website/index.html', import.meta.url), 'utf8');
const $ = load(html);

test('first-time visitor receives a working hosted-first connection path', () => {
  assert.equal($('a.btn.primary').attr('href'), '#connect');
  assert.equal($('section#connect').length, 1);
  assert.match($('section#connect').text(), /no Node\.js installation, local index, or Apple account is required/i);
  assert.match($('section#connect pre').first().text(), /^https:\/\/wwdc-mcp\.smatdesigns\.com\/mcp$/);
  assert.match($('section#connect').text(), /actually used the tools/i);
  assert.ok(html.indexOf('id="connect"') < html.indexOf('id="tools"'), 'first-time connection precedes the tool catalog');
  assert.ok(html.indexOf('id="connect"') < html.indexOf('id="local"'));
});

test('local setup is accurate and never instructs obsolete Ollama configuration', () => {
  assert.equal($('section#local').length, 1);
  assert.match($('section#local pre').first().text(), /npm ci/);
  assert.match($('section#local').text(), /Hugging Face Transformers\/ONNX/);
  assert.doesNotMatch(html, /ollama pull|OLLAMA_BASE|OLLAMA_EMBED_MODEL/i);
  assert.doesNotMatch(html, /Takes about a minute/i);
});

test('first-time users see compatible install choices and clear trust boundaries', () => {
  assert.match($('section#connect').text(), /client that supports remote Streamable HTTP/i);
  assert.ok($('section#connect a[href$="/releases/latest"]').length >= 1);
  assert.ok($('nav a[href="/support"]').length >= 1);
  assert.ok($('a.skip-link[href="#main-content"]').length === 1);
  assert.ok($('main#main-content').length === 1);
  assert.match($('main').text(), /not affiliated with or endorsed by Apple or OpenAI/i);
  assert.doesNotMatch(html, /it has to pull evidence/i);
  assert.doesNotMatch(html, /with full transcripts|works with Codex, Claude, Cursor, Windsurf, and Zed|Audit this app against/i);
  assert.match($('code').filter((_, el) => $(el).text() === 'swift_app_audit').parent().text(), /does not inspect your app source or run your app/i);
  assert.match($('div.prompt').text(), /flag anything the index cannot verify/i);
});
