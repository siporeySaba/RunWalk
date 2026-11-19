'use strict';
/* ===== ריצה והליכה – טיימר אינטרוולים עם הכרזות קוליות ===== */

const $ = id => document.getElementById(id);
const { CLIPS, heb } = window.RW_CLIPS;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

const DEFAULTS = {
  mode: 'fixed', run: 300, walk: 60, rounds: 6, custom: '3, 5, 7, 5, 3', warmup: 0, cooldown: 0,
  half: false, min: true, count: true, round: true, vibe: true, cheer: true,
  voice: 'avri', music: false, volume: 1, showProg: true
};
const cfg = Object.assign({}, DEFAULTS, store.get('rw.cfg', {}));

const BUILTIN = [
  { mode: 'fixed', run: 300, walk: 60, rounds: 6 },
  { mode: 'fixed', run: 180, walk: 60, rounds: 8 },
  { mode: 'custom', custom: '2, 3, 4, 5, 4, 3, 2', walk: 60 },
  { mode: 'fixed', run: 120, walk: 60, rounds: 10 },
  { mode: 'fixed', run: 480, walk: 120, rounds: 4 },
];

/* ---------- תוכנית התקדמות: 8 שבועות עד 30 דקות ריצה רצופה ---------- */
const F = (run, rounds, walk = 60) => ({ mode: 'fixed', run: run * 60, walk, rounds });
const C = (list, walk = 60) => ({ mode: 'custom', custom: list, walk });
const DEFAULT_PROGRAM = [
  [F(4, 6), F(5, 5), F(5, 6)],
  [F(6, 5), C('4, 6, 8, 6, 4'), F(7, 4)],
  [F(8, 4), C('5, 7, 9, 7, 5'), F(8, 4)],
  [F(10, 3), C('8, 10, 12'), F(10, 3)],
  [F(12, 3), C('10, 15, 10'), F(13, 3)],
  [F(15, 2), C('12, 15, 12'), F(17, 2)],
  [C('20, 10'), F(18, 2), C('22, 12')],
  [C('25, 5'), C('20, 10'), F(30, 1)],
];
// התוכנית ניתנת לעריכה ונשמרת במכשיר. לכל אימון מזהה קבוע, כדי שהסימון ✓ לא יזוז כשמוסיפים/מוחקים.
const defaultProgram = () => DEFAULT_PROGRAM.map((wk, w) => wk.map((p, s) => ({ ...p, id: `w${w}s${s}` })));
let PROGRAM = store.get('rw.program', null) || defaultProgram();
const saveProgram = () => store.set('rw.program', PROGRAM);
let prog = store.get('rw.prog', { done: {} });
function nextSession() {
  for (let w = 0; w < PROGRAM.length; w++)
    for (let s = 0; s < PROGRAM[w].length; s++)
      if (!prog.done[PROGRAM[w][s].id]) return { w, s, plan: PROGRAM[w][s], id: PROGRAM[w][s].id };
  return null;
}
const progCount = () => PROGRAM.reduce((a, w) => a + w.length, 0);
const progDoneCount = () => PROGRAM.reduce((a, w) => a + w.filter(p => prog.done[p.id]).length, 0);

/* ---------- מספרים ומילים ---------- */
function minWords(m) { return m === 1 ? 'דקה' : m === 2 ? 'שתי דקות' : heb(m) + ' דקות'; }
function secWords(s) { return s === 1 ? 'שנייה' : s === 2 ? 'שתי שניות' : heb(s) + ' שניות'; }
function durWords(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  if (!m) return secWords(s);
  if (!s) return m === 1 ? 'דקה אחת' : minWords(m);
  if (s === 30) return minWords(m) + ' וחצי';
  return minWords(m) + ' ו' + secWords(s);
}
// מפתחות ההקלטות למשך זמן. '#' = טקסט חופשי (יוקרא בקול הטלפון)
function durKeys(sec) {
  sec = Math.max(15, Math.round(sec / 15) * 15);
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m > 90) return ['#' + durWords(sec)];
  if (!m) return ['s' + s];
  if (!s) return ['m' + m];
  if (s === 30 && m <= 30) return ['m' + m + 'h'];
  return ['m' + m, 'and_s' + s];
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
const fmtMin = sec => String(+(sec / 60).toFixed(2));

/* ---------- תוכנית האימון ---------- */
function parseCustom(str) {
  const a = String(str || '').split(/[,\s،;]+/).map(x => parseFloat(x)).filter(x => x > 0)
    .map(x => Math.round(Math.min(60, Math.max(0.25, x)) * 4) * 15);
  return a.slice(0, 40);
}
function runsOf(c) {
  if (c.mode === 'custom') { const a = parseCustom(c.custom); return a.length ? a : [c.run || 300]; }
  return Array(c.rounds).fill(c.run);
}
function planLabel(p) {
  if (p.mode === 'custom') return `ריצות ${runsOf(p).map(fmtMin).join('-')} · הליכה ${fmtShort(p.walk)}`;
  return `${fmtShort(p.run)} / ${fmtShort(p.walk)} × ${p.rounds}`;
}
const samePlan = (a, b) => planLabel(a) === planLabel(b);
const planOf = c => c.mode === 'custom'
  ? { mode: 'custom', custom: c.custom, walk: c.walk }
  : { mode: 'fixed', run: c.run, walk: c.walk, rounds: c.rounds };
function applyPlan(p) {
  cfg.mode = p.mode || 'fixed'; cfg.walk = p.walk;
  if (cfg.mode === 'custom') cfg.custom = p.custom; else { cfg.run = p.run; cfg.rounds = p.rounds; }
  if ('warmup' in p) { cfg.warmup = p.warmup || 0; cfg.cooldown = p.cooldown || 0; }
  paintSetup(); saveCfg();
}

function buildSegments(c) {
  const runs = runsOf(c), n = runs.length, s = [];
  if (c.warmup) s.push({ kind: 'easy', label: 'חימום', dur: c.warmup });
  runs.forEach((dur, k) => {
    const r = k + 1;
    s.push({ kind: 'run', label: 'ריצה', dur, round: r });
    // אחרי הריצה האחרונה: אם יש שחרור – הוא מחליף את ההליכה
    if (r < n || !c.cooldown) s.push({ kind: 'walk', label: 'הליכה', dur: c.walk, round: r });
  });
  if (c.cooldown) s.push({ kind: 'easy', label: 'שחרור', dur: c.cooldown });
  let t = 0; s.forEach(x => { x.start = t; t += x.dur; });
  return s;
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
    const change = dir => {
      const v = cfg[key];
      const step = dir > 0 ? st.step(v) : st.step(v - 1);
      cfg[key] = Math.min(st.max, Math.max(st.min, v + dir * step));
      val.textContent = showVal(key); saveCfg();
    };
    // לחיצה ארוכה מחליפה מהר
    [[minus, -1], [plus, 1]].forEach(([b, d]) => {
      let t1, t2;
      const stopRep = () => { clearTimeout(t1); clearInterval(t2); };
      b.addEventListener('pointerdown', e => { e.preventDefault(); change(d); t1 = setTimeout(() => { t2 = setInterval(() => change(d), 110); }, 450); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stopRep));
    });
  });
}
function paintSetup() {
  document.querySelectorAll('.stepper').forEach(el => { el.querySelector('.val').textContent = showVal(el.dataset.key); });
  document.querySelectorAll('#mode button').forEach(b => b.classList.toggle('on', b.dataset.m === cfg.mode));
  document.body.classList.toggle('custom-mode', cfg.mode === 'custom');
  if (document.activeElement !== $('custom')) $('custom').value = cfg.custom;
}
const TOGGLES = { 'cue-half': 'half', 'cue-min': 'min', 'cue-count': 'count', 'cue-round': 'round', 'cue-vibe': 'vibe', 'cue-cheer': 'cheer', 'music': 'music' };
function bindSettings() {
  for (const [id, k] of Object.entries(TOGGLES)) {
    $(id).checked = cfg[k];
    $(id).addEventListener('change', () => { cfg[k] = $(id).checked; saveCfg(); });
  }
  $('volume').value = cfg.volume;
  $('volume').addEventListener('input', () => { cfg.volume = +$('volume').value; saveCfg(); });
  $('voice').value = cfg.voice;
  $('voice').addEventListener('change', () => { cfg.voice = $('voice').value; saveCfg(); voiceHint(); prefetchVoice(); });
  $('test-voice').addEventListener('click', () => { audio.unlock(); say(['test']); });
  document.querySelectorAll('#mode button').forEach(b => b.addEventListener('click', () => { cfg.mode = b.dataset.m; paintSetup(); saveCfg(); }));
  $('custom').addEventListener('input', () => { cfg.custom = $('custom').value; saveCfg(); });
  $('custom').addEventListener('blur', () => { const a = parseCustom(cfg.custom); if (a.length) { cfg.custom = a.map(fmtMin).join(', '); paintSetup(); saveCfg(); } });
}
function saveCfg() { store.set('rw.cfg', cfg); paintTotal(); paintPresets(); paintProgCard(); }
function paintTotal() {
  const segs = buildSegments(cfg);
  const total = segs.reduce((a, s) => a + s.dur, 0);
  const run = runsOf(cfg).reduce((a, b) => a + b, 0);
  $('total').innerHTML = `סה״כ <b>${fmt(total)}</b> · מתוכן ריצה <b>${fmt(run)}</b>`;
}

/* ---------- תוכניות שמורות ---------- */
let userPresets = store.get('rw.presets', []);
function paintPresets() {
  const box = $('presets'); box.innerHTML = '';
  const all = [...userPresets.map(p => ({ ...p, user: true })), ...BUILTIN.filter(b => !userPresets.some(u => samePlan(u, b)))];
  all.forEach(p => {
    const b = document.createElement('button');
    b.className = 'preset' + (samePlan(p, cfg) ? ' on' : '');
    b.innerHTML = (p.user ? '⭐ ' : '') + planLabel(p) + (p.user ? '<span class="x" title="מחיקה">✕</span>' : '');
    b.addEventListener('click', e => {
      if (e.target.classList.contains('x')) {
        userPresets = userPresets.filter(u => !samePlan(u, p)); store.set('rw.presets', userPresets); saveCfg();
      } else applyPlan(p);
    });
    box.appendChild(b);
  });
}
$('save-preset').addEventListener('click', () => {
  const p = { ...planOf(cfg), warmup: cfg.warmup, cooldown: cfg.cooldown };
  userPresets = [p, ...userPresets.filter(u => !samePlan(u, p))].slice(0, 8);
  store.set('rw.presets', userPresets); paintPresets();
  $('save-preset').textContent = '✓ נשמר';
  setTimeout(() => { $('save-preset').textContent = '⭐ שמירה כתוכנית קבועה'; }, 1500);
});

/* ---------- תוכנית ההתקדמות: כרטיס ומסך ---------- */
function paintProgCard() {
  const box = $('prog-card');
  if (!cfg.showProg) { box.innerHTML = '<button class="btn ghost small" id="prog-show">📅 תוכנית התקדמות ל-30 דקות ריצה</button>'; $('prog-show').onclick = () => { cfg.showProg = true; saveCfg(); }; return; }
  const nx = nextSession(), done = progDoneCount(), all = progCount();
  box.innerHTML = `<div class="card prog">
    <div class="prog-h">📅 התוכנית: 30 דקות ריצה רצופה <span>${done}/${all}</span></div>
    <div class="prog-bar"><div style="width:${100 * done / all}%"></div></div>
    ${nx ? `<div class="prog-next">האימון הבא: <b>שבוע ${nx.w + 1} · אימון ${nx.s + 1}</b><br>${planLabel(nx.plan)}${samePlan(nx.plan, cfg) ? ' <span class="ok">✓ נטען</span>' : ''}</div>`
        : '<div class="prog-next">🏆 סיימת את כל התוכנית! כל הכבוד!</div>'}
    <div class="prog-btns">
      ${nx && !samePlan(nx.plan, cfg) ? '<button class="btn small" id="prog-load">לטעון את האימון</button>' : ''}
      <button class="btn ghost small" id="prog-all">כל התוכנית</button>
    </div></div>`;
  if ($('prog-load')) $('prog-load').onclick = () => applyPlan(nx.plan);
  $('prog-all').onclick = () => { paintProgram(); show('program'); };
}
let progEdit = false;
function paintProgram() {
  const nx = nextSession();
  document.body.classList.toggle('prog-editing', progEdit);
  $('prog-edit').textContent = progEdit ? '✓ סיום עריכה' : '✏️ עריכת התוכנית';
  $('prog-list').innerHTML = PROGRAM.map((week, w) => `
    <div class="card week"><div class="week-h">שבוע ${w + 1}
      ${progEdit ? `<button class="mini del" data-act="del-week" data-w="${w}">🗑️ מחיקת שבוע</button>` : ''}</div>
    ${week.map((p, s) => {
      const d = prog.done[p.id], isNext = nx && nx.id === p.id;
      return `<div class="sess-row"><button class="sess${d ? ' done' : ''}${isNext ? ' next' : ''}" data-act="pick" data-w="${w}" data-s="${s}">
        <span>${d ? '✅' : isNext ? '👉' : '⚪'} אימון ${s + 1}</span><b>${planLabel(p)}</b></button>
        ${progEdit ? `<button class="mini" data-act="edit" data-w="${w}" data-s="${s}" aria-label="עריכה">✏️</button>
        <button class="mini del" data-act="del" data-w="${w}" data-s="${s}" aria-label="מחיקה">🗑️</button>` : ''}</div>`;
    }).join('')}
    ${progEdit ? `<button class="btn ghost small" data-act="add" data-w="${w}">➕ הוספת אימון לשבוע ${w + 1}</button>` : ''}
    </div>`).join('') +
    (progEdit ? `<button class="btn ghost small" data-act="add-week">➕ הוספת שבוע</button>
      <button class="btn ghost small" data-act="restore">↩️ שחזור התוכנית המקורית</button>` : '');
  $('prog-list').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => progAction(b.dataset.act, +b.dataset.w, +b.dataset.s)));
}
function progAction(act, w, s) {
  const p = PROGRAM[w] && PROGRAM[w][s];
  if (act === 'pick') {
    if (progEdit) return openEditor(w, s);
    if (prog.done[p.id]) {
      if (!confirm('האימון הזה כבר סומן כבוצע. לבטל את הסימון?')) return;
      delete prog.done[p.id]; store.set('rw.prog', prog); paintProgram(); paintProgCard(); return;
    }
    applyPlan(p); show('setup'); return;
  }
  if (act === 'edit') return openEditor(w, s);
  if (act === 'add') return openEditor(w, -1);
  if (act === 'del') { if (!confirm(`למחוק את אימון ${s + 1} משבוע ${w + 1}?`)) return; PROGRAM[w].splice(s, 1); }
  if (act === 'del-week') { if (!confirm(`למחוק את כל שבוע ${w + 1}?`)) return; PROGRAM.splice(w, 1); }
  if (act === 'add-week') PROGRAM.push([]);
  if (act === 'restore') { if (!confirm('לחזור לתוכנית המקורית? השינויים שעשית בתוכנית יימחקו.')) return; PROGRAM = defaultProgram(); }
  saveProgram(); paintProgram(); paintProgCard();
}

/* עורך אימון בתוכנית */
const ED = { w: 0, s: -1, mode: 'fixed' };
function edPlan() {
  const toSec = id => Math.round(Math.max(0.25, parseFloat($(id).value) || 1) * 4) * 15;
  const walk = toSec('ed-walk');
  if (ED.mode === 'custom') {
    const a = parseCustom($('ed-custom').value);
    return { mode: 'custom', custom: (a.length ? a : [300]).map(fmtMin).join(', '), walk };
  }
  return { mode: 'fixed', run: toSec('ed-run'), walk, rounds: Math.min(40, Math.max(1, parseInt($('ed-rounds').value) || 1)) };
}
function edFill(p) {
  ED.mode = p.mode || 'fixed';
  $('ed-run').value = fmtMin(p.run || 300); $('ed-rounds').value = p.rounds || 5;
  $('ed-custom').value = p.custom || runsOf(p).map(fmtMin).join(', ');
  $('ed-walk').value = fmtMin(p.walk || 60);
  edPaint();
}
function edPaint() {
  document.querySelectorAll('#ed-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === ED.mode));
  $('ed').classList.toggle('custom', ED.mode === 'custom');
  const p = edPlan(), segs = buildSegments({ ...p, warmup: 0, cooldown: 0 });
  $('ed-sum').textContent = `${planLabel(p)} · סה״כ ${fmt(segs.reduce((a, x) => a + x.dur, 0))}`;
}
function openEditor(w, s) {
  Object.assign(ED, { w, s });
  $('ed-title').textContent = s < 0 ? `אימון חדש בשבוע ${w + 1}` : `עריכת שבוע ${w + 1} · אימון ${s + 1}`;
  edFill(s < 0 ? (PROGRAM[w][PROGRAM[w].length - 1] || planOf(cfg)) : PROGRAM[w][s]);
  $('ed').showModal();
}
document.querySelectorAll('#ed-mode button').forEach(b => b.addEventListener('click', () => { ED.mode = b.dataset.m; edPaint(); }));
['ed-run', 'ed-rounds', 'ed-custom', 'ed-walk'].forEach(id => $(id).addEventListener('input', edPaint));
$('ed-copy').addEventListener('click', () => edFill(planOf(cfg)));
$('ed-cancel').addEventListener('click', () => $('ed').close());
$('ed-save').addEventListener('click', () => {
  const p = edPlan();
  if (ED.s < 0) PROGRAM[ED.w].push({ ...p, id: 'x' + Date.now().toString(36) });
  else PROGRAM[ED.w][ED.s] = { ...p, id: PROGRAM[ED.w][ED.s].id };
  saveProgram(); $('ed').close(); paintProgram(); paintProgCard();
});

$('prog-edit').addEventListener('click', () => { progEdit = !progEdit; paintProgram(); });
$('prog-back').addEventListener('click', () => { progEdit = false; show('setup'); });
$('prog-hide').addEventListener('click', () => { cfg.showProg = false; saveCfg(); show('setup'); });
$('prog-reset').addEventListener('click', () => {
  if (!confirm('לאפס את כל ההתקדמות בתוכנית?')) return;
  prog = { done: {} }; store.set('rw.prog', prog); paintProgram(); paintProgCard();
});

/* ---------- קול ושמע ---------- */
let heVoice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  heVoice = vs.find(v => /^(he|iw)/i.test(v.lang) && /google/i.test(v.name)) || vs.find(v => /^(he|iw)/i.test(v.lang)) || null;
  voiceHint();
}
function voiceHint() {
  $('voice-hint').textContent = cfg.voice !== 'tts' ? '' : heVoice ? '' :
    'לא נמצא קול עברי במכשיר. באנדרואיד: הגדרות ← המרת טקסט לדיבור ← מנוע Google ← להתקין עברית.';
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener('voiceschanged', pickVoice); }

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'he-IL'; if (heVoice) u.voice = heVoice;
  u.volume = cfg.volume;
  speechSynthesis.speak(u);
}

const audio = {
  ctx: null, keep: null, hum: null, bufs: {}, playing: [],
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
  // רעש זעיר בלולאה שלא שומעים – שומר את הדף "פעיל" כשהמסך נעול.
  // ב"מצב מוזיקה" לא מפעילים נגן מדיה, כדי לא לעצור את ספוטיפיי וכו'.
  startKeepAlive() {
    if (this.ctx && !this.hum) {
      const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() - 0.5) * 0.0004;
      this.hum = this.ctx.createBufferSource(); this.hum.buffer = b; this.hum.loop = true;
      this.hum.connect(this.ctx.destination); this.hum.start();
    }
    if (cfg.music) return;
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
  stopKeepAlive() {
    if (this.keep) this.keep.pause();
    if (this.hum) { try { this.hum.stop(); } catch (e) {} this.hum = null; }
  },
  async load(key) {
    const v = cfg.voice, id = v + '/' + key;
    if (this.bufs[id]) return this.bufs[id];
    const r = await fetch(`clips/${v}/${key}.mp3`);
    if (!r.ok) throw new Error('missing ' + key);
    const ab = await r.arrayBuffer();
    return (this.bufs[id] = await new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)));
  },
  stopPlaying() { this.playing.forEach(s => { try { s.stop(); } catch (e) {} }); this.playing = []; }
};

// השמעת משפט מורכב מכמה הקלטות. אם משהו חסר – הכל נקרא בקול של הטלפון.
async function say(keys) {
  keys = keys.filter(Boolean);
  const text = keys.map(k => k[0] === '#' ? k.slice(1) : CLIPS[k]).join(' ');
  if (cfg.voice === 'tts' || !audio.ctx || keys.some(k => k[0] === '#')) return speak(text);
  let bufs;
  try {
    bufs = await Promise.race([Promise.all(keys.map(k => audio.load(k))), new Promise((_, rej) => setTimeout(() => rej('slow'), 2500))]);
  } catch (e) { return speak(text); }
  audio.stopPlaying();
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
  const g = audio.ctx.createGain(); g.gain.value = cfg.volume; g.connect(audio.ctx.destination);
  let t = audio.ctx.currentTime + 0.05;
  bufs.forEach(b => {
    const s = audio.ctx.createBufferSource(); s.buffer = b; s.connect(g); s.start(t);
    audio.playing.push(s); t += b.duration + 0.08;
  });
}
// טעינה מראש של כל ההקלטות של הקול הנבחר (כדי שיעבדו גם בלי אינטרנט)
function prefetchVoice() {
  if (cfg.voice === 'tts' || store.get('rw.pref.' + cfg.voice, 0)) return;
  const keys = Object.keys(CLIPS), v = cfg.voice;
  let i = 0, bad = 0;
  const next = () => {
    if (i >= keys.length) { if (!bad) store.set('rw.pref.' + v, 1); return; }
    const batch = keys.slice(i, i += 12);
    Promise.all(batch.map(k => fetch(`clips/${v}/${k}.mp3`).then(r => { if (!r.ok) bad++; }, () => { bad++; })))
      .then(() => bad ? null : setTimeout(next, 150));
  };
  setTimeout(next, 2500);
}

/* ---------- מנוע הטיימר ---------- */
const W = { segs: [], total: 0, t0: 0, pausedAt: 0, pausedMs: 0, idx: -1, cue: {}, timer: null, lock: null, n: 0, lastCheer: 0 };
const now = () => Date.now();
const elapsed = () => ((W.pausedAt || now()) - W.t0 - W.pausedMs) / 1000;

function segKeys(seg, i) {
  const last = seg.round === W.n;
  if (seg.kind === 'run') {
    const k = [];
    if (cfg.round && W.n > 1) k.push(...(last ? ['rlast'] : seg.round === 1 ? ['r1', 'of' + W.n] : ['r' + seg.round, 'of' + W.n]));
    return [...k, 'now_run', ...durKeys(seg.dur)];
  }
  if (seg.kind === 'walk') return ['now_walk', ...durKeys(seg.dur), last ? 'last_seg' : ''];
  return [i === 0 ? 'warm' : 'cool', ...durKeys(seg.dur), 'walkw'];
}
function announce(seg, i) {
  audio.beep(1175, 260, 0.6);
  setTimeout(() => say(segKeys(seg, i)), 300);
  if (cfg.vibe && navigator.vibrate) navigator.vibrate(seg.kind === 'run' ? [300, 120, 300] : [600]);
  setMedia();
}
function cheerKey(seg) {
  if (seg.round === W.n) return 'cheer_last';
  let k; do { k = 1 + Math.floor(Math.random() * 7); } while (k === W.lastCheer);
  W.lastCheer = k; return 'cheer' + k;
}
const crossed = (remain, mark) => remain <= mark && remain > mark - 3;

function tick() {
  const e = elapsed();
  if (e >= W.total) return finish(true);
  let i = W.idx < 0 ? 0 : W.idx;
  while (i < W.segs.length - 1 && e >= W.segs[i + 1].start) i++;
  const seg = W.segs[i];
  if (i !== W.idx) { W.idx = i; W.cue = {}; announce(seg, i); }
  const remain = seg.start + seg.dur - e;

  if (!W.pausedAt) {
    if (cfg.half && seg.dur >= 120 && !W.cue.half && crossed(remain, seg.dur / 2)) { W.cue.half = 1; say(['half']); }
    // עידוד: בריצות של 2 דקות ומעלה, בחצי השני של האימון
    if (cfg.cheer && seg.kind === 'run' && seg.dur >= 120 && !W.cue.cheer && (seg.round > W.n / 2 || seg.round === W.n) && crossed(remain, seg.dur * 0.62)) {
      W.cue.cheer = 1; say([cheerKey(seg)]);
    }
    if (cfg.min && seg.dur >= 180 && !W.cue.min && crossed(remain, 60)) { W.cue.min = 1; say(['one_min']); }
    if (cfg.count) {
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
  $('round').textContent = seg.round ? `${seg.round}/${W.n}` : '–';
  $('elapsed').textContent = fmt(e);
  $('left').textContent = fmt(W.total - e);
  document.title = `${seg.label} ${fmt(remain)}`;
}

function setMedia() {
  if (cfg.music || !('mediaSession' in navigator) || W.idx < 0) return;
  const seg = W.segs[W.idx];
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: seg.label + (seg.round ? ` · סיבוב ${seg.round}/${W.n}` : ''),
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

async function start() {
  audio.unlock(); audio.startKeepAlive();
  if (cfg.voice === 'tts') speak(' '); // "פותח" את מנוע הדיבור מתוך לחיצת המשתמש
  W.segs = buildSegments(cfg); W.n = runsOf(cfg).length;
  W.total = W.segs.reduce((a, s) => a + s.dur, 0);
  W.plan = planOf(cfg);
  const nx = nextSession(); W.progId = nx && samePlan(nx.plan, cfg) ? nx.id : null;
  // טוענים מראש את כל ההקלטות של האימון
  if (cfg.voice !== 'tts') {
    $('start').textContent = '⏳ טוען קול...';
    const keys = new Set(['half', 'one_min', 'pause', 'resume', 'done', 'ran', 'record', 'prog_done', 'cheer_last', 'cheer1', 'cheer2', 'cheer3', 'cheer4', 'cheer5', 'cheer6', 'cheer7']);
    W.idx = -1; W.segs.forEach((s, i) => segKeys(s, i).forEach(k => k && k[0] !== '#' && keys.add(k)));
    await Promise.race([Promise.all([...keys].map(k => audio.load(k).catch(() => {}))), new Promise(r => setTimeout(r, 4000))]);
    $('start').textContent = '▶ התחלה';
  }
  W.t0 = now(); W.pausedAt = 0; W.pausedMs = 0; W.idx = -1; W.cue = {};
  show('run');
  wakeLock();
  clearInterval(W.timer); W.timer = setInterval(tick, 250);
  tick();
  if (!cfg.music && 'mediaSession' in navigator) {
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
    $('pause').textContent = '⏸ הפסקה'; say(['resume']); audio.startKeepAlive();
  } else {
    W.pausedAt = now(); $('pause').textContent = '▶ המשך'; say(['pause']);
  }
  setMedia(); tick();
}
function skip() {
  if (!W.timer || W.idx >= W.segs.length - 1) return;
  const target = W.segs[W.idx + 1].start;
  W.t0 -= (target - elapsed()) * 1000;
  tick();
}

/* ---------- סיום, שיאים והיסטוריה ---------- */
function bests(h) {
  return {
    run: Math.max(0, ...h.map(r => r.run || 0)),
    seg: Math.max(0, ...h.map(r => r.maxSeg || 0)),
  };
}
function finish(completed) {
  clearInterval(W.timer); W.timer = null;
  const e = Math.min(elapsed(), W.total);
  let runSec = 0, roundsDone = 0, maxSeg = 0;
  W.segs.forEach(s => {
    if (s.kind !== 'run') return;
    const part = Math.max(0, Math.min(s.dur, e - s.start));
    runSec += part; if (part >= s.dur) { roundsDone++; maxSeg = Math.max(maxSeg, s.dur); }
  });
  runSec = Math.round(runSec);

  const h = store.get('rw.history', []);
  const prev = bests(h);
  const recRun = h.length > 0 && runSec > prev.run, recSeg = h.length > 0 && maxSeg > prev.seg;
  let progDone = false;
  if (completed && W.progId) { prog.done[W.progId] = Date.now(); store.set('rw.prog', prog); progDone = true; }

  if (completed) {
    audio.stopPlaying();
    audio.beep(988, 200); setTimeout(() => audio.beep(1319, 400), 220);
    const ranK = runSec >= 60 ? durKeys(Math.round(runSec / 60) * 60) : durKeys(runSec);
    setTimeout(() => say(['done', 'ran', ...ranK, (recRun || recSeg) ? 'record' : '', progDone ? 'prog_done' : '']), 700);
    if (cfg.vibe && navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);
  } else { audio.stopPlaying(); if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  setTimeout(() => { if (!W.timer) audio.stopKeepAlive(); }, 9000);
  if (W.lock) { W.lock.release().catch(() => {}); W.lock = null; }
  document.body.className = ''; document.title = 'ריצה והליכה';

  if (e > 30) {
    h.unshift({ at: Date.now(), total: Math.round(e), run: runSec, rounds: roundsDone, of: W.n, plan: planLabel(W.plan), done: completed, maxSeg });
    store.set('rw.history', h.slice(0, 300));
  }
  $('done-title').textContent = completed ? 'כל הכבוד! 🎉' : 'האימון נעצר';
  $('summary').innerHTML = `
    ${recRun ? `<div class="rec">🏅 שיא חדש: הכי הרבה זמן ריצה באימון – ${fmt(runSec)}</div>` : ''}
    ${recSeg ? `<div class="rec">🏅 שיא חדש: ריצה רצופה הכי ארוכה – ${fmtShort(maxSeg)}</div>` : ''}
    ${progDone ? '<div class="rec prog-rec">📅 אימון בתוכנית סומן כבוצע ✓</div>' : ''}
    <div class="row"><span>זמן כולל</span><b>${fmt(e)}</b></div>
    <div class="row"><span>זמן ריצה</span><b>${fmt(runSec)}</b></div>
    <div class="row"><span>סיבובים שהושלמו</span><b>${roundsDone} מתוך ${W.n}</b></div>
    <div class="row"><span>תוכנית</span><b>${planLabel(W.plan)}</b></div>`;
  paintHistory(); paintStats(); paintProgCard();
  show('done');
}
function weekStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d.getTime(); }
function paintStats() {
  const h = store.get('rw.history', []);
  const box = $('stats-card');
  if (!h.length) { box.innerHTML = ''; return; }
  const ws = weekStart(Date.now()), wk = h.filter(r => r.at >= ws);
  const weekRun = wk.reduce((a, r) => a + r.run, 0);
  // רצף שבועות עם לפחות אימון אחד (השבוע הנוכחי נספר אם כבר רצת בו)
  const weeks = new Set(h.map(r => weekStart(r.at)));
  let streak = 0, w = ws;
  if (!weeks.has(w)) w -= 7 * 864e5;
  while (weeks.has(w)) { streak++; w = weekStart(w - 3 * 864e5); }
  const b = bests(h);
  box.innerHTML = `<div class="card stats-card">
    <div class="st-h">📊 הסטטיסטיקה שלי</div>
    <div class="st-grid">
      <div><b>${Math.round(weekRun / 60)}</b><small>דק׳ ריצה השבוע</small></div>
      <div><b>${wk.length}</b><small>אימונים השבוע</small></div>
      <div><b>${streak}</b><small>שבועות ברצף</small></div>
    </div>
    <div class="st-best">🏅 ריצה רצופה הכי ארוכה: <b>${b.seg ? fmtShort(b.seg) : '–'}</b> · הכי הרבה ריצה באימון: <b>${fmt(b.run)}</b></div>
    <button class="btn ghost small" id="hist-open">🗂️ כל הריצות (${h.length})</button>
  </div>`;
  $('hist-open').onclick = () => { paintHistory(); show('hist'); };
}
// רשימת ריצות עם כפתור מחיקה לכל אחת. מופיעה בסיכום (5 אחרונות) ובמסך "כל הריצות"
function paintHistory() {
  const h = store.get('rw.history', []);
  const row = r => {
    const d = new Date(r.at);
    return `<li><div><b>${d.getDate()}.${d.getMonth() + 1} · ריצה ${fmt(r.run)}${r.done ? ' ✓' : ''}</b><span>${r.plan}</span></div>
      <button class="mini del" data-at="${r.at}" aria-label="מחיקה">🗑️</button></li>`;
  };
  const empty = '<li><span>עוד אין ריצות שמורות</span></li>';
  $('history').innerHTML = h.slice(0, 5).map(row).join('') || empty;
  $('hist-all').innerHTML = h.map(row).join('') || empty;
  $('hist-clear').hidden = !h.length;
  document.querySelectorAll('.history .del').forEach(b => b.addEventListener('click', () => {
    if (!confirm('למחוק את הריצה הזו?')) return;
    store.set('rw.history', store.get('rw.history', []).filter(r => String(r.at) !== b.dataset.at));
    paintHistory(); paintStats();
  }));
}
$('hist-back').addEventListener('click', () => show('setup'));
$('hist-clear').addEventListener('click', () => {
  if (!confirm('למחוק את כל הריצות השמורות? (הסימונים בתוכנית נשארים)')) return;
  store.set('rw.history', []); paintHistory(); paintStats(); show('setup');
});

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

buildSteppers(); bindSettings(); paintSetup(); paintPresets(); paintTotal(); paintProgCard(); paintStats(); prefetchVoice();
