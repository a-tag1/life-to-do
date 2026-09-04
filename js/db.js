'use strict';

/* ============================================================
   IndexedDB ラッパー
   ============================================================ */
const DB_NAME = 'life-todo-db';
const DB_VERSION = 2;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('daily'))
        d.createObjectStore('daily', { keyPath: 'date' });
      if (!d.objectStoreNames.contains('monthly'))
        d.createObjectStore('monthly', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('vision'))
        d.createObjectStore('vision', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('templates'))
        d.createObjectStore('templates', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('settings'))
        d.createObjectStore('settings', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('goals'))
        d.createObjectStore('goals', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('projects')) {
        const ps = d.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
        ps.createIndex('goalId', 'goalId', { unique: false });
      }
      if (!d.objectStoreNames.contains('goal_tasks')) {
        const ts = d.createObjectStore('goal_tasks', { keyPath: 'id', autoIncrement: true });
        ts.createIndex('projectId', 'projectId', { unique: false });
      }
    };
  });
}

function _get(store, key) {
  return openDB().then(db => new Promise((res, rej) => {
    const r = db.transaction(store, 'readonly').objectStore(store).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

function _put(store, val) {
  return openDB().then(db => new Promise((res, rej) => {
    const r = db.transaction(store, 'readwrite').objectStore(store).put(val);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

function _add(store, val) {
  return openDB().then(db => new Promise((res, rej) => {
    const r = db.transaction(store, 'readwrite').objectStore(store).add(val);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

function _del(store, key) {
  return openDB().then(db => new Promise((res, rej) => {
    const r = db.transaction(store, 'readwrite').objectStore(store).delete(key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  }));
}

function _getAll(store) {
  return openDB().then(db => new Promise((res, rej) => {
    const r = db.transaction(store, 'readonly').objectStore(store).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

function _getAllByIndex(store, indexName, key) {
  return openDB().then(db => new Promise((res, rej) => {
    const r = db.transaction(store, 'readonly')
      .objectStore(store).index(indexName).getAll(IDBKeyRange.only(key));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

/* ============================================================
   DB パブリック API
   ============================================================ */
const DB = {
  /* --- 日別エントリ --- */
  async getDaily(date) {
    return (await _get('daily', date)) || { date, plan: '', actual: '', note: '', star: false };
  },
  saveDaily(entry) { return _put('daily', entry); },
  getAllDaily() { return _getAll('daily'); },

  /* --- 月別ノート（年間ビュー用） --- */
  async getMonthly(key) {
    return (await _get('monthly', key)) || { key, note: '' };
  },
  saveMonthly(data) { return _put('monthly', data); },

  /* --- ビジョン --- */
  async getVision() {
    return (await _get('vision', 'main')) || { id: 'main', text: '', tasks: [] };
  },
  saveVision(data) { return _put('vision', { id: 'main', ...data }); },

  /* --- テンプレート --- */
  getTemplates() { return _getAll('templates'); },
  addTemplate(tpl) { return _add('templates', tpl); },
  deleteTemplate(id) { return _del('templates', id); },

  /* --- 設定 --- */
  async getSetting(key, def = '') {
    const r = await _get('settings', key);
    return r ? r.value : def;
  },
  saveSetting(key, value) { return _put('settings', { key, value }); },

  /* --- 年の★付き日を取得 --- */
  async getStarredDaysForYear(year) {
    const all = await this.getAllDaily();
    return all
      .filter(e => e.date.startsWith(String(year) + '-') && e.star)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  /* --- 全データエクスポート --- */
  async exportAll() {
    const [daily, monthly, vision, templates, goals, projects, goalTasks] = await Promise.all([
      _getAll('daily'), _getAll('monthly'), this.getVision(), _getAll('templates'),
      _getAll('goals'), _getAll('projects'), _getAll('goal_tasks')
    ]);
    return { daily, monthly, vision, templates, goals, projects, goalTasks };
  },

  /* --- 理想像 (Goals) --- */
  getGoals() { return _getAll('goals'); },
  getGoal(id) { return _get('goals', id); },
  addGoal(goal) { return _add('goals', goal); },
  updateGoal(goal) { return _put('goals', goal); },
  async deleteGoal(id) {
    const projects = await _getAllByIndex('projects', 'goalId', id);
    for (const p of projects) {
      const tasks = await _getAllByIndex('goal_tasks', 'projectId', p.id);
      for (const t of tasks) await _del('goal_tasks', t.id);
      await _del('projects', p.id);
    }
    return _del('goals', id);
  },

  /* --- プロジェクト (Projects) --- */
  getAllProjects() { return _getAll('projects'); },
  getProjectsForGoal(goalId) { return _getAllByIndex('projects', 'goalId', goalId); },
  addProject(project) { return _add('projects', project); },
  updateProject(project) { return _put('projects', project); },
  async deleteProject(id) {
    const tasks = await _getAllByIndex('goal_tasks', 'projectId', id);
    for (const t of tasks) await _del('goal_tasks', t.id);
    return _del('projects', id);
  },

  /* --- ゴールタスク (Goal Tasks) --- */
  getAllGoalTasks() { return _getAll('goal_tasks'); },
  getTasksForProject(projectId) { return _getAllByIndex('goal_tasks', 'projectId', projectId); },
  addGoalTask(task) { return _add('goal_tasks', task); },
  updateGoalTask(task) { return _put('goal_tasks', task); },
  deleteGoalTask(id) { return _del('goal_tasks', id); }
};
