/*!
 * Xplore Voice Agent — embeddable voice receptionist widget.
 * Usage:
 *   <script src="https://YOUR-SERVER/widget.js" defer
 *           data-lang="en" data-color="#0ea5a4" data-color2="#6366f1" data-position="right"></script>
 * Optional: data-server="https://YOUR-SERVER" (defaults to the script's origin).
 * JS API: window.XploreVoiceAgent.open() / .close() / .ask("question")
 */
(() => {
  if (window.XploreVoiceAgent) return;

  const script = document.currentScript || [...document.scripts].find((s) => /widget\.js(\?|$)/.test(s.src));
  const ds = script?.dataset || {};
  const SERVER = (ds.server || (script?.src ? new URL(script.src, location.href).origin : location.origin)).replace(/\/$/, '');
  const C1 = ds.color || '#0ea5a4';
  const C2 = ds.color2 || '#6366f1';
  const SIDE = ds.position === 'left' ? 'left' : 'right';

  const store = {
    get(k) { try { return localStorage.getItem('xva:' + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('xva:' + k, v); } catch { /* private mode */ } },
  };

  let cfg = { orgName: 'our hospital', assistantName: 'Priya', supportPhone: '', emergencyPhone: '', voice: 'browser', mode: 'extractive' };
  let lang = store.get('lang') || (ds.lang === 'ta' ? 'ta' : 'en');
  let muted = store.get('muted') === '1';

  // ───────────────────────────── i18n ─────────────────────────────
  const T = {
    en: {
      role: 'Virtual receptionist',
      online: 'Online · answers in voice',
      idle: 'Tap the mic and ask me anything',
      listening: 'Listening…',
      transcribing: 'Got it, one moment…',
      thinking: 'Let me check that for you…',
      speaking: 'Speaking · tap to interrupt',
      placeholder: 'Or type your question…',
      greeting: (n, o) => `Hi there! I'm ${n}, the virtual receptionist at ${o}. You can ask me about our doctors, timings, insurance or how to book an appointment. Just tap the mic and speak!`,
      chips: ['Doctor timings', 'How do I book an appointment?', 'Which insurance do you accept?', 'Are you open on Sunday?', 'Where are you located?', 'Health check-up packages'],
      teaser: 'Hi! Have a question? Just ask me 👋',
      noMic: "I can't access your microphone. Please allow mic access, or type your question below.",
      noStt: "Voice input isn't available in this browser. Please type your question below.",
      notHeard: "Sorry, I didn't catch that. Tap the mic and try again.",
      offline: "I'm having trouble connecting. Please check your internet or call us.",
      from: 'Source',
      call: 'Call',
      footer: 'Answers come only from our website',
      mic: 'Talk to the assistant', stop: 'Stop', send: 'Send', close: 'Close', mute: 'Mute voice', unmute: 'Turn voice on',
      open: 'Talk to our receptionist',
    },
    ta: {
      role: 'மெய்நிகர் வரவேற்பாளர்',
      online: 'ஆன்லைனில் · குரலில் பதில்',
      idle: 'மைக்கைத் தட்டி உங்கள் கேள்வியைக் கேளுங்கள்',
      listening: 'கேட்கிறேன்…',
      transcribing: 'புரிந்தது, ஒரு நிமிடம்…',
      thinking: 'பார்த்துச் சொல்கிறேன்…',
      speaking: 'பேசுகிறேன் · நிறுத்த தட்டவும்',
      placeholder: 'அல்லது உங்கள் கேள்வியை தட்டச்சு செய்யவும்…',
      greeting: (n, o) => `வணக்கம்! நான் ${n}, ${o}-இன் மெய்நிகர் வரவேற்பாளர். எங்கள் மருத்துவர்கள், நேரங்கள், காப்பீடு அல்லது அப்பாயிண்ட்மெண்ட் பற்றி கேளுங்கள். மைக்கைத் தட்டி பேசுங்கள்!`,
      chips: ['மருத்துவர் நேரங்கள்', 'அப்பாயிண்ட்மெண்ட் எப்படி புக் செய்வது?', 'எந்த காப்பீடு ஏற்றுக்கொள்கிறீர்கள்?', 'ஞாயிற்றுக்கிழமை திறந்திருக்குமா?', 'மருத்துவமனை முகவரி என்ன?'],
      teaser: 'வணக்கம்! ஏதாவது கேள்வியா? என்னிடம் கேளுங்கள் 👋',
      noMic: 'மைக்ரோஃபோனை அணுக முடியவில்லை. அனுமதி கொடுக்கவும் அல்லது கேள்வியை தட்டச்சு செய்யவும்.',
      noStt: 'இந்த உலாவியில் குரல் உள்ளீடு இல்லை. உங்கள் கேள்வியை தட்டச்சு செய்யவும்.',
      notHeard: 'மன்னிக்கவும், சரியாக கேட்கவில்லை. மீண்டும் மைக்கைத் தட்டி முயற்சிக்கவும்.',
      offline: 'இணைப்பில் சிக்கல் உள்ளது. இணையத்தை சரிபார்க்கவும் அல்லது எங்களை அழைக்கவும்.',
      from: 'ஆதாரம்',
      call: 'அழைக்க',
      footer: 'பதில்கள் எங்கள் இணையதளத்தில் இருந்து மட்டுமே',
      mic: 'உதவியாளரிடம் பேசுங்கள்', stop: 'நிறுத்து', send: 'அனுப்பு', close: 'மூடு', mute: 'குரலை நிறுத்து', unmute: 'குரலை இயக்கு',
      open: 'வரவேற்பாளரிடம் பேசுங்கள்',
    },
  };
  const t = (k) => T[lang][k];

  // ───────────────────────────── icons ─────────────────────────────
  const I = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="3"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  };

  // ───────────────────────────── styles ─────────────────────────────
  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .root {
    --c1: ${C1}; --c2: ${C2};
    --bg: #ffffff; --bg2: #f4f7fb; --fg: #0f172a; --muted: #64748b; --line: #e2e8f0;
    --bot: #f1f5f9; --shadow: 0 24px 60px -12px rgba(15, 23, 42, .35), 0 8px 20px -8px rgba(15, 23, 42, .2);
    font-family: "Inter", "Noto Sans Tamil", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 15px; line-height: 1.5; color: var(--fg);
    position: fixed; ${SIDE}: 24px; bottom: 24px; z-index: 2147483000;
    -webkit-font-smoothing: antialiased;
  }
  @media (prefers-color-scheme: dark) {
    .root { --bg: #0f172a; --bg2: #111c33; --fg: #e2e8f0; --muted: #94a3b8; --line: #1e293b; --bot: #1e293b; }
  }
  button { font: inherit; cursor: pointer; border: 0; background: none; color: inherit; }
  button:focus-visible, input:focus-visible { outline: 3px solid color-mix(in srgb, var(--c1) 55%, transparent); outline-offset: 2px; }
  svg { width: 100%; height: 100%; display: block; }

  /* ── Launcher ── */
  .launcher {
    width: 64px; height: 64px; border-radius: 50%; color: #fff; position: relative;
    background: linear-gradient(135deg, var(--c1), var(--c2));
    box-shadow: 0 10px 30px -6px color-mix(in srgb, var(--c2) 60%, transparent), inset 0 1px 0 rgba(255,255,255,.35);
    display: grid; place-items: center; transition: transform .25s cubic-bezier(.34,1.56,.64,1);
  }
  .launcher:hover { transform: scale(1.07); }
  .launcher .ic { width: 28px; height: 28px; }
  .launcher::before, .launcher::after {
    content: ""; position: absolute; inset: 0; border-radius: 50%;
    border: 2px solid var(--c1); opacity: 0; animation: ping 2.8s ease-out infinite;
  }
  .launcher::after { animation-delay: 1.4s; }
  @keyframes ping { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(1.7); opacity: 0; } }
  .open .launcher { display: none; }

  .teaser {
    position: absolute; bottom: 76px; ${SIDE}: 0; width: max-content; max-width: 240px;
    background: var(--bg); color: var(--fg); padding: 12px 36px 12px 16px; border-radius: 16px;
    border-bottom-${SIDE}-radius: 4px;
    box-shadow: var(--shadow); font-size: 14px; font-weight: 500;
    animation: pop .45s cubic-bezier(.34,1.56,.64,1) both; cursor: pointer;
  }
  .teaser .x { position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; padding: 3px; color: var(--muted); border-radius: 50%; }
  .teaser .x:hover { background: var(--bg2); }
  @keyframes pop { from { opacity: 0; transform: translateY(10px) scale(.9); } to { opacity: 1; transform: none; } }

  /* ── Panel ── */
  .panel {
    position: absolute; bottom: 0; ${SIDE}: 0; width: 390px; height: min(680px, calc(100vh - 48px));
    background: var(--bg); border-radius: 24px; box-shadow: var(--shadow); overflow: hidden;
    display: none; flex-direction: column; border: 1px solid var(--line);
    transform-origin: bottom ${SIDE};
  }
  .open .panel { display: flex; animation: panelIn .4s cubic-bezier(.22,1,.36,1) both; }
  @keyframes panelIn { from { opacity: 0; transform: translateY(16px) scale(.96); } to { opacity: 1; transform: none; } }

  .head {
    position: relative; padding: 16px 16px 18px; color: #fff; display: flex; align-items: center; gap: 12px;
    background: linear-gradient(135deg, var(--c1), var(--c2));
  }
  .head::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(120% 120% at 100% 0%, rgba(255,255,255,.22), transparent 55%);
  }
  .avatar {
    width: 44px; height: 44px; border-radius: 50%; flex: none; position: relative;
    background: radial-gradient(circle at 32% 30%, #fff 0 8%, rgba(255,255,255,.55) 18%, transparent 45%), linear-gradient(135deg, rgba(255,255,255,.35), rgba(255,255,255,.08));
    border: 2px solid rgba(255,255,255,.55); display: grid; place-items: center; font-weight: 700; font-size: 18px;
  }
  .avatar .dot { position: absolute; right: -1px; bottom: -1px; width: 12px; height: 12px; border-radius: 50%; background: #22c55e; border: 2px solid #fff; }
  .who { flex: 1; min-width: 0; z-index: 1; }
  .who b { display: block; font-size: 16px; font-weight: 700; letter-spacing: -.01em; }
  .who b, .who span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .who span { display: block; font-size: 12.5px; opacity: .9; }
  .hbtn { width: 34px; height: 34px; padding: 8px; border-radius: 50%; z-index: 1; color: #fff; flex: none; }
  .hbtn:hover { background: rgba(255,255,255,.18); }
  .lang { display: flex; background: rgba(255,255,255,.18); border-radius: 999px; padding: 3px; z-index: 1; flex: none; }
  .lang button { color: #fff; font-size: 12.5px; font-weight: 600; padding: 4px 10px; border-radius: 999px; opacity: .85; }
  .lang button[aria-pressed="true"] { background: #fff; color: var(--c2); opacity: 1; }

  .msgs { flex: 1; overflow-y: auto; padding: 18px 16px 8px; display: flex; flex-direction: column; gap: 12px; background: var(--bg2); scroll-behavior: smooth; }
  .msg { flex: none; max-width: 86%; padding: 10px 14px; border-radius: 18px; word-wrap: break-word; animation: pop .3s ease-out both; white-space: pre-wrap; }
  .msg.user { align-self: flex-end; color: #fff; border-bottom-right-radius: 6px; background: linear-gradient(135deg, var(--c1), var(--c2)); }
  .msg.bot { align-self: flex-start; background: var(--bg); border: 1px solid var(--line); border-bottom-left-radius: 6px; }
  .msg.bot.err { border-color: #fca5a5; }
  .msg .src { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .msg .src span { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--muted); background: var(--bg2); border: 1px solid var(--line); padding: 2px 8px; border-radius: 999px; }
  .msg .src svg { width: 11px; height: 11px; }
  .typing { display: inline-flex; gap: 4px; padding: 4px 0; }
  .typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); animation: bounce 1.2s infinite; }
  .typing i:nth-child(2) { animation-delay: .15s; } .typing i:nth-child(3) { animation-delay: .3s; }
  @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .4; } 30% { transform: translateY(-5px); opacity: 1; } }

  .chips { display: flex; gap: 8px; overflow-x: auto; padding: 10px 16px 4px; background: var(--bg2); scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chip { flex: none; font-size: 13px; padding: 7px 12px; border-radius: 999px; background: var(--bg); border: 1px solid var(--line); color: var(--fg); transition: all .2s; }
  .chip:hover { border-color: var(--c1); color: var(--c1); transform: translateY(-1px); }

  /* ── Voice stage ── */
  .stage { padding: 14px 16px 10px; display: flex; flex-direction: column; align-items: center; gap: 8px; border-top: 1px solid var(--line); background: var(--bg); }
  .orbwrap { position: relative; width: 84px; height: 84px; display: grid; place-items: center; }
  .ring { position: absolute; inset: 0; border-radius: 50%; background: linear-gradient(135deg, var(--c1), var(--c2)); opacity: 0; }
  .orb {
    width: 72px; height: 72px; border-radius: 50%; color: #fff; position: relative; z-index: 1;
    background: radial-gradient(circle at 30% 28%, rgba(255,255,255,.55), transparent 42%), linear-gradient(135deg, var(--c1), var(--c2));
    box-shadow: 0 12px 28px -8px color-mix(in srgb, var(--c2) 70%, transparent), inset 0 -6px 14px rgba(0,0,0,.12);
    display: grid; place-items: center; transition: transform .2s;
    animation: breathe 3.6s ease-in-out infinite;
  }
  .orb:hover { transform: scale(1.05); }
  .orb:active { transform: scale(.96); }
  .orb .ic { width: 30px; height: 30px; }
  .bars { display: none; gap: 4px; align-items: center; height: 30px; }
  .bars i { width: 4px; height: 100%; border-radius: 4px; background: #fff; transform: scaleY(.3); }
  @keyframes breathe { 0%, 100% { box-shadow: 0 12px 28px -8px color-mix(in srgb, var(--c2) 70%, transparent), 0 0 0 0 color-mix(in srgb, var(--c1) 35%, transparent); } 50% { box-shadow: 0 12px 28px -8px color-mix(in srgb, var(--c2) 70%, transparent), 0 0 0 10px color-mix(in srgb, var(--c1) 0%, transparent); } }

  [data-state="listening"] .ring { animation: ripple 1.6s ease-out infinite; }
  [data-state="listening"] .ring.r2 { animation-delay: .8s; }
  [data-state="listening"] .orb { animation: none; transform: scale(calc(1 + var(--level, 0) * .25)); background: radial-gradient(circle at 30% 28%, rgba(255,255,255,.55), transparent 42%), linear-gradient(135deg, #f43f5e, #f97316); box-shadow: 0 12px 28px -8px rgba(244,63,94,.6); }
  [data-state="listening"] .ring { background: linear-gradient(135deg, #f43f5e, #f97316); }
  @keyframes ripple { 0% { transform: scale(.85); opacity: .5; } 100% { transform: scale(1.55); opacity: 0; } }

  [data-state="thinking"] .orb { animation: none; }
  [data-state="thinking"] .orb::before {
    content: ""; position: absolute; inset: -5px; border-radius: 50%;
    background: conic-gradient(from 0deg, transparent 0 60%, var(--c1) 80%, var(--c2));
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  [data-state="speaking"] .orb .ic { display: none; }
  [data-state="speaking"] .bars { display: flex; }
  [data-state="speaking"] .bars i { animation: eq 1s ease-in-out infinite; }
  [data-state="speaking"] .bars i:nth-child(2) { animation-delay: -.8s; } [data-state="speaking"] .bars i:nth-child(3) { animation-delay: -.45s; }
  [data-state="speaking"] .bars i:nth-child(4) { animation-delay: -.65s; } [data-state="speaking"] .bars i:nth-child(5) { animation-delay: -.2s; }
  @keyframes eq { 0%, 100% { transform: scaleY(.3); } 50% { transform: scaleY(1); } }

  .status { font-size: 13px; color: var(--muted); min-height: 20px; text-align: center; font-weight: 500; }
  .live { font-size: 14px; color: var(--fg); font-style: italic; text-align: center; min-height: 0; max-width: 100%; }
  .live:empty { display: none; }

  .composer { display: flex; gap: 8px; padding: 6px 12px 10px; background: var(--bg); }
  .composer input {
    flex: 1; min-width: 0; font: inherit; font-size: 14.5px; color: var(--fg); background: var(--bg2);
    border: 1px solid var(--line); border-radius: 999px; padding: 10px 16px; outline: none; transition: border-color .2s;
  }
  .composer input:focus { border-color: var(--c1); }
  .composer button { width: 42px; height: 42px; padding: 11px; border-radius: 50%; color: #fff; background: linear-gradient(135deg, var(--c1), var(--c2)); flex: none; transition: opacity .2s; }
  .composer button:disabled { opacity: .4; cursor: default; }

  .foot .disc { min-width: 0; }
  .foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 0 16px 12px; font-size: 11.5px; color: var(--muted); background: var(--bg); }
  .foot a { color: var(--c1); text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .foot a svg { width: 12px; height: 12px; }

  @media (max-width: 480px) {
    .root { ${SIDE}: 16px; bottom: 16px; }
    .open.root { inset: 0; }
    .open .panel { position: fixed; inset: 0; width: 100%; height: 100%; border-radius: 0; border: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition: none !important; }
  }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `;

  // ───────────────────────────── DOM ─────────────────────────────
  const host = document.createElement('div');
  host.id = 'xplore-voice-agent';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>${CSS}</style>
    <div class="root" data-state="idle">
      <button class="launcher" aria-haspopup="dialog"><span class="ic">${I.mic}</span></button>
      <section class="panel" role="dialog" aria-modal="false">
        <header class="head">
          <div class="avatar" aria-hidden="true"><span class="ini"></span><span class="dot"></span></div>
          <div class="who"><b class="name"></b><span class="sub"></span></div>
          <div class="lang" role="group" aria-label="Language">
            <button data-l="en">EN</button><button data-l="ta">தமிழ்</button>
          </div>
          <button class="hbtn mutebtn"></button>
          <button class="hbtn closebtn">${I.close}</button>
        </header>
        <div class="msgs" aria-live="polite"></div>
        <div class="chips"></div>
        <div class="stage">
          <div class="orbwrap">
            <span class="ring"></span><span class="ring r2"></span>
            <button class="orb"><span class="ic">${I.mic}</span><span class="bars"><i></i><i></i><i></i><i></i><i></i></span></button>
          </div>
          <div class="status" aria-live="polite"></div>
          <div class="live"></div>
        </div>
        <form class="composer">
          <input type="text" maxlength="500" autocomplete="off" enterkeyhint="send">
          <button type="submit" disabled>${I.send}</button>
        </form>
        <div class="foot"><span class="disc"></span><a class="call" href="#">${I.phone}<span></span></a></div>
      </section>
    </div>`;

  const $ = (s) => shadow.querySelector(s);
  const root = $('.root'), launcher = $('.launcher'), msgs = $('.msgs'), chips = $('.chips'), orb = $('.orb');
  const statusEl = $('.status'), live = $('.live'), form = $('.composer'), input = $('.composer input'), sendBtn = $('.composer button');

  // ───────────────────────────── state ─────────────────────────────
  let state = 'idle';
  let history = [];
  let chatCtrl = null;
  let silentRetry = false; // one extra listen after silence in hands-free mode
  let handsFree = false; // after a voice question, listen again automatically when the reply ends
  let greeted = false;
  let streamDone = true;

  function setState(s) {
    state = s;
    root.dataset.state = s;
    statusEl.textContent = t(s) || '';
    orb.setAttribute('aria-label', s === 'idle' ? t('mic') : t('stop'));
    orb.querySelector('.ic').innerHTML = s === 'listening' ? I.stop : I.mic;
    if (s !== 'listening') root.style.setProperty('--level', 0);
  }

  function renderStatic() {
    $('.name').textContent = cfg.assistantName;
    $('.ini').textContent = (cfg.assistantName || 'A')[0];
    $('.sub').textContent = cfg.orgName;
    $('.sub').title = $('.sub').textContent;
    launcher.setAttribute('aria-label', t('open'));
    $('.panel').setAttribute('aria-label', `${cfg.assistantName} — ${t('role')}`);
    $('.closebtn').setAttribute('aria-label', t('close'));
    const mb = $('.mutebtn');
    mb.innerHTML = muted ? I.mute : I.vol;
    mb.setAttribute('aria-label', muted ? t('unmute') : t('mute'));
    mb.setAttribute('aria-pressed', String(muted));
    shadow.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === lang)));
    input.placeholder = t('placeholder');
    sendBtn.setAttribute('aria-label', t('send'));
    $('.disc').textContent = t('footer');
    const call = $('.call');
    call.hidden = !cfg.supportPhone;
    call.href = 'tel:' + (cfg.supportPhone || '').replace(/[^\d+]/g, '');
    call.querySelector('span').textContent = `${t('call')} ${cfg.supportPhone}`;
    chips.innerHTML = '';
    for (const c of t('chips')) {
      const b = document.createElement('button');
      b.className = 'chip'; b.textContent = c;
      b.onclick = () => ask(c, false);
      chips.appendChild(b);
    }
    statusEl.textContent = t(state) || '';
  }

  function addMsg(role, text = '') {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }

  // ───────────────────────────── speech output ─────────────────────────────
  // Tiny silent WAV, played on the first tap so mobile browsers allow later audio playback.
  const SILENT = (() => {
    const n = 400, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    const w = (o, str) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    let bin = ''; new Uint8Array(b).forEach((x) => (bin += String.fromCharCode(x)));
    return 'data:audio/wav;base64,' + btoa(bin);
  })();
  const audio = new Audio();
  audio.preload = 'auto';
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    audio.src = SILENT;
    audio.play().catch(() => {});
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
  }

  let useBrowserVoice = false;
  const speaker = {
    queue: [], playing: false, gen: 0, ctrls: [],
    enqueue(text) {
      if (muted) return;
      const ctrl = new AbortController();
      this.ctrls.push(ctrl);
      this.queue.push(fetchVoice(text, ctrl.signal));
      this.pump(this.gen);
    },
    async pump(gen) {
      if (this.playing) return;
      this.playing = true;
      while (this.queue.length && gen === this.gen) {
        const item = await this.queue.shift();
        if (gen !== this.gen) break;
        if (state !== 'speaking') setState('speaking');
        await playItem(item);
      }
      if (gen === this.gen) { this.playing = false; onSpeechIdle(); }
    },
    stop() {
      this.gen++;
      this.queue = []; this.playing = false;
      this.ctrls.forEach((c) => c.abort()); this.ctrls = [];
      audio.pause(); audio.onended = null;
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    },
    get busy() { return this.playing || this.queue.length > 0; },
  };

  async function fetchVoice(text, signal) {
    if (!useBrowserVoice && cfg.voice === 'fish') {
      try {
        const r = await fetch(`${SERVER}/api/tts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }), signal,
        });
        if (r.ok) return { url: URL.createObjectURL(await r.blob()) };
        if (r.status === 503) useBrowserVoice = true;
      } catch (e) { if (e.name === 'AbortError') return { skip: true }; }
    }
    return { text, browser: true };
  }

  function playItem(item) {
    return new Promise((resolve) => {
      if (item.skip) return resolve();
      if (item.url) {
        audio.onended = audio.onerror = () => { URL.revokeObjectURL(item.url); resolve(); };
        audio.src = item.url;
        audio.play().catch(() => resolve());
        return;
      }
      if (!('speechSynthesis' in window)) return resolve();
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = lang === 'ta' ? 'ta-IN' : 'en-IN';
      const voices = speechSynthesis.getVoices();
      const pref = lang === 'ta' ? [/ta-IN/i, /^ta/i] : [/en-IN/i, /Google UK English Female/i, /Samantha|Zira|Female/i, /^en/i];
      for (const re of pref) { const v = voices.find((v) => re.test(v.lang) || re.test(v.name)); if (v) { u.voice = v; break; } }
      u.rate = 1.02; u.pitch = 1.05;
      // Some browsers never fire onend; never let the widget get stuck in "speaking".
      const guard = setTimeout(resolve, 3000 + item.text.length * 110);
      u.onend = u.onerror = () => { clearTimeout(guard); resolve(); };
      speechSynthesis.speak(u);
    });
  }

  function onSpeechIdle() {
    if (!streamDone || speaker.busy) return;
    if (handsFree && root.classList.contains('open')) startListening(true);
    else setState('idle');
  }

  // ───────────────────────────── speech input ─────────────────────────────
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let listener = null;

  async function startListening(auto = false) {
    stopEverything();
    if (!SR && !(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && cfg.voice === 'fish')) {
      addMsg('bot', t('noStt')); setState('idle'); return;
    }
    setState('listening');
    live.textContent = '';
    let text = null;
    try {
      text = SR ? await listenWebSpeech() : await listenRecorder();
    } catch (e) {
      handsFree = false;
      live.textContent = '';
      if (e === 'denied') addMsg('bot', t('noMic'));
      setState('idle');
      return;
    }
    live.textContent = '';
    if (state !== 'listening' && state !== 'thinking') return; // cancelled
    if (!text) {
      // A pause to think shouldn't end a hands-free conversation: listen once more before stopping.
      if (auto && handsFree && !silentRetry && root.classList.contains('open')) { silentRetry = true; startListening(true); return; }
      handsFree = false;
      setState('idle');
      if (!auto) statusEl.textContent = t('notHeard');
      return;
    }
    silentRetry = false;
    ask(text, true);
  }

  function listenWebSpeech() {
    return new Promise((resolve, reject) => {
      const rec = new SR();
      rec.lang = lang === 'ta' ? 'ta-IN' : 'en-IN';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      let finalText = '';
      let done = false;
      const finish = (v) => { if (!done) { done = true; listener = null; resolve(v); } };
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
        }
        live.textContent = (finalText + interim).trim();
        root.style.setProperty('--level', 0.6);
      };
      rec.onspeechend = () => root.style.setProperty('--level', 0);
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { done = true; listener = null; reject('denied'); }
        else finish(finalText.trim() || null);
      };
      rec.onend = () => finish((finalText || live.textContent).trim() || null);
      listener = { stop: () => rec.stop(), abort: () => { rec.abort(); finish(null); } };
      rec.start();
    });
  }

  async function listenRecorder() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch { throw 'denied'; }
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const an = ac.createAnalyser(); an.fftSize = 1024;
    ac.createMediaStreamSource(stream).connect(an);
    const data = new Uint8Array(an.fftSize);
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const parts = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);

    let cancelled = false;
    const stopped = new Promise((r) => (rec.onstop = r));
    const cleanup = () => { stream.getTracks().forEach((tr) => tr.stop()); ac.close().catch(() => {}); };
    listener = { stop: () => rec.state !== 'inactive' && rec.stop(), abort: () => { cancelled = true; if (rec.state !== 'inactive') rec.stop(); } };
    rec.start(250);

    // Voice-activity detection: stop after ~1.2 s of silence, or 6 s with no speech, or 15 s max.
    const t0 = performance.now();
    let spoke = false, lastLoud = t0;
    await new Promise((resolve) => {
      const tick = () => {
        if (rec.state === 'inactive') return resolve();
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / data.length);
        root.style.setProperty('--level', Math.min(1, rms * 6).toFixed(2));
        const now = performance.now();
        if (rms > 0.035) { spoke = true; lastLoud = now; }
        if ((spoke && now - lastLoud > 1200) || (!spoke && now - t0 > 6000) || now - t0 > 15000) { rec.stop(); return resolve(); }
        requestAnimationFrame(tick);
      };
      tick();
    });
    await stopped;
    cleanup();
    listener = null;
    if (cancelled || !spoke) return null;

    statusEl.textContent = t('transcribing');
    const blob = new Blob(parts, { type: rec.mimeType || 'audio/webm' });
    const r = await fetch(`${SERVER}/api/stt?lang=${lang}`, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
    if (!r.ok) return null;
    return ((await r.json()).text || '').trim() || null;
  }

  // ───────────────────────────── conversation ─────────────────────────────
  function stopEverything() {
    speaker.stop();
    if (chatCtrl) { chatCtrl.abort(); chatCtrl = null; }
    if (listener) { listener.abort(); listener = null; }
    streamDone = true;
  }

  async function ask(question, viaVoice) {
    question = String(question || '').trim();
    if (!question) return;
    unlockAudio();
    stopEverything();
    handsFree = viaVoice;
    streamDone = false;
    addMsg('user', question);
    const bot = addMsg('bot');
    bot.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    setState('thinking');

    const ctrl = new AbortController();
    chatCtrl = ctrl;
    let answer = '';
    let sources = [];
    try {
      const res = await fetch(`${SERVER}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, lang, history: history.slice(-6) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1];
          const raw = /^data: (.*)$/m.exec(block)?.[1];
          if (!ev || !raw) continue;
          const data = JSON.parse(raw);
          if (ev === 'sources') sources = data;
          else if (ev === 'sentence' || ev === 'error') {
            if (!answer) bot.textContent = '';
            answer += (answer ? ' ' : '') + data.text;
            bot.textContent = answer;
            if (ev === 'error') bot.classList.add('err');
            msgs.scrollTop = msgs.scrollHeight;
            speaker.enqueue(data.text);
          }
        }
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      answer = t('offline');
      bot.textContent = answer; bot.classList.add('err');
      speaker.enqueue(answer);
    }
    if (chatCtrl !== ctrl) return;
    chatCtrl = null;

    if (answer && sources.length) {
      const seen = new Set();
      const box = document.createElement('div');
      box.className = 'src';
      for (const s of sources.slice(0, 2)) {
        if (seen.has(s.title)) continue; seen.add(s.title);
        const pill = document.createElement('span');
        pill.innerHTML = I.doc; pill.append(s.title);
        pill.title = `${t('from')}: ${s.source}`;
        box.appendChild(pill);
      }
      bot.appendChild(box);
      msgs.scrollTop = msgs.scrollHeight;
    }
    history.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
    history = history.slice(-12);
    streamDone = true;
    if (muted || !speaker.busy) onSpeechIdle();
  }

  function greet() {
    if (greeted) return;
    greeted = true;
    const g = t('greeting')(cfg.assistantName, cfg.orgName);
    addMsg('bot', g);
    streamDone = true;
    speaker.enqueue(g);
  }

  // ───────────────────────────── open / close ─────────────────────────────
  function open() {
    unlockAudio();
    hideTeaser(true);
    root.classList.add('open');
    greet();
    setTimeout(() => orb.focus(), 50);
  }
  function close() {
    stopEverything();
    handsFree = false;
    setState('idle');
    root.classList.remove('open');
    launcher.focus();
  }

  let teaserEl = null;
  function hideTeaser(remember) { teaserEl?.remove(); teaserEl = null; if (remember) store.set('teaser', '1'); }
  function showTeaser() {
    if (store.get('teaser') || root.classList.contains('open')) return;
    teaserEl = document.createElement('div');
    teaserEl.className = 'teaser';
    teaserEl.innerHTML = `<span></span><button class="x" aria-label="${t('close')}">${I.close}</button>`;
    teaserEl.querySelector('span').textContent = t('teaser');
    teaserEl.onclick = (e) => { if (e.target.closest('.x')) { e.stopPropagation(); hideTeaser(true); } else open(); };
    root.appendChild(teaserEl);
  }

  // ───────────────────────────── events ─────────────────────────────
  launcher.onclick = open;
  $('.closebtn').onclick = close;
  orb.onclick = () => {
    unlockAudio();
    if (state === 'listening') { listener?.stop(); return; }
    if (state === 'speaking' || state === 'thinking') { stopEverything(); handsFree = false; }
    startListening(false);
  };
  $('.mutebtn').onclick = () => {
    muted = !muted; store.set('muted', muted ? '1' : '0');
    if (muted) { speaker.stop(); if (state === 'speaking') onSpeechIdle(); }
    renderStatic();
  };
  shadow.querySelectorAll('.lang button').forEach((b) => (b.onclick = () => {
    if (lang === b.dataset.l) return;
    lang = b.dataset.l; store.set('lang', lang);
    stopEverything(); handsFree = false; setState('idle');
    renderStatic();
    const g = t('greeting')(cfg.assistantName, cfg.orgName);
    addMsg('bot', g); speaker.enqueue(g);
  }));
  input.oninput = () => { sendBtn.disabled = !input.value.trim(); };
  form.onsubmit = (e) => { e.preventDefault(); const q = input.value; input.value = ''; sendBtn.disabled = true; ask(q, false); };
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('open')) close(); });

  // ───────────────────────────── boot ─────────────────────────────
  function mount() {
    document.body.appendChild(host);
    renderStatic();
    setState('idle');
    setTimeout(showTeaser, 3500);
  }
  fetch(`${SERVER}/api/config`).then((r) => r.json()).then((c) => { cfg = { ...cfg, ...c }; renderStatic(); }).catch(() => {});
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  window.XploreVoiceAgent = { open, close, ask: (q) => { open(); ask(q, false); } };
})();
