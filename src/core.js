/* core.js — 渲染器 / 相机 / 输入 / 合成器音效 / UI 胶水 */
(() => {
'use strict';
const T = THREE, G = window.G = window.G || {};
G.T = T; G.TAU = Math.PI * 2;
G.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
G.lerp = (a, b, t) => a + (b - a) * t;
G.damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
G.rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
G.randi = (a, b) => Math.floor(G.rand(a, b + 1));
G.choice = a => a[(Math.random() * a.length) | 0];
/* 带种子随机：给每个建筑模块一份确定性的"个性" */
G.mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

window.addEventListener('error', e => {
  const el = document.getElementById('err');
  el.style.display = 'block';
  el.textContent = '⚠ ' + (e.message || e.error) + ' @' + (e.lineno || '?');
});

/* ---------- 渲染器 / 场景 ---------- */
const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
/* 内部分辨率封顶 ~1.5M 设备像素（含 DPI 缩放）：大窗口/高DPI自动降采样，保底 0.5 倍 */
const MAXP = 1500000;
function fitRenderer() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const total = innerWidth * innerHeight * dpr * dpr;
  const s = Math.min(dpr, Math.sqrt(MAXP / (innerWidth * innerHeight)));
  renderer.setPixelRatio(1);
  renderer.setSize(Math.max(1, Math.round(innerWidth * s)), Math.max(1, Math.round(innerHeight * s)), false);
}
fitRenderer();
renderer.outputEncoding = T.sRGBEncoding;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);
G.renderer = renderer;

const scene = new T.Scene();
scene.fog = new T.FogExp2(0x101730, 0.006);
G.scene = scene;
G.camera = new T.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1800);
G.camera.position.set(30, 24, 46);

addEventListener('resize', () => {
  G.camera.aspect = innerWidth / innerHeight;
  G.camera.updateProjectionMatrix();
  fitRenderer();
});

/* ---------- 全屏 ---------- */
G.fullscreen = {
  on() { return !!(document.fullscreenElement); },
  enter() { if (!document.fullscreenElement && document.documentElement.requestFullscreen) { try { document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {} } },
  toggle() { if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} } else this.enter(); },
};

/* ---------- 输入 ---------- */
const input = G.input = { dragging: false, dx: 0, dy: 0, wheel: 0, px: 0, py: 0 };
const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => { if (e.button !== 0) return; input.dragging = true; input.px = e.clientX; input.py = e.clientY; });
addEventListener('pointermove', e => {
  if (!input.dragging) return;
  input.dx += e.clientX - input.px; input.dy += e.clientY - input.py;
  input.px = e.clientX; input.py = e.clientY;
});
addEventListener('pointerup', () => {
  input.dragging = false;
  const a = document.activeElement;                 // 用完控件即失焦，保证打字热键畅通
  if (a && (a.type === 'range' || a.tagName === 'SELECT')) a.blur();
});
cv.addEventListener('wheel', e => { e.preventDefault(); input.wheel += e.deltaY; }, { passive: false });
addEventListener('keydown', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (t?.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) ||
    (G.game?.state === 'play' && [' ', 'Tab', 'Backspace'].includes(e.key))) e.preventDefault();
  if (G.onKey) G.onKey(e);
});

/* ---------- 设置（持久化） ---------- */
let _set = { bgm: .6, sfx: .8, tick: true };
try { _set = Object.assign(_set, JSON.parse(localStorage.getItem('tr-set') || '{}')); } catch (e) {}
G.settings = _set;
G.saveSettings = () => { try { localStorage.setItem('tr-set', JSON.stringify(_set)); } catch (e) {} };

/* ---------- 合成器音效 + lo-fi BGM（无素材，WebAudio 现场合成） ---------- */
const audio = G.audio = {
  ctx: null, master: null, musicG: null, sfxG: null, rainG: null, windG: null, noise: null, ready: false,
  init() {
    if (this.ready) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const c = this.ctx = new C();
      this.master = c.createGain(); this.master.gain.value = .95; this.master.connect(c.destination);
      this.musicG = c.createGain(); this.musicG.gain.value = _set.bgm * .7; this.musicG.connect(this.master);
      this.sfxG = c.createGain(); this.sfxG.gain.value = _set.sfx; this.sfxG.connect(this.master);
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      const mk = (f, type, dest) => {
        const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
        const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f;
        const g = c.createGain(); g.gain.value = 0;
        s.connect(fl); fl.connect(g); g.connect(dest); s.start();
        return g;
      };
      this.rainG = mk(1400, 'lowpass', this.master);
      this.windG = mk(500, 'bandpass', this.master);
      this.ready = true;
      this.bgmStart();
    } catch (e) { /* 无声降级 */ }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setBgm(v) { _set.bgm = v; if (this.musicG) this.musicG.gain.value = v * .7; if (this.media) this.media.volume = v * .85; G.saveSettings(); },
  setSfx(v) { _set.sfx = v; if (this.sfxG) this.sfxG.gain.value = v; G.saveSettings(); },
  amb(rain, wind) {
    if (!this.ready) return; const t = this.ctx.currentTime;
    this.rainG.gain.linearRampToValueAtTime(rain * .45, t + .9);
    this.windG.gain.linearRampToValueAtTime(wind * .26, t + .9);
  },
  _tone(t, f, { dur = .15, type = 'sine', vol = .2, slide = 0, dest } = {}) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxG); o.start(t); o.stop(t + dur + .05);
  },
  _burst(t, { dur = .6, f0 = 800, f1 = 120, vol = .4, hp = false, dest } = {}) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const fl = c.createBiquadFilter(); fl.type = hp ? 'highpass' : 'lowpass';
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest || this.sfxG); s.start(t); s.stop(t + dur + .1);
  },
  tone(f, o = {}) { if (!this.ready) return; this._tone(this.ctx.currentTime + (o.at || 0), f, o); },
  burst(o = {}) { if (!this.ready) return; this._burst(this.ctx.currentTime + (o.at || 0), o); },
  /* 打字键音：轻而清脆 */
  click() {
    if (!_set.tick || !this.ready) return;
    const t = this.ctx.currentTime;
    this._tone(t, 2350 + Math.random() * 250, { dur: .028, type: 'sine', vol: .11 });
    this._tone(t, 3600, { dur: .014, type: 'sine', vol: .04 });
  },
  err() {
    if (!this.ready) return; const t = this.ctx.currentTime;
    this._tone(t, 140, { dur: .22, type: 'sawtooth', vol: .2, slide: -60 });
    this._tone(t, 92, { dur: .16, type: 'square', vol: .12 });
    this._burst(t, { dur: .1, f0: 500, f1: 120, vol: .12 });
  },
  ok(combo) {
    const b = 520 * Math.pow(1.059, Math.min(combo, 12));
    this.tone(b, { dur: .09, type: 'triangle', vol: .15 });
    this.tone(b * 1.5, { dur: .14, type: 'triangle', vol: .12, at: .055 });
  },
  word() { [740, 932, 1244].forEach((f, i) => this.tone(f, { dur: .16, vol: .13, at: i * .05 })); },
  thunder(at = 0) { this.burst({ dur: 1.7, f0: 420, f1: 48, vol: .5, at }); this.tone(46, { dur: 1.2, vol: .3, slide: -15, at }); },
  rumble() { this.tone(42, { dur: .9, vol: .25 }); },
  growl() { this.tone(90, { dur: .5, type: 'sawtooth', vol: .18, slide: -45 }); },
  over() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, { dur: .4, type: 'triangle', vol: .2, at: i * .22 })); },
  speak(word) {
    try {
      if (!window.speechSynthesis) return false;
      speechSynthesis.cancel();
      const acc = (window.G.cfg && window.G.cfg.accent) || 'us';
      const u = new SpeechSynthesisUtterance(word);
      u.lang = acc === 'uk' ? 'en-GB' : 'en-US';
      u.rate = .82; u.volume = 1;
      const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
      if (vs.length) u.voice = vs.find(v => v.lang.replace('_', '-').toLowerCase() === u.lang.toLowerCase()) || vs[0];
      speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  },
  hover() {
    if (!this.ready) { this.init(); }
    if (!this.ready) return; const t = this.ctx.currentTime;
    this._tone(t, 1750, { dur: .07, type: 'sine', vol: .22 });
    this._tone(t + .03, 2600, { dur: .05, type: 'sine', vol: .1 });
  },
  uiClick() {
    if (!this.ready) return; const t = this.ctx.currentTime;
    this._tone(t, 950, { dur: .07, type: 'triangle', vol: .22 });
    this._tone(t + .02, 1900, { dur: .05, type: 'sine', vol: .1 });
  },
  /* ---------- BGM：优先 audio/ 目录真实音轨，缺失/失败回退合成 ---------- */
  bgm: { on: false, step: 0, next: 0, timer: null,
    CH: [[220, 261.6, 329.6, 392], [174.6, 220, 261.6, 349.2], [130.8, 164.8, 196, 261.6], [196, 246.9, 293.7, 329.6]],
    PENTA: [0, 3, 5, 7, 10],
  },
  tracks: ['audio/bgm1.mp3', 'audio/bgm2.mp3', 'audio/bgm3.mp3'],
  media: null, mediaTried: false,
  bgmStart() {
    if (!this.ready || this.bgm.on) return;
    if (!this.mediaTried) {
      this.mediaTried = true;
      const a = this.media = new Audio(this.tracks[(Math.random() * this.tracks.length) | 0]);
      a.loop = true; a.volume = _set.bgm * .85;
      a.addEventListener('error', () => { this.media = null; this._synthStart(); });
      const pr = a.play();
      if (pr && pr.then) {
        pr.then(() => { this.bgm.on = true; }).catch(() => { this.media = null; this._synthStart(); });
      } else this._synthStart();
      return;
    }
    this._synthStart();
  },
  _synthStart() {
    if (!this.ready || this.bgm.on) return;
    this.bgm.on = true; this.bgm.step = 0;
    this.bgm.next = this.ctx.currentTime + .15;
    const loop = () => {
      if (!this.bgm.on) return;
      const c = this.ctx, B = this.bgm, SD = .235;
      while (B.next < c.currentTime + .7) {
        const t = B.next, st = B.step, s16 = st % 16;
        const chord = B.CH[(st >> 4) % 4];
        if (s16 === 0) for (const f of chord) this._tone(t, f / 2, { dur: 3.4, type: 'triangle', vol: .05, dest: this.musicG });
        if (s16 === 0 || s16 === 8) this._tone(t, 96, { dur: .14, type: 'sine', vol: .22, slide: -56, dest: this.musicG });
        if (s16 === 4 || s16 === 12) this._burst(t, { dur: .08, f0: 1100, f1: 500, vol: .06, dest: this.musicG });
        if (s16 % 2 === 1) this._burst(t, { dur: .03, f0: 7000, f1: 6000, vol: .03, hp: true, dest: this.musicG });
        if ([2, 5, 9, 13].includes(s16) && Math.random() < .72) {
          const deg = B.PENTA[(Math.random() * B.PENTA.length) | 0];
          const f = chord[(Math.random() * chord.length) | 0] * 2 * Math.pow(2, (deg - 5) / 12);
          this._tone(t, f, { dur: .5, type: 'sine', vol: .06, dest: this.musicG });
        }
        B.step++; B.next += SD;
      }
      this.bgm.timer = setTimeout(loop, 180);
    };
    loop();
  },
};

/* 首次交互即启声（浏览器自动播放策略）；悬停也想有声，故鼠标一动就尝试启动 */
const wake = () => { audio.init(); audio.resume(); };
addEventListener('pointerdown', wake);
addEventListener('keydown', wake);
addEventListener('mousemove', wake, { once: true, passive: true });

/* 全局点击：水波涟漪特效 + 轻点音 */
addEventListener('pointerdown', e => {
  for (const cls of ['', ' r2']) {
    const d = document.createElement('div');
    d.className = 'ripple' + cls;
    d.style.left = e.clientX + 'px';
    d.style.top = e.clientY + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 850);
  }
  audio.uiClick();
});

/* ---------- UI ---------- */
const $ = id => document.getElementById(id);
G.ui = {
  el: {
    dist: $('dist'), spd: $('spd'), wpm: $('wpm'), scoreN: $('scoreN'), wordN: $('wordN'),
    combo: $('combo'), zh: $('zhflash'), words: $('words'), hint: $('hint'), hud: $('hud'),
    menu: $('menu'), over: $('over'), track: $('track'), mBoss: $('mBoss'), mMe: $('mMe'),
    danger: $('danger'), flash: $('flash'), toast: $('toast'), clock: $('ctlClock'),
  },
  toastT: 0,
  toast(msg, ms = 1500) {
    const t = this.el.toast; t.textContent = msg; t.classList.add('on');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('on'), ms);
  },
  flash(a) { this.el.flash.style.opacity = G.clamp(a, 0, 1).toFixed(3); },
  setDanger(x) { this.el.danger.style.opacity = G.clamp(x, 0, 1).toFixed(2); this.el.track.classList.toggle('hot', x > .05); },
  zh(txt) { const z = this.el.zh; z.textContent = txt; z.classList.remove('pop'); void z.offsetWidth; z.classList.add('pop'); },
  comboPop(n) { const c = this.el.combo; c.textContent = '×' + n; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); },
};

/* ---------- 通用贴图 ---------- */
G.canvasTex = (w, h, fn, o = {}) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c); t.anisotropy = 8;
  if (o.sRGB !== false) t.encoding = T.sRGBEncoding;
  if (o.repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
  return t;
};
const once = fn => { let v; return () => v || (v = fn()); };
G.glowTex = once(() => G.canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
}, { sRGB: false }));
G.streakTex = once(() => G.canvasTex(64, 256, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
}, { sRGB: false }));
G.flakeTex = once(() => G.canvasTex(32, 32, (g) => {
  const gr = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.6, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
}, { sRGB: false }));
G.petalTex = once(() => G.canvasTex(32, 32, (g) => {
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(16, 16, 11, 6, .6, 0, G.TAU); g.fill();
}, { sRGB: false }));
})();
