/* A short walk alternates exposure and retrieval. Progress survives between walks. */
(() => {
'use strict';
const G = window.G;
const DAY = 86400000;
const shuffle = a => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
let memory = {};
try {
  const saved = JSON.parse(localStorage.getItem('tr-memory-v1') || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) memory = saved;
} catch (_) {}
let session;
const save = () => {
  try { localStorage.setItem('tr-memory-v1', JSON.stringify(memory)); }
  catch (_) { G.ui.toast('浏览器未允许保存进度，本次仍可正常练习', 3000); }
};
const validRecord = w => {
  const r = memory[w];
  return r && Number.isInteger(r.level) && r.level >= 0 && r.level <= 5 && Number.isFinite(r.due) && r.due >= 0 ? r : null;
};
G.learning = {
  begin(reviewOnly = false, targets = null) {
    const bank = G.words.banks[G.cfg.bank] || G.words.LIST;
    const due = shuffle(bank.filter(e => validRecord(e.w) && validRecord(e.w).due <= Date.now()));
    const fresh = shuffle(bank.filter(e => !validRecord(e.w)));
    const other = shuffle(bank.filter(e => validRecord(e.w) && validRecord(e.w).due > Date.now()));
    const pool = reviewOnly ? [...due, ...other] : [...due.slice(0, 4), ...fresh, ...due.slice(4), ...other];
    const selected = (targets?.length ? bank.filter(e => targets.includes(e.w)) : pool).slice(0, G.game?.mode === 'quest' ? 6 : 10);
    const preview = (G.game?.mode || G.cfg.mode) === 'learn' ? selected.filter(e => !validRecord(e.w)).map(entry => ({ entry, stage: 'discover', attempt: 0 })) : [];
    const recall = selected.map(entry => ({ entry, stage: 'recall', attempt: 0 }));
    session = { selected, queue: [...preview, ...shuffle(recall)], recovered: new Set(), completed: 0,
      attempts: 0, correct: 0, wrong: new Map(), results: new Map(), finished: false };
    return session;
  },
  next() { return session.queue.shift() || null; },
  result(t, success) {
    if (!session) return;
    session.attempts++;
    const clean = success && !t.errors && !t.hinted;
    if (t.stage === 'discover') {
      if (!clean) session.wrong.set(t.w, t);
      if (!validRecord(t.w)) { memory[t.w] = { level: 0, due: Date.now(), seen: 1 }; save(); }
      return;
    }
    const old = validRecord(t.w) || { level: 0, due: 0, seen: 0 };
    if (success && !t.retrieval) {
      memory[t.w] = { ...old, seen: (old.seen || 0) + 1 };
      session.results.set(t.w, { ...t, status: 'practiced' });
      session.completed++; save(); return;
    }
    if (clean) {
      // A same-session retry strengthens memory without skipping review intervals.
      const level = t.attempt > 0 || old.due > Date.now() ? Math.max(1, old.level) : Math.min(5, old.level + 1);
      const due = old.due > Date.now() && t.attempt === 0 ? old.due : Date.now() + [0, 1, 3, 7, 14, 30][level] * DAY;
      memory[t.w] = { level, due, seen: (old.seen || 0) + 1 };
      session.correct++;
      if (session.wrong.has(t.w)) session.recovered.add(t.w);
      session.results.set(t.w, { ...t, status: 'remembered' });
      if (t.quest) session.completed = session.results.size; else session.completed++;
    } else {
      memory[t.w] = { level: 0, due: Date.now(), seen: (old.seen || 0) + 1 };
      session.recovered.delete(t.w);
      session.wrong.set(t.w, t);
      if (t.quest) {
        session.results.set(t.w, { ...t, status: 'review' }); session.completed = session.results.size;
      } else if (t.attempt < 2) {
        session.queue.splice(Math.min(3, session.queue.length), 0,
          { entry: { w: t.w, zh: t.zh, example: t.example, display: t.display, ipa: t.ipa }, stage: 'recall', attempt: t.attempt + 1 });
      } else {
        session.results.set(t.w, { ...t, status: 'review' });
        session.completed++;
      }
    }
    save();
  },
  markWeak(t) {
    const old = validRecord(t.w) || { seen: 0 };
    memory[t.w] = { level: 0, due: Date.now(), seen: old.seen || 0 };
    session.wrong.set(t.w, t); session.recovered.delete(t.w);
    session.results.set(t.w, { ...t, status: 'review' }); session.completed = session.results.size; save();
  },
  overview() {
    const bank = G.words.banks[G.cfg.bank] || G.words.LIST;
    const seen = bank.filter(e => validRecord(e.w));
    return { seen: seen.length, mastered: seen.filter(e => validRecord(e.w).level >= 3).length,
      due: seen.filter(e => validRecord(e.w).due <= Date.now()).length, total: bank.length };
  },
  get session() { return session; },
  shuffle,
};
})();
