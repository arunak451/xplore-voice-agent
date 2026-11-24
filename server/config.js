import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = (k, d = '') => (process.env[k] ?? '').trim() || d;

export const config = {
  port: Number(env('PORT', '3000')),
  allowedOrigins: env('ALLOWED_ORIGINS', '*').split(',').map((s) => s.trim()).filter(Boolean),

  orgName: env('ORG_NAME', 'Xplore Hospital'),
  assistantName: env('ASSISTANT_NAME', 'Priya'),
  supportPhone: env('SUPPORT_PHONE', '+91 44 4000 1234'),
  emergencyPhone: env('EMERGENCY_PHONE', '+91 44 4000 1108'),

  claudeModel: env('CLAUDE_MODEL', 'claude-opus-5-5'),
  claudeEffort: env('CLAUDE_EFFORT', 'low'),
  groqApiKey: env('GROQ_API_KEY'),
  groqApiBase: env('GROQ_API_BASE', 'https://api.groq.com/openai/v1'),
  groqModel: env('GROQ_MODEL', 'openai/gpt-oss-120b'),
  // Which LLM answers: Groq if its key is set, else Claude, else none (extractive mode).
  llmProvider: env('GROQ_API_KEY') ? 'groq' : (env('ANTHROPIC_API_KEY') || env('ANTHROPIC_AUTH_TOKEN')) ? 'claude' : '',

  fishApiKey: env('FISH_API_KEY'),
  fishApiBase: env('FISH_API_BASE', 'https://api.fish.audio'),
  fishTtsModel: env('FISH_TTS_MODEL', 's1'),
  fishVoice: { en: env('FISH_VOICE_ID_EN'), ta: env('FISH_VOICE_ID_TA') },

  adminToken: env('ADMIN_TOKEN'),
  knowledgeDir: path.join(ROOT, 'knowledge'),
  crawledFile: path.join(ROOT, 'data', 'crawled.json'),
};
config.hasLLM = Boolean(config.llmProvider);
