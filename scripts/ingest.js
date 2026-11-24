#!/usr/bin/env node
// Crawl your website and save its text as the assistant's knowledge base.
//   npm run ingest -- https://www.your-hospital.com            (crawl up to 60 pages)
//   npm run ingest -- https://www.your-hospital.com --max 200
// Output: data/crawled.json (picked up automatically on server start or POST /api/admin/reindex)
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { config } from '../server/config.js';

const args = process.argv.slice(2);
const start = args.find((a) => /^https?:\/\//.test(a));
const max = Number(args[args.indexOf('--max') + 1]) || 60;
if (!start) {
  console.error('Usage: npm run ingest -- https://your-website.com [--max 60]');
  process.exit(1);
}

const origin = new URL(start).origin;
const UA = 'VoiceAgentIngest/1.0 (+knowledge base crawler)';
const SKIP = /\.(pdf|jpe?g|png|gif|webp|svg|ico|css|js|json|xml|zip|mp4|mp3|docx?|xlsx?)(\?|$)/i;

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function robotsDisallow() {
  try {
    const txt = await (await get(`${origin}/robots.txt`)).text();
    const rules = [];
    let applies = false;
    for (const line of txt.split('\n')) {
      const [k, ...v] = line.split(':');
      const key = k.trim().toLowerCase(), val = v.join(':').trim();
      if (key === 'user-agent') applies = val === '*';
      else if (applies && key === 'disallow' && val) rules.push(val);
    }
    return rules;
  } catch { return []; }
}

async function sitemapUrls() {
  try {
    const $ = cheerio.load(await (await get(`${origin}/sitemap.xml`)).text(), { xmlMode: true });
    return $('loc').map((_, el) => $(el).text().trim()).get().filter((u) => u.startsWith(origin) && !u.endsWith('.xml'));
  } catch { return []; }
}

function extract(html, url) {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, iframe, template, form, [aria-hidden="true"], .cookie, #cookie-banner').remove();
  const title = ($('h1').first().text() || $('title').text() || url).replace(/\s+/g, ' ').trim();
  // Put block elements on their own lines so the text keeps its structure.
  $('h1,h2,h3,h4,h5,h6,p,li,tr,div,section,article,br,dd,dt').each((_, el) => { $(el).append('\n'); });
  const root = $('main').length ? $('main') : $('body');
  let text = root.text().replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  // Keep footer contact details even when a <main> exists.
  if ($('main').length && $('footer').length) text += '\n\n' + $('footer').text().replace(/\s+/g, ' ').trim();
  const links = $('a[href]').map((_, a) => $(a).attr('href')).get();
  return { title, text, links };
}

const disallow = await robotsDisallow();
const allowed = (u) => { const p = new URL(u).pathname; return !disallow.some((d) => p.startsWith(d)); };
const norm = (u) => { const x = new URL(u); x.hash = ''; return x.href.replace(/\/$/, ''); };

const queue = [norm(start), ...(await sitemapUrls()).map(norm)];
const seen = new Set();
const pages = [];
const seenText = new Set();

while (queue.length && pages.length < max) {
  const url = queue.shift();
  if (seen.has(url) || SKIP.test(url) || !allowed(url)) continue;
  seen.add(url);
  try {
    const res = await get(url);
    if (!(res.headers.get('content-type') || '').includes('text/html')) continue;
    const { title, text, links } = extract(await res.text(), url);
    const sig = text.slice(0, 500);
    if (text.length > 120 && !seenText.has(sig)) {
      seenText.add(sig);
      pages.push({ url, title, text });
      console.log(`✓ ${pages.length.toString().padStart(3)}  ${url}  (${text.length} chars)`);
    }
    for (const href of links) {
      try {
        const abs = norm(new URL(href, url).href);
        if (abs.startsWith(origin) && !seen.has(abs)) queue.push(abs);
      } catch { /* bad link */ }
    }
  } catch (e) {
    console.warn(`✗ ${url}: ${e.message}`);
  }
}

fs.mkdirSync(path.dirname(config.crawledFile), { recursive: true });
fs.writeFileSync(config.crawledFile, JSON.stringify(pages, null, 2));
console.log(`\nSaved ${pages.length} pages to ${path.relative(process.cwd(), config.crawledFile)}.`);
console.log('Restart the server (or POST /api/admin/reindex) to use the new content.');
