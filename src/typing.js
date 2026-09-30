/* One clear target: encounter, recall, then revisit mistakes. */
(() => {
'use strict';
const G = window.G, $ = id => document.getElementById(id);
const S = { active: [], locked: null, timer: .4, combo: 0, maxCombo: 0, wordsDone: 0,
  chars: 0, errs: 0, hits: 0, elapsed: 0, missed: [], reviewTime: 0 };
const mode = () => G.game.mode || G.cfg.mode;
const hidden = t => !t.hinted && (mode() === 'hear' || mode() === 'recall' ||
  ((mode() === 'learn' || mode() === 'quest') && t.stage === 'recall'));
function render(t) {
  const conceal = hidden(t);
  const meaningTask = t.kind === 'meaning';
  $('meaningChoices').hidden = !meaningTask;
  $('stLetters').hidden = meaningTask;
  $('btnHint').disabled = meaningTask;
  $('btnSpeak').disabled = meaningTask;
  $('mobileEntry').hidden = meaningTask;
  $('station').classList.add('on');
  if (meaningTask) {
    $('stStage').textContent = '词义闪避 · 选对中文，躲开下一枚影弹';
    $('stMean').textContent = t.w;
    $('stFeedback').textContent = '按 1 / 2 / 3 选择 · 英文与含义必须连起来';
    $('stExample').textContent = '';
    $('wordTimer').style.width = (t.remaining / t.duration * 100) + '%';
    $('meaningChoices').replaceChildren();
    t.options.forEach((option, i) => {
      const b = document.createElement('button'); b.type = 'button';
      const number = document.createElement('kbd'); number.textContent = i + 1;
      const text = document.createElement('span'); text.textContent = option.zh;
      b.append(number, text); b.addEventListener('click', () => G.typing.choose(i));
      $('meaningChoices').appendChild(b);
    });
    return;
  }
  t.letters.forEach((el, i) => {
    el.textContent = i < t.typed || !conceal ? t.w[i] : '·';
    el.className = 'l' + (i < t.typed ? ' hit' : conceal ? ' blank' : '');
  });
  $('stMean').textContent = t.zh;
  $('stStage').textContent = t.stage === 'discover' ? '初见 · 看词认识它' : t.attempt ? '再遇 · 试着想起来' : '回忆 · 把单词带回家';
  if (mode() === 'spell') $('stStage').textContent = '字形 · 读词并拼写';
  if (mode() === 'hear') $('stStage').textContent = '听写 · 听一遍，写出来';
  if (mode() === 'quest' && t.stage !== 'discover') $('stStage').textContent = t.kind === 'seal' ? '封印开锁 · 只有独立回忆才能解除' : '回忆施法 · ' + (G.quest.run.stance === 'guard' ? '护灯：攻击并生成护盾' : '出击：以单词击退影怪');
  $('stLetters').replaceChildren();
  for (let i = 0; i < t.w.length; i++) {
    const d = document.createElement('span');
    d.className = 'stl' + (i < t.typed ? ' done' : i === t.typed ? ' cur' : '');
    d.textContent = i < t.typed || !conceal ? t.w[i] : '';
    $('stLetters').appendChild(d);
  }
  $('stFeedback').textContent = t.hinted ? '答案已亮起，稍后会再遇到它' : conceal ? '根据中文回忆拼写，想不起来可以看提示' : '读一遍意思，再敲出单词';
  if (mode() === 'hear' && !t.hinted) $('stFeedback').textContent = '听音拼写 · TAB 重听 · 想不起来可以看提示';
  $('stExample').textContent = !conceal && t.example ? t.example : '';
  $('wordTimer').style.width = (t.remaining / t.duration * 100) + '%';
}
function spawn() {
  const item = mode() === 'quest' ? G.quest.next() : G.learning.next();
  if (mode() === 'quest' && !item) { S.timer = .15; return; }
  if (!item) { G.learning.session.finished = true; G.endStroll(); return; }
  const t = { ...item.entry, stage: item.stage, attempt: item.attempt, typed: 0, errors: 0,
    kind: item.kind || 'spell', quest: !!item.quest, hinted: false, dead: false, z: G.actors.player.z - 18, x: -2.6, y: 3 };
  const D = { low: 1.5, mid: 1, high: .75 }[G.cfg.diff] || 1;
  t.duration = (16 + t.w.length * 1.8) * D;
  if (t.quest && t.stage !== 'discover') t.duration = (t.kind === 'meaning' ? 7 : 9 + t.w.length * .75) * D;
  if (t.kind === 'meaning') {
    const decoys = G.learning.shuffle(G.words.LIST.filter(e => e.zh !== t.zh)).slice(0, 2);
    t.options = G.learning.shuffle([{ w: t.w, zh: t.zh }, ...decoys]);
  }
  t.retrieval = hidden(t);
  t.remaining = t.duration;
  t.el = document.createElement('div'); t.el.className = 'word target';
  const cap = document.createElement('small'); cap.className = 'word-caption';
  cap.textContent = t.stage === 'discover' ? '发现一枚单词' : '记忆碎片';
  t.el.appendChild(cap);
  const lettersBox = document.createElement('div'); t.el.appendChild(lettersBox);
  t.letters = Array.from(t.w, () => { const s = document.createElement('span'); lettersBox.appendChild(s); return s; });
  const meaning = document.createElement('span'); meaning.className = 'zh'; meaning.textContent = t.zh;
  t.el.appendChild(meaning); $('words').appendChild(t.el);
  S.active.push(t); S.locked = t;
  render(t);
  if (!hidden(t) || mode() === 'hear') G.audio.speak(t.w);
}
function finish(t, success) {
  t.dead = true;
  if (t.kind !== 'meaning') G.learning.result(t, success);
  t.el.remove(); S.active.length = 0; S.locked = null;
  S.reviewTime = t.quest ? (success && !t.errors && !t.hinted ? .8 : 2.2) : (success && !t.errors && !t.hinted ? 1.8 : 3.2);
  S.timer = S.reviewTime;
  $('stStage').textContent = !success ? '没关系 · 下一个路口再见' : t.stage === 'discover' ? '已认识 · 稍后试着回忆' : !t.retrieval ? '字形练习完成' : !t.errors && !t.hinted ? '想起来了 · 已记入手帐' : '已完成 · 稍后再试一次';
  $('stLetters').replaceChildren();
  $('stLetters').hidden = false; $('meaningChoices').hidden = true;
  $('mobileEntry').hidden = false;
  const answer = document.createElement('strong'); answer.className = 'answer-word'; answer.textContent = t.w;
  $('stLetters').appendChild(answer);
  $('stFeedback').textContent = t.zh;
  $('stExample').textContent = t.example || '';
  $('wordTimer').style.width = '100%'; $('timerLabel').textContent = '';
  if (success) {
    S.wordsDone++;
    if (t.quest && (t.errors || t.hinted)) S.combo = 0; else S.combo++;
    S.maxCombo = Math.max(S.maxCombo, S.combo); G.onWordDone(t);
  } else {
    if (!S.missed.some(e => e.w === t.w)) S.missed.push({ w: t.w, zh: t.zh });
    S.combo = 0; G.onWordMiss(t);
  }
  if (t.quest) G.quest.resolve(t, success);
  G.refreshJourney();
}
G.typing = {
  stats: S,
  get locked() { return S.locked; },
  hasWordStartingWith(ch) { return S.active.some(t => t.w[0] === ch); },
  accuracy() { return S.hits + S.errs ? Math.round(100 * S.hits / (S.hits + S.errs)) : 100; },
  wpm() { return S.elapsed ? Math.round((S.chars / 5) / (S.elapsed / 60)) : 0; },
  reset() {
    S.active.forEach(t => t.el.remove());
    Object.assign(S, { active: [], locked: null, timer: .4, combo: 0, maxCombo: 0, wordsDone: 0,
      chars: 0, errs: 0, hits: 0, elapsed: 0, missed: [], reviewTime: 0 });
    $('station').classList.remove('on');
  },
  replaySpeech() {
    if (S.locked?.kind === 'meaning') return;
    if (S.locked && !G.audio.speak(S.locked.w)) G.ui.toast('当前浏览器无法朗读，可以使用拼写提示');
  },
  hint() {
    const t = S.locked; if (!t || t.hinted || t.kind === 'meaning') return;
    if (t.quest && !G.quest.hint()) return;
    t.hinted = true;
    if (!t.quest || t.stage === 'discover') t.remaining = Math.max(t.remaining, 12);
    render(t); G.audio.speak(t.w);
  },
  skip() { if (S.locked) finish(S.locked, false); },
  backspace() {
    const t = S.locked; if (!t || !t.typed || t.kind === 'meaning') return;
    t.typed--; S.chars = Math.max(0, S.chars - 1); render(t);
  },
  nearWord() { return !!S.locked && (hidden(S.locked) || S.locked.remaining < 10); },
  key(ch) {
    const t = S.locked;
    if (!t || t.kind === 'meaning' || !/^[a-z]$/.test(ch)) return false;
    if (ch !== t.w[t.typed]) {
      t.errors++; S.errs++; S.combo = 0;
      if (t.quest && t.stage !== 'discover') t.remaining = Math.max(0, t.remaining - .75);
      else t.remaining = Math.max(t.remaining, 8);
      $('stFeedback').textContent = '这个字母不对，再想一下 · 也可以按空格看提示';
      const tile = $('stLetters').children[t.typed];
      if (tile) { tile.classList.add('miss'); setTimeout(() => tile.classList.remove('miss'), 260); }
      G.onTypeError(); return true;
    }
    t.typed++; S.chars++; S.hits++; G.audio.click(); render(t);
    if (t.typed === t.w.length) finish(t, true);
    return true;
  },
  choose(index) {
    const t = S.locked;
    if (!t || t.kind !== 'meaning' || G.game.state !== 'play') return;
    const correct = t.options[index]?.w === t.w;
    if (!correct) { t.errors++; S.errs++; S.combo = 0; G.onTypeError(); }
    else S.hits++;
    finish(t, correct);
  },
  cancelTask() {
    S.active.forEach(t => t.el.remove()); S.active.length = 0; S.locked = null; S.timer = .25;
    $('station').classList.remove('on'); $('meaningChoices').hidden = true;
  },
  rerender() { if (S.locked) render(S.locked); },
  update(dt) {
    if (G.game.state !== 'play') return;
    S.elapsed += dt;
    if (!S.locked) {
      S.timer -= dt;
      if (S.timer <= 0) spawn();
      return;
    }
    const t = S.locked;
    t.remaining -= dt;
    $('wordTimer').style.width = Math.max(0, t.remaining / t.duration * 100) + '%';
    $('timerLabel').textContent = Math.max(0, Math.ceil(t.remaining)) + 's';
    if (t.remaining <= 0) finish(t, false);
  },
};
})();
