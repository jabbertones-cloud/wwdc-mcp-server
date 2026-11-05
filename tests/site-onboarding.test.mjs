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
  assert.ok(html.indexOf('id="connect"') < html.indexOf('id="local"'));
});

test('local setup is accurate and never instructs obsolete Ollama configuration', () => {
  assert.equal($('section#local').length, 1);
  assert.match($('section#local pre').first().text(), /npm ci/);
  assert.match($('section#local').text(), /Hugging Face Transformers\/ONNX/);
  assert.doesNotMatch(html, /ollama pull|OLLAMA_BASE|OLLAMA_EMBED_MODEL/i);
  assert.doesNotMatch(html, /Takes about a minute/i);
});

test('narrow mobile widths cannot force fixed 280px tool cards', () => {
  assert.match(html, /minmax\(min\(280px,100%\),1fr\)/);
  assert.match(html, /nav a\{display:inline-flex;align-items:center;min-height:44px/);
});

test('first-time users see compatible install choices and clear trust boundaries', () => {
  assert.match($('section#connect').text(), /client that supports remote Streamable HTTP/i);
  assert.ok($('section#connect a[href$="/releases/latest"]').length >= 1);
  assert.ok($('nav a[href="/support"]').length >= 1);
  assert.ok($('a.skip-link[href="#main-content"]').length === 1);
  assert.ok($('main#main-content').length === 1);
  assert.match($('main').text(), /not affiliated with or endorsed by Apple or OpenAI/i);
  assert.doesNotMatch(html, /it has to pull evidence/i);
});
