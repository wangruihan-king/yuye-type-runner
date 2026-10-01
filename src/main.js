/* main.js — 状态机 / 追逐逻辑 / 相机 / 面板与热键 / 主循环 */
(() => {
'use strict';
const T = THREE, G = window.G, E = G.env;
const clamp = G.clamp, lerp = G.lerp, damp = G.damp, rand = G.rand;
const $ = id => document.getElementById(id);

const WEATHER_ORDER = ['sun', 'cloud', 'rain', 'storm', 'snow', 'fog'];
const clock = new T.Clock();

/* ---------- 玩法配置（菜单可改，持久化） ---------- */
G.DIFF = {
  low:  { ivMul: 1.45, label: '入门', hint: '120 灯火，影弹较慢，330 秒战斗时间。适合第一次护灯。' },
  mid:  { ivMul: 1,    label: '标准', hint: '100 灯火，240 秒战斗时间。需要兼顾出击、护盾和词义闪避。' },
  high: { ivMul: .78,  label: '困难', hint: '85 灯火，180 秒战斗时间；敌人更坚韧，影弹更密集。' },
};
const BANK_LABEL = { cet4: '四级真题高频', ielts: '雅思词汇真经' };
const MODE_LABEL = { quest: '护灯闯关', learn: '记忆训练', recall: '中文回忆', spell: '字形练习', hear: '听写练习' };
let _cfg = { bank: 'cet4', diff: 'mid', mode: 'quest' };
try { _cfg = Object.assign(_cfg, JSON.parse(localStorage.getItem('tr-cfg') || '{}')); } catch (e) {}
if (!G.words.banks[_cfg.bank]) _cfg.bank = 'cet4';
if (!G.DIFF[_cfg.diff]) _cfg.diff = 'mid';
if (!MODE_LABEL[_cfg.mode]) _cfg.mode = 'learn';
if (_cfg.gameplayVersion !== 2) { _cfg.mode = 'quest'; _cfg.gameplayVersion = 2; }
G.cfg = _cfg;
G.saveCfg = () => { try { localStorage.setItem('tr-cfg', JSON.stringify(_cfg)); } catch (e) {} };

/* ---------- 纪录（持久化） ---------- */
let REC = { bestDist: 0, bestCombo: 0, totalWords: 0, runs: [] };
try {
  REC = Object.assign(REC, JSON.parse(localStorage.getItem('tr-rec') || '{}'));
  if (!Array.isArray(REC.runs)) REC.runs = [];
  const old = localStorage.getItem('tr-best');
  if (old && !REC.bestDist) { try { REC.bestDist = JSON.parse(old).dist || 0; } catch (e) {} }
} catch (e) {}
function saveRec() { try { localStorage.setItem('tr-rec', JSON.stringify(REC)); } catch (e) {} }
function refreshRecards() {
  $('rcDist').textContent = REC.bestDist > 0 ? REC.bestDist + ' m' : '—';
  $('rcCombo').textContent = REC.bestCombo > 0 ? '×' + REC.bestCombo : '—';
  $('rcWords').textContent = REC.totalWords;
  const m = G.learning.overview();
  $('memSeen').textContent = m.seen; $('memMastered').textContent = m.mastered; $('memDue').textContent = m.due;
  $('memoryFill').style.width = (m.seen / m.total * 100) + '%';
  $('memoryNote').textContent = m.seen ? '已认识 ' + m.seen + ' / ' + m.total + ' 词 · 连续三次按期回忆后计为熟悉' : '从第一个单词，开始积累。';
  $('btnReview').disabled = !m.seen;
  const q = G.quest.records;
  $('questRecord').textContent = '护灯纪录 · ' + q.wins + ' 次通关 · 最佳 ' + (q.bestStars ? '★'.repeat(q.bestStars) : '—');
}
function renderRecList() {
  const el = $('recList');
  el.innerHTML = REC.runs.length
    ? REC.runs.map(r => `<div class="rrow"><i>${r.d}m</i><span>${r.w} 词</span><span>${r.pm} WPM</span><span style="margin-left:auto;opacity:.6">${r.t}</span></div>`).join('')
    : '<div class="rrow" style="border:none;opacity:.6">还没有纪录 —— 先跑一次？</div>';
}

const game = G.game = {
  state: 'menu', diff: 0,
  dist: 0, score: 0, zStart: 0,
  timeScale: 1, shake: 0,
  fovKick: 0,
  countdown: 0, _rdy: '',
};

/* ---------- 面板 ---------- */
function initPanel() {
  const timeS = $('ctlTime'), auto = $('ctlAuto'), spd = $('ctlSpeed'), intS = $('ctlInt');
  timeS.addEventListener('input', () => { E.setTime(parseFloat(timeS.value)); refreshClock(); });
  auto.addEventListener('change', () => { E.timeAuto = auto.checked; });
  spd.addEventListener('change', () => { E.timeSpeed = parseFloat(spd.value); });
  intS.addEventListener('input', () => E.setIntensity(parseFloat(intS.value)));
  document.querySelectorAll('.wbtn').forEach(b => b.addEventListener('click', () => {
    E.setWeather(b.dataset.w); syncPanel();
  }));
  document.querySelectorAll('.sbtn').forEach(b => b.addEventListener('click', () => {
    E.setSeason(b.dataset.s); syncPanel();
  }));  /* 悬停自动展开 / 远离自动收成球；H 可"钉住"常开 */
  let pinned = false;
  const p = $('panel'), ic = $('panelIcon');
  const expand = () => { p.classList.remove('min'); ic.classList.remove('show'); };
  const collapse = () => { p.classList.add('min'); ic.classList.add('show'); };
  ic.addEventListener('mouseenter', expand);
  ic.addEventListener('click', () => { pinned = true; expand(); });
  /* 常驻检查：光标不在面板/球上就收起（覆盖"从未进入过面板"的情况） */
  let lastCheck = 0;
  addEventListener('mousemove', () => {
    const now = performance.now();
    if (now - lastCheck < 250) return;
    lastCheck = now;
    if (!pinned && !p.classList.contains('min') && !p.matches(':hover') && !ic.matches(':hover')) collapse();
  }, { passive: true });
  $('panelMin').addEventListener('click', () => { pinned = false; collapse(); });
  G.togglePanel = () => {
    if (p.classList.contains('min')) { pinned = true; expand(); }
    else { pinned = false; collapse(); }
  };
  syncPanel();
  collapse();
}
function syncPanel() {
  document.querySelectorAll('.wbtn').forEach(b => b.classList.toggle('on', b.dataset.w === E.weather));
  document.querySelectorAll('.sbtn').forEach(b => b.classList.toggle('on', b.dataset.s === E.season));
  $('ctlTime').value = E.tTarget;
  $('ctlInt').value = E.intensity;
  $('ctlAuto').checked = E.timeAuto;
}
let lastClockStr = '';
function refreshClock() {
  const s = E.label();
  if (s !== lastClockStr) { $('ctlClock').textContent = s; $('ctlTime').value = E.time; lastClockStr = s; }
}

/* ---------- 菜单：标题 / 编号行 / 子面板 / 设置 ---------- */
let menuSel = 0;
const ROWS = ['rowStart', 'rowDiff', 'rowBank', 'rowMode', 'rowRec', 'rowSet'];
function showPanel(id) {
  for (const p of ['spDiff', 'spBank', 'spMode', 'spRec']) $(p).classList.toggle('show', p === id);
}
function syncMenuTags() {
  $('diffTag').textContent = G.DIFF[_cfg.diff].label;
  $('bankTag').textContent = BANK_LABEL[_cfg.bank];
  $('bankTag').title = G.words.banks[_cfg.bank].length + ' 个词条';
  $('modeTag').textContent = MODE_LABEL[_cfg.mode];
  $('rowStart').querySelector('.cn').textContent = _cfg.mode === 'quest' ? '出发，迎战遗忘' : '开始' + MODE_LABEL[_cfg.mode];
  const meta = document.querySelectorAll('.session-meta span');
  meta[0].textContent = _cfg.mode === 'quest' ? '6 词卡组' : '10 词练习';
  meta[1].textContent = _cfg.mode === 'quest' ? '出击 / 护盾 / 鲸潮' : '认识 → 回忆 → 复习';
  document.querySelectorAll('#spDiff button').forEach(b => b.classList.toggle('on', b.dataset.diff === _cfg.diff));
  document.querySelectorAll('#spBank button').forEach(b => b.classList.toggle('on', b.dataset.bank === _cfg.bank));
  if ($('bankTip')) $('bankTip').textContent = _cfg.bank === 'ielts' ? '来自你提供的《雅思词汇真经》PDF，共 3629 个词条，保留原中文释义。短语的空格和连字符自动补齐，只需输入字母。' : '四级真题高频词，部分单词配有游戏场景例句。';
  document.querySelectorAll('#spMode button[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === _cfg.mode));
  document.querySelectorAll('#spMode [data-accent]').forEach(b => b.classList.toggle('on', b.dataset.accent === (_cfg.accent || 'us')));
  $('diffHint').textContent = G.DIFF[_cfg.diff].hint;
}
function initMenu() {
  const t = $('mTitle');
  '雨夜词旅'.split('').forEach((c, i) => {
    const s = document.createElement('span');
    s.textContent = c; s.style.setProperty('--i', i);
    t.appendChild(s);
  });
  $('rowStart').addEventListener('click', () => startGame());
  $('btnReview').addEventListener('click', () => startGame(true, null, 'recall'));
  ROWS.forEach((id, i) => $(id).addEventListener('focus', () => {
    menuSel = i; ROWS.forEach((row, j) => $(row).classList.toggle('sel', j === i));
  }));
  const toggleRow = (row, panel) => {
    $(row).addEventListener('click', () => {
      G.audio.init();
      const p = $(panel);
      const willShow = !p.classList.contains('show');
      showPanel(willShow ? panel : null);
      if (panel === 'spRec') renderRecList();
    });
  };
  toggleRow('rowDiff', 'spDiff');
  /* 词库子面板：按现有词库动态生成，每个选项带单词数量 */
  const bankBox = $('spBank');
  bankBox.innerHTML = '';
  for (const k of Object.keys(G.words.banks)) {
    const b = document.createElement('button');
    b.dataset.bank = k;
    b.textContent = BANK_LABEL[k] + '（' + G.words.banks[k].length + ' 词）';
    b.addEventListener('click', () => { _cfg.bank = k; G.saveCfg(); syncMenuTags(); refreshRecards(); });
    b.addEventListener('mouseenter', () => G.audio.hover());
    bankBox.appendChild(b);
  }
  const bankTip = document.createElement('p');
  bankTip.id = 'bankTip';
  bankTip.textContent = '四级真题高频词（按真题句频排序），部分单词配有游戏场景例句。';
  bankBox.appendChild(bankTip);
  toggleRow('rowBank', 'spBank');
  toggleRow('rowMode', 'spMode'); toggleRow('rowRec', 'spRec');
  $('rowSet').addEventListener('click', () => { G.audio.init(); openSettings(); });
  document.querySelectorAll('#spDiff button').forEach(b => b.addEventListener('click', () => { _cfg.diff = b.dataset.diff; G.saveCfg(); syncMenuTags(); }));
  document.querySelectorAll('#spMode button[data-mode]').forEach(b => b.addEventListener('click', () => { _cfg.mode = b.dataset.mode; G.saveCfg(); syncMenuTags(); }));
  document.querySelectorAll('#spMode [data-accent]').forEach(b => b.addEventListener('click', () => {
    _cfg.accent = b.dataset.accent; G.saveCfg(); syncMenuTags();
    const t = G.typing.stats.active[0]; if (t) G.audio.speak(t.w);
  }));
  /* 悬停高光音效：轻点一声 */
  document.querySelectorAll('.mrow,.m-subpanel button,.wbtn,.sbtn').forEach(el =>
    el.addEventListener('mouseenter', () => G.audio.hover()));
  syncMenuTags();
  refreshRecards();
  /* 设置弹窗 */
  const sb = $('setBgm'), ss = $('setSfx'), st = $('setTick');
  sb.value = G.settings.bgm; ss.value = G.settings.sfx; st.checked = G.settings.tick;
  $('setBgmV').textContent = Math.round(G.settings.bgm * 100) + '%';
  $('setSfxV').textContent = Math.round(G.settings.sfx * 100) + '%';
  sb.addEventListener('input', () => { G.audio.setBgm(parseFloat(sb.value)); $('setBgmV').textContent = Math.round(sb.value * 100) + '%'; });
  ss.addEventListener('input', () => { G.audio.setSfx(parseFloat(ss.value)); $('setSfxV').textContent = Math.round(ss.value * 100) + '%'; });
  st.addEventListener('change', () => { G.settings.tick = st.checked; G.saveSettings(); });
  $('setTry').addEventListener('click', () => { G.audio.click(); setTimeout(() => G.audio.click(), 160); setTimeout(() => G.audio.ok(3), 320); });
  $('setClose').addEventListener('click', closeSettings);
  $('setModal').addEventListener('click', e => { if (e.target === $('setModal')) closeSettings(); });
}
function openSettings() { $('setModal').classList.add('on'); }
function closeSettings() { $('setModal').classList.remove('on'); }

/* ---------- 状态切换 ---------- */
function startGame(reviewOnly = false, targets = null, modeOverride = null) {
  G.audio.init(); G.audio.resume();
  closeSettings(); showPanel(null);
  game.state = 'play';
  game.mode = modeOverride || _cfg.mode;
  G.saveCfg();
  document.body.dataset.mode = game.mode;
  document.querySelector('.journey-name').textContent = MODE_LABEL[game.mode];
  document.body.dataset.state = 'play';
  $('pause').hidden = true;
  learnedList.length = 0;
  G.learning.begin(reviewOnly, targets);
  game.lastStop = 0;
  game.zStart = G.actors.player.z;
  game.dist = 0; game.score = 0; game.timeScale = 1; game.fovKick = 0;
  game.countdown = 2.0; game._rdy = '';
  G.actors.player.speed = 0;
  G.actors.player.boost = 0; G.actors.player.errT = 0;
  G.typing.reset(); G.typing.stats.t0 = performance.now();
  if (game.mode === 'quest') { G.quest.begin(); camYaw = .32; camPitch = .12; camDist = 10; }
  else G.quest.stop();
  $('menu').classList.add('off');
  $('over').classList.remove('on');
  $('hud').classList.add('on');
  G.refreshJourney();
  G.ui.toast(game.mode === 'quest' ? '护灯任务：击退三处影怪，破除最终单词封印' : '今晚的目标：带回 ' + G.learning.session.selected.length + ' 枚记忆');
  say('go', 3, '出发', 600);
}
function toMenu() {
  game.state = 'menu';
  document.body.dataset.state = 'menu';
  $('pause').hidden = true;
  G.quest.stop();
  refreshRecards();
  game.countdown = 0; game._rdy = '';
  $('readyTxt').textContent = '';
  game._log = (game._log || []).concat(['menu@' + Math.round(G.actors.player.z)]);
  $('hud').classList.remove('on');
  $('over').classList.remove('on');
  $('menu').classList.remove('off');
  G.typing.reset();
}
function endStroll() {
  if (game.state !== 'play' && game.state !== 'pause') return;
  game.state = 'over';
  document.body.dataset.state = 'over';
  $('pause').hidden = true;
  $('readyTxt').textContent = '';
  if (window.speechSynthesis) speechSynthesis.cancel();
  G.audio.word();
  const T2 = G.typing.stats;
  const dist = Math.max(0, Math.round(-game.dist)), wpm = G.typing.wpm();
  $('ovDist').textContent = dist;
  const session = G.learning.session;
  $('ovWords').textContent = session.results.size;
  $('ovTitle').textContent = session.finished ? '十枚记忆，到站了。' : '今晚，记住了什么？';
  $('ovWpm').textContent = wpm;
  $('ovCombo').textContent = T2.maxCombo;
  const q = game.mode === 'quest' ? G.quest.run : null;
  const labels = document.querySelectorAll('.o-grid span');
  ['距离 m', '单词', 'WPM', '最大连击'].forEach((label, i) => labels[i].textContent = label);
  if (q) {
    $('ovTitle').textContent = q.phase === 'won' ? '护灯成功 · ' + '★'.repeat(q.stars) : (q.reason || '本次撤退') + ' · 再战一次';
    $('ovDist').textContent = q.cleared + '/3'; labels[0].textContent = '夺回街区';
    $('ovWords').textContent = q.remembered.size; labels[1].textContent = '回忆符文';
    $('ovWpm').textContent = Math.ceil(q.hp); labels[2].textContent = '剩余灯火';
  }
  const learned = $('ovLearned');
  learned.innerHTML = '';
  for (const w of session.selected) {
    const r = session.results.get(w.w);
    const item = document.createElement('button'); item.type = 'button'; item.className = 'summary-word';
    const en = document.createElement('strong'); en.textContent = w.display || w.w;
    const zh = document.createElement('span'); zh.textContent = w.zh;
    const label = document.createElement('small');
    label.textContent = r?.status === 'remembered' ? '已回忆 ✓' : r?.status === 'practiced' ? '已练习' : '待记忆';
    item.dataset.status = r?.status || 'review'; item.append(en, zh, label);
    item.title = '点击朗读 ' + w.w; item.addEventListener('click', () => G.audio.speak(w.w));
    learned.appendChild(item);
  }
  const mis = $('ovMissed'); mis.innerHTML = '';
  const ML = [...session.wrong.values()].filter(t => !session.recovered.has(t.w));
  if (ML.length) {
    const mt = document.createElement('span'); mt.className = 'mt';
    mt.textContent = '需要再记一次 · 已加入复习'; mis.appendChild(mt);
    for (const m of ML.slice(-8)) {
      const i = document.createElement('i');
      i.innerHTML = m.w + '<b>' + m.zh + '</b>';
      mis.appendChild(i);
    }
  }
  const isBest = dist > (REC.bestDist || 0);
  REC.bestDist = Math.max(REC.bestDist || 0, dist);
  REC.bestCombo = Math.max(REC.bestCombo || 0, T2.maxCombo);
  REC.totalWords = (REC.totalWords || 0) + T2.wordsDone;
  REC.runs.unshift({ d: dist, w: T2.wordsDone, pm: wpm, t: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) });
  REC.runs = REC.runs.slice(0, 5);
  saveRec(); refreshRecards();
  $('ovBest').textContent = (isBest ? '★ 新纪录 ' : '最近最远 ') + REC.bestDist + 'm';
  const remembered = [...session.results.values()].filter(r => r.status === 'remembered').length;
  $('ovMemory').textContent = '独立回忆 ' + remembered + ' 词 · 准确率 ' + G.typing.accuracy() + '% · 找回错词 ' + session.recovered.size + ' 词。回忆成功的词会在 1、3、7、14、30 天后复习。';
  if (q) {
    $('ovBest').textContent = '本局 ' + game.score + ' 分 · ' + q.hints + ' 次提示 · 最佳 ' + (G.quest.records.bestStars ? '★'.repeat(G.quest.records.bestStars) : '—');
    $('ovMemory').textContent = '回忆 ' + remembered + '/' + q.words.length + ' 枚符文。三星目标：通关、保留至少 60% 灯火、不用提示回忆全部词语。错词已进入复习手帐，可先训练后再挑战。';
  }
  $('btnAgain').textContent = q ? '再闯一次' : '下一段旅程';
  $('btnRetry').hidden = !session.selected.some(e => session.results.get(e.w)?.status !== 'remembered');
  $('over').classList.add('on');
  $('hud').classList.remove('on');
  G.ui.setDanger(0);
  G.quest.stop();
}
const learnedList = [];
G.endStroll = endStroll;
G.refreshJourney = () => {
  if (game.mode === 'quest') { G.quest.refresh(); return; }
  const s = G.learning.session; if (!s) return;
  const total = s.selected.length;
  $('journeyCount').textContent = s.completed + ' / ' + total;
  $('journeyFill').style.width = (s.completed / Math.max(1, total) * 100) + '%';
  const stop = s.completed >= total ? 2 : s.completed >= Math.ceil(total / 2) ? 1 : 0;
  for (let i = 0; i < 3; i++) $('stop' + i).classList.toggle('on', i <= stop);
  if (stop > game.lastStop) { G.ui.toast(['', '便利店亮起了 · 旅程过半', '到达车站 · 今晚的记忆已收集'][stop], 2500); G.audio.word(); }
  game.lastStop = stop;
};
function pauseGame() {
  if (game.state !== 'play') return;
  game.state = 'pause'; document.body.dataset.state = 'pause'; $('pause').hidden = false;
  if (window.speechSynthesis) speechSynthesis.cancel();
  $('btnResume').focus();
}
function resumeGame() {
  if (game.state !== 'pause') return;
  game.state = 'play'; document.body.dataset.state = 'play'; $('pause').hidden = true;
  clock.getDelta();
  if (game.mode === 'hear') G.typing.replaySpeech();
}

/* ---------- 表情气泡（8 张表情贴图切片：开心0 悲伤1 生气2 惊讶3 害怕4 疑惑5 害羞6 得意7） ---------- */
const EXPR = '__EXPR_DATA__';
let bubEl = null, bubUntil = 0;
const lastSay = {};
function say(type, face, label, cd = 4000) {
  const now = performance.now();
  if (lastSay[type] && now - lastSay[type] < cd) return;
  lastSay[type] = now;
  if (!bubEl) {
    bubEl = document.createElement('div');
    bubEl.className = 'bubble';
    document.body.appendChild(bubEl);
  }
  bubEl.innerHTML = `<i class="face" style="background-image:url(${EXPR});background-position:${(-face * 45).toFixed(1)}px -4px"></i><span>${label}</span>`;
  bubEl.classList.remove('out');
  bubUntil = now + 1700;
}
const _bv = new T.Vector3();

/* ---------- 打字回调 ---------- */
G.onWordDone = t => {
  const P = G.actors.player;
  P.boost = Math.min(2.4, P.boost + 1.0 + G.typing.stats.combo * .06);   // 漫步中的轻快小加速
  game.fovKick = .6;
  const recalled = t.retrieval && t.kind !== 'meaning' && !t.errors && !t.hinted;
  const points = t.w.length * 10 + G.typing.stats.combo * 5 + (recalled ? 50 : 0);
  game.score += points;
  const reward = document.createElement('div'); reward.className = 'memory-reward';
  reward.textContent = recalled ? '记忆碎片 +1 · +' + points : '+' + points;
  $('hud').appendChild(reward); setTimeout(() => reward.remove(), 1500);
  G.audio.ok(G.typing.stats.combo); G.audio.word();
  G.ui.zh(t.zh + (t.zh2 ? '　／　' + t.zh2 : ''));
  if (G.typing.stats.combo >= 3) G.ui.comboPop(G.typing.stats.combo);
  learnedList.push({ w: t.w, zh: t.zh + (t.zh2 ? ' / ' + t.zh2 : '') });
  say('done', G.typing.stats.combo >= 6 ? 7 : 0, G.typing.stats.combo >= 6 ? '得意' : '开心', 2200);
};
G.onTypeError = () => {
  const P = G.actors.player;
  P.errT = 1.2;          // 小踉跄
  game.shake = .45;
  G.audio.err();
  say('err', 2, '生气', 1800);
};
G.onWordMiss = () => {
  G.typing.stats.combo = 0;
  game.shake = .2;
  G.audio.tone(300, { dur: .18, type: 'triangle', vol: .1, slide: -80 });
  say('sad', 1, '难过', 3000);
};

/* ---------- 热键 ---------- */
G.onKey = e => {
  const k = e.key;
  const st = game.state;
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target?.tagName === 'BUTTON' && (k === 'Enter' || k === ' ')) return;
  if (st === 'pause') { if (k === 'Escape') resumeGame(); return; }
  if (st === 'menu' && !$('setModal').classList.contains('on')) {
    if (k === 'f' || k === 'F') { G.fullscreen.toggle(); return; }
    if (k === 'Enter') {
      const row = ROWS[menuSel];
      if (row === 'rowStart') startGame();
      else $(row).click();
      return;
    }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      menuSel = (menuSel + (k === 'ArrowDown' ? 1 : ROWS.length - 1)) % ROWS.length;
      ROWS.forEach((r, i) => $(r).classList.toggle('sel', i === menuSel));
      $(ROWS[menuSel]).focus();
      return;
    }
    if (k === 'Escape') { showPanel(null); return; }
  }
  if ($('setModal').classList.contains('on')) { if (k === 'Escape') closeSettings(); return; }
  if (st === 'menu' || st === 'over') {
    if ((k === 'Enter' || k === ' ') && st === 'over') { startGame(); return; }
  }
  if (st === 'play') {
    if (e.repeat) return;
    if (game.countdown > 0) { if (k === 'Escape') pauseGame(); return; }
    if (game.mode === 'quest') {
      if (['F1', 'F2', 'F3'].includes(k)) {
        e.preventDefault(); if (k === 'F3') G.quest.surge(); else { G.quest.stance(k === 'F1' ? 'strike' : 'guard'); G.typing.rerender(); } return;
      }
      if (G.typing.locked?.kind === 'meaning' && /^[1-3]$/.test(k)) { G.typing.choose(+k - 1); return; }
    }
    if (k === 'Tab') { G.typing.replaySpeech(); return; }
    if (k === ' ') { G.typing.hint(); return; }
    if (k === 'Enter') { G.typing.skip(); return; }
    if (k === 'Backspace') { e.preventDefault(); G.typing.backspace(); return; }
    if (/^[a-zA-Z]$/.test(k)) {
      if (e.repeat) return;
      const c = k.toLowerCase();
      G.typing.key(c); return;
    }
    if (k === 'Escape') { pauseGame(); return; }
  }
  if (k >= '1' && k <= '6') { E.setWeather(WEATHER_ORDER[+k - 1]); syncPanel(); return; }
  if (e.key === 'ArrowLeft') { E.setTime(E.tTarget - .5); syncPanel(); refreshClock(); G.ui.toast('⏪ ' + E.label(), 900); return; }
  if (e.key === 'ArrowRight') { E.setTime(E.tTarget + .5); syncPanel(); refreshClock(); G.ui.toast('⏩ ' + E.label(), 900); return; }
  if (k === 'h' || k === 'H') G.togglePanel();
};
$('btnAgain').addEventListener('click', () => startGame());
$('btnRetry').addEventListener('click', () => {
  const s = G.learning.session;
  const targets = s.selected.filter(e => s.results.get(e.w)?.status !== 'remembered').map(e => e.w);
  startGame(true, targets, 'recall');
});
$('btnMenu').addEventListener('click', toMenu);
$('btnPause').addEventListener('click', pauseGame);
$('btnResume').addEventListener('click', resumeGame);
$('btnFinish').addEventListener('click', endStroll);
for (const [id, stance] of [['btnStrike', 'strike'], ['btnGuard', 'guard']]) $(id).addEventListener('click', () => { G.quest.stance(stance); G.typing.rerender(); });
$('btnSurge').addEventListener('click', () => G.quest.surge());
for (const [id, action] of [['btnSpeak', 'replaySpeech'], ['btnHint', 'hint'], ['btnSkip', 'skip']]) {
  $(id).addEventListener('click', () => { if (game.state === 'play' && game.countdown <= 0) G.typing[action](); });
}
const mobileEntry = $('mobileEntry');
function mobileInput() {
  const value = mobileEntry.value.toLowerCase(); mobileEntry.value = '';
  if (game.state !== 'play' || game.countdown > 0) return;
  for (const ch of value) if (/^[a-z]$/.test(ch)) G.typing.key(ch);
}
mobileEntry.addEventListener('input', e => { if (!e.isComposing) mobileInput(); });
mobileEntry.addEventListener('compositionend', mobileInput);
mobileEntry.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); pauseGame(); }
  if (e.key === 'Enter') { e.preventDefault(); G.typing.skip(); }
});
addEventListener('blur', pauseGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

/* ---------- 相机 ---------- */
let camYaw = .9, camPitch = .27, camDist = 13.5, menuYaw = -.55, idleT = 0;
function updateCamera(dt) {
  const cam = G.camera;
  /* 拖拽 / 缩放输入 */
  if (G.input.dragging) { camYaw -= G.input.dx * .005; camPitch = clamp(camPitch + G.input.dy * .004, -.05, .85); idleT = 0; }
  else { idleT += dt; if (game.state === 'play' && idleT > 1.6 && !G.camLock) { camYaw = damp(camYaw, game.mode === 'quest' ? .32 : .9, 1.2, dt); camPitch = damp(camPitch, game.mode === 'quest' ? .12 : .27, 1.2, dt); } }
  camDist = clamp(camDist + G.input.wheel * .01, G.camDMin || 7, 26);
  G.input.dx = G.input.dy = 0; G.input.wheel = 0;

  if (game.state === 'menu') {
    /* 雨夜街头平视机位：街边低速漂移 + 可拖拽环绕 */
    menuYaw += dt * .05;
    const P = G.actors.player;
    const d = clamp(camDist * .8, 6, 18);
    const yaw = camYaw + Math.sin(menuYaw) * .12;
    cam.position.set(
      P.root.position.x + Math.sin(yaw) * d,
      2.6 + camPitch * 4,
      P.root.position.z + Math.cos(yaw) * d,
    );
    cam.lookAt(P.root.position.x, 1.5, P.root.position.z - 6);
    cam.fov = damp(cam.fov, 46, 3, dt); cam.updateProjectionMatrix();
    return;
  }
  const P = G.actors.player;
  const mobileArena = game.mode === 'quest' && G.quest.run?.fighting && innerWidth <= 800 && !G.camLock;
  const yaw = mobileArena ? camYaw + .52 : camYaw, pitch = camPitch;
  const d = camDist * (mobileArena ? 1.95 : 1);
  const ox = Math.sin(yaw) * d, oz = Math.cos(yaw) * d;
  const target = new T.Vector3(
    P.root.position.x + ox,
    2.25 + pitch * d * .7,
    P.root.position.z + oz,
  );
  cam.position.lerp(target, 1 - Math.exp(-6 * dt));
  if (game.shake > 0) {
    game.shake = Math.max(0, game.shake - dt * 2.4);
    cam.position.x += rand(-1, 1) * game.shake * .25;
    cam.position.y += rand(-1, 1) * game.shake * .18;
  }
  const look = new T.Vector3(P.root.position.x, mobileArena ? -.35 : G.camLookY === undefined ? 1.5 : G.camLookY, P.root.position.z - (mobileArena ? 2.4 : G.camLook === undefined ? 3.4 : G.camLook));
  cam.lookAt(look);
  game.fovKick = Math.max(0, game.fovKick - dt * 2.2);
  const spd = P.speed;
  const fovT = 44 + (spd - 2.6) * 1.4 + game.fovKick * 3;
  cam.fov = damp(cam.fov, fovT, 4, dt);
  cam.updateProjectionMatrix();
}

/* ---------- 漫步逻辑（无追赶） ---------- */
function stroll(dt) {
  const P = G.actors.player;
  P.boost = Math.max(0, P.boost - P.boost * dt * .5);
  P.errT = Math.max(0, P.errT - dt);
  /* 记忆缓冲：单词临近且未锁定 → 放慢脚步细看 */
  const slow = G.typing.nearWord(P.z) ? .72 : 1;
  const target = game.mode === 'quest' && G.quest.run?.fighting ? 0 : (1.1 + P.boost * .2 - (P.errT > 0 ? .18 : 0)) * slow;
  P.speed = damp(P.speed, target, 2.2, dt);
  game.dist = P.z - game.zStart;
  document.body.style.setProperty('--sl', clamp((P.speed - 3.4) / 6, 0, .5).toFixed(2));
}

/* ---------- HUD ---------- */
function updateHud() {
  const P = G.actors.player, S = G.typing.stats;
  $('dist').innerHTML = Math.max(0, Math.round(-game.dist)) + '<i>m</i>';
  $('spd').innerHTML = Math.round(P.speed * 3.6) + '<i>km/h</i>';
  $('wpm').innerHTML = G.typing.wpm() + '<i>WPM</i>';
  $('scoreN').textContent = game.score;
  $('wordN').textContent = S.wordsDone + ' WORDS';
  $('accChip').innerHTML = G.typing.accuracy() + '<i>准确率</i>';
  refreshClock();
}

/* ---------- 主循环 ---------- */
let frameCount = 0;
const errEl = $('err');
function loop() {
  requestAnimationFrame(loop);
  try {
    let dt = Math.min(clock.getDelta(), .05) * game.timeScale;
    if (game.state === 'pause') dt = 0;
    frameCount++;
    G.frame = frameCount;

    const pz = G.actors.player.z;
    E.update(dt);
    if (game.state === 'play') {
      if (game.countdown > -0.6) {
        game.countdown -= dt;
        const txt = game.countdown > 0 ? String(Math.ceil(game.countdown)) : 'GO!';
        if (txt !== game._rdy) {
          game._rdy = txt;
          const b = $('readyTxt');
          b.textContent = txt; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
        }
        if (game.countdown <= -0.6) $('readyTxt').textContent = '';
      } else {
        G.actors.player.z -= G.actors.player.speed * dt; stroll(dt);
        if (G.typing.nearWord(G.actors.player.z) && Math.random() < dt * .1) say('think', 5, '记忆中…', 9000);
      }
    }
    G.actors.update(dt);
    if (game.countdown <= 0) G.typing.update(dt, G.actors.player.z, G.camera);
    if (game.mode === 'quest' && game.countdown <= 0) G.quest.update(dt);
    updateCamera(dt);
    G.W.update(dt, -G.actors.player.z);
    G.city.tick();
    /* 表情气泡跟随头顶 */
    if (bubEl) {
      const nowMs = performance.now();
      if (nowMs > bubUntil + 350) { bubEl.remove(); bubEl = null; }
      else {
        if (nowMs > bubUntil) bubEl.classList.add('out');
        _bv.set(G.actors.player.x, 1.6, G.actors.player.z).project(G.camera);
        const hx = (_bv.x * .5 + .5) * innerWidth, hy = (-_bv.y * .5 + .5) * innerHeight;
        const bw = bubEl.offsetWidth || 110;
        const flip = hx + 20 + bw > innerWidth - 8;
        bubEl.classList.toggle('flip', flip);
        bubEl.style.left = (flip ? hx - 20 - bw : hx + 20).toFixed(0) + 'px';
        bubEl.style.top = hy.toFixed(0) + 'px';
      }
    }
    if (game.state === 'play') updateHud(); else refreshClock();
    G.renderer.render(G.scene, G.camera);
    if (errEl.dataset.on) { errEl.style.display = 'none'; errEl.dataset.on = ''; }
  } catch (e) {
    errEl.style.display = 'block'; errEl.dataset.on = '1';
    errEl.textContent = '⚠ ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 3).join('\n');
  }
}

/* ---------- 启动 ---------- */
E.init();
G.actors.init();
initPanel();
initMenu();
document.body.dataset.state = 'menu';
syncPanel();
loop();

/* 调试钩子：浏览器自动化测试用 */
window.__G = {
  G,
  set(h, w, i, s) {
    if (h !== undefined) E.setTime(h);
    if (w) E.setWeather(w, true);
    if (i !== undefined) E.setIntensity(i);
    if (s) E.setSeason(s);
    syncPanel();
  },
  start: startGame,
  menu: toMenu,
  /* 调试：锁定观察机位（看角色步态） */
  cam(yaw, dist, pitch, lock, lookAhead, lookY) {
    if (yaw !== undefined) camYaw = yaw;
    if (dist !== undefined) { camDist = dist; G.camDMin = Math.min(dist, 7); }
    if (pitch !== undefined) camPitch = pitch;
    if (lookAhead !== undefined) G.camLook = lookAhead;
    if (lookY !== undefined) G.camLookY = lookY;
    G.camLock = !!lock;
  },
  /* 调试：定格到指定步态相位 */
  pose(ph) { if (ph !== undefined) G.actors.player.ph = ph; },
};
})();
