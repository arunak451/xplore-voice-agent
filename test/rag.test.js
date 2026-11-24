import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KnowledgeBase, tokenize } from '../server/rag.js';
import { SentenceSplitter } from '../server/index.js';

const kb = new KnowledgeBase();
const top = (q) => kb.search(q)[0]?.title;

test('finds the right section for common visitor questions', () => {
  assert.equal(top('What are the cardiologist timings?'), 'Doctors — Cardiology (heart specialists)');
  assert.equal(top('Do you accept Star Health insurance?'), 'Insurance and cashless treatment');
  assert.equal(top('how do I book an appointment'), 'How to book an appointment');
  assert.equal(top('Is the hospital open on Sunday?'), 'Hospital timings and OPD hours');
  assert.equal(top('where are you located'), 'Address, location and directions');
  assert.equal(top('how much is the heart check package'), 'Health check-up packages');
});

test('Tamil questions reach English content through the glossary', () => {
  assert.ok(tokenize('காப்பீடு').includes('insurance'));
  assert.match(top('காப்பீடு ஏற்றுக்கொள்கிறீர்களா?'), /Insurance/);
  assert.ok(kb.search('இதய மருத்துவர் நேரம்').some((r) => r.title === 'Doctors — Cardiology (heart specialists)'));
});

test('off-topic questions return nothing (prevents made-up answers)', () => {
  assert.deepEqual(kb.search('what is the capital of France'), []);
  assert.deepEqual(kb.search('do you have a swimming pool'), []);
});

test('sentence splitter keeps "Dr." and prices intact and ships the first sentence early', () => {
  const out = [];
  const s = new SentenceSplitter((x) => out.push(x));
  for (const tok of 'Sure! Dr. Ramesh Kumar is available on Monday, Wednesday and Friday. The fee is ₹800. Would you like to know how to book?'.split(/(?<= )/)) s.push(tok);
  s.flush();
  assert.equal(out[0], 'Sure!');
  assert.ok(out.some((x) => x.includes('Dr. Ramesh Kumar is available')));
  assert.equal(out.join(' '), 'Sure! Dr. Ramesh Kumar is available on Monday, Wednesday and Friday. The fee is ₹800. Would you like to know how to book?');
});

test('follow-up questions use the previous turn ("his fee", "yes please")', async () => {
  const { retrieve } = await import('../server/index.js');
  const h = [
    { role: 'user', content: 'When is the cardiologist available?' },
    { role: 'assistant', content: 'Dr. Ramesh Kumar sees patients Monday, Wednesday and Friday, 10 AM to 2 PM. Would you like to know how to book an appointment?' },
  ];
  assert.match(retrieve('what about his fee?', h)[0].title, /Cardiology/);
  assert.match(retrieve('yes please', h)[0].title, /book an appointment/i);
  assert.match(retrieve('Do you accept Star Health insurance?', h)[0].title, /Insurance/);
});
