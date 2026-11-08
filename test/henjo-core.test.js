// 水辺変状計測 計算コアのテスト（Excel 原本の数式と同じ結果になることを確認）
// 実行: node test/henjo-core.test.js
const assert = require('assert');
const C = require('../henjo-core.js');

// 測点数：提出18点＋補助8点、初期値は基準座標図・Excel と一致
assert.strictEqual(C.MAIN_POINTS.length, 18);
assert.strictEqual(C.AUX_POINTS.length, 8);
assert.strictEqual(C.GRAPH_POINTS.length, 16);
const bm1 = C.findPoint('BM-1');
assert.deepStrictEqual([bm1.x, bm1.y, bm1.z], [-147735.684, -51507.098, 8.240]);
const ml43 = C.findPoint('ml4-3');
assert.deepStrictEqual([ml43.x, ml43.y, ml43.z], [-148032.580, -51480.314, 3.156]);

// ROUND(x,0) は0から遠い方向へ
assert.strictEqual(C.excelRound0(-2.5), -3);
assert.strictEqual(C.excelRound0(2.5), 3);
assert.strictEqual(C.excelRound0((7.2805 - 7.291) * 1000), -11);

// 取込判定
const s = C.createState();
s.rounds[0].date = '2026-11-20';
const text = [
    'G00,01,test,', 'A00,',
    'A01,1,BM-1,-147735.684,-51507.098,8.240,',            // OK
    'A01,2,ＭＬ１－１,-147795.352,-51456.795,7.285,',       // 全角 → OK
    'A01,3,ML2-1,-51519.946,-147868.515,6.913,',           // XY入替?
    'A01,4,ML2-2,-147890.465,-51502.182,abc,',             // 数値エラー
    'A01,5,ML3-1,-147968.490,-51563.032,6.893,',           // 重複
    'A01,6,ml3-1,-147968.490,-51563.032,6.893,',           // 重複（大小文字無視）
    'A01,7,XX9,-1,-1,1,',                                  // 点名なし
    'ML4-1\t-148044.609\t-51500.895\t6.836',               // タブ区切り CSV → OK・差大（100mm）
    'A99,'
].join('\n');
const res = C.applyImport(s, 1, text);
const j = res.rows.filter(r => r.type).map(r => r.judge);
assert.deepStrictEqual(j, ['対象外行', '対象外行', 'OK', 'OK', 'XY入替?', '数値エラー', '重複', '重複', '点名なし', 'OK・差大', '対象外行']);
const sum = C.importSummary(s, 1);
assert.strictEqual(sum.status, '要確認');
assert.strictEqual(sum.reflectedText, '反映 3点');
assert.strictEqual(sum.notImportedText, '未取込 23点');

// 差・方向・色
const ml11 = C.findPoint('ML1-1');
const cx = C.cellCalc(s, 1, ml11, 'x');
assert.deepStrictEqual([cx.dInit, cx.dirInit, cx.dPrev, cx.level], [-12, '−', -12, 'warn']);
const cz = C.cellCalc(s, 1, ml11, 'z');
assert.deepStrictEqual([cz.dInit, cz.dirInit, cz.level], [-6, '↓', 'warn']);

// 第2回：前回との差は直前回との差、直前回が空欄なら空欄
s.rounds[1].date = '2026-12-18';
C.setManual(s, 2, 'ML1-1', 'z', 7.2805);
const cz2 = C.cellCalc(s, 2, ml11, 'z');
assert.deepStrictEqual([cz2.dInit, cz2.dPrev, cz2.dirPrev, cz2.level], [-11, -5, '↓', 'limit']);
C.setManual(s, 3, 'ML1-1', 'z', 7.29);
assert.strictEqual(C.cellCalc(s, 3, ml11, 'z').dPrev, 10);   // 7.290-7.2805=+9.5 → +10
C.setManual(s, 4, 'ML1-1', 'z', 7.29);
C.setManual(s, 3, 'ML1-1', 'z', null);
assert.strictEqual(C.cellCalc(s, 4, ml11, 'z').dPrev, null);

// 直接入力は再取込で上書きされない／取込値に戻せる
C.setManual(s, 1, 'ML1-1', 'x', -147795.300);
C.applyImport(s, 1, text);
assert.strictEqual(C.getValue(s, 1, 'ML1-1', 'x'), -147795.300);
assert.strictEqual(C.verifyRow(s, 1, res.rows.find(r => r.name === 'ＭＬ１－１'.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)))), '本番で修正');
C.revertToImport(s, 1, 'ML1-1');
assert.strictEqual(C.getValue(s, 1, 'ML1-1', 'x'), -147795.352);

// やり直し（取込クリア）で取込値は空欄に
C.applyImport(s, 1, '');
assert.strictEqual(C.getValue(s, 1, 'BM-1', 'x'), null);

// PRINT_START
const p = C.createState();
assert.strictEqual(C.printStart(p, 'latest'), 1);
for (let i = 0; i < 8; i++) p.rounds[i].date = '2027-01-0' + (i + 1);
assert.strictEqual(C.printStart(p, 'latest'), 3);
assert.strictEqual(C.printStart(p, '40'), 31);

// グラフ：初期〜計測日のある最終回、計測日なしの回は NA
const g = C.createState();
g.rounds[2].date = '2027-01-10';
const gs = C.graphSeries(g, ml11);
assert.deepStrictEqual(gs.cats, ['26/10/23', '', '', '27/1/10']);
assert.deepStrictEqual(gs.xyP, [15, null, null, 15]);

console.log('henjo-core: all tests passed');
