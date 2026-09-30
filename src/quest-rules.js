/* The campaign is a deterministic state machine; rendering and input are adapters. */
(() => {
'use strict';
const G = window.G;
const CONFIG = {
  low: { hp: 120, scale: .8, interval: 1.35, time: 330, attack: 14 },
  mid: { hp: 100, scale: 1, interval: 1, time: 240, attack: 18 },
  high: { hp: 85, scale: 1.15, interval: .8, time: 180, attack: 23 },
};
class QuestRun {
  constructor(words, difficulty = 'mid') {
    this.words = words.slice(); this.config = CONFIG[difficulty] || CONFIG.mid;
    this.hp = this.maxHp = this.config.hp; this.shield = 0; this.energy = 0;
    this.remaining = this.config.time; this.phase = 'camp'; this.wave = 0;
    this.camp = words.slice(); this.trained = 0; this.stance = 'strike';
    this.enemyHp = 0; this.enemyMax = 1; this.armour = 0; this.clock = 0;
    this.taskCount = 0; this.cursor = 0; this.chain = 0; this.dodge = 0;
    this.wrong = new Map(); this.remembered = new Set(); this.seals = [];
    this.events = []; this.hints = 0; this.cleared = 0; this.stars = 0;
  }
  emit(type, detail = {}) { this.events.push({ type, ...detail }); }
  get fighting() { return this.phase === 'fight' || this.phase === 'seal'; }
  get interval() { return [16, 13, 10][this.wave] * this.config.interval; }
  enter(wave) {
    this.wave = wave; this.phase = 'fight'; this.taskCount = 0;
    this.enemyMax = Math.round([88, 116, 190][wave] * this.config.scale);
    this.enemyHp = this.enemyMax;
    this.armour = wave === 2 ? Math.min(32, this.wrong.size * 8) : 0;
    this.clock = this.interval; this.emit('encounter', { wave });
  }
  next() {
    if (this.phase === 'camp') {
      const entry = this.camp.shift();
      if (entry) return { entry, stage: 'discover', kind: 'spell', attempt: 0, quest: true };
      this.enter(0);
    }
    if (this.phase === 'seal') {
      return { entry: this.seals[0], stage: 'recall', kind: 'seal', attempt: 0, quest: true };
    }
    if (this.phase !== 'fight') return null;
    let entry;
    if (this.wave === 2 && this.wrong.size && this.taskCount % 2 === 0) {
      const weak = [...this.wrong.values()]; entry = weak[this.cursor++ % weak.length];
    } else entry = this.words[this.cursor++ % this.words.length];
    const kind = this.wave > 0 && this.taskCount % 3 === 2 ? 'meaning' : 'spell';
    this.taskCount++;
    return { entry, stage: 'recall', kind, attempt: this.wrong.has(entry.w) ? 1 : 0, quest: true };
  }
  setStance(stance) {
    if (!['strike', 'guard'].includes(stance)) return false;
    this.stance = stance; return true;
  }
  forget(t) {
    const newlyWrong = !this.wrong.has(t.w);
    this.wrong.set(t.w, { w: t.w, zh: t.zh, example: t.example });
    this.remembered.delete(t.w);
    if (newlyWrong && this.wave === 2 && this.phase === 'fight') this.armour = Math.min(32, this.armour + 8);
  }
  damageEnemy(amount) {
    const absorbed = Math.min(this.armour, amount); this.armour -= absorbed;
    const damage = Math.min(this.enemyHp, amount - absorbed); this.enemyHp -= damage;
    this.emit('damage', { amount: damage, absorbed });
    if (this.enemyHp <= 0) {
      if (this.wave < 2) {
        this.cleared++; this.phase = 'transit'; this.transit = 2.7;
        this.shield = Math.min(40, this.shield + 8); this.emit('clear', { wave: this.wave });
      } else {
        const weak = this.words.filter(e => !this.remembered.has(e.w) || this.wrong.has(e.w));
        this.seals = (weak.length ? weak : this.words.slice(0, 3)).slice();
        this.phase = 'seal'; this.clock = this.interval;
        this.emit('seal', { count: this.seals.length });
      }
    }
    return damage;
  }
  hit(amount) {
    if (!this.fighting) return;
    if (this.dodge > 0) { this.dodge--; this.emit('dodge'); return; }
    const blocked = Math.min(this.shield, amount); this.shield -= blocked;
    const damage = amount - blocked; this.hp = Math.max(0, this.hp - damage);
    this.emit('hurt', { damage, blocked });
    if (!this.hp) { this.phase = 'lost'; this.reason = '灯火熄灭'; this.emit('lose'); }
  }
  useHint() {
    if (!this.fighting) return true;
    this.hints++;
    if (this.energy >= 15) this.energy -= 15;
    else { this.hp = Math.max(0, this.hp - 8); this.emit('hurt', { damage: 8, blocked: 0 }); }
    if (!this.hp) { this.phase = 'lost'; this.reason = '灯火熄灭'; this.emit('lose'); return false; }
    return true;
  }
  surge() {
    if (this.phase !== 'fight' || this.energy < 60) return false;
    this.energy -= 60; this.shield = Math.min(40, this.shield + 10);
    this.clock = Math.min(this.interval + 3, this.clock + 3);
    this.emit('surge'); this.damageEnemy(48); return true;
  }
  resolve(t, success) {
    if (this.phase === 'camp') { this.trained++; this.energy = Math.min(100, this.energy + 5); return; }
    if (!this.fighting) return;
    const clean = success && !t.errors && !t.hinted;
    if (t.kind === 'meaning') {
      if (success) {
        this.dodge = Math.min(2, this.dodge + 1); this.energy = Math.min(100, this.energy + 12);
        this.hp = Math.min(this.maxHp, this.hp + 3);
        this.emit('meaning', { correct: true }); this.damageEnemy(10);
      } else {
        this.forget(t);
        this.chain = 0; this.emit('meaning', { correct: false }); this.hit(14);
      }
      return;
    }
    if (clean) {
      this.chain++; this.remembered.add(t.w);
      if (this.wrong.delete(t.w)) { this.armour = Math.max(0, this.armour - 8); this.emit('purge', { word: t.w }); }
      this.energy = Math.min(100, this.energy + 22);
    } else {
      this.chain = 0; this.forget(t);
      if (!success) this.hit(10);
    }
    if (!this.fighting) return;
    if (this.phase === 'seal') {
      if (clean) {
        this.seals.shift(); this.emit('unlock', { remaining: this.seals.length });
        if (!this.seals.length) {
          this.phase = 'won'; this.cleared = 3;
          this.stars = 1 + Number(this.hp >= this.maxHp * .6) + Number(this.hints === 0 && this.remembered.size === this.words.length);
          this.emit('win');
        }
      } else if (this.seals.length > 1) this.seals.push(this.seals.shift());
      return;
    }
    if (t.hinted) { this.emit('assisted'); return; }
    if (success) {
      const damage = clean ? (this.stance === 'guard' ? 18 : 34) + Math.min(3, this.chain - 1) * 2 : 12;
      if (this.stance === 'guard') this.shield = Math.min(40, this.shield + (clean ? 16 : 6));
      if (!clean) this.energy = Math.min(100, this.energy + 8);
      this.emit('cast', { stance: this.stance, clean }); this.damageEnemy(damage);
    }
  }
  update(dt, activeTask) {
    if (this.phase === 'transit') {
      this.transit -= dt; if (this.transit <= 0) this.enter(this.wave + 1);
    }
    if (!this.fighting || !activeTask) return;
    this.remaining = Math.max(0, this.remaining - dt);
    if (!this.remaining) { this.phase = 'lost'; this.reason = '错过末班车'; this.emit('lose'); return; }
    this.clock -= dt;
    if (this.clock <= 0) { this.clock += this.interval; this.emit('attack', { amount: this.config.attack }); }
  }
}
G.QuestRun = QuestRun;
})();
