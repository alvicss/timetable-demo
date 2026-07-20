/**
 * ============================================================
 *  課表查詢系統 - 應用程式邏輯 (app.js)
 *  嘉義國中 國中部
 * ============================================================
 */

/* ── 全域狀態 ─────────────────────────────────────────────── */
let scheduleData    = [];   // CSV 全部資料
let homeroomData    = {};   // 班級導師資料；使用者匯入檔案時預設為空
let isLoggedIn      = false;
let navHistory      = [];   // 導航歷史 [{type, value}]
let classGroups     = {};   // 班級分類
let subjectTeachers = {};   // 科目→教師

const PERIODS_ALL   = [0,1,2,3,4,5,6,7,8];  // 0=早自習, 1~8=第1~8節
const DAYS          = ['一','二','三','四','五'];
const LOCAL_TIMETABLE_KEY = 'timetable.importedCsv.v1';
const LOCAL_TIMETABLE_NAME_KEY = 'timetable.importedName.v1';
const LOCAL_TIMETABLE_IMPORTED_AT_KEY = 'timetable.importedAt.v1';
const LOCAL_SCHOOL_NAME_KEY = 'timetable.importedSchoolName.v1';
const LOCAL_DATA_LABEL = '本機匯入資料';
const DEFAULT_START_TITLE = '課表查詢系統';

// 給一般使用者貼到 AI 網頁版的固定提示詞。
// 目標是讓不同學校的原始課表，先被 AI 整理成本站可匯入的簡單 CSV 格式。
const AI_PROMPT_TEMPLATE = `請幫我把上傳的學校課表檔案轉成標準 CSV，並提供可下載的 .csv 檔案。

請務必遵守以下規則：
1. 請優先建立一個可下載的 CSV 檔案，檔名請使用 timetable_import.csv。
2. 不要只把 CSV 貼在對話內容裡；我需要可以下載後匯入網站的 .csv 檔。
3. 如果你所在的平台完全無法提供下載檔，才改用純文字貼出 CSV 內容，且不要加說明文字、不要加 Markdown 程式碼區塊。
4. CSV 檔案的第一列欄位名稱必須固定為：
school,class,day,period,subject,teacher,location
5. 每一節課一列，不要合併儲存格。
6. school 請填學校名稱，每一列都填同一個學校名稱；如果原始資料看不出學校名稱，請填 UNKNOWN。
7. class 請填班級名稱，例如 機械一甲、701、八年一班。
8. day 請填 1 到 5，1=星期一、2=星期二、3=星期三、4=星期四、5=星期五。
9. period 請填節次數字。早自習可填 0；第 1 節到第 8 節請填 1 到 8。
10. subject 請填科目名稱。
11. teacher 請填教師姓名。
12. location 沒有資料就留空。
13. 不確定的欄位請填 UNKNOWN，不要自行猜測。
14. 如果同一節有多位教師或多個班級，請拆成多列。
15. 產生檔案前請自行檢查欄位順序與列數，不要漏掉任何課程。

輸出範例：
school,class,day,period,subject,teacher,location
市立範例高中,機械一甲,1,1,國文,王小明,機械一甲教室
市立範例高中,機械一甲,1,2,數學,李小華,
市立範例高中,電子二乙,3,5,英文,陳美玲,`;

/* ── DOM 參考 ─────────────────────────────────────────────── */
const startView    = document.getElementById('startView');
const loginView    = document.getElementById('loginView');
const queryView    = document.getElementById('queryView');
const resultView   = document.getElementById('resultView');
const loadingOverlay = document.getElementById('loadingOverlay');
const scheduleTitle  = document.getElementById('scheduleTitle');
const scheduleTableContainer = document.getElementById('scheduleTableContainer');

/* ═══════════════════════════════════════════════════════════
   視圖切換
═══════════════════════════════════════════════════════════ */
function showView(viewId) {
    [startView, loginView, queryView, resultView].forEach(v => {
        if (!v) return;
        v.classList.remove('active', 'result-active');
        v.style.display = 'none';
    });
    const target = document.getElementById(viewId);
    if (!target) return;
    if (viewId === 'resultView') {
        target.classList.add('result-active');
        target.style.display = 'block';
    } else {
        target.classList.add('active');
        target.style.display = 'flex';
    }
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        themeBtn.style.display = (viewId === 'resultView') ? 'none' : 'flex';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showQueryView() {
    navHistory = [];
    resetQueryForm();
    showView('queryView');
}

function logout() {
    isLoggedIn   = false;
    navHistory   = [];
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').textContent = '';
    showView('startView');
}

/* ═══════════════════════════════════════════════════════════
   導航歷史（返回上一頁）
═══════════════════════════════════════════════════════════ */
function pushNav(type, value) {
    navHistory.push({ type, value });
    updateBackBtn();
}

function goBack() {
    if (navHistory.length <= 1) {
        showQueryView();
        return;
    }
    navHistory.pop();                               // 移除目前頁
    const prev = navHistory[navHistory.length - 1];
    navHistory.pop();                               // 移除上一頁（displayX 會再 push）
    if (prev.type === 'class')            displayClassSchedule(prev.value);
    else if (prev.type === 'teacherSubject') displayTeacherSubjectSchedule(prev.value.teacher, prev.value.subject);
    else                                    displayTeacherSchedule(prev.value);
}

function updateBackBtn() {
    const btn = document.getElementById('backBtn');
    if (!btn) return;
    btn.style.display = navHistory.length > 1 ? 'inline-flex' : 'none';
}

/* ═══════════════════════════════════════════════════════════
   學期下拉選單初始化
═══════════════════════════════════════════════════════════ */
function populateSemesterSelect() {
    const sel = document.getElementById('semesterSelect');
    if (!sel || !CONFIG.SEMESTERS) return;
    const keys = Object.keys(CONFIG.SEMESTERS);
    keys.forEach((label, i) => {
        const opt = document.createElement('option');
        opt.value       = label;
        opt.textContent = label;
        if (i === keys.length - 1) opt.selected = true;
        sel.appendChild(opt);
    });
}

/* ═══════════════════════════════════════════════════════════
   登入
═══════════════════════════════════════════════════════════ */
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl    = document.getElementById('loginError');
    const btn      = document.getElementById('loginBtn');
    const spinner  = document.getElementById('loginSpinner');

    errEl.textContent = '';

    if (username === CONFIG.USERNAME && password === CONFIG.PASSWORD) {
        btn.disabled = true;
        spinner.classList.add('show');
        const semLabel = document.getElementById('semesterSelect')?.value || '';
        await fetchAndParseCSV(semLabel);
        btn.disabled = false;
        spinner.classList.remove('show');
    } else {
        errEl.textContent = '帳號或密碼錯誤，請再試一次';
    }
});

/* ═══════════════════════════════════════════════════════════
   CSV 載入與解析
═══════════════════════════════════════════════════════════ */
async function fetchAndParseCSV(semLabel) {
    loadingOverlay.classList.add('show');

    let csvUrl = '/timetable_s2.csv';
    if (CONFIG.SEMESTERS && semLabel && CONFIG.SEMESTERS[semLabel]) {
        csvUrl = CONFIG.SEMESTERS[semLabel];
    }

    try {
        const response = await fetch(csvUrl);
        if (!response.ok) throw new Error(`HTTP 錯誤 ${response.status}`);
        const csvText = await response.text();

        // 取得對應的 homerooms.json
        const jsonUrl = csvUrl.replace('timetable_', 'homerooms_').replace('.csv', '.json');
        try {
            const hmRes = await fetch(jsonUrl);
            if (hmRes.ok) homeroomData = await hmRes.json();
            else homeroomData = {};
        } catch (e) { homeroomData = {}; }

        const parsed  = parseCSV(csvText);
        if (parsed.length === 0) throw new Error('CSV 資料為空');

        scheduleData = parsed;
        buildCategories();
        populateQueryUI();
        isLoggedIn = true;

        updateSemesterBadge(semLabel || '');

        loadingOverlay.classList.remove('show');
        showView('queryView');

    } catch (err) {
        loadingOverlay.classList.remove('show');
        console.error(err);
        document.getElementById('loginError').textContent =
            `載入失敗：${err.message}。請確認 Firebase 設定。`;
        setImportStatus(`載入內建課表失敗：${err.message}`, 'danger');
    }
}

/* ═══════════════════════════════════════════════════════════
   入口頁：提示模板、匯入檔案、進入查詢
═══════════════════════════════════════════════════════════ */
function setImportStatus(message, type = 'info') {
    const statusEl = document.getElementById('importStatus');
    if (!statusEl) return;

    statusEl.classList.remove('alert-info', 'alert-warning', 'alert-danger');
    statusEl.classList.add(`alert-${type}`);
    statusEl.textContent = message;
    statusEl.classList.toggle('show', Boolean(message));
}

function updateStartSchoolName(schoolName) {
    const displayName = schoolName || DEFAULT_START_TITLE;
    const startTitle = document.getElementById('startSchoolName');

    if (startTitle) {
        startTitle.textContent = displayName;
    }

    document.title = displayName === DEFAULT_START_TITLE ? DEFAULT_START_TITLE : `${displayName} 課表查詢`;
}

function getStoredSchoolName() {
    const storedSchoolName = localStorage.getItem(LOCAL_SCHOOL_NAME_KEY);
    if (!storedSchoolName || storedSchoolName === 'UNKNOWN') {
        return '';
    }
    return storedSchoolName;
}

function extractSchoolNameFromRows(rows) {
    const possibleFields = ['school', 'schoolname', 'school_name', '學校', '學校名稱'];

    for (const row of rows) {
        for (const field of possibleFields) {
            const value = (row[field] || '').trim();
            if (value && value !== 'UNKNOWN') {
                return value;
            }
        }
    }

    return '';
}

function openTemplateModal() {
    const modal = document.getElementById('templateModal');
    const promptText = document.getElementById('promptTemplateText');
    const copyStatus = document.getElementById('copyStatus');

    if (promptText) {
        promptText.value = AI_PROMPT_TEMPLATE;
    }
    if (copyStatus) {
        copyStatus.textContent = '';
    }
    if (modal) {
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
    }
}

function closeTemplateModal() {
    const modal = document.getElementById('templateModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
}

async function copyPromptTemplate() {
    const copyStatus = document.getElementById('copyStatus');

    try {
        await navigator.clipboard.writeText(AI_PROMPT_TEMPLATE);
        if (copyStatus) copyStatus.textContent = '已複製，可以貼到 Gemini / ChatGPT / Claude。';
    } catch (err) {
        if (copyStatus) copyStatus.textContent = '瀏覽器不允許自動複製，請手動選取上方文字複製。';
    }
}

function openImportFilePicker() {
    const input = document.getElementById('importFileInput');
    if (!input) return;
    input.value = '';
    input.click();
}

function handleImportFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
        try {
            const fileText = String(reader.result || '');
            importTimetableCsvText(fileText, file.name);
        } catch (err) {
            setImportStatus(`匯入失敗：${err.message}`, 'danger');
        }
    };

    reader.onerror = () => {
        setImportStatus('讀取檔案失敗，請確認檔案是否仍存在。', 'danger');
    };

    reader.readAsText(file, 'utf-8');
}

function importTimetableCsvText(csvText, fileName) {
    const parsedRows = parseCSVKeepAllRows(csvText);
    if (parsedRows.length === 0) {
        throw new Error('CSV 沒有可用資料列。');
    }

    const headers = Object.keys(parsedRows[0]);
    const importedSchoolName = extractSchoolNameFromRows(parsedRows);
    let internalCsvText = csvText;
    let importedRows = [];

    if (headers.includes('teachername')) {
        importedRows = parseCSV(csvText);
    } else if (hasSimpleTimetableHeaders(headers)) {
        internalCsvText = convertSimpleRowsToInternalCsv(parsedRows);
        importedRows = parseCSV(internalCsvText);
    } else {
        throw new Error('欄位不符合格式。請使用提示模板產生 school,class,day,period,subject,teacher,location 欄位。');
    }

    if (importedRows.length === 0) {
        throw new Error('轉換後沒有教師課表資料，請檢查 teacher、day、period、subject 是否有填。');
    }

    scheduleData = importedRows;
    homeroomData = {};
    buildCategories();
    populateQueryUI();
    isLoggedIn = true;

    localStorage.setItem(LOCAL_TIMETABLE_KEY, internalCsvText);
    localStorage.setItem(LOCAL_TIMETABLE_NAME_KEY, fileName || '本機匯入課表.csv');
    localStorage.setItem(LOCAL_TIMETABLE_IMPORTED_AT_KEY, new Date().toISOString());
    if (importedSchoolName) {
        localStorage.setItem(LOCAL_SCHOOL_NAME_KEY, importedSchoolName);
    } else {
        localStorage.removeItem(LOCAL_SCHOOL_NAME_KEY);
    }

    updateSemesterBadge(LOCAL_DATA_LABEL);
    updateStartSchoolName(importedSchoolName);

    const importedSchoolText = importedSchoolName ? `，學校名稱：${importedSchoolName}` : '，未讀到學校名稱';
    setImportStatus(`已匯入「${fileName || 'CSV 檔案'}」${importedSchoolText}，資料已儲存在此瀏覽器。`, 'info');
}

function enterScheduleSearch() {
    if (scheduleData.length > 0) {
        showQueryView();
        return;
    }

    if (loadStoredTimetable()) {
        showQueryView();
        return;
    }

    setImportStatus('尚未匯入課表 CSV。請先按「匯入檔案」，選擇 AI 產生的 timetable_import.csv。', 'warning');
    showView('startView');
}

function loadStoredTimetable() {
    const csvText = localStorage.getItem(LOCAL_TIMETABLE_KEY);
    if (!csvText) return false;

    try {
        const parsed = parseCSV(csvText);
        if (parsed.length === 0) {
            return false;
        }

        scheduleData = parsed;
        homeroomData = {};
        buildCategories();
        populateQueryUI();
        isLoggedIn = true;
        updateSemesterBadge(LOCAL_DATA_LABEL);
        updateStartSchoolName(getStoredSchoolName());

        const fileName = localStorage.getItem(LOCAL_TIMETABLE_NAME_KEY) || '本機匯入資料';
        setImportStatus(`目前使用「${fileName}」。如果要換學校或換學期，請重新匯入 CSV。`, 'info');
        return true;
    } catch (err) {
        setImportStatus(`讀取本機匯入資料失敗：${err.message}。請重新匯入 CSV。`, 'warning');
        return false;
    }
}

function getDefaultSemesterLabel() {
    if (!CONFIG.SEMESTERS) return '';
    const labels = Object.keys(CONFIG.SEMESTERS);
    return labels[labels.length - 1] || '';
}

function updateSemesterBadge(label) {
    const badge = document.getElementById('currentSemester');
    if (badge) badge.textContent = label || '';
}

/* ── CSV 解析 ─────────────────────────────────────────────── */
function splitCSVLine(line) {
    const result = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; }
        else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
        else { cur += c; }
    }
    result.push(cur);
    return result;
}

function parseCSV(text) {
    text = text.replace(/^﻿/, ''); // 去除UTF-8 BOM（CSV為了讓Excel開啟中文不亂碼而加上的標記）
    const lines   = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    const headers = splitCSVLine(lines[0]);
    return lines.slice(1).map(line => {
        const vals = splitCSVLine(line);
        const obj  = {};
        headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
        return obj;
    }).filter(r => r.teachername);
}

function parseCSVKeepAllRows(text) {
    text = text.replace(/^﻿/, '');
    const lines = text.replace(/\r/g, '').split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = splitCSVLine(lines[0]).map(header => header.trim());
    return lines.slice(1).map(line => {
        const values = splitCSVLine(line);
        const row = {};
        headers.forEach((header, index) => {
            row[header] = (values[index] || '').trim();
        });
        return row;
    });
}

function hasSimpleTimetableHeaders(headers) {
    return headers.includes('class') &&
        headers.includes('day') &&
        headers.includes('period') &&
        headers.includes('subject') &&
        headers.includes('teacher');
}

function buildInternalCsvHeaders() {
    const headers = ['teachername'];
    for (let day = 1; day <= 5; day++) {
        for (let period = 0; period <= 9; period++) {
            headers.push(`s${day}${period}`);
            headers.push(`c${day}${period}`);
        }
    }
    return headers;
}

function createEmptyTeacherRow(teacherName) {
    const row = { teachername: teacherName };
    for (let day = 1; day <= 5; day++) {
        for (let period = 0; period <= 9; period++) {
            row[`s${day}${period}`] = '';
            row[`c${day}${period}`] = '';
        }
    }
    return row;
}

function convertSimpleRowsToInternalCsv(simpleRows) {
    const teacherRows = {};

    simpleRows.forEach((sourceRow, index) => {
        const teacher = (sourceRow.teacher || '').trim();
        const className = (sourceRow.class || '').trim();
        const subject = (sourceRow.subject || '').trim();
        const day = Number((sourceRow.day || '').trim());
        const period = Number((sourceRow.period || '').trim());

        // 空列或 AI 產生的備註列不匯入；真正缺欄位的列會在下方報錯。
        const hasAnyImportantValue = teacher || className || subject || sourceRow.day || sourceRow.period;
        if (!hasAnyImportantValue) return;

        if (!teacher || !className || !subject || !Number.isInteger(day) || !Number.isInteger(period)) {
            throw new Error(`第 ${index + 2} 列缺少 class/day/period/subject/teacher 必要資料。`);
        }
        if (day < 1 || day > 5) {
            throw new Error(`第 ${index + 2} 列 day 必須是 1 到 5。`);
        }
        if (period < 0 || period > 9) {
            throw new Error(`第 ${index + 2} 列 period 必須是 0 到 9。`);
        }

        if (!teacherRows[teacher]) {
            teacherRows[teacher] = createEmptyTeacherRow(teacher);
        }

        const subjectKey = `s${day}${period}`;
        const classKey = `c${day}${period}`;
        const targetRow = teacherRows[teacher];

        if (targetRow[subjectKey] && targetRow[subjectKey] !== subject) {
            targetRow[subjectKey] = `${targetRow[subjectKey]} / ${subject}`;
        } else {
            targetRow[subjectKey] = subject;
        }

        const existingClasses = targetRow[classKey] ? targetRow[classKey].split(' ') : [];
        if (!existingClasses.includes(className)) {
            existingClasses.push(className);
        }
        targetRow[classKey] = existingClasses.filter(Boolean).join(' ');
    });

    const internalRows = Object.values(teacherRows);
    if (internalRows.length === 0) {
        throw new Error('CSV 沒有可轉換的課表列。');
    }

    const headers = buildInternalCsvHeaders();
    const lines = [headers.join(',')];
    internalRows
        .sort((a, b) => a.teachername.localeCompare(b.teachername, 'zh-Hant'))
        .forEach(row => {
            const values = headers.map(header => encodeCsvValue(row[header] || ''));
            lines.push(values.join(','));
        });

    return lines.join('\n');
}

function encodeCsvValue(value) {
    const text = String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

/* ═══════════════════════════════════════════════════════════
   建立分類資料
═══════════════════════════════════════════════════════════ */
// 科別排列順序（查詢介面的科別下拉選單依此順序顯示）
const DEPT_ORDER = ['機械','電子','電機','汽車','園藝','食加','餐管','綜職','資源班'];
// 年級／班別排序權重：中文數字與甲乙丙丁不是照字碼順序排的，要自訂順序
const GRADE_ORDER  = { '一':1, '二':2, '三':3 };
const LETTER_ORDER = { '甲':1, '乙':2, '丙':3, '丁':4 };

// 從班級名稱取出所屬科別（前兩個字，例如「機械二丙」→「機械」）；「資源班」整班自成一組
function extractDept(cls) {
    if (cls === '資源班') return '資源班';
    return cls.slice(0, 2);
}

// 班級名稱排序：先比年級（一二三），再比班別（甲乙丙丁），沒有班別或是「XX兼」合班代碼排最後
function classSortKey(cls) {
    const chars = [...cls];
    const gradeChar  = chars.find(c => GRADE_ORDER[c]);
    const letterChar = chars.find(c => LETTER_ORDER[c]);
    return (GRADE_ORDER[gradeChar] || 9) * 10 + (LETTER_ORDER[letterChar] || 5);
}

function buildCategories() {
    // ── 班級分類（依科別）──
    const allClasses = new Set();
    const PERIODS = [0,1,2,3,4,5,6,7,8,9];  // 0=早自習（此校未使用，資料恆為空）
    scheduleData.forEach(row => {
        for (let d = 1; d <= 5; d++)
            for (let p of PERIODS) {
                const classStr = row[`c${d}${p}`];
                if (classStr) {
                    classStr.split(' ').forEach(cls => {
                        if (cls) allClasses.add(cls);
                    });
                }
            }
    });

    classGroups = {};
    [...allClasses].forEach(cls => {
        const dept = extractDept(cls);
        if (!classGroups[dept]) classGroups[dept] = [];
        classGroups[dept].push(cls);
    });
    Object.keys(classGroups).forEach(dept => {
        classGroups[dept].sort((a, b) => classSortKey(a) - classSortKey(b));
    });

    // ── 科目→教師分類（含早自習）──
    subjectTeachers = {};
    scheduleData.forEach(row => {
        for (let d = 1; d <= 5; d++)
            for (let p of PERIODS_ALL) {
                const subj = row[`s${d}${p}`];
                if (!subj) continue;
                const base = normalizeSubject(subj);
                if (!subjectTeachers[base]) subjectTeachers[base] = new Set();
                subjectTeachers[base].add(row.teachername);
            }
    });
    Object.keys(subjectTeachers).forEach(k => {
        subjectTeachers[k] = [...subjectTeachers[k]].sort();
    });
}

function normalizeSubject(subj) {
    return subj.replace(/[（(]兼[）)]$/, '').replace(/輔導$/, '').replace(/加強$/, '').trim() || subj;
}

/* ═══════════════════════════════════════════════════════════
   填充查詢 UI
═══════════════════════════════════════════════════════════ */
function populateQueryUI() {
    const deptSel = document.getElementById('deptSelect');
    deptSel.innerHTML = '<option value="">— 選擇科別 —</option>';
    Object.keys(classGroups)
        .sort((a, b) => DEPT_ORDER.indexOf(a) - DEPT_ORDER.indexOf(b))
        .forEach(dept => {
            const opt = document.createElement('option');
            opt.value = dept; opt.textContent = dept;
            deptSel.appendChild(opt);
        });

    const classSel = document.getElementById('classSelect');
    classSel.innerHTML = '<option value="">— 請先選擇科別 —</option>';

    const subjectSel = document.getElementById('subjectSelect');
    subjectSel.innerHTML = '<option value="">— 選擇科目 —</option>';
    Object.keys(subjectTeachers).sort().forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        subjectSel.appendChild(opt);
    });
}

// 選擇科別後，動態列出該科別底下的班級
function onDeptChange() {
    const dept = document.getElementById('deptSelect').value;
    const classSel = document.getElementById('classSelect');
    classSel.innerHTML = '<option value="">— 選擇班級 —</option>';
    if (!dept) return;
    (classGroups[dept] || []).forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls; opt.textContent = cls;
        classSel.appendChild(opt);
    });
    document.getElementById('classError').textContent = '';
}

/* ═══════════════════════════════════════════════════════════
   Tab 切換
═══════════════════════════════════════════════════════════ */
function switchTab(tab) {
    document.getElementById('tabClass').classList.toggle('active', tab === 'class');
    document.getElementById('tabTeacher').classList.toggle('active', tab === 'teacher');
    document.getElementById('tabReverse').classList.toggle('active', tab === 'reverse');
    document.getElementById('panelClass').classList.toggle('hidden', tab !== 'class');
    document.getElementById('panelTeacher').classList.toggle('hidden', tab !== 'teacher');
    document.getElementById('panelReverse').classList.toggle('hidden', tab !== 'reverse');
    hideTeacherAutocomplete();
}

/* ═══════════════════════════════════════════════════════════
   班級查詢
═══════════════════════════════════════════════════════════ */
function resetQueryForm() {
    const deptSel = document.getElementById('deptSelect');
    if (deptSel) deptSel.value = '';
    const classSel = document.getElementById('classSelect');
    if (classSel) classSel.innerHTML = '<option value="">— 請先選擇科別 —</option>';
    const ce = document.getElementById('classError');
    if (ce) ce.textContent = '';
    const te = document.getElementById('teacherError');
    if (te) te.textContent = '';

    const teacherInput = document.getElementById('teacherInput');
    if (teacherInput) teacherInput.value = '';
    const teacherSubjectSel = document.getElementById('teacherSubjectSelect');
    if (teacherSubjectSel) teacherSubjectSel.innerHTML = '<option value="">— 請先輸入教師姓名 —</option>';
    const re = document.getElementById('reverseError');
    if (re) re.textContent = '';
    hideTeacherAutocomplete();
}

function submitClassQuery() {
    const cls = document.getElementById('classSelect')?.value;
    if (!cls) {
        document.getElementById('classError').textContent = '請先選擇科別與班級';
        return;
    }
    navHistory = [];
    displayClassSchedule(cls);
}

/* ═══════════════════════════════════════════════════════════
   教師查詢
═══════════════════════════════════════════════════════════ */
function onSubjectChange() {
    const subj = document.getElementById('subjectSelect').value;
    const teacherSel = document.getElementById('teacherSelect');
    teacherSel.innerHTML = '<option value="">— 選擇教師 —</option>';
    if (!subj) return;
    (subjectTeachers[subj] || []).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        teacherSel.appendChild(opt);
    });
    document.getElementById('teacherError').textContent = '';
}

function submitTeacherQuery() {
    const teacher = document.getElementById('teacherSelect').value;
    if (!teacher) {
        document.getElementById('teacherError').textContent = '請先選擇科目與教師';
        return;
    }
    navHistory = [];
    displayTeacherSchedule(teacher);
}

/* ═══════════════════════════════════════════════════════════
   依教師反查科目（輸入姓名關鍵字 → 智慧篩選候選清單 → 列出他教的科目 → 查該科目課表）
═══════════════════════════════════════════════════════════ */
let teacherAutocompleteMatches = [];   // 目前篩選出的候選教師姓名
let teacherAutocompleteIndex   = -1;   // 鍵盤上下鍵目前反白的項目索引

// 輸入框有變動：同時更新候選清單，並嘗試用目前輸入的完整文字比對出教師
function onTeacherInputChange() {
    const val = document.getElementById('teacherInput').value.trim();
    document.getElementById('reverseError').textContent = '';

    renderTeacherAutocomplete(val);

    const row = scheduleData.find(r => r.teachername === val);
    populateTeacherSubjectOptions(row);
}

// 依輸入的關鍵字，篩選出「姓名包含關鍵字」的教師，畫出下拉候選清單
function renderTeacherAutocomplete(keyword) {
    const listEl = document.getElementById('teacherAutocompleteList');
    listEl.innerHTML = '';
    teacherAutocompleteMatches = [];
    teacherAutocompleteIndex   = -1;

    if (!keyword) {
        listEl.classList.remove('show');
        return;
    }

    const allNames = [...new Set(scheduleData.map(r => r.teachername))].sort();
    const matches  = allNames.filter(n => n.includes(keyword));
    teacherAutocompleteMatches = matches;

    if (matches.length === 0) {
        const empty = document.createElement('div');
        empty.className   = 'autocomplete-empty';
        empty.textContent = '找不到符合的教師';
        listEl.appendChild(empty);
        listEl.classList.add('show');
        return;
    }

    matches.forEach(name => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';

        // 把符合關鍵字的部分用 <mark> 標出來，方便一眼看到比對到哪裡
        const idx = name.indexOf(keyword);
        if (idx >= 0) {
            item.appendChild(document.createTextNode(name.slice(0, idx)));
            const mark = document.createElement('mark');
            mark.textContent = name.slice(idx, idx + keyword.length);
            item.appendChild(mark);
            item.appendChild(document.createTextNode(name.slice(idx + keyword.length)));
        } else {
            item.textContent = name;
        }

        item.addEventListener('click', () => selectTeacherFromAutocomplete(name));
        listEl.appendChild(item);
    });

    listEl.classList.add('show');
}

// 點選候選清單裡的某位教師
function selectTeacherFromAutocomplete(name) {
    document.getElementById('teacherInput').value = name;
    document.getElementById('reverseError').textContent = '';
    hideTeacherAutocomplete();
    populateTeacherSubjectOptions(scheduleData.find(r => r.teachername === name));
}

function hideTeacherAutocomplete() {
    const listEl = document.getElementById('teacherAutocompleteList');
    if (!listEl) return;
    listEl.classList.remove('show');
    listEl.innerHTML = '';
    teacherAutocompleteMatches = [];
    teacherAutocompleteIndex   = -1;
}

// 鍵盤操作：上下鍵移動反白項目、Enter選取、Esc關閉候選清單
function onTeacherInputKeydown(e) {
    const listEl = document.getElementById('teacherAutocompleteList');
    if (!listEl.classList.contains('show') || teacherAutocompleteMatches.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        teacherAutocompleteIndex = Math.min(teacherAutocompleteIndex + 1, teacherAutocompleteMatches.length - 1);
        updateAutocompleteHighlight();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        teacherAutocompleteIndex = Math.max(teacherAutocompleteIndex - 1, 0);
        updateAutocompleteHighlight();
    } else if (e.key === 'Enter') {
        if (teacherAutocompleteIndex >= 0) {
            e.preventDefault();
            selectTeacherFromAutocomplete(teacherAutocompleteMatches[teacherAutocompleteIndex]);
        }
    } else if (e.key === 'Escape') {
        hideTeacherAutocomplete();
    }
}

function updateAutocompleteHighlight() {
    const items = document.querySelectorAll('#teacherAutocompleteList .autocomplete-item');
    items.forEach((el, i) => el.classList.toggle('highlighted', i === teacherAutocompleteIndex));
    if (teacherAutocompleteIndex >= 0 && items[teacherAutocompleteIndex]) {
        items[teacherAutocompleteIndex].scrollIntoView({ block: 'nearest' });
    }
}

// 依教師資料列出他任教的所有科目（同科目不同班級只算一筆）以及全課表選項
function populateTeacherSubjectOptions(row) {
    const subjSel = document.getElementById('teacherSubjectSelect');
    if (!row) {
        subjSel.innerHTML = '<option value="">— 請先輸入教師姓名 —</option>';
        return;
    }
    const subjects = new Set();
    for (let d = 1; d <= 5; d++)
        for (let p of PERIODS_ALL) {
            const s = row[`s${d}${p}`];
            if (s) subjects.add(normalizeSubject(s));
        }

    subjSel.innerHTML = '<option value="">— 選擇科目或完整課表 —</option>';

    // 第一個下拉選項：該教師完整課表
    const optAll = document.createElement('option');
    optAll.value = '__ALL__';
    optAll.textContent = '【全課表】該教師完整課表';
    subjSel.appendChild(optAll);

    // 接著為該教師各個科目
    [...subjects].sort().forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        subjSel.appendChild(opt);
    });
}

// 點擊候選清單以外的地方時自動收起清單
document.addEventListener('click', (e) => {
    const wrap = document.getElementById('teacherInput')?.closest('.autocomplete-wrap');
    if (wrap && !wrap.contains(e.target)) hideTeacherAutocomplete();
});

function submitReverseQuery() {
    const name    = document.getElementById('teacherInput').value.trim();
    const subject = document.getElementById('teacherSubjectSelect').value;
    const errEl   = document.getElementById('reverseError');

    if (!scheduleData.find(r => r.teachername === name)) {
        errEl.textContent = '找不到這位教師，請確認姓名或從候選清單選擇';
        return;
    }
    if (!subject) {
        errEl.textContent = '請選擇科目或全課表';
        return;
    }
    navHistory = [];
    if (subject === '__ALL__') {
        displayTeacherSchedule(name);
    } else {
        displayTeacherSubjectSchedule(name, subject);
    }
}

/* ═══════════════════════════════════════════════════════════
   顯示課表
═══════════════════════════════════════════════════════════ */
function displayClassSchedule(className) {
    pushNav('class', className);
    const cells = {};
    scheduleData.forEach(row => {
        for (let d = 1; d <= 5; d++)
            for (let p of PERIODS_ALL) {
                const classes = (row[`c${d}${p}`] || '').split(' ');
                if (classes.includes(className) && row[`s${d}${p}`]) {
                    const key = `${d}-${p}`;
                    if (!cells[key]) {
                        cells[key] = { subject: row[`s${d}${p}`], items: [row.teachername] };
                    } else {
                        if (!cells[key].items.includes(row.teachername)) {
                            cells[key].items.push(row.teachername);
                        }
                    }
                }
            }
    });
    
    const hmTeacher = homeroomData[className] || '';
    const hmHtml = hmTeacher ? `<span style="font-size: 1.1rem; color: var(--text-dim); margin-left: 0.5rem; font-weight: 500;">(導師：${escHtml(hmTeacher)})</span>` : '';
    
    scheduleTitle.innerHTML = `${className} 班課表 ${hmHtml}`;
    scheduleTableContainer.innerHTML = buildScheduleTable(cells, 'class');
    showView('resultView');
    updateBackBtn();
}

function displayTeacherSchedule(teacherName) {
    pushNav('teacher', teacherName);
    const row   = scheduleData.find(r => r.teachername === teacherName);
    const cells = {};
    if (row) {
        for (let d = 1; d <= 5; d++)
            for (let p of PERIODS_ALL) {
                if (row[`s${d}${p}`]) {
                    const key = `${d}-${p}`;
                    const classes = (row[`c${d}${p}`] || '').split(' ').filter(x => x);
                    cells[key] = { subject: row[`s${d}${p}`], items: classes };
                }
            }
    }
    scheduleTitle.textContent = `${teacherName} 老師課表`;
    scheduleTableContainer.innerHTML = buildScheduleTable(cells, 'teacher');
    showView('resultView');
    updateBackBtn();
}

// 教師＋科目的過濾課表：只顯示該教師任教「這個科目」的節次，其餘格子留空
function displayTeacherSubjectSchedule(teacherName, subject) {
    pushNav('teacherSubject', { teacher: teacherName, subject });
    const row   = scheduleData.find(r => r.teachername === teacherName);
    const cells = {};
    if (row) {
        for (let d = 1; d <= 5; d++)
            for (let p of PERIODS_ALL) {
                const s = row[`s${d}${p}`];
                if (s && normalizeSubject(s) === subject) {
                    const key = `${d}-${p}`;
                    const classes = (row[`c${d}${p}`] || '').split(' ').filter(x => x);
                    cells[key] = { subject: s, items: classes };
                }
            }
    }
    scheduleTitle.textContent = `${teacherName} 老師－${subject} 課表`;
    scheduleTableContainer.innerHTML = buildScheduleTable(cells, 'teacher');
    showView('resultView');
    updateBackBtn();
}

/* ═══════════════════════════════════════════════════════════
   建構課表 HTML
═══════════════════════════════════════════════════════════ */
function buildScheduleTable(cells, mode) {
    // PERIOD_TIMES[0]=早自習, [1]=第1節, ..., [8]=第8節
    const periods   = CONFIG.PERIOD_TIMES || [];
    const hasEarly  = Object.keys(cells).some(k => k.endsWith('-0'));

    let html = '<table class="schedule-table"><thead><tr>';
    html += '<th class="th-period">節次</th>';
    DAYS.forEach(d => html += `<th>${d}</th>`);
    html += '</tr></thead><tbody>';

    // 早自習列（只在有資料時顯示）
    if (hasEarly) {
        const et = periods[0] || { start: '07:40', end: '08:10' };
        html += `<tr><td class="td-period">
            <div class="period-num">早自習</div>
            <div class="period-time">${et.start}<br>${et.end}</div>
        </td>`;
        for (let d = 1; d <= 5; d++) {
            html += renderCell(cells[`${d}-0`], mode);
        }
        html += '</tr>';
    }

    // 第1~8節
    for (let p = 1; p <= 8; p++) {
        const pt = periods[p] || { start: '', end: '' };  // periods[p] 對應第p節（索引p）
        html += `<tr><td class="td-period"><div class="period-num">第${p}節</div>`;
        if (pt.start && pt.start !== '——') {
            html += `<div class="period-time">${pt.start}<br>${pt.end}</div>`;
        }
        html += '</td>';
        for (let d = 1; d <= 5; d++) {
            html += renderCell(cells[`${d}-${p}`], mode);
        }
        html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
}

function renderCell(cell, mode) {
    if (!cell) return '<td class="td-empty"></td>';
    
    const itemsHtml = (cell.items || []).map(item => {
        if (mode === 'class') {
            return `<div class="cell-link" onclick="displayTeacherSchedule('${escHtml(item)}')">${item}</div>`;
        } else {
            return `<div class="cell-link" onclick="displayClassSchedule('${escHtml(item)}')">${item}</div>`;
        }
    }).join(' ');

    return `<td class="td-cell">
        <div class="cell-subject">${cell.subject}</div>
        <div class="cell-items-container">${itemsHtml}</div>
    </td>`;
}

function escHtml(str) {
    return (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/* ═══════════════════════════════════════════════════════════
   列印
═══════════════════════════════════════════════════════════ */
function printSchedule() {
    const title    = scheduleTitle.textContent;
    const tableHTML = scheduleTableContainer.innerHTML;
    const semLabel  = document.getElementById('currentSemester')?.textContent || '';

    const win = window.open('', '_blank', 'width=1100,height=750');
    win.document.write(`<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8">
<title>${title}</title>
<style>
  @page { size: A4 landscape; margin: 1cm; }
  body { font-family: 'Noto Sans TC', sans-serif; font-size: 10pt; }
  h2 { text-align:center; margin-bottom:4px; font-size:14pt; }
  p.sem { text-align:center; font-size:9pt; color:#555; margin:0 0 8px; }
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #999; padding:4px 6px; text-align:center; vertical-align:middle; }
  th { background:#e8e8e8; font-weight:600; }
  .td-period { background:#f5f5f5; width:4rem; }
  .period-num { font-weight:600; font-size:9pt; }
  .period-time { font-size:7.5pt; color:#555; }
  .cell-subject { font-weight:500; }
  .cell-link { font-size:8.5pt; color:#444; }
  .td-empty { background:#fafafa; }
</style>
</head><body>
<h2>${title}</h2>
<p class="sem">${semLabel}</p>
${tableHTML}
<script>window.onload=()=>{window.print();window.close();}<\/script>
</body></html>`);
    win.document.close();
}

/* ═══════════════════════════════════════════════════════════
   初始化
═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    populateSemesterSelect();
    updateBackBtn();
    const promptText = document.getElementById('promptTemplateText');
    if (promptText) {
        promptText.value = AI_PROMPT_TEMPLATE;
    }

    const storedName = localStorage.getItem(LOCAL_TIMETABLE_NAME_KEY);
    updateStartSchoolName(getStoredSchoolName());

    if (storedName) {
        setImportStatus(`目前瀏覽器已有「${storedName}」。可直接按「課表搜尋」，或重新匯入新檔案。`, 'info');
    }

    showView('startView');
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeTemplateModal();
    }
});

document.addEventListener('click', (event) => {
    const modal = document.getElementById('templateModal');
    if (modal && event.target === modal) {
        closeTemplateModal();
    }
});

/* =====================================================================
   訪客登入
===================================================================== */
async function guestLogin() {
    const errEl    = document.getElementById('loginError');
    const btn      = document.getElementById('guestBtn');
    
    errEl.textContent = '';
    if (btn) btn.disabled = true;
    
    const semLabel = document.getElementById('semesterSelect')?.value || '';
    
    try {
        await fetchAndParseCSV(semLabel);
    } catch(err) {
        errEl.textContent = '載入失敗，請確認資料檔是否存在。';
    } finally {
        if (btn) btn.disabled = false;
    }
}
