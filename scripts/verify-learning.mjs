import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../src/learning.js', import.meta.url), 'utf8');
const DAY = 86400000;
function setup(saved = {}) {
  const store = new Map([['tr-memory-v1', JSON.stringify(saved)]]);
  let now = 100 * DAY;
  const bank = Array.from({ length: 25 }, (_, i) => ({ w: 'word' + i, zh: '释义' + i }));
  const G = { cfg: { bank: 'cet4', mode: 'learn' }, words: { banks: { cet4: bank }, LIST: bank }, ui: { toast() {} } };
  const context = createContext({ window: { G }, Date: { now: () => now }, localStorage: {
    getItem: key => store.get(key), setItem: (key, value) => store.set(key, value),
  } });
  runInContext(source, context);
  return { G, memory: () => JSON.parse(store.get('tr-memory-v1')), advance: days => now += days * DAY };
}
const test = setup();
let s = test.G.learning.begin();
assert.equal(s.selected.length, 10);
assert.equal(new Set(s.selected.map(e => e.w)).size, 10);
assert.equal(s.queue.length, 20, 'New words get exposure and recall');
assert.ok(s.queue.slice(0, 10).every(t => t.stage === 'discover'));
const target = s.selected[0];
test.G.learning.result({ ...target, stage: 'discover', errors: 0 }, true);
assert.equal(test.memory()[target.w].level, 0, 'Exposure does not imply mastery');
assert.equal(s.completed, 0);
test.G.learning.result({ ...target, stage: 'recall', retrieval: true, attempt: 0 }, true);
assert.equal(test.memory()[target.w].level, 1);
const due = test.memory()[target.w].due;
test.G.learning.begin(true, [target.w]);
test.G.learning.result({ ...target, stage: 'recall', retrieval: true, attempt: 0 }, true);
assert.equal(test.memory()[target.w].level, 1, 'Early practice does not skip intervals');
assert.equal(test.memory()[target.w].due, due, 'Early practice does not postpone review');
test.advance(1);
test.G.learning.begin(true, [target.w]);
test.G.learning.result({ ...target, stage: 'recall', retrieval: true, attempt: 0 }, true);
assert.equal(test.memory()[target.w].level, 2, 'Due recall advances level');
test.advance(3);
test.G.learning.begin(true, [target.w]);
test.G.learning.result({ ...target, stage: 'recall', retrieval: true, attempt: 0 }, true);
assert.equal(test.G.learning.overview().mastered, 1, 'Three scheduled recalls count as familiar');

const failures = setup();
s = failures.G.learning.begin();
const word = s.selected[0];
failures.G.learning.result({ ...word, stage: 'recall', retrieval: true, hinted: true, attempt: 0 }, true);
assert.equal(s.completed, 0, 'Hinted answer stays pending');
assert.equal(failures.memory()[word.w].level, 0);
assert.equal(s.queue[3].entry.w, word.w, 'Retry comes after intervening prompts');
failures.G.learning.result({ ...word, stage: 'recall', retrieval: true, attempt: 1 }, false);
failures.G.learning.result({ ...word, stage: 'recall', retrieval: true, attempt: 2 }, false);
assert.equal(s.completed, 1, 'Repeated failures resolve without an endless loop');
assert.equal(s.results.get(word.w).status, 'review');

const relapse = setup();
relapse.G.game = { mode: 'quest' };
s = relapse.G.learning.begin();
const repeated = { ...s.selected[0], stage: 'recall', retrieval: true, quest: true, attempt: 1 };
relapse.G.learning.result({ ...repeated, errors: 1 }, false);
relapse.G.learning.result(repeated, true);
assert.equal(s.recovered.has(repeated.w), true, 'Clean recall recovers a previously weak word');
assert.equal(s.results.get(repeated.w).status, 'remembered');
relapse.G.learning.result({ ...repeated, errors: 1 }, false);
assert.equal(s.recovered.has(repeated.w), false, 'A later failure removes the earlier recovery');
assert.equal(s.results.get(repeated.w).status, 'review', 'Latest performance controls the summary status');
assert.equal(s.completed, 1, 'Repeated campaign prompts still count one unique word');
assert.equal(relapse.memory()[repeated.w].level, 0, 'Relapsed words return to immediate review');
assert.equal(relapse.G.learning.overview().due, 1);
assert.ok([...s.wrong.values()].filter(t => !s.recovered.has(t.w)).some(t => t.w === repeated.w),
  'The summary retains a word that was recovered and then forgotten again');

const copy = setup();
s = copy.G.learning.begin();
copy.G.learning.result({ ...s.selected[0], stage: 'recall', retrieval: false, attempt: 0 }, true);
assert.equal(copy.memory()[s.selected[0].w].level, 0, 'Visible spelling never advances memory level');

const corrupt = setup({ word0: { level: 999, due: 1 }, word1: null });
assert.equal(corrupt.G.learning.overview().seen, 0, 'Invalid saved records are ignored');
console.log('Learning checks passed: selection, exposure, hints, retries, relapse summaries, due dates, early practice, persistence validation.');
