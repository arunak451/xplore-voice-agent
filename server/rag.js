// Lightweight, dependency-free retrieval (BM25) over website content.
// Sources: knowledge/*.md (one chunk per "## " section) + data/crawled.json (from `npm run ingest`).
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const STOP = new Set(
  ('a an the is are was were be been am do does did of to in on at for from by with and or not no ' +
    'what whats which who whom when where why how can could would should will shall may might must ' +
    'i me my we our you your u he she it they them this that these those there here please tell ' +
    'know want need like get got give have has had any some about into than then so if just also ' +
    'hi hello hey ok okay thanks thank sir madam mam ma').split(' '),
);

// Tamil (and Tanglish) → English keywords, so Tamil questions match English website content.
// Extend this with words your visitors actually use.
const GLOSSARY = {
  மருத்துவர்: 'doctor', டாக்டர்: 'doctor', டாக்டர்கள்: 'doctors', மருத்துவர்கள்: 'doctors',
  நேரம்: 'timings hours', நேரங்கள்: 'timings hours', டைமிங்: 'timings', மணி: 'hours',
  திறந்திருக்கும்: 'open timings', திறக்கும்: 'open timings',
  காப்பீடு: 'insurance', இன்சூரன்ஸ்: 'insurance', கேஷ்லெஸ்: 'cashless insurance',
  சந்திப்பு: 'appointment', அப்பாயிண்ட்மெண்ட்: 'appointment', அப்பாயின்ட்மென்ட்: 'appointment', முன்பதிவு: 'book appointment',
  கட்டணம்: 'fee charges', கட்டணங்கள்: 'fee charges', பீஸ்: 'fee', விலை: 'price fee', செலவு: 'cost fee',
  அவசர: 'emergency', அவசரம்: 'emergency', அவசரநிலை: 'emergency', ஆம்புலன்ஸ்: 'ambulance',
  இதய: 'heart cardiology', இதயம்: 'heart cardiology', எலும்பு: 'orthopaedics bones joints', மூட்டு: 'joints orthopaedics',
  குழந்தை: 'child paediatrics', குழந்தைகள்: 'child paediatrics', கர்ப்பம்: 'pregnancy gynaecology', பெண்கள்: 'women gynaecology',
  பல்: 'dental', கண்: 'eye ophthalmology', தோல்: 'skin dermatology', காது: 'ent ear', மூளை: 'neurology',
  முகவரி: 'address location', இடம்: 'location address', எங்கே: 'location address', வழி: 'directions',
  பார்க்கிங்: 'parking', மருந்தகம்: 'pharmacy', மருந்து: 'pharmacy medicines', பரிசோதனை: 'test laboratory checkup',
  ஸ்கேன்: 'scan', ரிப்போர்ட்: 'reports', அறிக்கை: 'reports', பார்வையாளர்: 'visiting visitors', தொலைபேசி: 'phone contact', போன்: 'phone contact', எண்: 'number contact',
  ஞாயிறு: 'sunday', ஞாயிற்றுக்கிழமை: 'sunday', திங்கள்: 'monday', சனி: 'saturday',
  செக்கப்: 'checkup', பேக்கேஜ்: 'package',
};

// English synonyms that visitors use but websites phrase differently.
const SYNONYMS = {
  timing: 'hours', timings: 'hours', time: 'hours', open: 'hours', opening: 'hours', close: 'hours', closing: 'hours',
  cost: 'fee', price: 'fee', charge: 'fee', charges: 'fee', fees: 'fee', much: 'fee',
  book: 'appointment', booking: 'appointment', schedule: 'appointment', slot: 'appointment', consult: 'consultation',
  heart: 'cardiology', cardiologist: 'cardiology', bone: 'orthopaedics', bones: 'orthopaedics', ortho: 'orthopaedics', orthopedic: 'orthopaedics', orthopedics: 'orthopaedics',
  child: 'paediatrics', children: 'paediatrics', kids: 'paediatrics', baby: 'paediatrics', pediatrician: 'paediatrics', pediatrics: 'paediatrics', paediatrician: 'paediatrics',
  pregnancy: 'gynaecology', pregnant: 'gynaecology', gynecologist: 'gynaecology', gynecology: 'gynaecology', gynaecologist: 'gynaecology',
  skin: 'dermatology', dermatologist: 'dermatology', teeth: 'dental', tooth: 'dental', dentist: 'dental', eye: 'ophthalmology', eyes: 'ophthalmology',
  neurologist: 'neurology', brain: 'neurology', ear: 'ent', nose: 'ent', throat: 'ent',
  where: 'address', located: 'location', directions: 'location', reach: 'location', metro: 'location',
  insurer: 'insurance', mediclaim: 'insurance', tpa: 'insurance', policy: 'insurance', cashless: 'insurance',
  phone: 'contact', number: 'contact', call: 'contact', whatsapp: 'contact', email: 'contact',
  medicine: 'pharmacy', medicines: 'pharmacy', chemist: 'pharmacy', test: 'laboratory', tests: 'laboratory', blood: 'laboratory', lab: 'laboratory', report: 'reports',
  visitor: 'visiting', visitors: 'visiting', visit: 'visiting', checkup: 'check', health: 'check',
  pay: 'payment', upi: 'payment', card: 'payment',
};

export function tokenize(text) {
  const out = [];
  for (let w of String(text).toLowerCase().normalize('NFC').split(/[^\p{L}\p{M}\p{N}]+/u)) {
    if (!w || STOP.has(w)) continue;
    if (GLOSSARY[w]) { out.push(w, ...GLOSSARY[w].split(' ')); continue; }
    // Tamil words carry suffixes (e.g. மருத்துவரின்); match on known glossary prefixes.
    if (/\p{Script=Tamil}/u.test(w)) {
      const hit = Object.keys(GLOSSARY).find((k) => k.length >= 2 && w.startsWith(k));
      if (hit) out.push(w, ...GLOSSARY[hit].split(' '));
      else out.push(w);
      continue;
    }
    if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1); // light plural stemming
    out.push(w);
    if (SYNONYMS[w]) out.push(SYNONYMS[w]);
  }
  return out;
}

function chunkText(text, max = 900) {
  const paras = text.split(/\n\s*\n|\n(?=[-•*] )/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length > max) { chunks.push(cur); cur = ''; }
    if (p.length > max) {
      for (const s of p.match(/[^.!?]+[.!?]*\s*/g) || [p]) {
        if (cur.length + s.length > max && cur) { chunks.push(cur); cur = ''; }
        cur += s;
      }
    } else cur += (cur ? '\n' : '') + p;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

function loadMarkdown(dir) {
  const docs = [];
  if (!fs.existsSync(dir)) return docs;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    let raw = fs.readFileSync(path.join(dir, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    let source = `/${file.replace(/\.md$/, '')}`;
    const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
    if (fm) {
      source = fm[1].match(/^source:\s*(.+)$/m)?.[1].trim() || source;
      raw = raw.slice(fm[0].length);
    }
    for (const sec of raw.split(/^## /m).slice(1)) {
      const [title, ...body] = sec.split('\n');
      const text = body.join('\n').trim();
      if (text) for (const c of chunkText(text)) docs.push({ title: title.trim(), text: c, source });
    }
  }
  return docs;
}

function loadCrawled(file) {
  if (!fs.existsSync(file)) return [];
  const pages = JSON.parse(fs.readFileSync(file, 'utf8'));
  return pages.flatMap((p) => chunkText(p.text).map((c) => ({ title: p.title, text: c, source: p.url })));
}

export class KnowledgeBase {
  constructor() { this.load(); }

  load() {
    this.docs = [...loadMarkdown(config.knowledgeDir), ...loadCrawled(config.crawledFile)];
    this.df = new Map();
    let total = 0;
    for (const d of this.docs) {
      // Title tokens are counted twice: headings are strong relevance signals.
      d.tokens = [...tokenize(d.title), ...tokenize(d.title), ...tokenize(d.text)];
      d.tf = new Map();
      for (const t of d.tokens) d.tf.set(t, (d.tf.get(t) || 0) + 1);
      for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
      total += d.tokens.length;
    }
    this.avgLen = total / Math.max(1, this.docs.length);
    return this.docs.length;
  }

  /** BM25 search. Returns [{title, text, source, score}] best first, below-threshold results removed. */
  search(query, { k = 4, minScore = 1.2 } = {}) {
    const q = [...new Set(tokenize(query))];
    if (!q.length) return [];
    const N = this.docs.length, k1 = 1.4, b = 0.7;
    const scored = this.docs.map((d) => {
      let s = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        const n = this.df.get(t);
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        s += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.tokens.length) / this.avgLen));
      }
      return { d, s };
    });
    scored.sort((a, z) => z.s - a.s);
    const top = scored[0]?.s || 0;
    return scored
      .filter((x) => x.s >= minScore && x.s >= top * 0.35)
      .slice(0, k)
      .map(({ d, s }) => ({ title: d.title, text: d.text, source: d.source, score: +s.toFixed(2) }));
  }
}
