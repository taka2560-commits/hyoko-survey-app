/*
 * 水辺変状計測 計算コア（henjo-core.js）
 * 「20261024_OSR水辺変状計測.xlsx」の数式をそのまま移植したもの。
 *   - 変状計測 / 補助点-3 タブ ……… 初期値との差・前回との差・変位方向・色判定
 *   - 取込処理（非表示）タブ ……… SIMA / CSV の自動判別と判定（OK / OK・差大 / 点名なし / 重複 / 数値エラー / XY入替? / 対象外行）
 *   - 計測値取込 タブ ……………… 見出し（反映n点 / 未取込n点 / ✓取込完了 等）と本番照合
 *   - 印刷 タブ ………………………… 表示開始回（PRINT_START）
 *   - 経時変化グラフ タブ ………… グラフ用データ（初期〜計測日が入っている最終回）
 * 画面（henjo.html）からも Node.js のテストからも使えるよう、DOM には依存しない。
 */
(function (root) {
    'use strict';

    const ROUND_COUNT = 36;          // 第1回〜第36回（月1回で約3年分）
    const PRINT_COLS = 6;            // 印刷は6回分
    const INIT_DATE = '2026-10-23';  // 初期値計測日（変状計測!E4）

    // 管理基準タブの初期値
    const DEFAULT_SETTINGS = {
        xyWarn: 10,      // XY_WARN  管理基準!B4
        xyLimit: 15,     // XY_LIMIT 管理基準!C4
        zWarn: 5,        // Z_WARN   管理基準!B5
        zLimit: 10,      // Z_LIMIT  管理基準!C5
        importDiff: 100  // IMPORT_DIFF 管理基準!B14（差大判定 mm）
    };

    // 変状計測タブ（提出 18点）: 測線・管理番号・測点名・初期値(X,Y,Z(OP))
    const MAIN_POINTS = [
        { line: '計測用BM', no: '',  name: 'BM-1',  x: -147735.684, y: -51507.098, z: 8.240 },
        { line: '計測用BM', no: '',  name: 'BM-2',  x: -148242.348, y: -51770.549, z: 4.945 },
        { line: 'ML1', no: '①', name: 'ML1-1', x: -147795.340, y: -51456.801, z: 7.291 },
        { line: 'ML1', no: '②', name: 'ML1-2', x: -147828.754, y: -51457.942, z: 4.176 },
        { line: 'ML2', no: '③', name: 'ML2-1', x: -147868.515, y: -51519.946, z: 6.913 },
        { line: 'ML2', no: '④', name: 'ML2-2', x: -147890.465, y: -51502.182, z: 4.177 },
        { line: 'ML3', no: '⑤', name: 'ML3-1', x: -147968.490, y: -51563.032, z: 6.893 },
        { line: 'ML3', no: '⑥', name: 'ML3-2', x: -147968.335, y: -51541.391, z: 4.198 },
        { line: 'ML4', no: '⑦', name: 'ML4-1', x: -148044.609, y: -51500.895, z: 6.736 },
        { line: 'ML4', no: '⑧', name: 'ML4-2', x: -148032.284, y: -51480.119, z: 4.212 },
        { line: 'ML5', no: '⑨', name: 'ML5-1', x: -148111.845, y: -51559.228, z: 6.624 },
        { line: 'ML5', no: '⑩', name: 'ML5-2', x: -148120.300, y: -51535.683, z: 4.117 },
        { line: 'ML6', no: '⑪', name: 'ML6-1', x: -148159.007, y: -51611.492, z: 8.674 },
        { line: 'ML6', no: '⑫', name: 'ML6-2', x: -148185.601, y: -51603.375, z: 3.953 },
        { line: 'ML7', no: '⑬', name: 'ML7-1', x: -148224.142, y: -51681.912, z: 8.914 },
        { line: 'ML7', no: '⑭', name: 'ML7-2', x: -148244.309, y: -51666.697, z: 3.963 },
        { line: 'ML8', no: '⑮', name: 'ML8-1', x: -148274.328, y: -51736.605, z: 8.035 },
        { line: 'ML8', no: '⑯', name: 'ML8-2', x: -148297.851, y: -51726.142, z: 4.009 }
    ];

    // 補助点-3タブ（社内管理のみ・提出しない 8点）
    const AUX_POINTS = [
        { line: 'ML1', no: '補', name: 'ML1-3', x: -147828.648, y: -51458.047, z: 3.147 },
        { line: 'ML2', no: '補', name: 'ML2-3', x: -147890.412, y: -51502.265, z: 3.132 },
        { line: 'ML3', no: '補', name: 'ML3-3', x: -147966.793, y: -51540.241, z: 3.150 },
        { line: 'ML4', no: '補', name: 'ML4-3', x: -148032.580, y: -51480.314, z: 3.156 },
        { line: 'ML5', no: '補', name: 'ML5-3', x: -148120.471, y: -51535.906, z: 3.066 },
        { line: 'ML6', no: '補', name: 'ML6-3', x: -148185.821, y: -51603.689, z: 2.897 },
        { line: 'ML7', no: '補', name: 'ML7-3', x: -148243.303, y: -51665.638, z: 2.912 },
        { line: 'ML8', no: '補', name: 'ML8-3', x: -148297.586, y: -51725.786, z: 2.947 }
    ];
    MAIN_POINTS.forEach(p => { p.kind = 'main'; });
    AUX_POINTS.forEach(p => { p.kind = 'aux'; });
    const ALL_POINTS = MAIN_POINTS.concat(AUX_POINTS);
    // 経時変化グラフ（16点）＝ 水辺変状計測点 ML1-1〜ML8-2
    const GRAPH_POINTS = MAIN_POINTS.filter(p => p.line !== '計測用BM');

    const COMPS = ['x', 'y', 'z'];
    const COMP_LABEL = { x: 'X', y: 'Y', z: 'Z (OP)' };

    // ---------- 状態 ----------
    function emptyRound() {
        return { date: '', remarks: '', values: {}, src: {}, importText: '' };
    }

    function createState() {
        const rounds = [];
        for (let i = 0; i < ROUND_COUNT; i++) rounds.push(emptyRound());
        return {
            version: 1,
            initDate: INIT_DATE,
            initRemarks: '初期値設置',
            settings: Object.assign({}, DEFAULT_SETTINGS),
            rounds: rounds,
            currentRound: 1,
            printStart: 'latest',
            printMap: true
        };
    }

    // 保存データの欠けを補う（バックアップ復元・旧版データ対策）
    function normalizeState(s) {
        const base = createState();
        if (!s || typeof s !== 'object') return base;
        const out = Object.assign(base, s);
        out.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings || {});
        const rounds = Array.isArray(s.rounds) ? s.rounds : [];
        out.rounds = [];
        for (let i = 0; i < ROUND_COUNT; i++) {
            const r = Object.assign(emptyRound(), rounds[i] || {});
            r.values = r.values || {};
            r.src = r.src || {};
            out.rounds.push(r);
        }
        out.currentRound = clampInt(out.currentRound, 1, ROUND_COUNT, 1);
        return out;
    }

    function clampInt(v, lo, hi, def) {
        const n = parseInt(v, 10);
        if (isNaN(n)) return def;
        return Math.max(lo, Math.min(hi, n));
    }

    // ---------- 共通関数（Excel関数の再現） ----------

    // ASC 関数：全角英数記号・全角スペースを半角に
    function toHalfWidth(str) {
        return String(str == null ? '' : str)
            .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
            .replace(/　/g, ' ');
    }

    // TRIM 関数：前後の空白除去＋連続空白を1つに
    function excelTrim(str) {
        return String(str == null ? '' : str).replace(/ +/g, ' ').trim();
    }

    // ROUND(x,0)：0から遠い方向へ四捨五入（浮動小数点誤差を吸収）
    function excelRound0(v) {
        const fixed = Number(v.toFixed(6));
        const r = Math.round(Math.abs(fixed));
        return fixed < 0 ? -r : r;
    }

    // --"文字列"：数値に変換できなければ NaN
    function toNumber(s) {
        if (typeof s === 'number') return isFinite(s) ? s : NaN;
        const t = String(s == null ? '' : s).trim();
        if (t === '') return NaN;
        const n = Number(t);
        return isFinite(n) ? n : NaN;
    }

    function isNum(v) { return typeof v === 'number' && isFinite(v); }

    // 点名の照合（Excel の MATCH / COUNTIF は大文字小文字を区別しない）
    const NAME_INDEX = {};
    ALL_POINTS.forEach(p => { NAME_INDEX[p.name.toUpperCase()] = p; });
    function findPoint(name) {
        if (!name) return null;
        return NAME_INDEX[String(name).toUpperCase()] || null;
    }

    // ---------- 変状計測タブの計算 ----------

    function getValue(state, roundNo, name, comp) {
        if (roundNo < 1 || roundNo > ROUND_COUNT) return null;
        const v = state.rounds[roundNo - 1].values[name];
        if (!v) return null;
        return isNum(v[comp]) ? v[comp] : null;
    }

    function limitsFor(settings, comp) {
        return comp === 'z'
            ? { warn: settings.zWarn, limit: settings.zLimit }
            : { warn: settings.xyWarn, limit: settings.xyLimit };
    }

    // 変位方向：X・Y は + / − / ±0、Z は ↑ / ↓ / ±0
    function direction(d, comp) {
        if (!isNum(d)) return '';
        if (comp === 'z') return d > 0 ? '↑' : d < 0 ? '↓' : '±0';
        return d > 0 ? '+' : d < 0 ? '−' : '±0';
    }

    // 色判定：ABS(初期値との差) >= 管理値 → 赤、>= 注意値 → 黄
    function level(d, settings, comp) {
        if (!isNum(d)) return '';
        const lim = limitsFor(settings, comp);
        const a = Math.abs(d);
        if (a >= lim.limit) return 'limit';
        if (a >= lim.warn) return 'warn';
        return '';
    }

    /**
     * 1セル分（1点・1成分・1回）の計算結果
     *   value   計測値（m）
     *   dInit   初期値との差（mm）= ROUND((計測値-初期値)*1000,0)
     *   dPrev   前回との差（mm）  第1回 = 初期値との差／第2回以降 = 直前回との差（直前回が空欄なら空欄）
     */
    function cellCalc(state, roundNo, point, comp) {
        const value = getValue(state, roundNo, point.name, comp);
        const init = point[comp];
        let dInit = null, dPrev = null;
        if (value !== null) {
            dInit = excelRound0((value - init) * 1000);
            if (roundNo === 1) {
                dPrev = isNum(init) ? excelRound0((value - init) * 1000) : null;
            } else {
                const prev = getValue(state, roundNo - 1, point.name, comp);
                dPrev = prev !== null ? excelRound0((value - prev) * 1000) : null;
            }
        }
        return {
            value: value,
            dInit: dInit,
            dirInit: direction(dInit, comp),
            dPrev: dPrev,
            dirPrev: direction(dPrev, comp),
            level: level(dInit, state.settings, comp)
        };
    }

    function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

    // 計測済回数 = COUNT(変状計測!F4:GC4)（計測日が入っている回の数）
    function measuredCount(state) {
        return state.rounds.filter(r => isDate(r.date)).length;
    }

    // 「○年○月○日時点」= 初期値＋各回の計測日の最大
    function asOfDate(state) {
        const ds = [state.initDate].concat(state.rounds.map(r => r.date)).filter(isDate).sort();
        return ds.length ? ds[ds.length - 1] : '';
    }

    // PRINT_START
    function printStart(state, sel) {
        const maxStart = ROUND_COUNT - PRINT_COLS + 1; // 31
        if (sel === 'latest' || sel === '最新' || sel == null || sel === '') {
            return Math.max(1, Math.min(maxStart, measuredCount(state) - (PRINT_COLS - 1)));
        }
        const n = Math.floor(toNumber(sel));
        return Math.max(1, Math.min(maxStart, isNaN(n) ? 1 : n));
    }

    // ラウンド内の注意・管理超過件数
    function roundAlerts(state, roundNo, points) {
        let warn = 0, limit = 0;
        (points || ALL_POINTS).forEach(p => {
            COMPS.forEach(c => {
                const lv = cellCalc(state, roundNo, p, c).level;
                if (lv === 'limit') limit++;
                else if (lv === 'warn') warn++;
            });
        });
        return { warn: warn, limit: limit };
    }

    // ---------- 計測値取込（取込処理タブ） ----------

    const SIMA_SKIP = ['G00', 'Z00', 'A00', 'A99', 'C00', 'D00', 'D99', 'B01'];

    // 1行 → A〜F 列の値
    //   1セルにカンマ区切りのまま → カンマで分割（取込処理!A7〜F7）
    //   列に分かれて貼付（タブ区切り） → タブで分割
    //   ※ 空白区切りのテキストも読めるよう、カンマ・タブが無い場合は空白で分割（アプリ版の追加）
    function splitFields(line) {
        const s = toHalfWidth(line).replace(/\r/g, '');
        let parts;
        if (s.indexOf(',') >= 0) parts = s.split(',');
        else if (s.indexOf('\t') >= 0) parts = s.split('\t');
        else if (/\S\s+\S/.test(s.trim())) parts = s.trim().split(/\s+/);
        else parts = [s];
        const out = [];
        for (let i = 0; i < 6; i++) out.push(excelTrim(parts[i] == null ? '' : parts[i]));
        return out;
    }

    /**
     * 取込テキストを解析し判定する。
     * 戻り値: { rows:[...], okMap:{点名:{x,y,z}}, okCount, diffCount, hasRows }
     */
    function parseImport(text, settings) {
        settings = settings || DEFAULT_SETTINGS;
        const lines = String(text == null ? '' : text).split(/\n/);
        const rows = lines.map((line, i) => {
            const f = splitFields(line);
            const A = f[0].toUpperCase();
            let type = '';
            if (f[0] + f[1] + f[2] !== '') {
                if (A === 'A01') type = 'SIMA';
                else if (SIMA_SKIP.indexOf(A) >= 0) type = '対象外';
                else type = 'CSV';
            }
            let name = '', x = NaN, y = NaN, z = NaN;
            if (type === 'SIMA') { name = f[2]; x = toNumber(f[3]); y = toNumber(f[4]); z = toNumber(f[5]); }
            else if (type === 'CSV') { name = f[0]; x = toNumber(f[1]); y = toNumber(f[2]); z = toNumber(f[3]); }
            const pt = findPoint(name);
            return {
                lineNo: i + 1, raw: line.replace(/\r/g, ''), type: type, name: name,
                point: pt, kind: pt ? (pt.kind === 'main' ? '本' : '補') : '',
                x: x, y: y, z: z, judge: ''
            };
        });

        // COUNTIF($H$7:$H$106,H7) 用（大文字小文字を区別しない）
        const nameCount = {};
        rows.forEach(r => {
            if (r.type === 'SIMA' || r.type === 'CSV') {
                const k = r.name.toUpperCase();
                if (k !== '') nameCount[k] = (nameCount[k] || 0) + 1;
            }
        });

        const okMap = {};
        let okCount = 0, diffCount = 0;
        rows.forEach(r => {
            if (r.type === '') { r.judge = ''; return; }
            if (r.type === '対象外') { r.judge = '対象外行'; return; }
            if (r.name === '' || !r.point) { r.judge = '点名なし'; return; }
            if (!(isNum(r.x) && isNum(r.y) && isNum(r.z))) { r.judge = '数値エラー'; return; }
            if (nameCount[r.name.toUpperCase()] > 1) { r.judge = '重複'; return; }
            const p = r.point;
            if (Math.abs(r.x - p.y) < 1 && Math.abs(r.y - p.x) < 1) { r.judge = 'XY入替?'; return; }
            const maxDiff = Math.max(Math.abs(r.x - p.x), Math.abs(r.y - p.y), Math.abs(r.z - p.z)) * 1000;
            r.judge = maxDiff > settings.importDiff ? 'OK・差大' : 'OK';
            okMap[p.name] = { x: r.x, y: r.y, z: r.z };
            okCount++;
            if (r.judge === 'OK・差大') diffCount++;
        });

        return {
            rows: rows,
            okMap: okMap,
            okCount: okCount,
            diffCount: diffCount,
            hasRows: rows.some(r => r.raw.trim() !== '')
        };
    }

    /**
     * 取込結果を回に反映する（判定 OK / OK・差大 のみ）。
     * 直接打ち換えた成分（src=manual）は上書きしない＝Excelで数式を値で上書きした状態と同じ。
     * 前回の取込で入った値のうち今回OKでない点は空欄に戻す（Excelの数式参照と同じ挙動）。
     */
    function applyImport(state, roundNo, text) {
        const round = state.rounds[roundNo - 1];
        round.importText = text;
        const res = parseImport(text, state.settings);
        ALL_POINTS.forEach(p => {
            const src = round.src[p.name] || {};
            const vals = round.values[p.name] || {};
            COMPS.forEach(c => {
                if (src[c] === 'manual') return;
                if (res.okMap[p.name]) {
                    vals[c] = res.okMap[p.name][c];
                    src[c] = 'import';
                } else if (src[c] === 'import') {
                    delete vals[c];
                    delete src[c];
                }
            });
            if (Object.keys(vals).length) round.values[p.name] = vals; else delete round.values[p.name];
            if (Object.keys(src).length) round.src[p.name] = src; else delete round.src[p.name];
        });
        return res;
    }

    // 直接打ち換え（変状計測タブの計測値セルに直接入力）
    function setManual(state, roundNo, name, comp, value) {
        const round = state.rounds[roundNo - 1];
        const vals = round.values[name] || {};
        const src = round.src[name] || {};
        if (isNum(value)) vals[comp] = value; else delete vals[comp];
        src[comp] = 'manual';
        round.values[name] = vals;
        round.src[name] = src;
    }

    // 直接打ち換えを取り消して取込値に戻す
    function revertToImport(state, roundNo, name) {
        const round = state.rounds[roundNo - 1];
        delete round.src[name];
        delete round.values[name];
        const res = parseImport(round.importText, state.settings);
        if (res.okMap[name]) {
            round.values[name] = Object.assign({}, res.okMap[name]);
            round.src[name] = { x: 'import', y: 'import', z: 'import' };
        }
    }

    // 本番照合：取込値と本番の表が一致（0.0005m 未満）→ 反映済、それ以外 → 本番で修正
    function verifyRow(state, roundNo, row) {
        if (row.judge.slice(0, 2) !== 'OK') return '';
        const p = row.point;
        const cur = COMPS.map(c => getValue(state, roundNo, p.name, c));
        if (cur.some(v => v === null)) return '本番で修正';
        const same = Math.abs(cur[0] - row.x) < 0.0005 && Math.abs(cur[1] - row.y) < 0.0005 && Math.abs(cur[2] - row.z) < 0.0005;
        return same ? '反映済' : '本番で修正';
    }

    /**
     * 計測値取込タブの見出し（F5:反映n点 / G5:未取込n点 / H5:状態）
     */
    function importSummary(state, roundNo) {
        const round = state.rounds[roundNo - 1];
        const res = parseImport(round.importText, state.settings);
        const okNames = {};
        res.rows.forEach(r => { if (r.judge === 'OK' || r.judge === 'OK・差大') okNames[r.point.name] = true; });
        const notImported = ALL_POINTS.filter(p => !okNames[p.name]).length;
        const reflected = res.rows.filter(r => r.judge === 'OK' || r.judge === 'OK・差大').length;
        let status = '';
        if (res.hasRows) {
            const bad = res.rows.some(r => ['OK', 'OK・差大', '対象外行', ''].indexOf(r.judge) < 0);
            if (!isDate(round.date)) status = '⚠計測日を入力';
            else if (bad) status = '要確認';
            else if (notImported !== 0) status = '未取込あり';
            else if (res.diffCount > 0) status = '✓完了(差大あり)';
            else status = '✓取込完了';
        }
        return {
            parsed: res,
            reflectedText: '反映 ' + reflected + '点',
            notImported: notImported,
            notImportedText: res.hasRows ? '未取込 ' + notImported + '点' : '未取込',
            status: status
        };
    }

    // ---------- 経時変化グラフ ----------

    /**
     * グラフ用データ（経時変化グラフ!A79:BI115 と 名前 gN / gCat / gr_○○）
     *   横軸 = 初期〜「計測日が入っている最終回」
     *   計測日が無い回・計測値が無い回は NA（null）
     */
    function graphSeries(state, point) {
        let lastIdx = 0;
        for (let i = ROUND_COUNT; i >= 1; i--) {
            if (isDate(state.rounds[i - 1].date)) { lastIdx = i; break; }
        }
        const s = state.settings;
        const cats = [], x = [], y = [], z = [], xyP = [], xyM = [], zP = [], zM = [];
        for (let k = 0; k <= lastIdx; k++) {
            const date = k === 0 ? state.initDate : state.rounds[k - 1].date;
            const has = isDate(date);
            cats.push(has ? fmtYYMD(date) : '');
            xyP.push(has ? s.xyLimit : null); xyM.push(has ? -s.xyLimit : null);
            zP.push(has ? s.zLimit : null); zM.push(has ? -s.zLimit : null);
            COMPS.forEach((c, ci) => {
                let v = null;
                if (has) {
                    if (k === 0) v = isNum(point[c]) ? 0 : null;
                    else v = cellCalc(state, k, point, c).dInit;
                }
                [x, y, z][ci].push(v);
            });
        }
        return { cats: cats, x: x, y: y, z: z, xyP: xyP, xyM: xyM, zP: zP, zM: zM };
    }

    // ---------- 日付表示 ----------
    function dParts(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? [+m[1], +m[2], +m[3]] : null; }
    function fmtSlash(s) { const p = dParts(s); return p ? p[0] + '/' + String(p[1]).padStart(2, '0') + '/' + String(p[2]).padStart(2, '0') : ''; }
    function fmtJP(s) { const p = dParts(s); return p ? p[0] + '年' + p[1] + '月' + p[2] + '日' : ''; }
    function fmtYYMD(s) { const p = dParts(s); return p ? String(p[0]).slice(2) + '/' + p[1] + '/' + p[2] : ''; }

    // ---------- 出力 ----------

    // SIMA 形式（Excel の「計測値取込」タブへそのまま貼り付け可能）
    function toSIMA(state, roundNo) {
        const lines = ['G00,01,OSR水辺変状計測 第' + roundNo + '回,', 'Z00,座標データ,', 'A00,'];
        let n = 1;
        ALL_POINTS.forEach(p => {
            const v = COMPS.map(c => getValue(state, roundNo, p.name, c));
            if (v.some(a => a === null)) return;
            lines.push(['A01', n++, p.name, v[0].toFixed(3), v[1].toFixed(3), v[2].toFixed(3), ''].join(','));
        });
        lines.push('A99,');
        return lines.join('\r\n') + '\r\n';
    }

    function csvCell(v) {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    // 全回の一覧 CSV（変状計測タブ＋補助点-3タブの縦持ち）
    function toCSV(state) {
        const head = ['区分', '測線', '管理番号', '測点名', '成分', '初期値', '回', '計測日', '計測値', '初期値との差(mm)', '変位方向', '前回との差(mm)', '変位方向', '判定'];
        const out = [head.join(',')];
        ALL_POINTS.forEach(p => {
            COMPS.forEach(c => {
                for (let r = 1; r <= ROUND_COUNT; r++) {
                    const round = state.rounds[r - 1];
                    const cc = cellCalc(state, r, p, c);
                    if (cc.value === null && !isDate(round.date)) continue;
                    out.push([
                        p.kind === 'main' ? '提出' : '補助', p.line, p.no, p.name, COMP_LABEL[c], p[c].toFixed(3),
                        '第' + r + '回', fmtSlash(round.date),
                        cc.value === null ? '' : cc.value.toFixed(3),
                        cc.dInit === null ? '' : cc.dInit, cc.dirInit,
                        cc.dPrev === null ? '' : cc.dPrev, cc.dirPrev,
                        cc.level === 'limit' ? '管理値超過' : cc.level === 'warn' ? '注意値超過' : ''
                    ].map(csvCell).join(','));
                }
            });
        });
        return '﻿' + out.join('\r\n') + '\r\n';
    }

    const api = {
        ROUND_COUNT, PRINT_COLS, INIT_DATE, DEFAULT_SETTINGS,
        MAIN_POINTS, AUX_POINTS, ALL_POINTS, GRAPH_POINTS, COMPS, COMP_LABEL,
        createState, normalizeState, emptyRound,
        toHalfWidth, excelTrim, excelRound0, toNumber, isNum, isDate, findPoint,
        getValue, cellCalc, direction, level, limitsFor,
        measuredCount, asOfDate, printStart, roundAlerts,
        splitFields, parseImport, applyImport, setManual, revertToImport, verifyRow, importSummary,
        graphSeries, fmtSlash, fmtJP, fmtYYMD, toSIMA, toCSV
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.HenjoCore = api;
})(typeof window !== 'undefined' ? window : this);
