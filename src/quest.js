/* The street is an arena: shadow attacks are 3D objects; vocabulary drives combat. */
(() => {
'use strict';
const G = window.G, T = THREE, $ = id => document.getElementById(id);
const NAMES = ['书店 · 偷词影', '高架桥 · 回声守卫', '车站 · 遗忘之影'];
let run = null, enemy = null, shieldVisual = null, effects = [], projectiles = [], time = 0;
let records = { wins: 0, bestStars: 0, bestScore: 0 };
try { records = { ...records, ...JSON.parse(localStorage.getItem('tr-quest-v1') || '{}') }; } catch (_) {}
function dispose(root) {
  if (!root) return;
  G.scene.remove(root);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(o => { if (o.isMesh) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => { if (m.map) textures.add(m.map); m.dispose(); });
  textures.forEach(t => t.dispose());
}
function toon(color, extra = {}) {
  const m = G.cityToon(color, extra); m.color.convertSRGBToLinear(); return m;
}
function createEnemy(wave) {
  dispose(enemy);
  const root = enemy = new T.Group(); root.name = 'shadow-enemy';
  const boss = wave === 2, radius = boss ? .67 : .43;
  const body = new T.Mesh(new T.SphereGeometry(radius, 24, 18), toon('#22263f'));
  body.scale.y = boss ? 1.13 : .92; body.castShadow = true; root.add(body);
  const face = G.canvasTex(256, 128, ctx => {
    ctx.fillStyle = '#ecd9fa';
    for (const x of [76, 180]) {
      ctx.beginPath(); ctx.ellipse(x, 53, 21, 27, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8052bb'; ctx.beginPath(); ctx.ellipse(x + 3, 58, 8, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ecd9fa';
    }
    ctx.strokeStyle = '#bca1e5'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(113, 98); ctx.lineTo(143, 98); ctx.stroke();
  });
  const eyes = new T.Mesh(new T.PlaneGeometry(radius * 1.3, radius * .65),
    new T.MeshBasicMaterial({ map: face, transparent: true, depthWrite: false }));
  eyes.position.set(0, .06, radius * .94); root.add(eyes);
  for (const side of [-1, 1]) {
    const horn = new T.Mesh(new T.ConeGeometry(radius * .25, radius * .75, 10), toon('#424060'));
    horn.position.set(side * radius * .66, radius * .73, 0); horn.rotation.z = -side * .55; root.add(horn);
    const arm = new T.Mesh(new T.SphereGeometry(radius * .23, 12, 8), toon('#353149'));
    arm.scale.y = 1.6; arm.position.set(side * radius * 1.04, -.06, 0); root.add(arm);
  }
  for (let i = 0; i < 5; i++) {
    const tail = new T.Mesh(new T.ConeGeometry(radius * .20, radius * .6, 8), toon('#22263f'));
    tail.position.set((i - 2) * radius * .24, -radius * .93, 0); tail.rotation.z = Math.PI; root.add(tail);
  }
  const ring = new T.Mesh(new T.TorusGeometry(radius * 1.4, .022, 8, 48), new T.MeshBasicMaterial({ color: '#b18de4', transparent: true, opacity: .7 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -1.06; root.add(ring);
  root.userData.ring = ring;
  root.position.set(G.actors.player.x, 1.15, G.actors.player.z - 5.5);
  root.scale.setScalar(boss ? 1.2 : 1);
  G.scene.add(root); G.actors.player.speed = 0;
}
function effect(kind) {
  const p = G.actors.player;
  let obj;
  if (kind === 'guard') {
    obj = new T.Mesh(new T.SphereGeometry(.68, 20, 14), new T.MeshBasicMaterial({
      color: '#92e9df', wireframe: true, transparent: true, opacity: .5, depthWrite: false }));
    obj.position.set(p.x, 1.0, p.z);
  } else {
    obj = new T.Mesh(new T.TorusGeometry(kind === 'surge' ? .8 : .3, kind === 'surge' ? .065 : .025, 8, 48),
      new T.MeshBasicMaterial({ color: kind === 'purge' ? '#f0cf8e' : '#a4f2e0', transparent: true, opacity: .9 }));
    obj.position.set(kind === 'surge' ? p.x : enemy?.position.x || p.x, .9,
      kind === 'surge' ? p.z : enemy?.position.z || p.z - 5);
    if (kind === 'strike') {
      obj.userData.destination = obj.position.clone();
      obj.userData.origin = new T.Vector3(p.x, 1.2, p.z - .3);
      obj.position.copy(obj.userData.origin);
    }
  }
  G.scene.add(obj); effects.push({ obj, kind, age: 0 });
}
function shoot(amount) {
  if (!enemy) return;
  const obj = new T.Mesh(new T.SphereGeometry(.14, 14, 10), new T.MeshBasicMaterial({ color: '#df8db5' }));
  const from = enemy.position.clone(); from.y = 1.1;
  obj.position.copy(from); G.scene.add(obj);
  projectiles.push({ obj, from, age: 0, amount });
  G.audio.tone(240, { type: 'triangle', dur: .18, vol: .08, slide: 130 });
}
function textEffect(message, tone = '') {
  // Keep successive hits readable when one answer emits several combat events.
  while ($('hud').querySelectorAll('.battle-pop').length >= 3) $('hud').querySelector('.battle-pop').remove();
  $('hud').querySelectorAll('.battle-pop').forEach(d => d.style.marginTop = (parseInt(d.style.marginTop || '0', 10) - 30) + 'px');
  const d = document.createElement('div'); d.className = 'battle-pop ' + tone; d.textContent = message;
  $('hud').appendChild(d); setTimeout(() => d.remove(), 1400);
}
function flush() {
  if (!run) return;
  for (const e of run.events.splice(0)) {
    if (e.type === 'encounter') {
      createEnemy(e.wave); G.ui.toast(NAMES[e.wave] + ' · 回忆单词才能击退它', 2300);
    } else if (e.type === 'attack') shoot(e.amount);
    else if (e.type === 'cast') { G.actors.player.castT = .7; G.actors.player.castKind = e.stance; effect(e.stance === 'guard' ? 'guard' : 'strike'); }
    else if (e.type === 'surge') { G.actors.player.castT = .7; G.actors.player.castKind = 'surge'; effect('surge'); G.audio.word(); textEffect('鲸潮！破影 + 护盾'); }
    else if (e.type === 'damage') textEffect(e.absorbed ? '破甲 ' + e.absorbed + ' · 伤害 ' + e.amount : '记忆命中 −' + e.amount);
    else if (e.type === 'hurt') {
      textEffect(e.damage ? '灯火 −' + e.damage : '护盾格挡 ' + e.blocked, e.damage ? 'hurt' : '');
      G.game.shake = e.damage ? .4 : .1; if (e.damage) G.audio.err();
    } else if (e.type === 'dodge') { effect('guard'); textEffect('词义闪避！'); }
    else if (e.type === 'meaning') textEffect(e.correct ? '认义成功 · 闪避就绪' : '认义失败 · 错词进入敌方护甲', e.correct ? '' : 'hurt');
    else if (e.type === 'purge') { effect('purge'); textEffect('找回 ' + e.word + ' · 破除遗忘护甲'); }
    else if (e.type === 'assisted') textEffect('借阅了答案 · 本次无法攻击', 'hurt');
    else if (e.type === 'clear' || e.type === 'seal') {
      G.typing.cancelTask(); projectiles.forEach(p => dispose(p.obj)); projectiles = [];
      G.audio.word();
      G.ui.toast(e.type === 'seal' ? 'Boss 已破防！独立回忆 ' + e.count + ' 个封印词才能通关' : '街区已夺回 · 获得 8 点护盾，前往下一处', 2800);
    } else if (e.type === 'unlock') { effect('purge'); textEffect('封印解除 · 剩余 ' + e.remaining); }
    else if (e.type === 'win' || e.type === 'lose') {
      G.learning.session.finished = e.type === 'win';
      if (e.type === 'win') {
        records.wins++; records.bestStars = Math.max(records.bestStars, run.stars);
        records.bestScore = Math.max(records.bestScore, G.game.score);
        try { localStorage.setItem('tr-quest-v1', JSON.stringify(records)); } catch (_) {}
      }
      G.endStroll();
    }
  }
  refresh();
}
function refresh() {
  if (!run) return;
  $('battleName').textContent = run.phase === 'camp' ? '出发前 · 收集六枚词语符文' : run.phase === 'transit' ? '街区夺回 · 前往下一处' : run.phase === 'seal' ? '最终封印 · 还需独立回忆 ' + run.seals.length + ' 词' : NAMES[run.wave];
  $('battleStage').textContent = run.phase === 'camp' ? run.trained + ' / ' + run.words.length : (run.wave + 1) + ' / 3';
  for (let i = 0; i < 3; i++) {
    $('qRoom' + i).classList.toggle('cleared', i < run.wave || run.phase === 'won');
    $('qRoom' + i).classList.toggle('active', i === run.wave && run.phase !== 'camp');
  }
  $('enemyFill').style.width = (run.enemyHp / run.enemyMax * 100) + '%';
  $('enemyHealth').textContent = run.phase === 'camp' ? '认识词语，就是准备武器' : run.phase === 'seal' ? '拼出词语封印 · 提示无法开锁' : '敌人 ' + Math.ceil(run.enemyHp) + ' / ' + run.enemyMax + (run.armour ? ' · 遗忘护甲 ' + run.armour : '');
  $('lampN').textContent = Math.ceil(run.hp); $('lampFill').style.width = (run.hp / run.maxHp * 100) + '%';
  $('shieldN').textContent = run.shield; $('energyN').textContent = run.energy;
  const seconds = Math.ceil(run.remaining);
  $('battleClock').textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  $('attackWarning').textContent = run.fighting ? (run.clock < 2 ? '影弹即将袭来！' : '下次影弹 ' + Math.ceil(run.clock) + 's') + (run.dodge ? ' · 闪避 ×' + run.dodge : '') : run.phase === 'camp' ? '准备阶段安全 · 每认识一词获得 5 能量' : '战斗结束后可继续行走';
  $('battleHud').classList.toggle('urgent', run.fighting && run.clock < 2);
  $('battleHud').classList.toggle('low-hp', run.hp < run.maxHp * .3);
  const typed = G.typing.locked?.typed || 0;
  for (const [id, stance] of [['btnStrike', 'strike'], ['btnGuard', 'guard']]) {
    $(id).classList.toggle('selected', run.stance === stance);
    $(id).disabled = run.phase !== 'fight' || !!typed || G.game.state !== 'play';
  }
  $('btnSurge').disabled = run.phase !== 'fight' || run.energy < 60 || G.game.state !== 'play';
  $('btnSurge').classList.toggle('charged', run.energy >= 60);
  $('questHint').textContent = run.phase === 'camp' ? '准备：看词打字，之后这些词就是你的武器。' : run.phase === 'seal' ? '封印只能靠独立回忆打开；已有护盾和闪避仍可抵挡影弹。提示无法开锁。' : '出击伤害更高；护灯伤害较低但生成护盾。提示消耗 15 能量，不足时消耗 8 灯火。';
}
G.quest = {
  begin() {
    this.stop(); time = 0; run = new G.QuestRun(G.learning.session.selected, G.cfg.diff);
    shieldVisual = new T.Mesh(new T.SphereGeometry(.75, 20, 14), new T.MeshBasicMaterial({
      color: '#a6eadc', transparent: true, opacity: .12, wireframe: true, depthWrite: false }));
    shieldVisual.name = 'lamp-shield'; shieldVisual.visible = false; G.scene.add(shieldVisual); refresh();
  },
  get run() { return run; },
  get active() { return G.game?.mode === 'quest' && !!run; },
  get records() { return records; },
  next() { const task = run.next(); flush(); return task; },
  resolve(t, success) {
    if (t.kind === 'meaning' && !success) G.learning.markWeak(t);
    run.resolve(t, success); flush();
  },
  hint() { const allowed = run.useHint(); flush(); return allowed; },
  stance(value) {
    if (run?.phase !== 'fight' || G.typing.locked?.typed || G.game.state !== 'play') return;
    run.setStance(value); refresh();
  },
  surge() { if (G.game.state !== 'play') return; if (run.surge()) flush(); },
  refresh,
  stop() {
    dispose(enemy); enemy = null;
    dispose(shieldVisual); shieldVisual = null;
    G.actors.player.castT = 0;
    $('hud').querySelectorAll('.battle-pop').forEach(d => d.remove());
    effects.forEach(e => dispose(e.obj)); effects = [];
    projectiles.forEach(p => dispose(p.obj)); projectiles = [];
  },
  update(dt) {
    if (!this.active || G.game.state !== 'play') return;
    time += dt; run.update(dt, !!G.typing.locked); flush();
    if (G.game.state !== 'play') return;
    if (enemy) {
      enemy.position.y = 1.15 + Math.sin(time * 2.2) * .1;
      enemy.rotation.y = Math.sin(time * .9) * .12;
      enemy.userData.ring.rotation.z += dt * .4;
      enemy.visible = run.fighting;
      enemy.scale.setScalar((run.wave === 2 ? 1.2 : 1) * (run.phase === 'seal' ? .7 : 1));
    }
    if (shieldVisual) {
      shieldVisual.visible = run.shield > 0 && run.fighting;
      shieldVisual.position.set(G.actors.player.x, .95, G.actors.player.z);
      shieldVisual.rotation.y = time * .4;
      shieldVisual.material.opacity = .06 + run.shield / 40 * .15;
    }
    for (const p of projectiles.slice()) {
      p.age += dt;
      const player = G.actors.player;
      const to = new T.Vector3(player.x, 1, player.z);
      p.obj.position.lerpVectors(p.from, to, Math.min(1, p.age / .75));
      if (p.age >= .75) {
        dispose(p.obj); projectiles.splice(projectiles.indexOf(p), 1);
        run.hit(p.amount); flush(); if (G.game.state !== 'play') return;
      }
    }
    for (const e of effects.slice()) {
      e.age += dt;
      e.obj.scale.setScalar(1 + e.age * (e.kind === 'surge' ? 1.5 : 1));
      e.obj.material.opacity = Math.max(0, .85 - e.age);
      if (e.kind === 'strike') e.obj.position.lerpVectors(e.obj.userData.origin, e.obj.userData.destination, Math.min(1, e.age / .55));
      if (e.kind === 'surge') e.obj.position.z -= dt * 8;
      if (e.age > .9) { dispose(e.obj); effects.splice(effects.indexOf(e), 1); }
    }
    refresh();
  },
};
})();
