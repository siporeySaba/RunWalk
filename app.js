'use strict';
/* ===== ריצה והליכה – טיימר אינטרוולים עם הכרזות קוליות ===== */

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

const DEFAULTS = {
  run: 300, walk: 60, rounds: 6, warmup: 0, cooldown: 0,
  half: false, min: true, count: true, round: true, vibe: true, volume: 1, rate: 1
};
const cfg = Object.assign({}, DEFAULTS, store.get('rw.cfg', {}));

const BUILTIN = [
  { run: 300, walk: 60, rounds: 6 },
  { run: 180, walk: 60, rounds: 8 },
  { run: 120, walk: 60, rounds: 10 },
  { run: 60, walk: 60, rounds: 10 },
  { run: 480, walk: 120, rounds: 4 },
];

/* ---------- מספרים ומילים בעברית ---------- */
const ONES = ['', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע'];
const TENS = ['', 'עשר', 'עשרים', 'שלושים', 'ארבעים', 'חמישים', 'שישים', 'שבעים', 'שמונים', 'תשעים'];
function heb(n) {
  if (n < 10) return ONES[n];
  if (n === 10) return 'עשר';
  if (n < 20) return (n === 12 ? 'שתים' : ONES[n - 10]) + ' עשרה';
  if (n < 100) { const t = TENS[Math.floor(n / 10)], o = n % 10; return o ? t + ' ו' + ONES[o] : t; }
  return String(n);
}
function minWords(m) { return m === 1 ? 'דקה' : m === 2 ? 'שתי דקות' : heb(m) + ' דקות'; }
function secWords(s) { return s === 1 ? 'שנייה' : s === 2 ? 'שתי שניות' : heb(s) + ' שניות'; }
function durWords(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  if (!m) return secWords(s);
  if (!s) return m === 1 ? 'דקה אחת' : minWords(m);
  if (s === 30) return minWords(m) + ' וחצי';
  return minWords(m) + ' ו' + secWords(s);
}
function fmt(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
function fmtShort(sec) {
  if (sec < 60) return sec + ' שנ׳';
  if (sec % 60 === 0) return sec / 60 + ' דק׳';
  return fmt(sec);
}

/* ---------- מסך ההגדרות ---------- */
const STEP = {
  run: { min: 15, max: 3600, step: v => v < 60 ? 15 : 30 },
  walk: { min: 15, max: 1800, step: v => v < 60 ? 15 : 30 },
  rounds: { min: 1, max: 40, step: () => 1 },
  warmup: { min: 0, max: 1800, step: () => 60 },
  cooldown: { min: 0, max: 1800, step: () => 60 },
};
function showVal(key) {
  const v = cfg[key];
  if (key === 'rounds') return v + ' ×';
  if ((key === 'warmup' || key === 'cooldown') && !v) return 'ללא';
  return fmtShort(v);
}
function buildSteppers() {
  document.querySelectorAll('.stepper').forEach(el => {
    const key = el.dataset.key, st = STEP[key];
    el.innerHTML = '<button aria-label="פחות">−</button><span class="val"></span><button aria-label="יותר">+</button>';
    const [minus, val, plus] = el.children;
    const paint = () => { val.textContent = showVal(key); };
    const change = dir => {
      const v = cfg[key];
      const step = dir > 0 ? st.step(v) : st.step(v - 1);
      cfg[key] = Math.min(st.max, Math.max(st.min, v + dir * step));
      paint(); saveCfg();
    };
    // לחיצה ארוכה מחליפה מהר
    [[minus, -1], [plus, 1]].forEach(([b, d]) => {
      let t1, t2;
      const stopRep = () => { clearTimeout(t1); clearInterval(t2); };
      b.addEventListener('pointerdown', e => { e.preventDefault(); change(d); t1 = setTimeout(() => { t2 = setInterval(() => change(d), 110); }, 450); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stopRep));
    });
    paint();
  });
}
const TOGGLES = { 'cue-half': 'half', 'cue-min': 'min', 'cue-count': 'count', 'cue-round': 'round', 'cue-vibe': 'vibe' };
function bindSettings() {
  for (const [id, k] of Object.entries(TOGGLES)) {
    $(id).checked = cfg[k];
    $(id).addEventListener('change', () => { cfg[k] = $(id).checked; saveCfg(); });
  }
  ['volume', 'rate'].forEach(k => {
    $(k).value = cfg[k];
    $(k).addEventListener('input', () => { cfg[k] = +$(k).value; saveCfg(); });
  });
  $('test-voice').addEventListener('click', () => { audio.unlock(); speak('עכשיו ריצה, ' + durWords(cfg.run)); });
}
function saveCfg() { store.set('rw.cfg', cfg); paintTotal(); paintPresets(); }
function paintTotal() {
  const segs = buildSegments(cfg);
  const total = segs.reduce((a, s) => a + s.dur, 0);
  const run = cfg.run * cfg.rounds;
  $('total').innerHTML = `סה״כ <b>${fmt(total)}</b> · מתוכן ריצה <b>${fmt(run)}</b>`;
}

/* ---------- תוכניות שמורות ---------- */
let userPresets = store.get('rw.presets', []);
const samePlan = (a, b) => a.run === b.run && a.walk === b.walk && a.rounds === b.rounds;
function presetLabel(p) { return `${fmtShort(p.run)} / ${fmtShort(p.walk)} × ${p.rounds}`; }
function paintPresets() {
  const box = $('presets'); box.innerHTML = '';
  const all = [...userPresets.map(p => ({ ...p, user: true })), ...BUILTIN.filter(b => !userPresets.some(u => samePlan(u, b)))];
  all.forEach(p => {
    const b = document.createElement('button');
    b.className = 'preset' + (samePlan(p, cfg) ? ' on' : '');
    b.innerHTML = (p.user ? '⭐ ' : '') + presetLabel(p) + (p.user ? '<span class="x" title="מחיקה">✕</span>' : '');
    b.addEventListener('click', e => {
      if (e.target.classList.contains('x')) {
        userPresets = userPresets.filter(u => !samePlan(u, p)); store.set('rw.presets', userPresets);
      } else {
        Object.assign(cfg, { run: p.run, walk: p.walk, rounds: p.rounds });
        if (p.user) Object.assign(cfg, { warmup: p.warmup || 0, cooldown: p.cooldown || 0 });
        buildSteppers();
      }
      saveCfg();
    });
    box.appendChild(b);
  });
}
$('save-preset').addEventListener('click', () => {
  const p = { run: cfg.run, walk: cfg.walk, rounds: cfg.rounds, warmup: cfg.warmup, cooldown: cfg.cooldown };
  userPresets = [p, ...userPresets.filter(u => !samePlan(u, p))].slice(0, 8);
  store.set('rw.presets', userPresets); paintPresets();
  $('save-preset').textContent = '✓ נשמר';
  setTimeout(() => { $('save-preset').textContent = '⭐ שמירה כתוכנית קבועה'; }, 1500);
});

/* ---------- קול ושמע ---------- */
let heVoice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  heVoice = vs.find(v => /^he|^iw/i.test(v.lang) && /google/i.test(v.name)) || vs.find(v => /^he|^iw/i.test(v.lang)) || null;
  $('voice-hint').textContent = heVoice ? '' :
    vs.length ? 'לא נמצא קול עברי במכשיר. באנדרואיד: הגדרות ← המרת טקסט לדיבור ← מנוע Google ← להתקין עברית.' : '';
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener('voiceschanged', pickVoice); }

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'he-IL'; if (heVoice) u.voice = heVoice;
  u.volume = cfg.volume; u.rate = cfg.rate;
  speechSynthesis.speak(u);
}

const audio = {
  ctx: null, keep: null,
  unlock() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  beep(freq = 880, ms = 160, gain = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * cfg.volume, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + ms / 1000 + 0.05);
  },
  // צליל שקט כמעט לגמרי בלולאה – שומר את הדף "חי" כשהמסך נעול
  startKeepAlive() {
    if (!this.keep) {
      const rate = 8000, n = rate * 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
      const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true);
      v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
      v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, (Math.random() * 6 - 3) | 0, true);
      this.keep = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
      this.keep.loop = true; this.keep.volume = 0.05;
    }
    this.keep.play().catch(() => {});
  },
  stopKeepAlive() { if (this.keep) this.keep.pause(); }
};

/* ---------- בניית האימון ---------- */
function buildSegments(c) {
  const s = [];
  if (c.warmup) s.push({ kind: 'easy', label: 'חימום', dur: c.warmup });
  for (let r = 1; r <= c.rounds; r++) {
    s.push({ kind: 'run', label: 'ריצה', dur: c.run, round: r });
    // אחרי הריצה האחרונה: אם יש שחרור – הוא מחליף את ההליכה
    if (r < c.rounds || !c.cooldown) s.push({ kind: 'walk', label: 'הליכה', dur: c.walk, round: r });
  }
  if (c.cooldown) s.push({ kind: 'easy', label: 'שחרור', dur: c.cooldown });
  let t = 0; s.forEach(x => { x.start = t; t += x.dur; });
  return s;
}

/* ---------- מנוע הטיימר ---------- */
const W = { segs: [], total: 0, t0: 0, pausedAt: 0, pausedMs: 0, idx: -1, cue: {}, timer: null, lock: null };
const now = () => Date.now();
const elapsed = () => ((W.pausedAt || now()) - W.t0 - W.pausedMs) / 1000;

function announce(seg, i) {
  const last = seg.round === cfg.rounds;
  let t = '';
  if (seg.kind === 'run') {
    if (cfg.round && cfg.rounds > 1) t += last ? 'סיבוב אחרון! ' : `סיבוב ${seg.round === 1 ? 'ראשון' : heb(seg.round)} מתוך ${heb(cfg.rounds)}. `;
    t += `עכשיו ריצה, ${durWords(seg.dur)}.`;
  } else if (seg.kind === 'walk') {
    t = `עכשיו הליכה, ${durWords(seg.dur)}.`;
    if (last) t += ' זה הקטע האחרון.';
  } else {
    t = i === 0 ? `מתחילים בחימום, ${durWords(seg.dur)} הליכה.` : `כל הכבוד! עכשיו שחרור, ${durWords(seg.dur)} הליכה.`;
  }
  audio.beep(1175, 260, 0.6);
  setTimeout(() => speak(t), 300);
  if (cfg.vibe && navigator.vibrate) navigator.vibrate(seg.kind === 'run' ? [300, 120, 300] : [600]);
  setMedia();
}

function tick() {
  const e = elapsed();
  if (e >= W.total) return finish(true);
  let i = W.idx < 0 ? 0 : W.idx;
  while (i < W.segs.length - 1 && e >= W.segs[i + 1].start) i++;
  const seg = W.segs[i];
  if (i !== W.idx) { W.idx = i; W.cue = {}; announce(seg, i); }
  const remain = seg.start + seg.dur - e;

  if (!W.pausedAt) {
    if (cfg.half && seg.dur >= 120 && !W.cue.half && remain <= seg.dur / 2 && remain > seg.dur / 2 - 3) { W.cue.half = 1; speak('חצי עבר.'); }
    if (cfg.min && seg.dur >= 180 && !W.cue.min && remain <= 60 && remain > 57) { W.cue.min = 1; speak('עוד דקה.'); }
    if (cfg.count && i < W.segs.length) {
      const s = Math.ceil(remain);
      if (s <= 3 && s >= 1 && W.cue.cnt !== s) { W.cue.cnt = s; audio.beep(660, 120, 0.45); }
    }
  }
  paintRun(seg, i, remain, e);
}

function paintRun(seg, i, remain, e) {
  document.body.className = W.pausedAt ? 'paused' : 'ph-' + seg.kind;
  $('phase').textContent = W.pausedAt ? '⏸ בהפסקה' : (seg.kind === 'run' ? '🏃 ' : '🚶 ') + seg.label;
  $('clock').textContent = fmt(remain);
  const nx = W.segs[i + 1];
  $('next').textContent = nx ? `הבא: ${nx.label} ${fmtShort(nx.dur)}` : 'הקטע האחרון 💪';
  $('seg-bar').style.width = (100 * (1 - remain / seg.dur)) + '%';
  $('all-bar').style.width = (100 * e / W.total) + '%';
  $('round').textContent = seg.round ? `${seg.round}/${cfg.rounds}` : '–';
  $('elapsed').textContent = fmt(e);
  $('left').textContent = fmt(W.total - e);
  document.title = `${seg.label} ${fmt(remain)}`;
}

function setMedia() {
  if (!('mediaSession' in navigator) || W.idx < 0) return;
  const seg = W.segs[W.idx];
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: seg.label + (seg.round ? ` · סיבוב ${seg.round}/${cfg.rounds}` : ''),
      artist: 'ריצה והליכה',
      artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }]
    });
    navigator.mediaSession.playbackState = W.pausedAt ? 'paused' : 'playing';
  } catch (e) {}
}

async function wakeLock() {
  try { if ('wakeLock' in navigator && !W.lock) { W.lock = await navigator.wakeLock.request('screen'); W.lock.addEventListener('release', () => { W.lock = null; }); } } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && W.timer) { wakeLock(); tick(); }
});

function start() {
  audio.unlock(); audio.startKeepAlive();
  speak(' '); // "פותח" את מנוע הדיבור מתוך לחיצת המשתמש
  W.segs = buildSegments(cfg);
  W.total = W.segs.reduce((a, s) => a + s.dur, 0);
  W.t0 = now(); W.pausedAt = 0; W.pausedMs = 0; W.idx = -1; W.cue = {};
  show('run');
  wakeLock();
  clearInterval(W.timer); W.timer = setInterval(tick, 250);
  tick();
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('pause', togglePause);
      navigator.mediaSession.setActionHandler('play', togglePause);
      navigator.mediaSession.setActionHandler('nexttrack', skip);
    } catch (e) {}
  }
}
function togglePause() {
  if (!W.timer) return;
  if (W.pausedAt) {
    W.pausedMs += now() - W.pausedAt; W.pausedAt = 0;
    $('pause').textContent = '⏸ הפסקה'; speak('ממשיכים!'); audio.startKeepAlive();
  } else {
    W.pausedAt = now(); $('pause').textContent = '▶ המשך'; speak('הפסקה.');
  }
  setMedia(); tick();
}
function skip() {
  if (!W.timer || W.idx >= W.segs.length - 1) return;
  const target = W.segs[W.idx + 1].start;
  W.t0 -= (target - elapsed()) * 1000;
  tick();
}
function finish(completed) {
  clearInterval(W.timer); W.timer = null;
  const e = Math.min(elapsed(), W.total);
  // כמה זמן ריצה בפועל
  let runSec = 0, roundsDone = 0;
  W.segs.forEach(s => {
    if (s.kind !== 'run') return;
    const part = Math.max(0, Math.min(s.dur, e - s.start));
    runSec += part; if (part >= s.dur) roundsDone++;
  });
  if (completed) {
    audio.beep(988, 200); setTimeout(() => audio.beep(1319, 400), 220);
    setTimeout(() => speak(`סיימת! כל הכבוד! רצת ${durWords(Math.round(runSec / 60) * 60 || Math.round(runSec))}.`), 700);
    if (cfg.vibe && navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);
  } else speechSynthesis.cancel();
  setTimeout(() => audio.stopKeepAlive(), 6000);
  if (W.lock) { W.lock.release().catch(() => {}); W.lock = null; }
  document.body.className = ''; document.title = 'ריצה והליכה';

  if (e > 30) {
    const h = store.get('rw.history', []);
    h.unshift({ at: Date.now(), total: Math.round(e), run: Math.round(runSec), rounds: roundsDone, plan: presetLabel(cfg), done: completed });
    store.set('rw.history', h.slice(0, 30));
  }
  $('done-title').textContent = completed ? 'כל הכבוד! 🎉' : 'האימון נעצר';
  $('summary').innerHTML = `
    <div class="row"><span>זמן כולל</span><b>${fmt(e)}</b></div>
    <div class="row"><span>זמן ריצה</span><b>${fmt(runSec)}</b></div>
    <div class="row"><span>סיבובים שהושלמו</span><b>${roundsDone} מתוך ${cfg.rounds}</b></div>
    <div class="row"><span>תוכנית</span><b>${presetLabel(cfg)}</b></div>`;
  paintHistory();
  show('done');
}
function paintHistory() {
  const h = store.get('rw.history', []);
  $('history').innerHTML = h.slice(0, 10).map(r => {
    const d = new Date(r.at);
    return `<li><b>${d.getDate()}.${d.getMonth() + 1} · ריצה ${fmt(r.run)}${r.done ? ' ✓' : ''}</b><span>${r.plan}</span></li>`;
  }).join('') || '<li><span>עוד אין ריצות שמורות</span></li>';
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}

$('start').addEventListener('click', start);
$('pause').addEventListener('click', togglePause);
$('skip').addEventListener('click', skip);
$('stop').addEventListener('click', () => { if (confirm('לסיים את האימון?')) finish(false); });
$('again').addEventListener('click', () => show('setup'));

/* ---------- התקנה כאפליקציה ---------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); installEvt = e;
  $('install-hint').innerHTML = '<button class="btn ghost small" id="install">📲 התקנה כאפליקציה בטלפון</button>';
  $('install').addEventListener('click', () => { installEvt.prompt(); installEvt = null; $('install-hint').textContent = ''; });
});
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone)
  $('install-hint').textContent = '📲 להתקנה: כפתור השיתוף ⬆️ ← "הוספה למסך הבית"';

buildSteppers(); bindSettings(); paintPresets(); paintTotal();
