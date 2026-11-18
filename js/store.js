/* Хранилище: пользователи, онтологии, настройки и история тестов.
   Данные лежат в localStorage браузера (сервер не нужен). Если браузер запрещает localStorage,
   программа продолжает работать, но данные живут только до закрытия вкладки. */
(function () {
  var PFX = 'ontotrainer.v1.', mem = {}, persistent = true;
  try { localStorage.setItem(PFX + 'probe', '1'); localStorage.removeItem(PFX + 'probe'); } catch (e) { persistent = false; }

  function read(key, def) {
    try { var v = persistent ? localStorage.getItem(PFX + key) : mem[key]; return v == null ? def : JSON.parse(v); }
    catch (e) { return def; }
  }
  function write(key, val) {
    var s = JSON.stringify(val);
    try { if (persistent) localStorage.setItem(PFX + key, s); else mem[key] = s; return { ok: true }; }
    catch (e) { return { ok: false, error: 'В браузере не хватает места для сохранения. Удалите ненужные онтологии и повторите попытку.' }; }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function same(a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }

  var Store = { persistent: persistent, BUILTIN_ID: 'builtin', SYSTEM_OWNER: 'Система' };

  /* ---------- пользователи ---------- */
  Store.users = function () { return read('users', []); };
  Store.register = function (login, password, password2) {
    login = String(login || '').trim();
    if (login.length < 3) return { ok: false, field: 'login', error: 'Логин слишком короткий: нужно минимум 3 символа.' };
    if (login.length > 30) return { ok: false, field: 'login', error: 'Логин слишком длинный: не более 30 символов.' };
    if (!/^[\p{L}\p{N}_.\- ]+$/u.test(login)) return { ok: false, field: 'login', error: 'В логине допустимы буквы, цифры, пробел и знаки _ . -' };
    if (same(login, Store.SYSTEM_OWNER)) return { ok: false, field: 'login', error: 'Этот логин зарезервирован. Выберите другой.' };
    if (String(password || '').length < 4) return { ok: false, field: 'password', error: 'Пароль слишком короткий: нужно минимум 4 символа.' };
    if (password !== password2) return { ok: false, field: 'password2', error: 'Пароли не совпадают. Введите повтор пароля ещё раз.' };
    var users = Store.users();
    if (users.some(function (u) { return same(u.login, login); })) return { ok: false, field: 'login', error: 'Пользователь с таким логином уже есть. Войдите или выберите другой логин.' };
    var salt = uid();
    users.push({ login: login, salt: salt, hash: hashPassword(password, salt), created: Date.now() });
    var w = write('users', users);
    return w.ok ? { ok: true, login: login } : w;
  };
  Store.login = function (login, password) {
    var u = Store.users().find(function (x) { return same(x.login, login); });
    if (!u || u.hash !== hashPassword(password || '', u.salt)) return { ok: false, error: 'Неверный логин или пароль. Проверьте раскладку клавиатуры и попробуйте ещё раз.' };
    return { ok: true, login: u.login };
  };
  Store.getSession = function () {
    try { var s = sessionStorage.getItem(PFX + 'session'); if (s) return s; } catch (e) {}
    return read('session', null);
  };
  Store.setSession = function (login, remember) {
    try { sessionStorage.removeItem(PFX + 'session'); } catch (e) {}
    if (login == null) { write('session', null); return; }
    if (remember) write('session', login); else { write('session', null); try { sessionStorage.setItem(PFX + 'session', login); } catch (e) { write('session', login); } }
  };

  /* ---------- онтологии ---------- */
  function all() { return read('ontologies', []); }
  Store.builtin = function () {
    return { id: Store.BUILTIN_ID, name: 'Нейронные сети: РБФ (учебная онтология)', owner: Store.SYSTEM_OWNER, visibility: 'public', builtin: true, data: window.DEFAULT_ONTOLOGY };
  };
  Store.visible = function (user) {
    var mine = all().filter(function (o) { return o.visibility === 'public' || same(o.owner, user); });
    return [Store.builtin()].concat(mine);
  };
  Store.get = function (id, user) {
    return Store.visible(user).find(function (o) { return o.id === id; }) || null;
  };
  Store.canEdit = function (o, user) { return !!o && !o.builtin && same(o.owner, user); };
  Store.addOntology = function (user, name, visibility, data) {
    name = String(name || '').trim();
    if (!name) return { ok: false, error: 'Укажите название онтологии.' };
    var list = all();
    if (same(Store.builtin().name, name) || list.some(function (o) { return same(o.owner, user) && same(o.name, name); }))
      return { ok: false, error: 'У вас уже есть онтология с таким названием. Выберите другое название.' };
    var o = { id: uid(), name: name, owner: user, visibility: visibility === 'public' ? 'public' : 'private', updated: Date.now(), data: data };
    list.push(o);
    var w = write('ontologies', list);
    return w.ok ? { ok: true, ontology: o } : w;
  };
  function mutate(id, user, fn) {
    var list = all(), i = list.findIndex(function (o) { return o.id === id; });
    if (i < 0) return { ok: false, error: 'Онтология не найдена — возможно, она уже удалена.' };
    if (!Store.canEdit(list[i], user)) return { ok: false, error: 'Изменять и удалять онтологию может только её владелец.' };
    fn(list, i);
    var w = write('ontologies', list);
    return w.ok ? { ok: true } : w;
  }
  Store.deleteOntology = function (id, user) { return mutate(id, user, function (l, i) { l.splice(i, 1); }); };
  Store.setVisibility = function (id, user, v) { return mutate(id, user, function (l, i) { l[i].visibility = v === 'public' ? 'public' : 'private'; }); };
  Store.rename = function (id, user, name) {
    name = String(name || '').trim();
    if (!name) return { ok: false, error: 'Название не может быть пустым.' };
    return mutate(id, user, function (l, i) { l[i].name = name; });
  };

  /* ---------- настройки и история ---------- */
  Store.getSettings = function (user) {
    var s = read('settings.' + user, null), d = window.Questions.DEFAULTS;
    return Object.assign({}, d, s || {}, { types: Object.assign({}, d.types, (s && s.types) || {}) });
  };
  Store.saveSettings = function (user, s) { return write('settings.' + user, s); };
  Store.getLastOnt = function (user) { return read('last.' + user, null); };
  Store.setLastOnt = function (user, id) { write('last.' + user, id); };
  Store.history = function (user) { return read('history.' + user, []); };
  Store.addResult = function (user, r) { var h = Store.history(user); h.unshift(r); return write('history.' + user, h.slice(0, 200)); };
  Store.clearHistory = function (user) { return write('history.' + user, []); };

  window.Store = Store;
})();
