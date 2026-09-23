'use strict';
// 使い方: node tools/test-level.js
// index.html の LEVEL-LOGIC 区間(純粋関数のみ)を切り出して検証する。

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\/ ==== LEVEL-LOGIC-BEGIN ====([\s\S]*?)\/\/ ==== LEVEL-LOGIC-END ====/);
if (!m) throw new Error('LEVEL-LOGIC 区間が見つかりません');

const L = vm.runInNewContext(m[1] + `
;({ fieldNames, FIELD_WEIGHTS, PASS_LEVEL, PASS_RATE, xpToNext, calcExpLevel, fieldStats,
    estimateScore, levelCap, weakFields, calcOverallLevel, latestWrongIds, allocateByWeight, heroTier })`);

const FIELDS = Object.keys(L.fieldNames);
let t0 = Date.parse('2026-01-01T00:00:00Z');
// 分野 id に n 問、正答率 rate で回答したログを作る(不正解を均等に散らす)
function answers(id, n, rate) {
  const out = [];
  const hits = k => Math.floor(k * rate + 1e-9);
  for (let i = 0; i < n; i++) {
    const ok = hits(i + 1) > hits(i);
    out.push({ question_id: id + '-' + i, category_id: id, is_correct: ok, created_at: new Date(t0 += 1000).toISOString() });
  }
  return out;
}
function allFields(n, rate) { return FIELDS.flatMap(id => answers(id, n, rate)); }
const BIG_EXP = 1e6;

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('比重の合計は100で、全分野に比重がある', () => {
  assert.strictEqual(Object.values(L.FIELD_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  assert.deepStrictEqual(Object.keys(L.FIELD_WEIGHTS).sort(), FIELDS.slice().sort());
});

test('EXP レベル: 0 EXP は Lv1、Lv100 で頭打ち', () => {
  assert.strictEqual(L.calcExpLevel(0).level, 1);
  assert.strictEqual(L.calcExpLevel(99).level, 1);
  assert.strictEqual(L.calcExpLevel(100).level, 2);
  let sum = 0;
  for (let n = 1; n < 100; n++) sum += L.xpToNext(n);
  assert.strictEqual(sum, 19602);
  assert.strictEqual(L.calcExpLevel(sum - 1).level, 99);
  assert.strictEqual(L.calcExpLevel(sum).level, 100);
  assert.strictEqual(L.calcExpLevel(BIG_EXP).level, 100);
});

test('解いた数だけでは Lv100 にならない(全分野 60% だと上限 Lv79)', () => {
  const r = L.calcOverallLevel(BIG_EXP, allFields(40, 0.6));
  assert.ok(Math.abs(r.estimate - 0.6) < 1e-9);
  assert.strictEqual(r.level, 79);
  assert.ok(r.capped);
});

test('推定得点率ごとのレベル上限', () => {
  assert.strictEqual(L.calcOverallLevel(BIG_EXP, allFields(30, 0.5)).level, 59);
  assert.strictEqual(L.calcOverallLevel(BIG_EXP, allFields(30, 0.7)).level, 89);
  assert.strictEqual(L.calcOverallLevel(BIG_EXP, allFields(40, 0.75)).level, 99);
  assert.strictEqual(L.calcOverallLevel(BIG_EXP, allFields(40, 0.8)).level, 100);
});

test('ログなしでも EXP が少なければ上限にかからない', () => {
  const r = L.calcOverallLevel(500, []);
  assert.strictEqual(r.estimate, 0);
  assert.strictEqual(r.level, L.calcExpLevel(500).level);
  assert.ok(!r.capped);
});

test('推定得点率は直近30問だけで計算する', () => {
  const logs = FIELDS.flatMap(id => answers(id, 50, 0).concat(answers(id, 30, 1)));
  const r = L.calcOverallLevel(BIG_EXP, logs);
  assert.strictEqual(r.estimate, 1);
  assert.strictEqual(r.stats.france.total, 80);
  assert.strictEqual(r.stats.france.recentTotal, 30);
});

test('未回答の分野は 0 扱いで、1分野でも30問未満なら Lv100 不可', () => {
  const logs = FIELDS.filter(id => id !== 'law').flatMap(id => answers(id, 40, 1)).concat(answers('law', 29, 1));
  const r = L.calcOverallLevel(BIG_EXP, logs);
  assert.strictEqual(r.estimate, 1);
  assert.strictEqual(r.level, 99);
  assert.ok(r.blockers.some(b => b.includes('酒類の法規')));

  const noLaw = FIELDS.filter(id => id !== 'law').flatMap(id => answers(id, 40, 0.8));
  const r2 = L.calcOverallLevel(BIG_EXP, noLaw);
  assert.ok(Math.abs(r2.estimate - 0.8 * 0.96) < 1e-9);
  assert.strictEqual(r2.level, 99);
});

test('高比重分野(フランス)が75%未満なら、全体が高くても Lv100 不可', () => {
  const logs = FIELDS.filter(id => id !== 'france').flatMap(id => answers(id, 40, 0.9)).concat(answers('france', 40, 0.7));
  const r = L.calcOverallLevel(BIG_EXP, logs);
  assert.ok(r.estimate >= L.PASS_RATE);
  assert.strictEqual(r.level, 99);
  assert.ok(r.blockers.some(b => b.includes('フランス')));
});

test('弱点分野は「比重 × 合格ラインとの差」の大きい順', () => {
  const logs = allFields(30, 0.9).concat(answers('france', 30, 0.5), answers('law', 30, 0));
  const r = L.calcOverallLevel(0, logs);
  assert.deepStrictEqual([...r.weak.map(w => w.id)], ['france', 'law']);
});

test('復習対象は「最後の回答が不正解」の問題だけ', () => {
  const at = s => new Date(Date.parse('2026-02-01T00:00:00Z') + s * 1000).toISOString();
  const logs = [
    { question_id: 'a', is_correct: false, created_at: at(1) },
    { question_id: 'a', is_correct: true,  created_at: at(2) },
    { question_id: 'b', is_correct: true,  created_at: at(3) },
    { question_id: 'b', is_correct: false, created_at: at(4) },
    { question_id: 'c', is_correct: false, created_at: at(5) }
  ];
  assert.deepStrictEqual([...L.latestWrongIds(logs.reverse())].sort(), ['b', 'c']);
});

test('模試の配分: 120問を比重どおり、在庫不足は他分野へ再配分', () => {
  const plenty = {};
  FIELDS.forEach(id => { plenty[id] = 100; });
  const a = L.allocateByWeight(120, plenty);
  assert.strictEqual(Object.values(a).reduce((s, n) => s + n, 0), 120);
  assert.strictEqual(a.france, 26);
  assert.strictEqual(a.intro, 18);

  const tight = Object.assign({}, plenty, { france: 10 });
  const b = L.allocateByWeight(120, tight);
  assert.strictEqual(b.france, 10);
  assert.strictEqual(Object.values(b).reduce((s, n) => s + n, 0), 120);

  const tiny = { france: 3, law: 2 };
  const c = L.allocateByWeight(120, tiny);
  assert.strictEqual(c.france + c.law, 5);
});

test('キャラクター段階: Lv1=0, Lv100=6', () => {
  assert.strictEqual(L.heroTier(1), 0);
  assert.strictEqual(L.heroTier(14), 0);
  assert.strictEqual(L.heroTier(15), 1);
  assert.strictEqual(L.heroTier(99), 5);
  assert.strictEqual(L.heroTier(100), 6);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok   -', name); }
  catch (e) { failed++; console.log('FAIL -', name, '\n      ', e.message); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
