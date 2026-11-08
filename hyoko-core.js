/*
 * 標高管理 履歴コア（hyoko-core.js）
 * Excel「OSR水準点計測」と同じく 初期値＋第1回〜第12回 の計測履歴を持つ。
 *   計測値          … 各回の標高（m, 文字列 "+7.899" 形式で保存）
 *   初期値との差    … (計測値 − 初期値) × 1000  [mm, 四捨五入]
 *   前回との差      … (計測値 − 直前回の計測値) × 1000、第1回は初期値との差。直前回が空欄なら空欄
 *   変位方向        … 初期値との差が ＋なら ↑、−なら ↓、0 または空欄なら -
 * 変位量 3mm 以上は基準点の更新対象（Excel の注記どおり）。
 * DOM には依存しない（index.html と Node.js のテストで共用）。
 */
(function (root) {
    'use strict';

    const ROUND_COUNT = 12;
    const UPDATE_MM = 3;          // 変位量が3mm以上 → 2級・3級基準点の更新
    const DATA_REVISION = 3;      // 3 = 履歴（第1〜12回）形式

    // OSR 現場の計測履歴（Excel「OSR水準点計測 0826～最新」）
    const OSR_HISTORY = {
        initDate: '2026-05-13',
        dates: ['2026-06-25', '2026-07-25', '2026-08-26'],
        values: {
            '① SA18 (OP)': ['+9.977', '+9.977', '+9.977'],
            '① SA18 (B1FL)': ['+6.777', '+6.777', '+6.777'],
            '② SA1 (OP)': ['+12.830', '+12.830', '+12.830'],
            '② SA1 (B1FL)': ['+9.630', '+9.630', '+9.630'],
            '③ SA12 (OP)': ['+18.434', '+18.433', '+18.433'],
            '③ SA12 (B1FL)': ['+15.234', '+15.233', '+15.233'],
            '駐車場外壁 (OP)': ['+3.500', '+3.500', '+3.500'],
            '駐車場外壁 (B1FL)': ['+0.300', '+0.300', '+0.300'],
            '④ KBM(T1) (OP)': ['+1.330', '+1.330', '+1.330'],
            '④ KBM(T1) (B1FL)': ['-1.870', '-1.870', '-1.870'],
            '⑤ アングル (OP)': ['+7.899', '+7.899', '+7.899'],
            '⑤ アングル (B1FL)': ['+4.699', '+4.699', '+4.699'],
            '⑥ アングル (OP)': ['+7.899', '+7.899', '+7.897'],
            '⑥ アングル (B1FL)': ['+4.699', '+4.699', '+4.697'],
            '⑦ アングル (OP)': ['+7.900', '+7.900', '+7.898'],
            '⑦ アングル (B1FL)': ['+4.700', '+4.700', '+4.698'],
            '⑧ アングル (OP)': ['+8.000', '+8.000', '+7.999'],
            '⑧ アングル (B1FL)': ['+4.800', '+4.800', '+4.799'],
            '⑨ アングル (OP)': ['+8.000', '+8.000', '+7.999'],
            '⑨ アングル (B1FL)': ['+4.800', '+4.800', '+4.799'],
            '⑩ アングル (OP)': ['', '+3.000', '+3.000'],
            '⑩ アングル (B1FL)': ['', '-0.200', '-0.200'],
            '⑪ アングル (OP)': ['+2.900', '+2.900', '+2.900'],
            '⑪ アングル (B1FL)': ['-0.300', '-0.300', '-0.300'],
            '⑫ アングル (OP)': ['+3.200', '+3.200', '+3.200'],
            '⑫ アングル (B1FL)': ['+0.000', '+0.000', '+0.000'],
            '⑬ 構台杭 (OP)': ['', '', '+3.000'],
            '⑬ 構台杭 (B1FL)': ['', '', '-0.200'],
            '⑭ 構台杭 (OP)': ['', '', '+3.700'],
            '⑭ 構台杭 (B1FL)': ['', '', '+0.500'],
            '⑮ 構台杭 (OP)': ['', '', '+4.200'],
            '⑮ 構台杭 (B1FL)': ['', '', '+1.000'],
            '⑯ 構台杭 (OP)': ['', '', '+3.700'],
            '⑯ 構台杭 (B1FL)': ['', '', '+0.500']
        }
    };

    // ---------- 数値 ----------
    function num(s) {
        if (s === null || s === undefined) return null;
        const t = String(s).trim();
        if (t === '' || t === '---') return null;
        const n = Number(t);
        return isFinite(n) ? n : null;
    }
    function fmtVal(n) { return n === null ? '' : (n >= 0 ? '+' : '-') + Math.abs(n).toFixed(3); }
    function round0(v) {
        const f = Number(v.toFixed(6));
        const r = Math.round(Math.abs(f));
        return f < 0 ? -r : r;
    }

    // ---------- 構造 ----------
    function emptyRounds() {
        const a = [];
        for (let i = 0; i < ROUND_COUNT; i++) a.push({ date: '', remarks: '' });
        return a;
    }
    function emptyHist() { return new Array(ROUND_COUNT).fill(''); }

    function getVal(point, r) { return (point.hist && point.hist[r - 1]) || ''; }
    function setVal(point, r, s) {
        if (!point.hist) point.hist = emptyHist();
        point.hist[r - 1] = s || '';
    }
    // 前回値（第1回は初期値）
    function prevVal(point, r) { return r === 1 ? (point.init || '') : getVal(point, r - 1); }
    // 直近の計測値（前回が空欄なら遡る。なければ初期値）… 前回値コピー用
    function latestBefore(point, r) {
        for (let k = r - 1; k >= 1; k--) { if (num(getVal(point, k)) !== null) return getVal(point, k); }
        return point.init || '';
    }

    /** 1点・1回の計算 */
    function calc(point, r) {
        const v = num(getVal(point, r));
        const i = num(point.init);
        const pv = num(prevVal(point, r));
        const dInit = (v !== null && i !== null) ? round0((v - i) * 1000) : null;
        const dPrev = (v !== null && pv !== null) ? round0((v - pv) * 1000) : null;
        return {
            value: v,
            dInit: dInit,
            dPrev: dPrev,
            dir: (dInit === null || dInit === 0) ? '-' : (dInit > 0 ? '↑' : '↓'),
            update: dInit !== null && Math.abs(dInit) >= UPDATE_MM
        };
    }

    function allPoints(project) {
        const out = [];
        (project.tabs || []).forEach(t => (t.data || []).forEach(p => out.push(p)));
        return out;
    }
    // 計測値が1つでも入っている最後の回
    function lastMeasuredRound(project) {
        let last = 0;
        allPoints(project).forEach(p => {
            for (let r = ROUND_COUNT; r > last; r--) { if (num(getVal(p, r)) !== null) { last = r; break; } }
        });
        return last;
    }
    function roundHasData(project, r) { return allPoints(project).some(p => num(getVal(p, r)) !== null); }
    // 「○年○月○日時点」= 計測値のある最後の回の計測日（なければ初期値計測日）
    function asOfDate(project) {
        for (let r = ROUND_COUNT; r >= 1; r--) {
            const d = project.rounds && project.rounds[r - 1] && project.rounds[r - 1].date;
            if (d && roundHasData(project, r)) return d;
        }
        return project.initDate || '';
    }

    // ---------- 現場の作成・移行 ----------

    // テンプレート（測点・初期値）から履歴形式の現場を作る
    function projectFromTemplate(id, name, template) {
        return {
            id: id, name: name,
            initDate: '', initRemarks: '初期値設置',
            rounds: emptyRounds(),
            currentRound: 1,
            tabs: template.map(t => ({
                tabName: t.tabName,
                data: t.data.map(d => ({ id: d.id, init: d.init || '', type: d.type || '', remarks: d.remarks || '', hist: emptyHist() }))
            }))
        };
    }

    // OSR の計測履歴（第1〜3回）を入れる
    function applyOsrHistory(project) {
        project.initDate = OSR_HISTORY.initDate;
        project.initRemarks = project.initRemarks || '初期値設置';
        if (!project.rounds) project.rounds = emptyRounds();
        OSR_HISTORY.dates.forEach((d, i) => { project.rounds[i].date = d; });
        allPoints(project).forEach(p => {
            const h = OSR_HISTORY.values[p.id];
            if (!p.hist) p.hist = emptyHist();
            if (h) h.forEach((v, i) => { p.hist[i] = v; });
        });
    }

    function isOsrProject(project) {
        return (project.tabs || []).map(t => t.tabName).join('|') === '1級基準点|2級基準点|3級基準点';
    }

    /**
     * 旧形式（初期値・前月・当月）→ 履歴形式へ移行
     *   OSR現場：Excel の第1〜3回を入れ、当月値があれば第4回へ
     *   その他：前月値が初期値と異なる（実測）なら第1回、当月値はその次の回へ
     */
    function migrateProject(project) {
        if (project.rounds && allPoints(project).every(p => Array.isArray(p.hist))) return project;
        const pts = allPoints(project);
        const measureDate = project.measureDate || '';
        project.rounds = emptyRounds();
        project.initRemarks = project.initRemarks || '初期値設置';
        if (project.initDate === undefined) project.initDate = '';
        pts.forEach(p => { if (!Array.isArray(p.hist)) p.hist = emptyHist(); });

        let next;
        if (isOsrProject(project)) {
            applyOsrHistory(project);
            next = OSR_HISTORY.dates.length + 1;
        } else {
            const prevMeasured = pts.some(p => num(p.prev) !== null && num(p.init) !== null && num(p.prev) !== num(p.init));
            next = 1;
            if (prevMeasured) {
                pts.forEach(p => { if (num(p.prev) !== null) p.hist[0] = fmtVal(num(p.prev)); });
                next = 2;
            }
        }
        const hasCurr = pts.some(p => num(p.curr) !== null);
        if (hasCurr && next <= ROUND_COUNT) {
            pts.forEach(p => { if (num(p.curr) !== null) p.hist[next - 1] = fmtVal(num(p.curr)); });
            project.rounds[next - 1].date = measureDate;
        }
        project.currentRound = Math.min(next, ROUND_COUNT);
        pts.forEach(p => { delete p.prev; delete p.curr; });
        delete project.measureDate;
        return project;
    }

    // ---------- CSV ----------
    function csvCell(v) {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function toCSV(project) {
        const head = ['区分', '点名', '初期値', '初期値計測日'];
        for (let r = 1; r <= ROUND_COUNT; r++) head.push(`第${r}回 計測値`, `第${r}回 初期値との差(mm)`, `第${r}回 前回との差(mm)`, `第${r}回 変位方向`);
        head.push('備考');
        const rows = [head.join(',')];
        const dates = ['', '', '', '計測日'];
        for (let r = 1; r <= ROUND_COUNT; r++) dates.push((project.rounds[r - 1] || {}).date || '', '', '', '');
        rows.push(dates.map(csvCell).join(','));
        project.tabs.forEach(t => t.data.forEach(p => {
            const line = [t.tabName, p.id, p.init || '', project.initDate || ''];
            for (let r = 1; r <= ROUND_COUNT; r++) {
                const c = calc(p, r);
                line.push(getVal(p, r), c.dInit === null ? '' : c.dInit, c.dPrev === null ? '' : c.dPrev, c.value === null ? '' : c.dir);
            }
            line.push(p.remarks || '');
            rows.push(line.map(csvCell).join(','));
        }));
        return '﻿' + rows.join('\r\n') + '\r\n';
    }

    // 点名「① SA18 (OP)」→ 管理番号・測点名・種別
    function splitId(id) {
        const m = /^([①-⑳㉑-㉟㊱-㊿]?)\s*(.*?)\s*\((OP|B1FL|FL|GL|B2FL|1FL)\)\s*$/.exec(id || '');
        if (!m) return { no: '', name: id || '', kind: '' };
        return { no: m[1], name: m[2], kind: m[3] };
    }

    const api = {
        ROUND_COUNT, UPDATE_MM, DATA_REVISION, OSR_HISTORY,
        num, fmtVal, round0, emptyRounds, emptyHist,
        getVal, setVal, prevVal, latestBefore, calc,
        allPoints, lastMeasuredRound, roundHasData, asOfDate,
        projectFromTemplate, applyOsrHistory, isOsrProject, migrateProject,
        toCSV, splitId
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.HyokoCore = api;
})(typeof window !== 'undefined' ? window : this);
