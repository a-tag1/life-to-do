'use strict';

/* ============================================================
   IndexedDB ラッパー
   ============================================================ */
const DB_NAME = 'life-todo-db';
const DB_VERSION = 1;

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
    const [daily, monthly, vision, templates] = await Promise.all([
      _getAll('daily'), _getAll('monthly'), this.getVision(), _getAll('templates')
    ]);
    return { daily, monthly, vision, templates };
  }
};
