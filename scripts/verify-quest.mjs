import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import assert from 'node:assert/strict';
const G = {};
runInContext(readFileSync(new URL('../src/quest-rules.js', import.meta.url), 'utf8'), createContext({ window: { G } }));
const words = ['protect', 'shelter', 'explore', 'memory', 'steady', 'journey'].map(w => ({ w, zh: w }));
const answer = (task, extras = {}) => ({ ...task.entry, ...task, ...extras });
function prepared(difficulty = 'mid') {
  const run = new G.QuestRun(words, difficulty);
  for (let i = 0; i < words.length; i++) run.resolve(answer(run.next()), true);
  return run;
}

const attack = prepared();
let t = answer(attack.next());
assert.equal(attack.phase, 'fight');
assert.equal(attack.energy, 30);
const before = attack.enemyHp;
attack.resolve(t, true);
assert.equal(before - attack.enemyHp, 34, 'Independent recall directly damages the enemy');
assert.equal(attack.energy, 52);
assert.equal(attack.remembered.has(t.w), true);
assert.equal(attack.surge(), false, 'Skill needs 60 energy');

const guard = prepared();
t = answer(guard.next()); guard.setStance('guard');
guard.resolve(t, true);
assert.equal(guard.shield, 16, 'Guard stance creates protection');
assert.equal(guard.enemyHp, before - 18, 'Guard trades damage for protection');
guard.hit(18);
assert.equal(guard.hp, 98); assert.equal(guard.shield, 0, 'Shield absorbs a real attack');

const hints = prepared();
t = answer(hints.next(), { hinted: true });
const hp = hints.enemyHp;
assert.equal(hints.useHint(), true); assert.equal(hints.energy, 15);
hints.resolve(t, true);
assert.equal(hints.enemyHp, hp, 'Revealed spelling cannot attack');
assert.equal(hints.remembered.size, 0);
assert.equal(hints.wrong.has(t.w), true);
hints.energy = 0; hints.useHint(); assert.equal(hints.hp, 92, 'Hint debt costs health');

const typo = prepared();
t = answer(typo.next(), { errors: 1 });
typo.resolve(t, true);
assert.equal(typo.enemyHp, before - 12, 'Corrected spelling deals reduced damage');
assert.equal(typo.remembered.size, 0, 'Corrected spelling is not independent recall');

const meaning = prepared(); meaning.next(); meaning.enter(1);
meaning.next(); meaning.next(); t = answer(meaning.next());
assert.equal(t.kind, 'meaning'); meaning.resolve(t, true);
assert.equal(meaning.dodge, 1, 'Recognition arms an actual dodge');
assert.equal(meaning.remembered.size, 0, 'Recognition does not masquerade as recalled spelling');
meaning.hit(18); assert.equal(meaning.hp, 100); assert.equal(meaning.dodge, 0);
meaning.resolve(t, false); assert.equal(meaning.hp, 86); assert.equal(meaning.wrong.has(t.w), true);
meaning.enter(2); assert.equal(meaning.armour, 8, 'Wrong meanings give the boss armour');
assert.equal(meaning.next().entry.w, t.w, 'Boss prioritizes the player’s weak word');

const relapse = prepared(); relapse.next(); relapse.enter(2);
const familiar = { ...words[0], stage: 'recall', kind: 'spell', errors: 0, hinted: false };
relapse.resolve(familiar, true);
assert.equal(relapse.remembered.has(familiar.w), true);
relapse.resolve({ ...familiar, kind: 'meaning', errors: 1 }, false);
assert.equal(relapse.armour, 8, 'A newly wrong Boss word adds armour during the fight');
assert.equal(relapse.remembered.has(familiar.w), false, 'A later wrong meaning invalidates earlier recall');
relapse.resolve({ ...familiar, kind: 'meaning', errors: 1 }, false);
assert.equal(relapse.armour, 8, 'Repeating the same wrong word does not stack its armour');
relapse.resolve(familiar, true);
assert.equal(relapse.wrong.has(familiar.w), false, 'Independent recall purges the weak word');
assert.equal(relapse.remembered.has(familiar.w), true);
assert.equal(relapse.armour, 0);
assert.ok(relapse.events.some(e => e.type === 'purge' && e.word === familiar.w));
relapse.resolve({ ...familiar, errors: 1 }, true);
assert.equal(relapse.remembered.has(familiar.w), false, 'Corrected spelling also invalidates earlier clean recall');

const cappedArmour = prepared(); cappedArmour.next(); cappedArmour.enter(2);
for (const entry of words) cappedArmour.resolve({ ...entry, kind: 'spell', hinted: true }, true);
assert.equal(cappedArmour.wrong.size, 6);
assert.equal(cappedArmour.armour, 32, 'Several weak words cannot grow Boss armour beyond its cap');
const bossHp = cappedArmour.enemyHp;
cappedArmour.resolve(familiar, true);
assert.equal(cappedArmour.wrong.has(familiar.w), false);
assert.equal(bossHp - cappedArmour.enemyHp, 10, 'Recall removes the word’s armour before its attack lands');
assert.ok(cappedArmour.events.some(e => e.type === 'damage' && e.absorbed === 24 && e.amount === 10));

const skill = prepared(); skill.next(); skill.energy = 70;
assert.equal(skill.surge(), true); assert.equal(skill.energy, 10);
assert.equal(skill.enemyHp, before - 48); assert.equal(skill.shield, 10);
assert.equal(skill.surge(), false, 'Cannot spam the skill without earning energy');

const pressure = prepared(); pressure.next();
pressure.update(17, true);
assert.equal(pressure.events.some(e => e.type === 'attack'), true, 'Attack pressure runs independently of the current word');
const remaining = pressure.remaining;
pressure.update(20, false);
assert.equal(pressure.remaining, remaining, 'Answer feedback does not burn unavoidable health or time');
pressure.hp = 2; pressure.hit(18); assert.equal(pressure.phase, 'lost');
const train = prepared(); train.next(); train.remaining = 1; train.update(2, true);
assert.equal(train.reason, '错过末班车'); assert.equal(train.phase, 'lost');

const seals = prepared(); seals.next(); seals.enter(2); seals.damageEnemy(seals.enemyHp);
assert.equal(seals.phase, 'seal'); assert.equal(seals.seals.length, 6);
seals.energy = 100; assert.equal(seals.surge(), false, 'Skill cannot bypass vocabulary seals');
t = answer(seals.next(), { hinted: true }); seals.resolve(t, true);
assert.equal(seals.seals.length, 6, 'Hints cannot unlock the final seal');

const winner = prepared(); let count = 0;
while (!['won', 'lost'].includes(winner.phase) && count++ < 100) {
  if (winner.phase === 'transit') winner.update(3, false);
  const task = winner.next(); if (task) winner.resolve(answer(task), true);
}
assert.equal(winner.phase, 'won'); assert.equal(winner.cleared, 3);
assert.equal(winner.remembered.size, 6); assert.equal(winner.stars, 3);
assert.ok(count < 35, 'A successful run is bounded');
console.log('Quest checks passed: damage, defensive tradeoff, recognition dodge, hint cost, typo penalty, Boss armour cap and purge, relapse, skill cost, defeat, timer and final seals.');
console.log('Perfect run:', { tasks: count, stars: winner.stars, remembered: winner.remembered.size });
