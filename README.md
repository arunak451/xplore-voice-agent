# Xplore Voice Agent 🎙️

A human-like **voice receptionist for your website**. Visitors tap the mic, ask their question out loud
("When is the cardiologist available?", "Do you take Star Health insurance?"), and get a warm, spoken
answer in seconds, taken **only from your website content**. Works in **English and Tamil**.

It's built to cut calls to the support line: doctors, timings, insurance, appointments, directions and
fees are all answered instantly, 24×7.

```html
<!-- The only change your website needs: -->
<script src="https://YOUR-VOICE-SERVER/widget.js" defer data-lang="en"></script>
```

---

## How it works

```
 Visitor speaks ──► ① Speech-to-Text ──► ② Retrieve (RAG) ──► ③ Claude ──► ④ Text-to-Speech ──► Visitor hears
   (browser mic)     browser engine /      BM25 search over     grounded,      Fish Audio, sentence
                     Fish Audio ASR        your site content    streamed       by sentence
```

| # | Requirement | How it's done |
|---|---|---|
| 1 | Voice input | Browser mic, tap-to-talk orb with live transcript. Tap again to interrupt the assistant at any time. |
| 2 | Speech-to-Text | The browser's built-in recognition (Chrome, Edge, Safari) with `en-IN` / `ta-IN`. Firefox falls back to recording plus **Fish Audio ASR** with automatic silence detection. |
| 3 | LLM + RAG | Your pages are split into sections and indexed. The best 4 matches go to **Claude** with strict grounding rules. |
| 4 | Natural TTS | **Fish Audio** voice (pick any voice ID). Falls back to the browser voice if Fish is unavailable. |
| 5 | Human-like | Receptionist persona, short spoken replies, natural numbers and times. Hands-free: after answering, it listens again automatically. |
| 6 | Website embed | One `<script>` tag. A floating button opens a panel. Shadow DOM, so it never clashes with your site's CSS. Full-screen on mobile, dark mode. |
| 7 | English + Tamil | Language toggle. Tamil speech recognition, Tamil replies, Tamil voice, and a Tamil→English keyword glossary so Tamil questions find English content. |
| 8 | Under 2–3 s | Answer streams token by token. The first sentence is sent to TTS before the rest is written. Repeated phrases are cached. Claude runs at `effort: low`. |
| 9 | No hallucination | Answers only from retrieved website text. Off-topic questions retrieve nothing, and the assistant says so and gives the phone number. No medical advice. Emergencies get the ambulance number. |

---

## Quick start

Requires **Node.js 20+**.

```bash
npm install
```

```bash
cp .env.example .env
```

Edit `.env` and set an LLM key, either `GROQ_API_KEY` (free tier at console.groq.com) or `ANTHROPIC_API_KEY`,
plus `FISH_API_KEY` if you have one. Then start the server:

```bash
npm start
```

Open **http://localhost:3000** to see a demo hospital site with the assistant embedded.

> **Without `GROQ_API_KEY` or `ANTHROPIC_API_KEY`** the agent still works in *extractive mode*: it reads out the best matching
> passage word for word. That can't hallucinate, but it sounds less conversational.
> **Without `FISH_API_KEY`** it uses the browser's built-in voice.

---

## Load YOUR website content

**Option A: crawl your site automatically**

```bash
npm run ingest -- https://www.your-hospital.com --max 100
```

This follows `sitemap.xml` and internal links, respects `robots.txt`, and writes `data/crawled.json`.
Restart the server to use the new content.

**Option B: hand-written knowledge (most accurate)**

Edit or add Markdown files in `knowledge/`. Every `## Heading` becomes one searchable section:

```markdown
## Doctors — Cardiology (heart specialists)
Dr. Ramesh Kumar, Senior Cardiologist. Available Monday, Wednesday and Friday, 10 AM to 2 PM. Fee ₹800.
```

Tips for the best answers:
- One topic per section, with a descriptive heading, e.g. "Insurance and cashless treatment".
- Put the words visitors actually say in headings, e.g. "(heart specialists)".
- **`knowledge/hospital.md` is SAMPLE DATA.** Replace it with your real details before going live.

You can use both options together. To reload without a restart, set `ADMIN_TOKEN` and call:

```bash
curl -X POST https://YOUR-VOICE-SERVER/api/admin/reindex -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Embed on your website

```html
<script src="https://YOUR-VOICE-SERVER/widget.js" defer
        data-lang="en"
        data-color="#0ea5a4"
        data-color2="#6366f1"
        data-position="right"></script>
```

| Attribute | Meaning |
|---|---|
| `data-lang` | Starting language: `en` or `ta` |
| `data-color`, `data-color2` | Brand gradient colours |
| `data-position` | `right` or `left` |
| `data-server` | API server URL, if different from where `widget.js` is served |

JavaScript API, e.g. for your own "Ask us" button:

```js
XploreVoiceAgent.open();
XploreVoiceAgent.ask('Do you accept Star Health insurance?');
```

Set `ALLOWED_ORIGINS=https://www.your-hospital.com` in `.env` so only your site can use the server.
The microphone requires **HTTPS** on the live site (localhost is fine for testing).

---

## Configuration (`.env`)

| Variable | Default | Notes |
|---|---|---|
| `ORG_NAME`, `ASSISTANT_NAME` | Xplore Hospital, Priya | Used in the greeting and persona |
| `SUPPORT_PHONE`, `EMERGENCY_PHONE` | — | Given when an answer isn't on the site, or for emergencies |
| `GROQ_API_KEY` | — | Enables conversational answers through Groq. When set, Groq is used instead of Claude |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Any chat model ID listed at console.groq.com/docs/models |
| `ANTHROPIC_API_KEY` | — | Enables conversational answers through Claude |
| `CLAUDE_MODEL` | `claude-opus-5-5` | `claude-haiku-5-5` is faster and much cheaper for high traffic |
| `CLAUDE_EFFORT` | `low` | `low` gives the fastest replies |
| `FISH_API_KEY` | — | Natural voice and the STT fallback |
| `FISH_TTS_MODEL` | `s1` | Fish model header |
| `FISH_VOICE_ID_EN`, `FISH_VOICE_ID_TA` | Fish default | Voice model IDs from fish.audio. Choose a warm, friendly voice for each language |
| `ALLOWED_ORIGINS` | `*` | Comma-separated list of sites allowed to embed |
| `ADMIN_TOKEN` | — | Protects `/api/admin/reindex` |

---

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/chat` `{message, lang, history}` | Server-Sent Events: `sources`, `sentence` (repeated), `done` or `error` |
| `POST /api/tts` `{text, lang}` | MP3 audio. Returns 503 when not configured, and the widget uses the browser voice |
| `POST /api/stt?lang=en` (raw audio body) | `{text}` via Fish Audio ASR |
| `GET /api/config` | Branding and which features are enabled |

All `/api` routes are rate-limited per IP to protect your API credits.

---

## Deploying

Any Node host works (Render, Railway, Fly.io, a VPS or EC2 with PM2, etc.):

```bash
npm ci --omit=dev
```

```bash
npm start
```

Set the `.env` values as environment variables on the host, serve over HTTPS, and add the script tag to your site.

## Tests

```bash
npm test
```

The end-to-end tests start the real server against local mocks of Claude and Fish Audio. They cover streaming,
grounding, Tamil replies, TTS/STT request format and caching, plus retrieval accuracy for typical questions.

## Project layout

```
server/index.js    Express server: chat (SSE), TTS, STT, CORS, rate limits
server/rag.js      BM25 retrieval + English synonyms + Tamil glossary
server/llm.js      Claude prompt, grounding rules, streaming, extractive fallback
server/fish.js     Fish Audio TTS / ASR client with audio cache
scripts/ingest.js  Website crawler → data/crawled.json
public/widget.js   The embeddable widget (no dependencies)
public/index.html  Demo website
knowledge/         Your content as Markdown (sample data included)
```
