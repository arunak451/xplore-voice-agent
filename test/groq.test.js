// End-to-end with Groq as the LLM: real server process against a local mock of Groq's API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

const seen = [];
let mock, server, base;

before(async () => {
  mock = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (req.url !== '/openai/v1/chat/completions') return res.writeHead(404).end();
    seen.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks)) });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const t of 'Sure! Dr. Ramesh Kumar is available Monday to Friday. His fee is 800 rupees.'.match(/.{1,10}/gs)) {
      res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: t } }] })}\n\n`);
    }
    res.end('data: [DONE]\n\n');
  });
  await new Promise((r) => mock.listen(0, r));
  const port = 4000 + Math.floor(Math.random() * 90);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env, PORT: String(port), ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', FISH_API_KEY: '',
      GROQ_API_KEY: 'gsk_test', GROQ_API_BASE: `http://127.0.0.1:${mock.address().port}/openai/v1`,
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

test('Groq answers stream as sentences, with history, grounding and the system prompt', async () => {
  const history = [
    { role: 'user', content: 'When is the cardiologist available?' },
    { role: 'assistant', content: 'Dr. Ramesh Kumar sees patients Monday, Wednesday and Friday.' },
  ];
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'what about his fee?', lang: 'en', history }),
  });
  const events = (await res.text()).trim().split('\n\n')
    .map((b) => ({ event: /^event: (.*)$/m.exec(b)[1], data: JSON.parse(/^data: (.*)$/m.exec(b)[1]) }));

  const said = events.filter((e) => e.event === 'sentence').map((e) => e.data.text).join(' ');
  assert.match(said, /800 rupees/);
  assert.equal(events.at(-1).event, 'done');
  assert.equal(events.at(-1).data.mode, 'llm');

  const req = seen.at(-1);
  assert.equal(req.headers.authorization, 'Bearer gsk_test');
  assert.equal(req.body.stream, true);
  assert.equal(req.body.messages[0].role, 'system');
  assert.deepEqual(req.body.messages.slice(1, 3), history);
  assert.match(req.body.messages.at(-1).content, /Cardiology[\s\S]*Visitor: what about his fee\?/);

  const cfg = await (await fetch(`${base}/api/config`)).json();
  assert.equal(cfg.mode, 'llm');
});
