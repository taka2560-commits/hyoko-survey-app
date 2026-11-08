// 標高管理 履歴コアのテスト（Excel「OSR水準点計測」と同じ結果になることを確認）
// 実行: node test/hyoko-core.test.js
const assert = require('assert');
const H = require('../hyoko-core.js');

const tmpl = [
    { tabName: '1級基準点', data: [{ id: '③ SA12 (OP)', init: '+18.434', prev: '+18.433', curr: '' }] },
    { tabName: '2級基準点', data: [
        { id: '⑥ アングル (OP)', init: '+7.900', prev: '+7.897', curr: '' },
        { id: '⑩ アングル (OP)', init: '+3.000', prev: '+3.000', curr: '' }] },
    { tabName: '3級基準点', data: [{ id: '⑬ 構台杭 (OP)', init: '+3.000', prev: '+3.000', curr: '' }] }
];

// OSR 現場の移行：Excel の第1〜3回が入り、入力先は第4回
let p = { id: 'p_1', name: 'OSR', measureDate: '2026-11-08', tabs: JSON.parse(JSON.stringify(tmpl)) };
H.migrateProject(p);
assert.strictEqual(p.currentRound, 4);
assert.deepStrictEqual(p.rounds.slice(0, 4).map(r => r.date), ['2026-06-25', '2026-07-25', '2026-08-26', '']);
const sa12 = p.tabs[0].data[0], a6 = p.tabs[1].data[0], a10 = p.tabs[1].data[1], k13 = p.tabs[2].data[0];
assert.deepStrictEqual(sa12.hist.slice(0, 3), ['+18.434', '+18.433', '+18.433']);
assert.ok(!('prev' in sa12) && !('curr' in sa12) && !('measureDate' in p));

// 計算（Excel PDF の値）
assert.deepStrictEqual(pick(H.calc(sa12, 2)), [-1, -1, '↓']);
assert.deepStrictEqual(pick(H.calc(sa12, 3)), [-1, 0, '↓']);
assert.deepStrictEqual(pick(H.calc(a6, 3)), [-3, -2, '↓']);
assert.strictEqual(H.calc(a6, 3).update, true);           // 3mm以上 → 更新対象
assert.strictEqual(H.calc(a6, 2).update, false);
assert.deepStrictEqual(pick(H.calc(a10, 3)), [0, 0, '-']);
assert.deepStrictEqual(pick(H.calc(a10, 2)), [0, null, '-']); // 前回(第1回)が空欄 → 前回との差は空欄
assert.deepStrictEqual(pick(H.calc(k13, 3)), [0, null, '-']);
assert.strictEqual(H.calc(sa12, 4).value, null);
assert.strictEqual(H.latestBefore(k13, 4), '+3.000');
assert.strictEqual(H.latestBefore(a10, 2), '+3.000');       // 第1回空欄 → 初期値
assert.strictEqual(H.asOfDate(p), '2026-08-26');
assert.strictEqual(H.lastMeasuredRound(p), 3);

// 当月値（8/26 より後に入力中）は第4回へ
p = { id: 'p_1', name: 'OSR', measureDate: '2026-09-25', tabs: JSON.parse(JSON.stringify(tmpl)) };
p.tabs[1].data[0].curr = '+7.895';
H.migrateProject(p);
assert.strictEqual(p.tabs[1].data[0].hist[3], '+7.895');
assert.strictEqual(p.rounds[3].date, '2026-09-25');
assert.strictEqual(H.asOfDate(p), '2026-09-25');

// 従来テンプレートの現場：前月が実測（初期値と違う）なら第1回、当月は第2回
let q = { id: 'p_2', name: '別', measureDate: '2026-06-01', tabs: [{ tabName: '水準点鋲 / KBM', data: [
    { id: 'T-1', init: '+2.058', prev: '+2.055', curr: '+2.050' }, { id: 'T-2', init: '+1.133', prev: '+1.133', curr: '' }] }] };
H.migrateProject(q);
assert.deepStrictEqual(q.tabs[0].data[0].hist.slice(0, 2), ['+2.055', '+2.050']);
assert.deepStrictEqual(q.tabs[0].data[1].hist.slice(0, 2), ['+1.133', '']);
assert.strictEqual(q.currentRound, 2);
assert.strictEqual(q.rounds[1].date, '2026-06-01');
// 前月＝初期値（未計測）なら当月が第1回
q = { id: 'p_3', name: '別', measureDate: '2026-06-01', tabs: [{ tabName: 'X', data: [{ id: 'T-1', init: '+2.058', prev: '+2.058', curr: '+2.050' }] }] };
H.migrateProject(q);
assert.deepStrictEqual(q.tabs[0].data[0].hist.slice(0, 2), ['+2.050', '']);
assert.strictEqual(q.currentRound, 1);

// 移行済みは変更しない
const before = JSON.stringify(p);
H.migrateProject(p);
assert.strictEqual(JSON.stringify(p), before);

// 点名の分解・CSV
assert.deepStrictEqual(H.splitId('④ KBM(T1) (B1FL)'), { no: '④', name: 'KBM(T1)', kind: 'B1FL' });
assert.deepStrictEqual(H.splitId('駐車場外壁 (OP)'), { no: '', name: '駐車場外壁', kind: 'OP' });
assert.deepStrictEqual(H.splitId('SA5'), { no: '', name: 'SA5', kind: '' });
const csv = H.toCSV(p);
assert.ok(csv.includes('⑥ アングル (OP),+7.900,2026-05-13,+7.899,-1,-1,↓,+7.899,-1,0,↓,+7.897,-3,-2,↓,+7.895,-5,-2,↓'));

console.log('hyoko-core: all tests passed');
function pick(c) { return [c.dInit, c.dPrev, c.dir]; }
