import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context = vm.createContext({ window: {} });
vm.runInContext(await readFile(new URL('../src/words.js', import.meta.url), 'utf8'), context);
context.G = context.window.G;
vm.runInContext(await readFile(new URL('../src/ielts-words.js', import.meta.url), 'utf8'), context);
const bank = context.G.words.banks.ielts;
assert.equal(bank.length, 3629);
assert.equal(new Set(bank.map(e => e.w)).size, 3629);
for (const [i, entry] of bank.entries()) {
  assert.equal(entry.sourceId, i + 1);
  assert.ok(entry.sourcePage >= 1 && entry.sourcePage <= 76);
  assert.match(entry.w, /^[a-z]+(?:[ '-][a-z]+)*$/);
  assert.match(entry.zh, /[\u3400-\u9fff]/);
  assert.equal(entry.display.toLowerCase(), entry.w);
}
assert.equal(bank.filter(e => /[^a-z]/.test(e.w)).length, 25);
assert.match(bank.find(e => e.w === 'carbon dioxide').zh, /二氧化碳/);
assert.ok(bank.some(e => e.w === 'up-to-date'));
assert.equal(context.G.words.LIST.length, 1417);
console.log('Both word banks verified: CET4 1417; IELTS 3629, including 25 phrases.');
