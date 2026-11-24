// End-to-end: real server process, with local mocks standing in for Claude and Fish Audio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { decode } from '@msgpack/msgpack';

const seen = { claude: [], fishTts: [], fishAsr: [] };
let mock, server, base;

function sse(res, events) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  res.end();
}

function claudeReply(text) {
  const msg = { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } };
  return [
    { type: 'message_start', message: msg },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...text.match(/.{1,12}/gs).map((t) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 30 } },
    { type: 'message_stop' },
  ];
}

before(async () => {
  mock = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    if (req.url.startsWith('/v1/messages')) {
      const json = JSON.parse(body);
      seen.claude.push({ headers: req.headers, body: json });
      return sse(res, claudeReply('Sure! Dr. Ramesh Kumar sees patients on Monday, Wednesday and Friday, from 10 AM to 2 PM. His consultation fee is 800 rupees.'));
    }
    if (req.url === '/v1/tts') {
      seen.fishTts.push({ headers: req.headers, body: decode(body) });
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      return res.end(Buffer.from('ID3fake-mp3-bytes'));
    }
    if (req.url === '/v1/asr') {
      seen.fishAsr.push({ headers: req.headers, body: decode(body) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ text: 'cardiology timings', duration: 1.2, segments: [] }));
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => mock.listen(0, r));
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;
  const port = 3900 + Math.floor(Math.random() * 90);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env, PORT: String(port),
      ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: mockUrl, ANTHROPIC_AUTH_TOKEN: '',
      FISH_API_KEY: 'test-fish', FISH_API_BASE: mockUrl, FISH_VOICE_ID_EN: 'voice-en-123',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write(d));
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

after(() => { server?.kill(); mock?.close(); });

async function chat(message, lang = 'en') {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, lang, history: [{ role: 'assistant', content: 'Hi!' }] }),
  });
  const text = await res.text();
  return text.trim().split('\n\n').map((b) => ({ event: /^event: (.*)$/m.exec(b)[1], data: JSON.parse(/^data: (.*)$/m.exec(b)[1]) }));
}

test('chat streams grounded sentences with sources', async () => {
  const events = await chat('When is the cardiologist available?');
  const sentences = events.filter((e) => e.event === 'sentence').map((e) => e.data.text);
  assert.equal(sentences[0], 'Sure!');
  assert.ok(sentences.join(' ').includes('Dr. Ramesh Kumar sees patients'));
  assert.equal(events.find((e) => e.event === 'sources').data[0].title, 'Doctors — Cardiology (heart specialists)');
  assert.equal(events.at(-1).event, 'done');

  const req = seen.claude.at(-1);
  assert.equal(req.body.model, 'claude-opus-5-5');
  assert.equal(req.body.fallbacks, 'default');
  assert.match(req.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(req.body.messages[0].role, 'user', 'leading assistant turn must be dropped');
  const prompt = req.body.messages.at(-1).content;
  assert.match(prompt, /<website_content>[\s\S]*Dr\. Ramesh Kumar[\s\S]*<\/website_content>/);
  assert.match(req.body.system, /Answer ONLY using facts inside <website_content>/);
});

test('Tamil requests ask Claude to reply in Tamil', async () => {
  await chat('இதய மருத்துவர் நேரம்', 'ta');
  assert.match(seen.claude.at(-1).body.messages.at(-1).content, /Reply in Tamil/);
});

test('TTS proxies to Fish Audio with msgpack body, model header and voice', async () => {
  const res = await fetch(`${base}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Hello there!', lang: 'en' }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'audio/mpeg');
  const call = seen.fishTts.at(-1);
  assert.equal(call.headers.authorization, 'Bearer test-fish');
  assert.equal(call.headers.model, 's1');
  assert.equal(call.body.text, 'Hello there!');
  assert.equal(call.body.reference_id, 'voice-en-123');
  assert.equal(call.body.format, 'mp3');

  // Second identical request is served from cache.
  const n = seen.fishTts.length;
  await fetch(`${base}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Hello there!', lang: 'en' }) });
  assert.equal(seen.fishTts.length, n);
});

test('STT forwards recorded audio to Fish ASR', async () => {
  const res = await fetch(`${base}/api/stt?lang=en`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: new Uint8Array([1, 2, 3, 4]) });
  assert.deepEqual(await res.json(), { text: 'cardiology timings' });
  const call = seen.fishAsr.at(-1);
  assert.deepEqual([...call.body.audio], [1, 2, 3, 4]);
  assert.equal(call.body.language, 'en');
});

test('config endpoint and widget are served', async () => {
  const cfg = await (await fetch(`${base}/api/config`)).json();
  assert.equal(cfg.voice, 'fish');
  assert.equal(cfg.mode, 'llm');
  assert.ok((await fetch(`${base}/widget.js`)).ok);
});
