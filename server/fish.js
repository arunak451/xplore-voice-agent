// Fish Audio: text-to-speech + speech-to-text. Uses MessagePack, like the official SDKs.
import { encode } from '@msgpack/msgpack';
import { config } from './config.js';

export const fishEnabled = () => Boolean(config.fishApiKey);

const headers = (extra = {}) => ({
  Authorization: `Bearer ${config.fishApiKey}`,
  'Content-Type': 'application/msgpack',
  ...extra,
});

// Small in-memory LRU cache: greetings and common answers are spoken instantly.
const cache = new Map();
const CACHE_MAX = 300;

/** Returns an MP3 Buffer for `text`. Throws on failure (caller falls back to browser voice). */
export async function synthesize(text, lang = 'en', signal) {
  const voice = config.fishVoice[lang] || config.fishVoice.en || undefined;
  const key = `${lang}|${voice}|${text}`;
  if (cache.has(key)) {
    const buf = cache.get(key);
    cache.delete(key); cache.set(key, buf);
    return buf;
  }

  const body = {
    text,
    format: 'mp3',
    mp3_bitrate: 128,
    latency: 'balanced', // lower first-byte latency
    normalize: true, // speaks numbers/dates naturally
    chunk_length: 200,
  };
  if (voice) body.reference_id = voice;

  const res = await fetch(`${config.fishApiBase}/v1/tts`, {
    method: 'POST',
    headers: headers({ model: config.fishTtsModel }),
    body: encode(body),
    signal,
  });
  if (!res.ok) throw new Error(`Fish TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());

  cache.set(key, buf);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return buf;
}

/** Transcribe recorded audio (webm/ogg/mp3/wav bytes). Returns plain text. */
export async function transcribe(audio, lang = 'en', signal) {
  const res = await fetch(`${config.fishApiBase}/v1/asr`, {
    method: 'POST',
    headers: headers(),
    body: encode({ audio: new Uint8Array(audio), language: lang, ignore_timestamps: true }),
    signal,
  });
  if (!res.ok) throw new Error(`Fish ASR ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.text || '').trim();
}
