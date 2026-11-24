import express from 'express';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { KnowledgeBase } from './rag.js';
import { streamAnswer } from './llm.js';
import { synthesize, transcribe, fishEnabled } from './fish.js';

const kb = new KnowledgeBase();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ── CORS: the widget is embedded on your website and calls this server ──
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Simple per-IP rate limit to protect paid API keys ──
const hits = new Map();
function rateLimit(limit, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}|${req.path}`;
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) hits.set(key, { start: now, n: 1 });
    else if (++h.n > limit) return res.status(429).json({ error: 'Too many requests, please slow down.' });
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (now - h.start > 120_000) hits.delete(k); }, 60_000).unref();

const normLang = (l) => (l === 'ta' ? 'ta' : 'en');

app.get('/api/config', (_req, res) => {
  res.json({
    orgName: config.orgName,
    assistantName: config.assistantName,
    supportPhone: config.supportPhone,
    emergencyPhone: config.emergencyPhone,
    voice: fishEnabled() ? 'fish' : 'browser',
    mode: config.hasLLM ? 'llm' : 'extractive',
    chunks: kb.docs.length,
  });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── Chat: retrieve → stream grounded answer as speakable sentences (SSE) ──
app.post('/api/chat', express.json({ limit: '32kb' }), rateLimit(30, 60_000), async (req, res) => {
  const question = String(req.body?.message || '').trim().slice(0, 500);
  const lang = normLang(req.body?.lang);
  const history = Array.isArray(req.body?.history)
    ? req.body.history.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    : [];
  if (!question) return res.status(400).json({ error: 'message is required' });

  const t0 = Date.now();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const abort = new AbortController();
  res.on('close', () => abort.abort());

  // Search with the last user turn too, so follow-ups like "what about Sunday?" still find context.
  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content || '';
  let passages = kb.search(question, { k: 4 });
  if (passages.length < 2 && lastUser) {
    const extra = kb.search(`${lastUser} ${question}`, { k: 3 });
    for (const p of extra) if (!passages.some((x) => x.text === p.text)) passages.push(p);
    passages = passages.slice(0, 4);
  }
  send('sources', passages.map(({ title, source }) => ({ title, source })));

  const splitter = new SentenceSplitter((s) => send('sentence', { text: s }));
  try {
    const { mode } = await streamAnswer(
      { question, lang, history, passages },
      (delta) => splitter.push(delta),
      abort.signal,
    );
    splitter.flush();
    send('done', { ms: Date.now() - t0, mode });
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error('[chat]', err?.status || '', err?.message || err);
      splitter.flush();
      send('error', {
        text: lang === 'ta'
          ? `மன்னிக்கவும், ஒரு சிறிய பிரச்சனை ஏற்பட்டது. ${config.supportPhone} என்ற எண்ணை அழைக்கவும்.`
          : `Sorry, I'm having a little trouble right now. Please call us at ${config.supportPhone}.`,
      });
    }
  }
  res.end();
});

// ── Text-to-speech (Fish Audio). 503 → widget falls back to the browser voice ──
app.post('/api/tts', express.json({ limit: '16kb' }), rateLimit(120, 60_000), async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 600);
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (!fishEnabled()) return res.status(503).json({ error: 'TTS not configured' });
  try {
    const audio = await synthesize(text, normLang(req.body?.lang));
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(audio);
  } catch (err) {
    console.error('[tts]', err.message);
    res.status(503).json({ error: 'TTS failed' });
  }
});

// ── Speech-to-text fallback for browsers without built-in speech recognition ──
app.post('/api/stt', express.raw({ type: () => true, limit: '8mb' }), rateLimit(30, 60_000), async (req, res) => {
  if (!fishEnabled()) return res.status(503).json({ error: 'STT not configured' });
  if (!req.body?.length) return res.status(400).json({ error: 'audio body is required' });
  try {
    const text = await transcribe(req.body, normLang(req.query.lang));
    res.json({ text });
  } catch (err) {
    console.error('[stt]', err.message);
    res.status(502).json({ error: 'Transcription failed' });
  }
});

// ── Re-index knowledge after `npm run ingest` or editing knowledge/*.md ──
app.post('/api/admin/reindex', (req, res) => {
  if (!config.adminToken || req.headers.authorization !== `Bearer ${config.adminToken}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.json({ chunks: kb.load() });
});

app.use(express.static(path.join(ROOT, 'public'), { maxAge: '1h' }));

/** Turns a token stream into natural sentences for TTS, without breaking "Dr. Ramesh" or "₹1,499". */
export class SentenceSplitter {
  static ABBR = /(?:\b(?:Dr|Mr|Mrs|Ms|No|St|Rd|Prof|Sr|Jr|vs|etc|e\.g|i\.e|approx|Ph|Ltd|Ave)\.|\b[A-Z]\.)$/;
  constructor(emit) { this.emit = emit; this.buf = ''; this.count = 0; }
  push(text) {
    this.buf += text;
    const re = /[.!?।]+["')\]]*\s+|\n+/g;
    let m, start = 0, pending = '';
    while ((m = re.exec(this.buf))) {
      const end = m.index + m[0].length;
      const piece = this.buf.slice(start, end);
      if (ABBR_TEST(this.buf.slice(0, m.index + 1))) continue;
      pending += piece;
      start = end;
      // First sentence goes out immediately (fast first audio); later ones are merged to ≥ 40 chars.
      if (this.count === 0 || pending.trim().length >= 40) { this.out(pending); pending = ''; }
    }
    this.buf = pending + this.buf.slice(start);
  }
  out(s) { const t = s.replace(/\s+/g, ' ').trim(); if (t) { this.count++; this.emit(t); } }
  flush() { this.out(this.buf); this.buf = ''; }
}
const ABBR_TEST = (s) => SentenceSplitter.ABBR.test(s);

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'server', 'index.js')) {
  app.listen(config.port, () => {
    console.log(`\n  🎙️  ${config.assistantName} voice agent for ${config.orgName}`);
    console.log(`  → Demo:        http://localhost:${config.port}`);
    console.log(`  → Knowledge:   ${kb.docs.length} chunks`);
    console.log(`  → Answers:     ${config.hasLLM ? `Claude (${config.claudeModel}, effort ${config.claudeEffort})` : 'extractive mode (set ANTHROPIC_API_KEY for conversational answers)'}`);
    console.log(`  → Voice:       ${fishEnabled() ? `Fish Audio (${config.fishTtsModel})` : 'browser voice (set FISH_API_KEY for natural voice)'}\n`);
  });
}

export { app, kb };
