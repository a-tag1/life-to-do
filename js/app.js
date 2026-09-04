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

/* --- ドラッグ並び替え（ポインターイベント / タッチ対応） --- */
function enableDragReorder(container, itemSelector, handleSelector, onReorder) {
  container.querySelectorAll(handleSelector).forEach(handle => {
    const item = handle.closest(itemSelector);
    if (!item) return;
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      const pid = e.pointerId;
      item.classList.add('dragging');
      handle.setPointerCapture(pid);

      const onMove = ev => {
        const y = ev.clientY;
        const siblings = [...container.querySelectorAll(itemSelector)].filter(el => el !== item);
        let target = null;
        for (const sib of siblings) {
          const rect = sib.getBoundingClientRect();
          if (y < rect.top + rect.height / 2) { target = sib; break; }
        }
        if (target) container.insertBefore(item, target);
        else container.appendChild(item);
      };
      const onUp = () => {
        handle.releasePointerCapture(pid);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        item.classList.remove('dragging');
        const ids = [...container.querySelectorAll(itemSelector)].map(el => el.dataset.id);
        onReorder(ids);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
}

async function persistReorder(list, ids, updateFn) {
  const map = new Map(list.map(x => [String(x.id), x]));
  await Promise.all(ids.map((id, idx) => {
    const obj = map.get(id);
    if (!obj) return null;
    obj.order = idx;
    return updateFn(obj);
  }));
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
  templates: [],
  currentGoalId: null
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
  const navId = id === 'goal-detail' ? 'vision' : id;
  const navItem = document.querySelector(`.nav-item[data-view="${navId}"]`);
  if (navItem) navItem.classList.add('active');
  state.view = id;
  ({ today: loadTodayView, monthly: loadMonthlyView, yearly: loadYearlyView,
     vision: loadVisionView, tasks: loadTasksView, settings: loadSettingsView,
     'goal-detail': loadGoalDetailView })[id]();
  updateHeader();
  updateFAB();
}

const DAY_JP = ['日', '月', '火', '水', '木', '金', '土'];

function updateHeader() {
  const titleEl = document.getElementById('header-title');
  const prev = document.getElementById('btn-prev');
  const next = document.getElementById('btn-next');

  if (state.view === 'goal-detail') {
    prev.style.visibility = 'visible';
    next.style.visibility = 'hidden';
    // title set dynamically in loadGoalDetailView
    return;
  }

  const showNav = !['vision', 'tasks', 'settings'].includes(state.view);
  prev.style.visibility = next.style.visibility = showNav ? 'visible' : 'hidden';

  const d = state.todayDate;
  const titles = {
    today:    `${d.getMonth() + 1}月${d.getDate()}日（${DAY_JP[d.getDay()]}）`,
    monthly:  `${state.monthDate.getFullYear()}年${state.monthDate.getMonth() + 1}月`,
    yearly:   `${state.yearDate.getFullYear()}年`,
    vision:   'ビジョン・目標',
    tasks:    'タスク',
    settings: '設定・バックアップ'
  };
  titleEl.textContent = titles[state.view] || '';
}

function updateFAB() {
  const fabToday = document.getElementById('fab-today');
  const fabVision = document.getElementById('fab-vision');
  const isToday = state.view === 'today' && formatDate(state.todayDate) === formatDate(new Date());
  const onVisionArea = ['vision', 'goal-detail', 'tasks', 'settings'].includes(state.view);
  fabToday.classList.toggle('hidden', isToday || onVisionArea);
  fabVision.classList.toggle('hidden', state.view !== 'vision');
}

let isSliding = false;

async function slideAndLoad(direction, loadFn) {
  if (isSliding) return;
  isSliding = true;
  const view = document.querySelector('.view.active');
  const DURATION = 260;
  const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

  if (view) {
    const target = direction === 'forward' ? '-100%' : '100%';
    const origin = direction === 'forward' ? '100%' : '-100%';
    view.style.transition = `transform ${DURATION}ms ${EASE}`;
    view.style.transform = `translateX(${target})`;
    await new Promise(r => setTimeout(r, DURATION + 20));
    view.style.transition = 'none';
    view.style.transform = `translateX(${origin})`;
  }

  await loadFn();

  if (view) {
    view.getBoundingClientRect();
    view.style.transition = `transform ${DURATION}ms ${EASE}`;
    view.style.transform = '';
    await new Promise(r => setTimeout(r, DURATION + 20));
    view.style.transition = '';
  }

  isSliding = false;
}

function goForward() {
  if (['vision', 'goal-detail', 'tasks', 'settings'].includes(state.view)) return;
  slideAndLoad('forward', async () => {
    if (state.view === 'today') { flushTodaySave(); const d = new Date(state.todayDate); d.setDate(d.getDate() + 1); state.todayDate = d; await loadTodayView(); }
    else if (state.view === 'monthly') { const d = new Date(state.monthDate); d.setMonth(d.getMonth() + 1); state.monthDate = d; await loadMonthlyView(); }
    else if (state.view === 'yearly') { state.yearDate.setFullYear(state.yearDate.getFullYear() + 1); await loadYearlyView(); }
    updateHeader(); updateFAB();
  });
}

function goBack() {
  if (state.view === 'goal-detail') { navigate('vision'); return; }
  if (['vision', 'tasks', 'settings'].includes(state.view)) return;
  slideAndLoad('back', async () => {
    if (state.view === 'today') { flushTodaySave(); const d = new Date(state.todayDate); d.setDate(d.getDate() - 1); state.todayDate = d; await loadTodayView(); }
    else if (state.view === 'monthly') { const d = new Date(state.monthDate); d.setMonth(d.getMonth() - 1); state.monthDate = d; await loadMonthlyView(); }
    else if (state.view === 'yearly') { state.yearDate.setFullYear(state.yearDate.getFullYear() - 1); await loadYearlyView(); }
    updateHeader(); updateFAB();
  });
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

  // 表示年が当年なら当月へスクロール
  const todayYear = new Date().getFullYear();
  if (year === todayYear) {
    const currentMonth = new Date().getMonth(); // 0-based
    const monthEls = container.querySelectorAll('.year-month');
    if (monthEls[currentMonth]) {
      setTimeout(() => monthEls[currentMonth].scrollIntoView({ block: 'start', behavior: 'smooth' }), 80);
    }
  }

  updateHeader();
}

/* ============================================================
   ビジョンビュー（ダッシュボード）
   ============================================================ */
async function loadVisionView() {
  await renderGoalList();
  updateHeader();
}

async function renderGoalList() {
  const container = document.getElementById('goal-list');
  const goals = (await DB.getGoals()).sort((a, b) => {
    if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
    return (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0);
  });

  if (!goals.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">🎯</span>
        理想像がまだありません。<br>＋ボタンで追加しましょう！
      </div>`;
    return;
  }

  const allProjects = await Promise.all(goals.map(g => DB.getProjectsForGoal(g.id)));
  const allTasksNested = await Promise.all(
    allProjects.map(ps => Promise.all(ps.map(p => DB.getTasksForProject(p.id))))
  );

  container.innerHTML = goals.map((goal, gi) => {
    const projects = allProjects[gi];
    const tasks = allTasksNested[gi].flat();
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    const pct = total ? Math.round(done / total * 100) : 0;

    return `
      <div class="goal-card${goal.completed ? ' completed-item' : ''}" data-id="${goal.id}">
        <span class="drag-handle goal-drag-handle" aria-label="並び替え">⠿</span>
        <input type="checkbox" class="goal-complete-checkbox" data-id="${goal.id}"${goal.completed ? ' checked' : ''} aria-label="完了">
        <div class="goal-card-body">
          <div class="goal-card-title">${escapeHtml(goal.title)}</div>
          <div class="goal-card-meta">
            <span class="goal-projects-count">${projects.length}件のプロジェクト</span>
            <span class="goal-task-count">${total ? `${done}/${total}タスク` : 'タスクなし'}</span>
          </div>
          ${total ? `
          <div class="goal-progress-track">
            <div class="goal-progress-fill" style="width:${pct}%"></div>
          </div>` : ''}
        </div>
        <button class="btn-goal-delete" data-id="${goal.id}" aria-label="削除">×</button>
        <div class="goal-card-arrow">›</div>
      </div>`;
  }).join('');

  container.querySelectorAll('.goal-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.btn-goal-delete') ||
          e.target.closest('.goal-complete-checkbox') ||
          e.target.closest('.goal-drag-handle')) return;
      state.currentGoalId = parseInt(card.dataset.id);
      navigate('goal-detail');
    });
  });

  container.querySelectorAll('.btn-goal-delete').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('この理想像と紐づくプロジェクト・タスクをすべて削除しますか？')) return;
      await DB.deleteGoal(parseInt(btn.dataset.id));
      await renderGoalList();
    });
  });

  container.querySelectorAll('.goal-complete-checkbox').forEach(cb => {
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', async () => {
      const id = parseInt(cb.dataset.id);
      const goal = goals.find(g => g.id === id);
      if (!goal) return;
      goal.completed = cb.checked;
      await DB.updateGoal(goal);
      await renderGoalList();
    });
  });

  enableDragReorder(container, '.goal-card', '.goal-drag-handle', async ids => {
    await persistReorder(goals, ids, DB.updateGoal);
  });
}

function initVisionView() {
  document.getElementById('fab-vision').addEventListener('click', () => openGoalModal());
  document.getElementById('goal-modal-close').addEventListener('click', closeGoalModal);
  document.getElementById('goal-modal-overlay').addEventListener('click', closeGoalModal);

  const titleInput = document.getElementById('goal-title-input');
  const noteInput = document.getElementById('goal-note-input');

  titleInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-save-goal').click(); }
  });

  document.getElementById('btn-save-goal').addEventListener('click', async () => {
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }
    await DB.addGoal({ title, note: noteInput.value.trim(), createdAt: Date.now(), order: Date.now(), completed: false });
    closeGoalModal();
    await renderGoalList();
  });
}

function openGoalModal() {
  document.getElementById('goal-title-input').value = '';
  document.getElementById('goal-note-input').value = '';
  document.getElementById('goal-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('goal-title-input').focus(), 80);
}

function closeGoalModal() {
  document.getElementById('goal-modal').classList.add('hidden');
}

/* ============================================================
   理想像詳細ビュー (Goal Detail)
   ============================================================ */
async function loadGoalDetailView() {
  const goal = await DB.getGoal(state.currentGoalId);
  if (!goal) { navigate('vision'); return; }

  document.getElementById('header-title').textContent = goal.title;

  const noteTA = document.getElementById('goal-note-textarea');
  noteTA.value = goal.note || '';
  autoResize(noteTA);

  await renderProjectList();
}

function initGoalDetailView() {
  const noteTA = document.getElementById('goal-note-textarea');
  const _saveNote = debounce(async val => {
    const goal = await DB.getGoal(state.currentGoalId);
    if (!goal) return;
    goal.note = val;
    DB.updateGoal(goal);
  }, 500);
  noteTA.addEventListener('input', () => { autoResize(noteTA); _saveNote(noteTA.value); });

  document.getElementById('btn-add-project').addEventListener('click', async () => {
    if (!state.currentGoalId) return;
    const newId = await DB.addProject({ goalId: state.currentGoalId, title: '', order: Date.now(), completed: false });
    await renderProjectList();
    const input = document.querySelector(`.project-title-input[data-id="${newId}"]`);
    if (input) {
      const accordion = input.closest('.project-accordion');
      if (accordion) accordion.classList.add('open');
      input.focus();
    }
  });
}

async function renderProjectList() {
  const container = document.getElementById('project-list');
  const projects = (await DB.getProjectsForGoal(state.currentGoalId)).sort((a, b) => {
    if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
    return (a.order ?? 0) - (b.order ?? 0);
  });

  if (!projects.length) {
    container.innerHTML = '<div class="empty-state" style="padding:20px 0">プロジェクトがまだありません</div>';
    return;
  }

  const allTasks = await Promise.all(projects.map(p => DB.getTasksForProject(p.id)));
  allTasks.forEach(tasks => tasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

  container.innerHTML = projects.map((project, pi) => {
    const tasks = allTasks[pi];
    const done = tasks.filter(t => t.completed).length;
    return `
      <div class="project-accordion${project.completed ? ' completed-item' : ''}" data-id="${project.id}">
        <div class="project-accordion-header">
          <span class="drag-handle project-drag-handle" aria-label="並び替え">⠿</span>
          <input type="checkbox" class="project-complete-checkbox" data-id="${project.id}"${project.completed ? ' checked' : ''} aria-label="完了">
          <span class="accordion-chevron">›</span>
          <div class="project-title-wrap">
            <input class="project-title-input" data-id="${project.id}"
              placeholder="プロジェクト名を入力..." maxlength="60">
          </div>
          <span class="project-task-badge">${done}/${tasks.length}</span>
          <button class="btn-project-delete" data-id="${project.id}" aria-label="削除">×</button>
        </div>
        <div class="project-accordion-body">
          <div class="project-tasks" data-project-id="${project.id}">
            ${tasks.map(task => `
              <div class="project-task-item" data-id="${task.id}">
                <span class="drag-handle project-task-drag-handle" aria-label="並び替え">⠿</span>
                <input type="checkbox" class="project-task-checkbox" data-id="${task.id}"${task.completed ? ' checked' : ''}>
                <div class="project-task-body">
                  <textarea class="project-task-text${task.completed ? ' completed' : ''}" data-id="${task.id}" rows="1" placeholder="タスクを入力..."></textarea>
                  <input type="date" class="project-task-due" data-id="${task.id}" value="${task.dueDate || ''}">
                </div>
                <button class="btn-project-task-delete" data-id="${task.id}" aria-label="削除">×</button>
              </div>`).join('')}
          </div>
          <button class="btn-add-task-to-project" data-project-id="${project.id}">＋ タスクを追加</button>
        </div>
      </div>`;
  }).join('');

  // タイトル入力値をJSで設定
  container.querySelectorAll('.project-title-input').forEach((input, i) => {
    input.value = projects[i].title;
  });

  // タスクテキスト値をJSで設定
  const taskMap = {};
  allTasks.forEach(tasks => tasks.forEach(t => { taskMap[t.id] = t; }));
  container.querySelectorAll('.project-task-text').forEach(ta => {
    const t = taskMap[parseInt(ta.dataset.id)];
    if (t) { ta.value = t.text; autoResize(ta); }
  });

  // アコーディオントグル
  container.querySelectorAll('.project-accordion-header').forEach(header => {
    header.addEventListener('click', e => {
      if (e.target.closest('.btn-project-delete') ||
          e.target.closest('.project-title-input') ||
          e.target.closest('.project-complete-checkbox') ||
          e.target.closest('.project-drag-handle')) return;
      header.closest('.project-accordion').classList.toggle('open');
    });
  });

  // タイトル入力クリック伝播防止
  container.querySelectorAll('.project-title-input').forEach(input => {
    input.addEventListener('click', e => e.stopPropagation());
    const _saveTitle = debounce(async val => {
      const id = parseInt(input.dataset.id);
      const proj = projects.find(p => p.id === id);
      if (proj) { proj.title = val; await DB.updateProject(proj); }
    }, 500);
    input.addEventListener('input', () => _saveTitle(input.value));
  });

  // プロジェクト完了チェック
  container.querySelectorAll('.project-complete-checkbox').forEach(cb => {
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', async () => {
      const id = parseInt(cb.dataset.id);
      const proj = projects.find(p => p.id === id);
      if (!proj) return;
      proj.completed = cb.checked;
      await DB.updateProject(proj);
      await renderProjectList();
    });
  });

  // プロジェクト削除
  container.querySelectorAll('.btn-project-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('このプロジェクトとタスクをすべて削除しますか？')) return;
      await DB.deleteProject(parseInt(btn.dataset.id));
      await renderProjectList();
    });
  });

  // タスク追加
  container.querySelectorAll('.btn-add-task-to-project').forEach(btn => {
    btn.addEventListener('click', async () => {
      const projectId = parseInt(btn.dataset.projectId);
      const newId = await DB.addGoalTask({ projectId, text: '', completed: false, order: Date.now(), dueDate: '' });
      await renderProjectList();
      const ta = container.querySelector(`.project-task-text[data-id="${newId}"]`);
      if (ta) {
        ta.closest('.project-accordion').classList.add('open');
        ta.focus();
      }
    });
  });

  // タスクチェックボックス
  container.querySelectorAll('.project-task-checkbox').forEach(cb => {
    cb.addEventListener('change', async () => {
      const id = parseInt(cb.dataset.id);
      const task = taskMap[id];
      if (!task) return;
      task.completed = cb.checked;
      await DB.updateGoalTask(task);
      const ta = container.querySelector(`.project-task-text[data-id="${id}"]`);
      if (ta) ta.classList.toggle('completed', cb.checked);
      // バッジ数更新
      const accordion = cb.closest('.project-accordion');
      const projectId = parseInt(accordion.dataset.id);
      const updatedTasks = await DB.getTasksForProject(projectId);
      const badge = accordion.querySelector('.project-task-badge');
      if (badge) badge.textContent = `${updatedTasks.filter(t=>t.completed).length}/${updatedTasks.length}`;
    });
  });

  // タスクテキスト保存
  const _saveTaskText = debounce(async (id, val) => {
    const task = taskMap[id];
    if (!task) return;
    task.text = val;
    DB.updateGoalTask(task);
  }, 500);

  container.querySelectorAll('.project-task-text').forEach(ta => {
    ta.addEventListener('input', () => { autoResize(ta); _saveTaskText(parseInt(ta.dataset.id), ta.value); });
  });

  // タスク期限保存
  container.querySelectorAll('.project-task-due').forEach(inp => {
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('change', async () => {
      const id = parseInt(inp.dataset.id);
      const task = taskMap[id];
      if (!task) return;
      task.dueDate = inp.value;
      await DB.updateGoalTask(task);
    });
  });

  // タスク削除
  container.querySelectorAll('.btn-project-task-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await DB.deleteGoalTask(parseInt(btn.dataset.id));
      await renderProjectList();
    });
  });

  // 並び替え：プロジェクト
  enableDragReorder(container, '.project-accordion', '.project-drag-handle', async ids => {
    await persistReorder(projects, ids, DB.updateProject);
  });

  // 並び替え：プロジェクト内タスク
  container.querySelectorAll('.project-tasks').forEach(taskContainer => {
    const projectId = parseInt(taskContainer.dataset.projectId);
    const tasksForThis = allTasks[projects.findIndex(p => p.id === projectId)] || [];
    enableDragReorder(taskContainer, '.project-task-item', '.project-task-drag-handle', async ids => {
      await persistReorder(tasksForThis, ids, DB.updateGoalTask);
    });
  });
}

async function renderTaskList() {
  const container = document.getElementById('task-list');
  const [tasks, projects, goals] = await Promise.all([
    DB.getAllGoalTasks(), DB.getAllProjects(), DB.getGoals()
  ]);
  const projectMap = new Map(projects.map(p => [p.id, p]));
  const goalMap = new Map(goals.map(g => [g.id, g]));

  if (!tasks.length) {
    container.innerHTML = '<div class="empty-state"><span class="empty-state-icon">🎯</span>タスクはまだありません<br>ビジョンタブのプロジェクトからタスクを追加してください</div>';
    return;
  }

  const sorted = [...tasks].sort((a, b) => {
    const da = a.dueDate || '9999-99-99';
    const db2 = b.dueDate || '9999-99-99';
    if (da !== db2) return da.localeCompare(db2);
    return (a.order ?? 0) - (b.order ?? 0);
  });

  container.innerHTML = sorted.map(t => {
    const project = projectMap.get(t.projectId);
    const goal = project ? goalMap.get(project.goalId) : null;
    const label = [goal?.title, project?.title].filter(Boolean).join(' / ');
    return `
      <div class="task-item${t.completed ? ' completed-item' : ''}" data-id="${t.id}">
        <input type="checkbox" class="task-checkbox" data-id="${t.id}"${t.completed ? ' checked' : ''}>
        <div class="task-body">
          ${label ? `<div class="task-source">${escapeHtml(label)}</div>` : ''}
          <textarea class="task-text${t.completed ? ' completed' : ''}" data-id="${t.id}" rows="1" placeholder="タスクを入力..."></textarea>
          <input type="date" class="task-due-input" data-id="${t.id}" value="${t.dueDate || ''}">
        </div>
        <div class="task-actions">
          <button class="btn-task-transfer" data-id="${t.id}" title="今日の予定に転送">→今日</button>
        </div>
      </div>`;
  }).join('');

  const taskMap = new Map(tasks.map(t => [t.id, t]));

  // テキスト値をJSで設定
  container.querySelectorAll('.task-text').forEach(ta => {
    const t = taskMap.get(parseInt(ta.dataset.id));
    ta.value = t?.text || '';
    autoResize(ta);
  });

  // チェックボックス
  container.querySelectorAll('.task-checkbox').forEach(cb => {
    cb.addEventListener('change', async () => {
      const id = parseInt(cb.dataset.id);
      const t = taskMap.get(id);
      if (!t) return;
      t.completed = cb.checked;
      await DB.updateGoalTask(t);
      const ta = container.querySelector(`.task-text[data-id="${id}"]`);
      if (ta) ta.classList.toggle('completed', cb.checked);
      cb.closest('.task-item').classList.toggle('completed-item', cb.checked);
    });
  });

  // テキスト保存
  const _saveTaskText = debounce(async (id, val) => {
    const t = taskMap.get(id);
    if (!t) return;
    t.text = val;
    DB.updateGoalTask(t);
  }, 500);

  container.querySelectorAll('.task-text').forEach(ta => {
    ta.addEventListener('input', () => { autoResize(ta); _saveTaskText(parseInt(ta.dataset.id), ta.value); });
  });

  // 期限保存（変更で日付順に再表示）
  container.querySelectorAll('.task-due-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const id = parseInt(inp.dataset.id);
      const t = taskMap.get(id);
      if (!t) return;
      t.dueDate = inp.value;
      await DB.updateGoalTask(t);
      await renderTaskList();
    });
  });

  // →今日ボタン
  container.querySelectorAll('.btn-task-transfer').forEach(btn => {
    btn.addEventListener('click', async () => {
      const t = taskMap.get(parseInt(btn.dataset.id));
      if (!t) return;
      const todayStr = formatDate(new Date());
      const entry = await DB.getDaily(todayStr);
      entry.plan = entry.plan ? entry.plan + '\n' + t.text : t.text;
      await DB.saveDaily(entry);
      btn.textContent = '✓転送！';
      setTimeout(() => { btn.textContent = '→今日'; }, 1800);
    });
  });
}

/* ============================================================
   タスクビュー（全プロジェクトのタスクを日付順に表示・編集専用）
   ============================================================ */
async function loadTasksView() {
  await renderTaskList();
  updateHeader();
}

function initTasksView() {
  // タスクタブでの新規追加は不可（編集専用）
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

  if (data.vision.text || data.goals?.length) {
    lines.push('=== ビジョン・目標 ===');
    if (data.vision.text) lines.push(data.vision.text);
    if (data.goals?.length) {
      const projectsByGoal = new Map();
      (data.projects || []).forEach(p => {
        if (!projectsByGoal.has(p.goalId)) projectsByGoal.set(p.goalId, []);
        projectsByGoal.get(p.goalId).push(p);
      });
      const tasksByProject = new Map();
      (data.goalTasks || []).forEach(t => {
        if (!tasksByProject.has(t.projectId)) tasksByProject.set(t.projectId, []);
        tasksByProject.get(t.projectId).push(t);
      });
      data.goals.forEach(g => {
        lines.push(`\n【理想像】${g.completed ? '[✓] ' : ''}${g.title}`);
        (projectsByGoal.get(g.id) || []).forEach(p => {
          lines.push(`  ・${p.completed ? '[✓] ' : ''}${p.title}`);
          (tasksByProject.get(p.id) || []).forEach(t => {
            lines.push(`      ${t.completed ? '[✓]' : '[ ]'} ${t.text}${t.dueDate ? ` (期限: ${t.dueDate})` : ''}`);
          });
        });
      });
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
  let sx = 0, sy = 0, tracking = false;
  const NAVLESS = ['vision', 'goal-detail', 'tasks', 'settings'];
  const mc = document.getElementById('main-content');

  mc.addEventListener('touchstart', e => {
    if (isSliding) return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    tracking = false;
  }, { passive: true });

  mc.addEventListener('touchmove', e => {
    if (isSliding) return;
    const focused = document.activeElement;
    if (focused && (focused.tagName === 'TEXTAREA' || focused.tagName === 'INPUT')) return;
    if (NAVLESS.includes(state.view)) return;

    const dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (!tracking) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      tracking = Math.abs(dx) > Math.abs(dy);
    }
    if (!tracking) return;

    const view = document.querySelector('.view.active');
    if (!view) return;
    view.style.transition = 'none';
    view.style.transform = `translateX(${dx * 0.38}px)`;
  }, { passive: true });

  mc.addEventListener('touchend', e => {
    const focused = document.activeElement;
    if (focused && (focused.tagName === 'TEXTAREA' || focused.tagName === 'INPUT')) { tracking = false; return; }
    if (!tracking) return;
    tracking = false;

    const dx = sx - e.changedTouches[0].clientX;
    const dy = sy - e.changedTouches[0].clientY;
    if (Math.abs(dx) >= 50 && Math.abs(dx) >= Math.abs(dy) * 1.5) {
      if (dx > 0) goForward(); else goBack();
    } else {
      const view = document.querySelector('.view.active');
      if (view) {
        view.style.transition = 'transform 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        view.style.transform = '';
        view.addEventListener('transitionend', () => { view.style.transition = ''; }, { once: true });
      }
    }
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
  initGoalDetailView();
  initTasksView();
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
