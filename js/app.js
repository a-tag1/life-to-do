'use strict';

/* ============================================================
   ユーティリティ
   ============================================================ */
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function roundUpTo5Min() {
  const now = new Date();
  const total = now.getHours() * 60 + now.getMinutes();
  const rounded = Math.ceil(total / 5) * 5;
  const h = Math.floor(rounded / 60) % 24;
  const min = rounded % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function insertAtCursor(ta, text) {
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + text.length;
  ta.focus();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================
   アプリ状態
   ============================================================ */
const _today = new Date();

const state = {
  view: 'today',
  todayDate: new Date(_today),
  monthDate: new Date(_today.getFullYear(), _today.getMonth(), 1),
  yearDate: new Date(_today.getFullYear(), 0, 1),
  tmplTarget: null,
  templates: []
};

/* ============================================================
   ダークモード
   ============================================================ */
function applyDarkMode(mode) {
  document.body.classList.remove('force-dark', 'force-light');
  if (mode === 'dark') document.body.classList.add('force-dark');
  else if (mode === 'light') document.body.classList.add('force-light');
}

/* ============================================================
   ルーター / ヘッダー更新
   ============================================================ */
function navigate(id) {
  if (state.view === 'today') flushTodaySave();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${id}`).classList.add('active');
  document.querySelector(`.nav-item[data-view="${id}"]`).classList.add('active');
  state.view = id;
  ({ today: loadTodayView, monthly: loadMonthlyView, yearly: loadYearlyView,
     vision: loadVisionView, settings: loadSettingsView })[id]();
  updateHeader();
  updateFAB();
}

const DAY_JP = ['日', '月', '火', '水', '木', '金', '土'];

function updateHeader() {
  const titleEl = document.getElementById('header-title');
  const prev = document.getElementById('btn-prev');
  const next = document.getElementById('btn-next');
  const showNav = !['vision', 'settings'].includes(state.view);
  prev.style.visibility = next.style.visibility = showNav ? 'visible' : 'hidden';

  const d = state.todayDate;
  const titles = {
    today:    `${d.getMonth() + 1}月${d.getDate()}日（${DAY_JP[d.getDay()]}）`,
    monthly:  `${state.monthDate.getFullYear()}年${state.monthDate.getMonth() + 1}月`,
    yearly:   `${state.yearDate.getFullYear()}年`,
    vision:   'ビジョン・目標',
    settings: '設定・バックアップ'
  };
  titleEl.textContent = titles[state.view] || '';
}

function updateFAB() {
  const fab = document.getElementById('fab-today');
  const isToday = state.view === 'today' && formatDate(state.todayDate) === formatDate(new Date());
  fab.classList.toggle('hidden', isToday);
}

function goForward() {
  if (['vision', 'settings'].includes(state.view)) return;
  if (state.view === 'today') { flushTodaySave(); const d = new Date(state.todayDate); d.setDate(d.getDate() + 1); state.todayDate = d; loadTodayView(); }
  else if (state.view === 'monthly') { const d = new Date(state.monthDate); d.setMonth(d.getMonth() + 1); state.monthDate = d; loadMonthlyView(); }
  else if (state.view === 'yearly') { state.yearDate.setFullYear(state.yearDate.getFullYear() + 1); loadYearlyView(); }
  updateHeader(); updateFAB();
}

function goBack() {
  if (['vision', 'settings'].includes(state.view)) return;
  if (state.view === 'today') { flushTodaySave(); const d = new Date(state.todayDate); d.setDate(d.getDate() - 1); state.todayDate = d; loadTodayView(); }
  else if (state.view === 'monthly') { const d = new Date(state.monthDate); d.setMonth(d.getMonth() - 1); state.monthDate = d; loadMonthlyView(); }
  else if (state.view === 'yearly') { state.yearDate.setFullYear(state.yearDate.getFullYear() - 1); loadYearlyView(); }
  updateHeader(); updateFAB();
}

/* ============================================================
   今日ビュー
   ============================================================ */
let planTA, actualTA;

function flushTodaySave() {
  if (!planTA) return;
  const date = formatDate(state.todayDate);
  DB.getDaily(date).then(entry => {
    entry.plan = planTA.value;
    entry.actual = actualTA.value;
    DB.saveDaily(entry);
  });
}

async function loadTodayView() {
  const entry = await DB.getDaily(formatDate(state.todayDate));
  planTA.value = entry.plan || '';
  actualTA.value = entry.actual || '';
  updateHeader();
}

const _savePlan = debounce(async val => {
  const date = formatDate(state.todayDate);
  const e = await DB.getDaily(date); e.plan = val; DB.saveDaily(e);
}, 500);

const _saveActual = debounce(async val => {
  const date = formatDate(state.todayDate);
  const e = await DB.getDaily(date); e.actual = val; DB.saveDaily(e);
}, 500);

function initTodayView() {
  planTA = document.getElementById('plan-textarea');
  actualTA = document.getElementById('actual-textarea');

  // 予定セクションの折りたたみトグル（ボタン操作は除外）
  const planSection = planTA.closest('.plan-section');
  planSection.querySelector('.plan-toggle').addEventListener('click', e => {
    if (e.target.closest('button')) return;
    planSection.classList.toggle('collapsed');
  });

  // 予定→実績コピー
  document.getElementById('btn-copy-plan').addEventListener('click', () => {
    actualTA.value = planTA.value;
    actualTA.dispatchEvent(new Event('input', { bubbles: true }));
    autoResize(actualTA);
  });

  planTA.addEventListener('input', e => _savePlan(e.target.value));
  actualTA.addEventListener('input', e => _saveActual(e.target.value));

  document.querySelectorAll('.btn-now').forEach(btn => {
    btn.addEventListener('click', () => {
      const ta = document.getElementById(btn.dataset.target);
      insertAtCursor(ta, roundUpTo5Min());
    });
  });

  document.querySelectorAll('.btn-template').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tmplTarget = document.getElementById(btn.dataset.target);
      showTemplateModal();
    });
  });

  document.getElementById('btn-habit-app').addEventListener('click', async () => {
    const url = await DB.getSetting('habitAppUrl');
    if (!url) { alert('設定画面で習慣アプリのURLを設定してください。'); return; }
    // iOS PWA standalone では window.open() がブロックされるため location.href を使う
    if (navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
      location.href = url;
    } else {
      window.open(url, '_blank', 'noopener');
    }
  });
}

/* ============================================================
   今月ビュー
   ============================================================ */
async function loadMonthlyView() {
  const year = state.monthDate.getFullYear();
  const month = state.monthDate.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const todayStr = formatDate(new Date());
  const pad = n => String(n).padStart(2, '0');
  const monthStr = `${year}-${pad(month + 1)}`;

  const container = document.getElementById('monthly-days');
  container.innerHTML = '<div class="empty-state">読み込み中...</div>';

  const entries = await Promise.all(
    Array.from({ length: days }, (_, i) => DB.getDaily(`${monthStr}-${pad(i + 1)}`))
  );

  let html = '';
  entries.forEach((entry, i) => {
    const d = i + 1;
    const dateStr = `${monthStr}-${pad(d)}`;
    const dow = new Date(year, month, d).getDay();
    const dowCls = dow === 0 ? 'sun' : dow === 6 ? 'sat' : '';
    html += `
      <div class="month-day${dateStr === todayStr ? ' today' : ''}" data-date="${dateStr}">
        <div class="month-day-header">
          <span class="month-day-num ${dowCls}">${d}日（${DAY_JP[dow]}）</span>
          <button class="star-btn${entry.star ? ' active' : ''}" data-date="${dateStr}" aria-label="スターマーク">★</button>
        </div>
        <textarea class="month-note" data-date="${dateStr}" placeholder="メモ..." rows="2"></textarea>
      </div>`;
  });

  container.innerHTML = html;

  // テキスト値をJSで設定（HTMLエンティティの問題を回避）
  container.querySelectorAll('.month-note').forEach(ta => {
    const e = entries[parseInt(ta.dataset.date.slice(-2)) - 1];
    ta.value = e ? (e.note || '') : '';
    autoResize(ta);
  });

  // 今日にスクロール
  const todayEl = container.querySelector('.month-day.today');
  if (todayEl) setTimeout(() => todayEl.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);

  // ★ ボタン
  container.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const date = btn.dataset.date;
      const entry = await DB.getDaily(date);
      entry.star = !entry.star;
      await DB.saveDaily(entry);
      btn.classList.toggle('active', entry.star);
    });
  });

  // ノート自動保存
  const _saveNote = debounce(async (date, val) => {
    const e = await DB.getDaily(date); e.note = val; DB.saveDaily(e);
  }, 500);

  container.querySelectorAll('.month-note').forEach(ta => {
    ta.addEventListener('input', () => { autoResize(ta); _saveNote(ta.dataset.date, ta.value); });
  });

  updateHeader();
}

/* ============================================================
   年間ビュー
   ============================================================ */
async function loadYearlyView() {
  const year = state.yearDate.getFullYear();
  const container = document.getElementById('yearly-months');
  container.innerHTML = '<div class="empty-state">読み込み中...</div>';

  const pad = n => String(n).padStart(2, '0');
  const keys = Array.from({ length: 12 }, (_, m) => `${year}-${pad(m + 1)}`);

  const [allStarred, ...monthlyNotes] = await Promise.all([
    DB.getStarredDaysForYear(year),
    ...keys.map(k => DB.getMonthly(k))
  ]);

  const starredByMonth = {};
  allStarred.forEach(e => {
    const mk = e.date.slice(0, 7);
    (starredByMonth[mk] = starredByMonth[mk] || []).push(e);
  });

  const monthlyByKey = Object.fromEntries(keys.map((k, i) => [k, monthlyNotes[i]]));

  let html = '';
  keys.forEach((key, m) => {
    const starred = starredByMonth[key] || [];
    let starHtml = '';
    if (starred.length) {
      starHtml = `<div class="starred-days">
        <div class="starred-days-label">★ ピックアップ</div>
        ${starred.map(e => {
          const day = parseInt(e.date.slice(-2));
          return `<div class="starred-day">
            <span class="starred-day-date">${day}日</span>
            <span class="starred-day-text"></span>
          </div>`;
        }).join('')}
      </div>`;
    }
    html += `
      <div class="year-month">
        <div class="year-month-title">${m + 1}月</div>
        <textarea class="year-note" data-key="${key}" placeholder="${m + 1}月のメモ..." rows="2"></textarea>
        ${starHtml}
      </div>`;
  });

  container.innerHTML = html;

  // 月別ノート値をJSで設定
  container.querySelectorAll('.year-note').forEach(ta => {
    ta.value = monthlyByKey[ta.dataset.key]?.note || '';
    autoResize(ta);
  });

  // ★日のテキストをJSで設定
  let starIdx = 0;
  keys.forEach(key => {
    const starred = starredByMonth[key] || [];
    const spans = container.querySelectorAll(`.year-month[data-key-ref="${key}"] .starred-day-text`);
    // data-key-ref が無いので別方法で取得
    const yearMonth = container.querySelectorAll('.year-month');
    const monthIdx = keys.indexOf(key);
    if (monthIdx < 0) return;
    const monthEl = yearMonth[monthIdx];
    if (!monthEl) return;
    const textEls = monthEl.querySelectorAll('.starred-day-text');
    textEls.forEach((el, i) => {
      const e = starred[i];
      if (e) el.textContent = (e.note || e.plan || '').slice(0, 80);
    });
    starIdx += starred.length;
  });

  // 月別ノート自動保存
  const _saveMonthNote = debounce(async (key, val) => {
    DB.saveMonthly({ key, note: val });
  }, 500);

  container.querySelectorAll('.year-note').forEach(ta => {
    ta.addEventListener('input', () => { autoResize(ta); _saveMonthNote(ta.dataset.key, ta.value); });
  });

  updateHeader();
}

/* ============================================================
   ビジョンビュー
   ============================================================ */
let visionData = null;

async function loadVisionView() {
  visionData = await DB.getVision();
  document.getElementById('vision-textarea').value = visionData.text || '';
  renderTaskList();
  updateHeader();
}

function renderTaskList() {
  const container = document.getElementById('task-list');
  const tasks = visionData.tasks || [];

  if (!tasks.length) {
    container.innerHTML = '<div class="empty-state"><span class="empty-state-icon">🎯</span>タスクはまだありません</div>';
    return;
  }

  container.innerHTML = tasks.map((t, i) => `
    <div class="task-item" data-idx="${i}">
      <input type="checkbox" class="task-checkbox" data-idx="${i}"${t.completed ? ' checked' : ''}>
      <textarea class="task-text${t.completed ? ' completed' : ''}" data-idx="${i}" rows="1" placeholder="タスクを入力..."></textarea>
      <div class="task-actions">
        <button class="btn-task-transfer" data-idx="${i}" title="今日の予定に転送">→今日</button>
        <button class="btn-task-delete" data-idx="${i}" title="削除">×</button>
      </div>
    </div>`).join('');

  // テキスト値をJSで設定
  container.querySelectorAll('.task-text').forEach(ta => {
    const i = parseInt(ta.dataset.idx);
    ta.value = tasks[i]?.text || '';
    autoResize(ta);
  });

  // チェックボックス
  container.querySelectorAll('.task-checkbox').forEach(cb => {
    cb.addEventListener('change', async () => {
      const i = parseInt(cb.dataset.idx);
      visionData.tasks[i].completed = cb.checked;
      const ta = container.querySelector(`.task-text[data-idx="${i}"]`);
      if (ta) ta.classList.toggle('completed', cb.checked);
      await DB.saveVision(visionData);
    });
  });

  // テキスト
  const _saveTask = debounce(async (idx, val) => {
    if (visionData.tasks[idx] !== undefined) {
      visionData.tasks[idx].text = val;
      DB.saveVision(visionData);
    }
  }, 500);

  container.querySelectorAll('.task-text').forEach(ta => {
    ta.addEventListener('input', () => { autoResize(ta); _saveTask(parseInt(ta.dataset.idx), ta.value); });
  });

  // →今日ボタン
  container.querySelectorAll('.btn-task-transfer').forEach(btn => {
    btn.addEventListener('click', async () => {
      const task = visionData.tasks[parseInt(btn.dataset.idx)];
      const todayStr = formatDate(new Date());
      const entry = await DB.getDaily(todayStr);
      entry.plan = entry.plan ? entry.plan + '\n' + task.text : task.text;
      await DB.saveDaily(entry);
      btn.textContent = '✓転送！';
      setTimeout(() => { btn.textContent = '→今日'; }, 1800);
    });
  });

  // 削除ボタン
  container.querySelectorAll('.btn-task-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      visionData.tasks.splice(parseInt(btn.dataset.idx), 1);
      await DB.saveVision(visionData);
      renderTaskList();
    });
  });
}

function initVisionView() {
  const visionTA = document.getElementById('vision-textarea');
  const _saveVision = debounce(async val => {
    if (!visionData) visionData = await DB.getVision();
    visionData.text = val;
    DB.saveVision(visionData);
  }, 500);
  visionTA.addEventListener('input', e => _saveVision(e.target.value));

  document.getElementById('btn-add-task').addEventListener('click', async () => {
    if (!visionData) visionData = await DB.getVision();
    visionData.tasks.push({ id: Date.now(), text: '', completed: false });
    await DB.saveVision(visionData);
    renderTaskList();
    const all = document.querySelectorAll('.task-text');
    if (all.length) all[all.length - 1].focus();
  });
}

/* ============================================================
   設定ビュー
   ============================================================ */
async function loadSettingsView() {
  await loadTemplateList();
  document.getElementById('habit-url-input').value = await DB.getSetting('habitAppUrl');
  document.getElementById('dark-mode-select').value = await DB.getSetting('darkMode', 'system');
  await checkStorageStatus();
  updateHeader();
}

async function loadTemplateList() {
  state.templates = await DB.getTemplates();
  renderTemplateList();
}

function renderTemplateList() {
  const container = document.getElementById('template-list');
  if (!state.templates.length) {
    container.innerHTML = '<div class="empty-state" style="padding:16px 0">テンプレートはまだありません</div>';
    return;
  }
  container.innerHTML = state.templates.map(t => `
    <div class="template-item" data-id="${t.id}">
      <div>
        <div class="template-item-label">${escapeHtml(t.label)}</div>
        ${t.text !== t.label ? `<div class="template-item-text">${escapeHtml(t.text)}</div>` : ''}
      </div>
      <button class="btn-delete" data-id="${t.id}" aria-label="削除">×</button>
    </div>`).join('');

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await DB.deleteTemplate(parseInt(btn.dataset.id));
      await loadTemplateList();
    });
  });
}

function initSettingsView() {
  const textInput = document.getElementById('template-text-input');

  // Cmd/Ctrl+Enter で追加
  textInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      document.getElementById('btn-add-template').click();
    }
  });

  document.getElementById('btn-add-template').addEventListener('click', async () => {
    const label = document.getElementById('template-label-input').value.trim();
    const text = textInput.value.trim();
    if (!label && !text) return;
    await DB.addTemplate({ label: label || text, text: text || label });
    document.getElementById('template-label-input').value = '';
    textInput.value = '';
    await loadTemplateList();
  });

  document.getElementById('btn-save-habit-url').addEventListener('click', async () => {
    const url = document.getElementById('habit-url-input').value.trim();
    await DB.saveSetting('habitAppUrl', url);
    const btn = document.getElementById('btn-save-habit-url');
    btn.textContent = '✓ 保存しました';
    setTimeout(() => { btn.textContent = '保存'; }, 2000);
  });

  document.getElementById('dark-mode-select').addEventListener('change', async e => {
    await DB.saveSetting('darkMode', e.target.value);
    applyDarkMode(e.target.value);
  });

  document.getElementById('btn-export-txt').addEventListener('click', exportTxt);
  document.getElementById('btn-export-csv').addEventListener('click', exportCsv);
  document.getElementById('btn-share').addEventListener('click', shareData);
  document.getElementById('btn-google-drive').addEventListener('click', () => {
    alert('Google Drive連携は今後実装予定です。\n現在はエクスポート機能でバックアップしてください。');
  });
}

async function exportTxt() {
  const data = await DB.exportAll();
  const lines = [
    '=== LifeToDo エクスポート ===',
    `出力日時: ${new Date().toLocaleString('ja-JP')}`,
    ''
  ];

  const sorted = [...data.daily].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length) {
    lines.push('=== 日別記録 ===');
    sorted.forEach(e => {
      lines.push(`\n--- ${e.date}${e.star ? ' ★' : ''} ---`);
      if (e.plan) { lines.push('【予定】'); lines.push(e.plan); }
      if (e.actual) { lines.push('【実績】'); lines.push(e.actual); }
      if (e.note) { lines.push('【メモ】'); lines.push(e.note); }
    });
    lines.push('');
  }

  if (data.vision.text || data.vision.tasks?.length) {
    lines.push('=== ビジョン・目標 ===');
    if (data.vision.text) lines.push(data.vision.text);
    if (data.vision.tasks?.length) {
      lines.push('\n【タスク】');
      data.vision.tasks.forEach(t => lines.push(`${t.completed ? '[✓]' : '[ ]'} ${t.text}`));
    }
    lines.push('');
  }

  downloadBlob(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }),
    `life-todo-${formatDate(new Date())}.txt`);
}

async function exportCsv() {
  const data = await DB.exportAll();
  const rows = [['日付', '予定', '実績', 'メモ', 'スター']];
  [...data.daily].sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
    rows.push([e.date, e.plan || '', e.actual || '', e.note || '', e.star ? '★' : '']);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }),
    `life-todo-${formatDate(new Date())}.csv`);
}

async function shareData() {
  if (!navigator.share) {
    alert('お使いのブラウザはWeb Share APIに対応していません。\nエクスポート機能をご利用ください。');
    return;
  }
  const todayStr = formatDate(new Date());
  const entry = await DB.getDaily(todayStr);
  const text = `【LifeToDo ${todayStr}】\n\n【予定】\n${entry.plan || '（なし）'}\n\n【実績】\n${entry.actual || '（なし）'}`;
  try { await navigator.share({ title: 'LifeToDo', text }); }
  catch (err) { if (err.name !== 'AbortError') console.error(err); }
}

async function checkStorageStatus() {
  const el = document.getElementById('storage-status');
  if (!navigator.storage?.persisted) { el.textContent = 'ストレージ永続化APIは利用できません'; return; }
  try {
    const p = await navigator.storage.persisted();
    if (p) { el.textContent = '✓ 永続ストレージが有効です（データ保護済み）'; return; }
    const ok = await navigator.storage.persist();
    el.textContent = ok
      ? '✓ 永続ストレージを有効化しました'
      : '⚠ 永続ストレージの有効化に失敗しました。ブラウザ設定を確認してください。';
  } catch { el.textContent = 'ストレージ状態を確認できませんでした'; }
}

/* ============================================================
   テンプレートモーダル
   ============================================================ */
function showTemplateModal() {
  const modal = document.getElementById('template-modal');
  const list = document.getElementById('modal-template-list');

  if (!state.templates.length) {
    list.innerHTML = '<div class="empty-state">テンプレートがありません。<br>設定画面で追加してください。</div>';
  } else {
    list.innerHTML = state.templates.map(t => `
      <button class="modal-template-item" data-text="${t.text.replace(/"/g, '&quot;')}">
        <span class="modal-template-label">${escapeHtml(t.label)}</span>
        ${t.text !== t.label ? `<span class="modal-template-sub">${escapeHtml(t.text)}</span>` : ''}
      </button>`).join('');

    list.querySelectorAll('.modal-template-item').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.tmplTarget) insertAtCursor(state.tmplTarget, btn.dataset.text);
        closeTemplateModal();
      });
    });
  }

  modal.classList.remove('hidden');
}

function closeTemplateModal() {
  document.getElementById('template-modal').classList.add('hidden');
}

/* ============================================================
   スワイプナビゲーション
   ============================================================ */
function initSwipe() {
  let sx = 0, sy = 0;
  const mc = document.getElementById('main-content');
  mc.addEventListener('touchstart', e => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  mc.addEventListener('touchend', e => {
    const dx = sx - e.changedTouches[0].clientX;
    const dy = sy - e.changedTouches[0].clientY;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx > 0) goForward(); else goBack();
  }, { passive: true });
}

/* ============================================================
   初期化
   ============================================================ */
async function init() {
  try {
    await openDB();
  } catch {
    alert('データベースの初期化に失敗しました。\nブラウザのプライベートモードをオフにするか、ストレージを許可してください。');
    return;
  }

  // 永続ストレージを要求
  navigator.storage?.persist?.().catch(() => {});

  // ダークモード適用
  applyDarkMode(await DB.getSetting('darkMode', 'system'));

  // テンプレート読み込み
  state.templates = await DB.getTemplates();

  // デフォルトテンプレートを初回のみ追加
  if (!state.templates.length) {
    const defaults = [
      { label: '読書：', text: '読書：' },
      { label: '運動：', text: '運動：' },
      { label: '今：', text: '今：' },
      { label: '〜', text: '〜' }
    ];
    for (const t of defaults) await DB.addTemplate(t);
    state.templates = await DB.getTemplates();
  }

  // ビュー初期化（イベントリスナー登録）
  initTodayView();
  initVisionView();
  initSettingsView();

  // ボトムナビ
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  // ヘッダーナビ
  document.getElementById('btn-prev').addEventListener('click', goBack);
  document.getElementById('btn-next').addEventListener('click', goForward);

  // FAB
  document.getElementById('fab-today').addEventListener('click', () => {
    state.todayDate = new Date();
    navigate('today');
  });

  // モーダル閉じる
  document.getElementById('modal-close').addEventListener('click', closeTemplateModal);
  document.getElementById('template-modal-overlay').addEventListener('click', closeTemplateModal);

  // スワイプ
  initSwipe();

  // Service Worker 登録
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // 初期ビュー表示
  navigate('today');
}

document.addEventListener('DOMContentLoaded', init);
