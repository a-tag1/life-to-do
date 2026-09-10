'use strict';

const SupabaseSync = (() => {
  let client = null;
  let user = null;
  let timer = null;
  let restoring = false;
  let initialized = false;
  let onChange = () => {};
  let onSync = () => {};

  function isConfigured() {
    return Boolean(client);
  }

  function hasLocalData(data) {
    return data.daily.length || data.monthly.length || data.templates.length ||
      data.goals.length || data.projects.length || data.goalTasks.length ||
      data.vision?.text || data.vision?.tasks?.length;
  }

  async function configure(url, key) {
    if (!url || !key || !window.supabase?.createClient) return false;
    if (client) return true;
    client = window.supabase.createClient(url, key);
    const { data } = await client.auth.getSession();
    user = data.session?.user || null;
    client.auth.onAuthStateChange((_event, session) => {
      user = session?.user || null;
      onChange(user);
    });
    initialized = true;
    return true;
  }

  async function signUp(email, password) {
    if (!client) throw new Error('Supabaseが設定されていません');
    return client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  }

  async function signIn(email, password) {
    if (!client) throw new Error('Supabaseが設定されていません');
    return client.auth.signInWithPassword({ email, password });
  }

  async function signInWithGoogle() {
    if (!client) throw new Error('Supabaseが設定されていません');
    return client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname }
    });
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
  }

  async function pullOrPushInitial() {
    if (!client || !user || restoring) return null;
    const { data: remote, error } = await client
      .from('life_todo_data')
      .select('data, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;

    const local = await DB.exportAll();
    if (remote?.data) {
      if (hasLocalData(local) && !confirm('クラウドのデータでこの端末のデータを上書きします。続けますか？\n必要なら先にJSON出力してください。')) {
        return { type: 'cancelled', updatedAt: remote.updated_at };
      }
      restoring = true;
      try { await DB.restoreAll(remote.data); }
      finally { restoring = false; }
      return { type: 'pulled', updatedAt: remote.updated_at };
    }

    if (hasLocalData(local) && confirm('この端末のデータをSupabaseへ保存しますか？')) {
      await push(local);
      return { type: 'pushed' };
    }
    return { type: 'empty' };
  }

  async function push(data = null) {
    if (!client || !user || restoring) return;
    const payload = data || await DB.exportAll();
    const { error } = await client.from('life_todo_data').upsert({
      user_id: user.id,
      data: payload,
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    onSync(new Date());
  }

  function schedulePush() {
    if (!client || !user || restoring) return;
    clearTimeout(timer);
    timer = setTimeout(() => push().catch(error => onChange(user, error)), 800);
  }

  window.addEventListener('online', () => {
    if (client && user) push().catch(error => onChange(user, error));
  });

  function setChangeHandler(handler) {
    onChange = handler;
  }

  function setSyncHandler(handler) {
    onSync = handler;
  }

  return {
    configure, signUp, signIn, signInWithGoogle, signOut,
    pullOrPushInitial, push, schedulePush, setChangeHandler, setSyncHandler,
    isConfigured: () => isConfigured(),
    isInitialized: () => initialized,
    getUser: () => user
  };
})();