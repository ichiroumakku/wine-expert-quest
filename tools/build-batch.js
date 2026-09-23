'use strict';
// 使い方: node tools/build-batch.js <batch名> [開始question_no]
//   例:   node tools/build-batch.js batch-001 1
//         node tools/build-batch.js all          … input/ の全バッチを連番で変換し seed-all.sql も出力
//         node tools/build-batch.js all --from batch-013 … 上記に加え、batch-013 以降だけをまとめた seed-from-batch-013.sql も出力(追加投入用)
//
// 入力: tools/input/<batch名>.json
//   [{ "f":"france", "d":2, "r":true,
//      "q":"問題文",
//      "c":["正答の選択肢","誤答1","誤答2","誤答3"],
//      "e":"解説(選択肢記号ではなく内容で説明すること。並べ替え後も破綻しないように)" }, ...]
//   "f" は categories マスタの11分類のいずれか:
//   intro / france / italy / spain_portugal / germany_austria / new_world /
//   japan / other_drinks / tasting / service_cheese / law
//   "d" は 1=基礎用語 / 2=産地・品種の対応 / 3=細かい数値・法規
//   "r" は needs_review(年度で変わりうる数値・法規を含む問題に true)
//
// 出力: tools/out/<batch名>.sql   (questions への INSERT 文)
//   - c[0] を正答として、ア/イ/ウ/エ の正答分布が均等になるよう毎回割り当てる

const fs = require('fs');
const path = require('path');

const LETTERS = ['ア', 'イ', 'ウ', 'エ'];
const VALID_CATEGORIES = new Set([
  'intro', 'france', 'italy', 'spain_portugal', 'germany_austria', 'new_world',
  'japan', 'other_drinks', 'tasting', 'service_cheese', 'law'
]);

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const jb = obj => q(JSON.stringify(obj)) + '::jsonb';

function buildBatch(batch, startNo) {
  const inPath = path.join(__dirname, 'input', batch + '.json');
  const items = JSON.parse(fs.readFileSync(inPath, 'utf8'));

  const counts = { 'ア': 0, 'イ': 0, 'ウ': 0, 'エ': 0 };
  function pickLetter(seed) {
    const min = Math.min(...LETTERS.map(l => counts[l]));
    const cands = LETTERS.filter(l => counts[l] === min);
    const L = cands[hash(seed) % cands.length];
    counts[L]++;
    return L;
  }

  let no = startNo;
  const rows = items.map(item => {
    const label = JSON.stringify(item.q).slice(0, 40);
    if (!Array.isArray(item.c) || item.c.length !== 4) {
      throw new Error('c は4要素の配列である必要があります: ' + label);
    }
    if (new Set(item.c).size !== 4) {
      throw new Error('c に重複した選択肢があります: ' + label);
    }
    if (!VALID_CATEGORIES.has(item.f)) {
      throw new Error('f が11分類のいずれでもありません: ' + item.f + ' (' + label + ')');
    }
    if (![1, 2, 3].includes(item.d)) {
      throw new Error('d は 1/2/3 のいずれかです: ' + label);
    }
    if (!item.q || !item.e) {
      throw new Error('q と e は必須です: ' + label);
    }
    const correctText = item.c[0];
    const others = item.c.slice(1);
    const target = pickLetter(item.q);
    const nc = {};
    let oi = 0;
    for (const l of LETTERS) nc[l] = (l === target) ? correctText : others[oi++];
    const row = `(${q('JSA-WE')}, ${q('gen-' + batch)}, ${no}, ${q(item.f)}, ${item.d}, ${q(item.q)}, ${jb(nc)}, ${q(target)}, ${q(item.e)}, ${item.r ? 'true' : 'false'}, ${q('generated')})`;
    no++;
    return row;
  });

  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const head = 'insert into questions (exam_type, year, question_no, category_id, difficulty, body, choices, official_answer, explanation, needs_review, source) values\n';
  const sql = head + rows.join(',\n') + ';\n';
  const outPath = path.join(outDir, batch + '.sql');
  fs.writeFileSync(outPath, sql);

  console.log('wrote', path.relative(process.cwd(), outPath), '-', rows.length, 'rows (question_no', startNo, '..', no - 1 + ')');
  console.log('official_answer distribution:', JSON.stringify(counts));
  return { sql, nextNo: no };
}

const batch = process.argv[2];
if (!batch) {
  console.error('batch名を指定してください。例: node tools/build-batch.js batch-001 1');
  process.exit(1);
}

if (batch === 'all') {
  const names = fs.readdirSync(path.join(__dirname, 'input'))
    .filter(f => /^batch-\d+\.json$/.test(f)).sort().map(f => f.replace(/\.json$/, ''));
  let no = 1;
  const parts = [];
  for (const name of names) {
    const r = buildBatch(name, no);
    parts.push({ name: name, rows: r.nextNo - no, sql: '-- ' + name + '\n' + r.sql });
    no = r.nextNo;
  }
  const seedPath = path.join(__dirname, 'out', 'seed-all.sql');
  fs.writeFileSync(seedPath, parts.map(p => p.sql).join('\n'));
  console.log('wrote', path.relative(process.cwd(), seedPath), '-', no - 1, 'rows total');

  const fromIdx = process.argv.indexOf('--from');
  if (fromIdx > 0) {
    const from = process.argv[fromIdx + 1];
    const picked = parts.filter(p => p.name >= from);
    if (picked.length === 0) throw new Error('--from に該当するバッチがありません: ' + from);
    const addPath = path.join(__dirname, 'out', 'seed-from-' + from + '.sql');
    fs.writeFileSync(addPath, picked.map(p => p.sql).join('\n'));
    console.log('wrote', path.relative(process.cwd(), addPath), '-', picked.reduce((s, p) => s + p.rows, 0), 'rows (', picked[0].name, '..', picked[picked.length - 1].name, ')');
  }
} else {
  buildBatch(batch, parseInt(process.argv[3] || '1', 10));
}
