/* Интерфейс и логика приложения «ОнтоТренер». */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG, S = window.Store, O = window.Ontology, Q = window.Questions;
  var $ = function (id) { return document.getElementById(id); };
  var state = { user: null, ontId: null, meta: null, onto: null, view: 'auth', settings: null, sess: null,
                graph: null, authTab: 'login', dictCat: 'all', dictQ: '' };

  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, a, b, c) { var m = n % 100, k = n % 10; return (m > 10 && m < 20) ? c : k === 1 ? a : (k >= 2 && k <= 4) ? b : c; }
  function fmtDate(t) { return new Date(t).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }); }
  function catBadge(cat) { var c = Graph.CAT_COLORS[cat] || '#64748b'; return '<span class="badge catbadge" style="color:' + c + '">' + h(cat) + '</span>'; }
  var toastTimer;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200); }

  /* ================= модальные окна ================= */
  function modal(html, onClose) {
    var root = $('modal-root'), prev = document.activeElement;
    root.innerHTML = '<div class="overlay"><div class="modal" role="dialog" aria-modal="true">' + html + '</div></div>';
    var box = root.querySelector('.modal');
    function close(v) { root.innerHTML = ''; document.removeEventListener('keydown', key, true); if (prev && prev.focus) prev.focus(); if (onClose) onClose(v); }
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      if (e.key === 'Tab') {
        var f = box.querySelectorAll('button, input, select, a[href]'); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', key, true);
    root.querySelector('.overlay').addEventListener('mousedown', function (e) { if (e.target.classList.contains('overlay')) close(null); });
    var af = box.querySelector('[data-autofocus]') || box.querySelector('button'); if (af) af.focus();
    return { box: box, close: close };
  }
  function confirmBox(o) {
    return new Promise(function (res) {
      var m = modal('<h2>' + h(o.title) + '</h2><p>' + h(o.text) + '</p><div class="row"><button class="btn" data-autofocus data-m="no">' + h(o.cancel || 'Отмена') +
        '</button><button class="btn ' + (o.danger ? 'danger solid' : 'primary') + '" data-m="yes">' + h(o.ok || 'Да') + '</button></div>', function (v) { res(v === true); });
      m.box.addEventListener('click', function (e) { var b = e.target.closest('[data-m]'); if (b) m.close(b.dataset.m === 'yes'); });
    });
  }
  function promptBox(o) {
    return new Promise(function (res) {
      var m = modal('<h2>' + h(o.title) + '</h2><form><div class="field"><label for="pb-in">' + h(o.label) + '</label><input type="text" id="pb-in" data-autofocus maxlength="80" value="' + h(o.value || '') + '"></div><div id="pb-err"></div>' +
        '<div class="row"><button type="button" class="btn" data-m="no">Отмена</button><button class="btn primary" type="submit">' + h(o.ok || 'Сохранить') + '</button></div></form>', function (v) { res(typeof v === 'string' ? v : null); });
      m.box.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); var v = m.box.querySelector('#pb-in').value.trim(); if (!v) { m.box.querySelector('#pb-err').innerHTML = '<div class="err">Поле не может быть пустым.</div>'; return; } m.close(v); });
      m.box.querySelector('[data-m=no]').addEventListener('click', function () { m.close(null); });
    });
  }
  function aboutBox() {
    var m = modal('<h2>О программе «' + h(CFG.name) + '»</h2><dl class="about"><dt>Цель</dt><dd>' + h(CFG.purpose) + '</dd><dt>Категория</dt><dd>' + h(CFG.category) +
      '</dd><dt>Автор</dt><dd>' + h(CFG.author) + '</dd><dt>Год</dt><dd>' + h(CFG.year) + '</dd><dt>Версия</dt><dd>' + h(CFG.version) +
      '</dd><dt>Формат данных</dt><dd>Онтологии в формате .ont (JSON); определения понятий хранятся в атрибутах вершин: <code>"definition": "…"</code></dd></dl>' +
      '<div class="row"><button class="btn primary" data-autofocus data-m="x">Закрыть</button></div>');
    m.box.addEventListener('click', function (e) { if (e.target.closest('[data-m]')) m.close(); });
  }

  /* ================= состояние ================= */
  function sessionRunning() { return state.sess && state.sess.running; }
  window.addEventListener('beforeunload', function (e) { if (sessionRunning()) { e.preventDefault(); e.returnValue = ''; } });

  function setOntology(id) {
    var meta = S.get(id, state.user) || S.builtin();
    var v = O.validate(JSON.parse(JSON.stringify(meta.data)));
    if (!v.ok) { toast('Не удалось открыть онтологию: ' + v.error); meta = S.builtin(); v = O.validate(JSON.parse(JSON.stringify(meta.data))); }
    state.meta = meta; state.ontId = meta.id; state.onto = new O.Onto(v.data);
    S.setLastOnt(state.user, meta.id);
  }
  function effSettings() {
    var s = Object.assign({}, state.settings), cats = state.onto.categories;
    if (s.cats) { var c = s.cats.filter(function (x) { return cats.indexOf(x) >= 0; }); s.cats = c.length ? c : null; }
    return s;
  }
  function settingsText() {
    var s = effSettings(), nt = Object.keys(s.types).filter(function (k) { return s.types[k]; }).length;
    return s.count + ' ' + plural(s.count, 'вопрос', 'вопроса', 'вопросов') + ' · глубина ' + s.depth + ' · типов вопросов: ' + nt + ' из 4 · категории: ' + (s.cats ? s.cats.join(', ') : 'все');
  }

  async function go(view) {
    if (view === state.view && !(state.sess && state.sess.finished)) { return; }
    if (sessionRunning()) {
      var ok = await confirmBox({ title: 'Прервать сеанс?', text: 'Вы не закончили ' + (state.sess.mode === 'test' ? 'тест' : 'обучение') + '. Если уйти сейчас, ответы будут потеряны' + (state.sess.mode === 'test' ? ' и результат не сохранится' : '') + '.', ok: 'Прервать и уйти', cancel: 'Остаться', danger: true });
      if (!ok) return;
    }
    state.sess = null; state.view = view; render(true);
  }

  /* ================= каркас ================= */
  function render(focus) {
    if (state.graph) { state.graph.destroy(); state.graph = null; }
    renderTop(); renderBanner(); renderMain(); renderStatus();
    if (focus) { window.scrollTo(0, 0); $('main').focus({ preventScroll: true }); }
  }
  var NAV = [['library', 'Онтологии', 'Выбрать или загрузить онтологию'], ['graph', 'Граф', 'Графический просмотр онтологии'],
             ['dict', 'Словарь', 'Просмотр определений понятий'], ['learn', 'Обучение', 'Режим обучения: вопросы с подсказками'],
             ['test', 'Тест', 'Режим тестирования со статистикой'], ['settings', 'Настройки', 'Число вопросов, глубина поиска, категории'],
             ['profile', 'Профиль', 'История тестов и выход']];
  function renderTop() {
    var t = '<button class="brand" data-act="home" title="На главную"><span class="logo" aria-hidden="true">О</span>' + h(CFG.name) + '</button>';
    if (state.user) {
      t += '<nav class="nav" aria-label="Разделы">' + NAV.map(function (n) { return '<button data-act="nav" data-v="' + n[0] + '" title="' + h(n[2]) + '"' + (state.view === n[0] ? ' aria-current="page"' : '') + '>' + n[1] + '</button>'; }).join('') + '</nav>';
      t += '<div class="userbox"><span class="small muted" title="Вы вошли как">' + h(state.user) + '</span><button class="btn small" data-act="about">О программе</button><button class="btn small" data-act="logout" title="Выйти из аккаунта">Выйти</button></div>';
    } else t += '<div class="nav"></div><div class="userbox"><button class="btn small" data-act="about">О программе</button></div>';
    $('topbar').innerHTML = t;
  }
  function renderBanner() {
    var v = state.view, s = state.sess, t = '';
    if (v === 'auth') t = '<b>Вход.</b> Войдите или зарегистрируйтесь, чтобы работать с онтологиями. Данные хранятся только в вашем браузере.';
    else if (v === 'library') t = '<b>Шаг 1.</b> Выберите онтологию кнопкой «Использовать» или загрузите свой файл .ont. Затем откройте «Словарь», «Обучение» или «Тест».';
    else if (v === 'graph') t = '<b>Граф.</b> Нажмите на понятие — справа появятся его определение и связи. Колесо мыши — масштаб, перетаскивание — сдвиг.';
    else if (v === 'dict') t = '<b>Определения.</b> Найдите понятие через поиск или выберите категорию. Чтобы проверить себя, перейдите в «Обучение».';
    else if (v === 'settings') t = '<b>Настройки.</b> Измените число вопросов, глубину поиска, типы вопросов и категории. Изменения сохраняются сразу.';
    else if (v === 'profile') t = '<b>Профиль.</b> Здесь хранится история ваших тестов. Выйти из аккаунта можно кнопкой справа сверху.';
    else if (v === 'learn' || v === 'test') {
      var isT = v === 'test';
      if (!s) t = '<b>' + (isT ? 'Тест.' : 'Обучение.') + '</b> ' + (isT ? 'Вопросы без подсказок; результат сохранится в профиле. Нажмите «Начать тест».' : 'Вопросы с подсказками и мгновенной проверкой. Нажмите «Начать обучение».');
      else if (s.finished) t = '<b>Сеанс завершён.</b> Просмотрите результаты ниже. Чтобы начать заново, нажмите «Пройти ещё раз».';
      else t = '<b>Вопрос ' + (s.i + 1) + ' из ' + s.qs.length + '.</b> ' + (isT
        ? 'Выберите ответ и нажмите «Далее». Вернуться и изменить ответ — «← Назад». Выйти — «Прервать», закончить раньше — «Завершить досрочно».'
        : 'Выберите вариант и нажмите «Проверить». Нужна помощь — «Подсказка». Шаг назад — «← Назад», выйти — «Прервать».');
    }
    $('banner').innerHTML = t;
  }
  function renderStatus() {
    var segs = [];
    if (state.user) segs.push('<span title="Текущий пользователь">Пользователь: <b>' + h(state.user) + '</b></span>');
    if (state.onto) segs.push('<span title="Онтология, с которой вы сейчас работаете">Онтология: <b>' + h(state.meta.name) + '</b> (' + state.onto.list.length + ' ' + plural(state.onto.list.length, 'понятие', 'понятия', 'понятий') + ', определения у ' + state.onto.defCoverage() + '%)</span>');
    var mode = { library: 'выбор онтологии', graph: 'просмотр графа', dict: 'просмотр определений', learn: 'обучение', test: 'тестирование', settings: 'настройки', profile: 'профиль', auth: 'вход' }[state.view];
    var s = state.sess; if (s && !s.finished) mode += ' (вопрос ' + (s.i + 1) + ' из ' + s.qs.length + ')'; else if (s && s.finished) mode += ' (результаты)';
    segs.push('<span title="Текущий режим работы">Режим: <b>' + mode + '</b></span>');
    if (state.settings && state.onto) segs.push('<span title="Параметры вопросов (меняются в разделе «Настройки»)">Настройки: ' + h(settingsText()) + '</span>');
    if (!S.persistent) segs.push('<span class="mark-bad" title="Браузер запретил хранение данных">Данные не сохраняются между сеансами</span>');
    $('statusbar').innerHTML = segs.join('<span class="sep">|</span>');
  }
  function renderMain() {
    var v = state.view, m = $('main');
    m.classList.toggle('wide', v === 'graph');
    if (v === 'auth') m.innerHTML = authView();
    else if (v === 'library') m.innerHTML = libraryView();
    else if (v === 'graph') { m.innerHTML = graphView(); initGraph(); }
    else if (v === 'dict') m.innerHTML = dictView();
    else if (v === 'learn' || v === 'test') m.innerHTML = quizView(v);
    else if (v === 'settings') { m.innerHTML = settingsView(); }
    else if (v === 'profile') m.innerHTML = profileView();
  }

  /* ================= вход ================= */
  function authView() {
    var reg = state.authTab === 'register';
    return '<div class="auth"><div class="card"><h1>' + (reg ? 'Регистрация' : 'Вход в ' + h(CFG.name)) + '</h1>' +
      '<p class="muted">' + h(CFG.purpose) + '</p>' +
      '<div class="tabs" role="tablist"><button role="tab" data-act="authtab" data-t="login" aria-selected="' + !reg + '">Вход</button><button role="tab" data-act="authtab" data-t="register" aria-selected="' + reg + '">Регистрация</button></div>' +
      '<form id="auth-form" novalidate>' +
      '<div class="field"><label for="a-login">Логин</label><input type="text" id="a-login" autocomplete="username" maxlength="30" autofocus></div>' +
      '<div class="field"><label for="a-pass">Пароль</label><input type="password" id="a-pass" autocomplete="' + (reg ? 'new-password' : 'current-password') + '"></div>' +
      (reg ? '<div class="field"><label for="a-pass2">Повторите пароль</label><input type="password" id="a-pass2" autocomplete="new-password"></div>' : '') +
      '<label class="check"><input type="checkbox" id="a-show"> Показать пароль</label>' +
      (reg ? '' : '<label class="check"><input type="checkbox" id="a-rem"> Запомнить меня на этом компьютере</label>') +
      '<div id="auth-err" aria-live="assertive"></div>' +
      '<button class="btn primary" style="width:100%;margin-top:8px" type="submit">' + (reg ? 'Создать аккаунт' : 'Войти') + '</button></form>' +
      '<p class="hint" style="margin-top:14px">Аккаунты и онтологии хранятся в этом браузере и не отправляются на сервер.</p></div></div>';
  }
  function authSubmit() {
    var login = $('a-login').value, pass = $('a-pass').value, reg = state.authTab === 'register', r;
    if (!login.trim() || !pass) { $('auth-err').innerHTML = '<div class="err">Введите логин и пароль.</div>'; return; }
    if (reg) { r = S.register(login, pass, $('a-pass2').value); if (r.ok) { S.setSession(r.login, true); } }
    else { r = S.login(login, pass); if (r.ok) S.setSession(r.login, $('a-rem').checked); }
    if (!r.ok) { $('auth-err').innerHTML = '<div class="err">' + h(r.error) + '</div>'; if (r.field && $('a-' + (r.field === 'password' ? 'pass' : r.field === 'password2' ? 'pass2' : r.field))) $('a-' + (r.field === 'password' ? 'pass' : r.field === 'password2' ? 'pass2' : r.field)).focus(); return; }
    enter(r.login); toast(reg ? 'Аккаунт создан. Добро пожаловать!' : 'С возвращением, ' + r.login + '!');
  }
  function enter(login) {
    state.user = login; state.settings = S.getSettings(login); state.sess = null;
    setOntology(S.getLastOnt(login) || S.BUILTIN_ID); state.view = 'library'; render(true);
  }
  async function logout() {
    if (sessionRunning() && !(await confirmBox({ title: 'Выйти из аккаунта?', text: 'Сеанс не завершён — ответы будут потеряны.', ok: 'Выйти', danger: true }))) return;
    S.setSession(null); state.user = null; state.sess = null; state.meta = state.onto = null; state.view = 'auth'; state.authTab = 'login'; render(true);
  }

  /* ================= онтологии ================= */
  function libraryView() {
    var list = S.visible(state.user);
    var cards = list.map(function (o) {
      var st; try { var v = O.validate(JSON.parse(JSON.stringify(o.data))); var on = new O.Onto(v.data); st = { n: on.list.length, r: on.rels.length, d: on.defCoverage() }; } catch (e) { st = { n: '?', r: '?', d: '?' }; }
      var cur = o.id === state.ontId, mine = S.canEdit(o, state.user);
      var vis = o.builtin ? '<span class="badge sys">Встроенная</span>' : o.visibility === 'public' ? '<span class="badge pub" title="Видна всем пользователям, изменять может только владелец">Общедоступная</span>' : '<span class="badge priv" title="Видна только владельцу">Личная</span>';
      return '<article class="card ont-card' + (cur ? ' current' : '') + '"><h3>' + h(o.name) + '</h3><div>' + vis + (cur ? ' <span class="badge sys">Выбрана</span>' : '') + '</div>' +
        '<div class="meta"><span>Владелец: ' + h(o.owner) + '</span><span>Понятий: ' + st.n + '</span><span>Связей: ' + st.r + '</span><span>Определения: ' + st.d + '%</span></div>' +
        '<div class="actions"><button class="btn primary small" data-act="useont" data-id="' + h(o.id) + '"' + (cur ? ' disabled' : '') + '>' + (cur ? 'Используется' : 'Использовать') + '</button>' +
        '<button class="btn small" data-act="dlont" data-id="' + h(o.id) + '" title="Скачать файл .ont">Скачать .ont</button>' +
        (mine ? '<button class="btn small" data-act="renont" data-id="' + h(o.id) + '">Переименовать</button><button class="btn small" data-act="visont" data-id="' + h(o.id) + '">' + (o.visibility === 'public' ? 'Сделать личной' : 'Сделать общедоступной') + '</button><button class="btn small danger" data-act="delont" data-id="' + h(o.id) + '">Удалить</button>' : '') + '</div>' +
        (!mine ? '<p class="hint">' + (o.builtin ? 'Встроенная онтология: только для чтения.' : 'Изменять и удалять может только владелец (' + h(o.owner) + ').') + '</p>' : '') + '</article>';
    }).join('');
    return '<h1>Онтологии</h1><p class="muted">Здесь все онтологии, доступные вам: встроенная, общедоступные и ваши личные.</p>' +
      '<section class="card"><h2>Загрузить онтологию</h2><form id="up-form"><div class="grid two"><div><div class="field"><label for="up-file">Файл онтологии (.ont)</label><input type="file" id="up-file" accept=".ont,.json,application/json"><div class="hint">Подойдёт любая онтология в формате .ont, построенная по общей модели (корневые понятия: модель, метод, задача, ресурс).</div></div>' +
      '<div class="field"><label for="up-name">Название в списке</label><input type="text" id="up-name" maxlength="80" placeholder="Например: Нейронные сети (моя)"></div></div>' +
      '<div class="field"><label>Кто увидит онтологию</label><label class="check"><input type="radio" name="vis" value="private" checked> <span><b>Личная</b> — только я</span></label><label class="check"><input type="radio" name="vis" value="public"> <span><b>Общедоступная</b> — все зарегистрированные пользователи смогут её открыть, а изменить или удалить — только я</span></label></div></div>' +
      '<div id="up-msg" aria-live="polite"></div><button class="btn primary" type="submit">Загрузить</button></form></section>' +
      '<h2 style="margin-top:26px">Доступные онтологии (' + list.length + ')</h2><div class="grid two">' + cards + '</div>';
  }
  function readFileText(file) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(); }; r.readAsText(file, 'utf-8'); }); }
  async function upload() {
    var f = $('up-file').files[0], msg = $('up-msg'), name = $('up-name').value.trim();
    var vis = document.querySelector('input[name=vis]:checked').value;
    function fail(t) { msg.innerHTML = '<div class="err">' + h(t) + '</div>'; }
    if (!f) return fail('Сначала выберите файл онтологии (.ont).');
    if (f.size > 4 * 1024 * 1024) return fail('Файл слишком большой (больше 4 МБ). Проверьте, что это именно онтология.');
    if (!name) name = f.name.replace(/\.(ont|json)$/i, '');
    var text; try { text = await readFileText(f); } catch (e) { return fail('Не удалось прочитать файл. Попробуйте выбрать его ещё раз.'); }
    var v = O.validate(text); if (!v.ok) return fail(v.error);
    var r = S.addOntology(state.user, name, vis, v.data); if (!r.ok) return fail(r.error);
    setOntology(r.ontology.id);
    var on = state.onto, extra = [];
    if (!on.withDef.length) extra.push('В онтологии нет определений в атрибутах «definition» — режимы обучения и теста будут недоступны.');
    else if (on.withDef.length < on.list.length) extra.push('Определения есть не у всех понятий (' + on.withDef.length + ' из ' + on.list.length + ').');
    v.warnings.forEach(function (w) { extra.push(w); });
    render(); toast('Онтология «' + name + '» загружена и выбрана');
    if (extra.length) $('up-msg').innerHTML = extra.map(function (t) { return '<div class="warnmsg">' + h(t) + '</div>'; }).join('');
  }
  function download(id) {
    var o = S.get(id, state.user); if (!o) return;
    var blob = new Blob([JSON.stringify(o.data, null, 4)], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = o.name.replace(/[\\/:*?"<>|]+/g, '_') + '.ont'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ================= граф ================= */
  function graphView() {
    var on = state.onto, types = on.relTypes();
    var cats = on.categories.map(function (c) { return '<span><i class="dot" style="background:' + Graph.CAT_COLORS[c] + '"></i>' + h(c) + '</span>'; }).join('');
    var rels = types.map(function (t) { var st = Graph.relStyle(t, types); return '<span><svg width="34" height="10" aria-hidden="true"><line x1="0" y1="5" x2="34" y2="5" stroke="' + st.color + '" stroke-width="2.5" stroke-dasharray="' + st.dash + '"/></svg> ' + h(O.REL_SHORT[t] || t) + '</span>'; }).join('');
    return '<div class="row between"><h1>Граф онтологии</h1></div><div class="row" style="margin-bottom:12px">' +
      '<div style="flex:1;min-width:200px"><input type="search" id="g-search" placeholder="Найти понятие…" aria-label="Поиск понятия на графе"></div>' +
      '<button class="btn" data-act="gzoom" data-d="in" title="Приблизить" aria-label="Приблизить">＋</button><button class="btn" data-act="gzoom" data-d="out" title="Отдалить" aria-label="Отдалить">－</button><button class="btn" data-act="gzoom" data-d="fit" title="Показать весь граф">Весь граф</button>' +
      '<label class="check" style="padding:0"><input type="checkbox" id="g-labels" checked> Подписи связей</label></div>' +
      '<div class="graph-wrap"><div style="min-width:0"><div class="graph-box" id="graph-box"></div><div class="legend"><b>Категории:</b>' + cats + '</div><div class="legend"><b>Связи (стрелка от частного к общему):</b>' + rels + '</div></div>' +
      '<aside class="card side" id="side" aria-live="polite"></aside></div>';
  }
  function sideHtml(id) {
    var on = state.onto;
    if (!id) return '<h3>Понятие не выбрано</h3><p class="muted">Нажмите на любое понятие на графе, чтобы прочитать его определение и увидеть связи. Всего понятий: ' + on.list.length + ', связей: ' + on.rels.length + '.</p>';
    var n = on.nodes[id], rel = on.describe(id);
    return '<h3>' + h(n.name) + '</h3><div>' + catBadge(n.cat) + '</div><h3 style="margin-top:14px">Определение</h3>' +
      (n.def ? '<p>' + h(n.def) + '</p>' : '<p class="muted">Для этого понятия определение в онтологии не задано.</p>') +
      '<h3>Связи</h3>' + (rel.length ? '<ul class="rel-list">' + rel.map(function (r) { return '<li>' + (r.dir === 'out' ? 'это понятие ' + h(r.text) + ' ' : h(r.text) + ' ') + '<button class="linkbtn" data-act="gsel" data-id="' + h(r.id) + '">«' + h(r.name) + '»</button></li>'; }).join('') + '</ul>' : '<p class="muted">Связей нет.</p>');
  }
  function initGraph() {
    var side = $('side'); side.innerHTML = sideHtml(null);
    state.graph = Graph.render($('graph-box'), state.onto, { onSelect: function (id) { side.innerHTML = sideHtml(id); } });
  }

  /* ================= словарь ================= */
  function dictList() {
    var on = state.onto, q = O.norm(state.dictQ), cat = state.dictCat;
    var items = on.list.filter(function (n) { return (cat === 'all' || n.cat === cat) && (!q || O.norm(n.name).indexOf(q) >= 0 || O.norm(n.def).indexOf(q) >= 0); })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
    if (!items.length) return '<div class="card"><p>Ничего не найдено. Измените запрос или выберите «Все категории».</p></div>';
    return '<p class="muted small">Показано понятий: ' + items.length + ' из ' + on.list.length + '</p>' + items.map(function (n) {
      var rel = on.describe(n.id);
      return '<article class="card term"><h3>' + h(n.name) + catBadge(n.cat) + '</h3>' + (n.def ? '<p class="def">' + h(n.def) + '</p>' : '<p class="muted">Определение не задано.</p>') +
        (rel.length ? '<details><summary class="small muted" style="cursor:pointer">Связи (' + rel.length + ')</summary><ul class="rel-list">' + rel.map(function (r) { return '<li>' + (r.dir === 'out' ? 'это понятие ' + h(r.text) + ' ' : h(r.text) + ' ') + '«' + h(r.name) + '»</li>'; }).join('') + '</ul></details>' : '') + '</article>';
    }).join('<div style="height:10px"></div>');
  }
  function dictView() {
    var on = state.onto;
    var chips = ['all'].concat(on.categories).map(function (c) { return '<button class="chip" data-act="dcat" data-c="' + h(c) + '" aria-pressed="' + (state.dictCat === c) + '">' + (c === 'all' ? 'Все категории' : h(c)) + '</button>'; }).join('');
    return '<h1>Словарь определений</h1><p class="muted">Определения берутся из атрибута <code>definition</code> вершин онтологии «' + h(state.meta.name) + '».</p>' +
      '<input type="search" id="d-search" placeholder="Поиск по названию или тексту определения…" aria-label="Поиск" value="' + h(state.dictQ) + '"><div class="chips" role="group" aria-label="Фильтр по категории">' + chips + '</div><div id="d-list">' + dictList() + '</div>';
  }

  /* ================= обучение и тест ================= */
  function quizView(mode) {
    var s = state.sess;
    if (!s) return startView(mode);
    if (s.finished) return resultView();
    return questionView();
  }
  function startView(mode) {
    var isT = mode === 'test', on = state.onto, st = effSettings(), avail = Q.count(on, st);
    var title = isT ? 'Тестирование' : 'Обучение';
    var intro = isT
      ? 'Вы отвечаете на вопросы без подсказок. Правильность ответов не показывается до конца теста. В конце вы увидите статистику: число правильных ответов, результат по категориям и разбор ошибок. Результат сохранится в профиле.'
      : 'Вы отвечаете на вопросы и сразу видите, верно ли ответили. В любой момент можно открыть подсказку, а после проверки — прочитать правильное определение понятия. Результаты обучения в профиле не сохраняются.';
    var problems = '';
    if (!on.withDef.length) problems = '<div class="err">В этой онтологии нет определений (атрибут «definition»), поэтому вопросы составить нельзя. Выберите другую онтологию в разделе «Онтологии».</div>';
    else if (avail === 0) problems = '<div class="err">При текущих настройках нет ни одного подходящего вопроса. Включите больше типов вопросов или категорий в разделе «Настройки».</div>';
    else if (avail < st.count) problems = '<div class="warnmsg">Подходящих вопросов только ' + avail + ', а в настройках указано ' + st.count + '. Будет задано ' + avail + '. Расширить набор можно в «Настройках».</div>';
    return '<div class="quiz"><h1>' + title + '</h1><div class="card"><p>' + intro + '</p><h3>Текущие параметры</h3><ul>' +
      '<li>Онтология: <b>' + h(state.meta.name) + '</b></li><li>Число вопросов: <b>' + Math.min(st.count, avail) + '</b> (доступно: ' + avail + ')</li><li>Глубина поиска по связям: <b>' + st.depth + '</b></li>' +
      '<li>Типы вопросов: ' + Object.keys(Q.TYPES).filter(function (k) { return st.types[k]; }).map(function (k) { return Q.TYPES[k]; }).join('; ') + '</li><li>Категории понятий: ' + (st.cats ? h(st.cats.join(', ')) : 'все') + '</li></ul>' + problems +
      '<div class="row" style="margin-top:14px"><button class="btn primary" data-act="start" data-m="' + mode + '"' + (avail === 0 ? ' disabled' : '') + '>' + (isT ? 'Начать тест' : 'Начать обучение') + '</button><button class="btn" data-act="nav" data-v="settings">Изменить настройки</button></div></div></div>';
  }
  function startSession(mode) {
    var qs = Q.generate(state.onto, effSettings());
    if (!qs.length) { toast('Не удалось составить вопросы. Проверьте настройки.'); return; }
    var n = qs.length;
    state.sess = { mode: mode, qs: qs, i: 0, ans: new Array(n).fill(null), checked: new Array(n).fill(false), hint: new Array(n).fill(false), running: true, finished: false, started: Date.now() };
    render(true);
  }
  function questionView() {
    var s = state.sess, q = s.qs[s.i], isT = s.mode === 'test', n = s.qs.length, chk = s.checked[s.i], a = s.ans[s.i];
    var pct = Math.round(100 * (s.i + (chk || (isT && a != null) ? 1 : 0)) / n);
    var opts = q.options.map(function (t, k) {
      var cls = 'opt';
      if (!isT && chk) cls += k === q.correct ? ' right' : (k === a ? ' wrong' : '');
      else if (a === k) cls += ' chosen';
      var mark = !isT && chk ? (k === q.correct ? ' <span class="mark-ok">✓ верно</span>' : (k === a ? ' <span class="mark-bad">✗ неверно</span>' : '')) : '';
      return '<button class="' + cls + '" data-act="opt" data-k="' + k + '" aria-pressed="' + (a === k) + '"' + (!isT && chk ? ' disabled' : '') + '><span class="k">' + (k + 1) + '</span><span>' + h(t) + mark + '</span></button>';
    }).join('');
    var fb = '';
    if (!isT && s.hint[s.i] && !chk) fb += '<div class="feedback hint"><b>Подсказка.</b> ' + h(q.hint) + '</div>';
    if (!isT && chk) {
      var ok = a === q.correct;
      fb += '<div class="feedback ' + (ok ? 'ok' : 'bad') + '" role="status"><b>' + (ok ? 'Верно!' : 'Неверно.') + '</b> ' + (ok ? '' : 'Правильный ответ: «' + h(q.options[q.correct]) + '». ') +
        (q.explDef ? '<br>Определение понятия «' + h(q.explName) + '»: ' + h(q.explDef) : '') + '</div>';
    }
    var last = s.i === n - 1, primary;
    if (isT) primary = '<button class="btn primary" data-act="' + (last ? 'finish' : 'next') + '"' + (a == null ? ' disabled title="Сначала выберите ответ"' : '') + '>' + (last ? 'Завершить тест' : 'Далее →') + '</button>';
    else if (!chk) primary = '<button class="btn primary" data-act="check"' + (a == null ? ' disabled title="Сначала выберите вариант ответа"' : '') + '>Проверить</button>';
    else primary = '<button class="btn primary" data-act="' + (last ? 'finish' : 'next') + '">' + (last ? 'Завершить' : 'Далее →') + '</button>';
    var navq = s.qs.map(function (x, k) { var d = isT ? s.ans[k] != null : s.checked[k]; return '<button data-act="goq" data-k="' + k + '" class="' + (d ? 'done ' : '') + (k === s.i ? 'cur' : '') + '" aria-label="Вопрос ' + (k + 1) + (d ? ', отвечен' : '') + '"' + (k === s.i ? ' aria-current="step"' : '') + '>' + (k + 1) + '</button>'; }).join('');
    return '<div class="quiz"><div class="row between"><div class="qtype">' + (isT ? 'Тест' : 'Обучение') + ' · вопрос ' + (s.i + 1) + ' из ' + n + ' · ' + h(q.typeLabel) + '</div>' +
      '<div class="row">' + (isT ? '<button class="btn small" data-act="earlyfinish" title="Показать результат по уже данным ответам">Завершить досрочно</button>' : '') + '<button class="btn small danger" data-act="abort" title="Выйти из сеанса без результата">Прервать</button></div></div>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '<div class="card"><div class="qtext">' + h(q.text) + '</div><div class="opts" role="group" aria-label="Варианты ответа">' + opts + '</div>' + fb +
      '<div class="qactions"><div class="row"><button class="btn" data-act="prev"' + (s.i === 0 ? ' disabled' : '') + '>← Назад</button>' + (!isT && !chk ? '<button class="btn" data-act="hint">' + (s.hint[s.i] ? 'Подсказка показана' : 'Подсказка') + '</button>' : '') + '</div>' + primary + '</div></div>' +
      '<div class="navq" role="group" aria-label="Переход к вопросу">' + navq + '</div><p class="hint">Клавиши 1–4 выбирают вариант ответа.</p></div>';
  }
  function compute(s) {
    var res = { total: s.qs.length, correct: 0, answered: 0, hints: s.hint.filter(Boolean).length, byCat: {}, byType: {}, items: [] };
    s.qs.forEach(function (q, i) {
      var ok = s.ans[i] === q.correct; if (s.ans[i] != null) res.answered++; if (ok) res.correct++;
      [['byCat', q.cat], ['byType', q.typeLabel]].forEach(function (p) { var m = res[p[0]], k = p[1]; m[k] = m[k] || { t: 0, c: 0 }; m[k].t++; if (ok) m[k].c++; });
      res.items.push({ q: q, ok: ok, ans: s.ans[i] });
    });
    res.pct = Math.round(100 * res.correct / res.total); return res;
  }
  function finish(early) {
    var s = state.sess;
    s.running = false; s.finished = true; s.result = compute(s);
    if (s.mode === 'test') {
      var r = s.result, w = S.addResult(state.user, { date: Date.now(), ontId: state.ontId, ontName: state.meta.name, total: r.total, correct: r.correct, answered: r.answered, pct: r.pct, settings: settingsText(), early: !!early });
      s.saved = w.ok;
    }
    render(true);
  }
  function statTable(map, head) {
    var keys = Object.keys(map); if (!keys.length) return '';
    return '<table><thead><tr><th>' + head + '</th><th>Верно</th><th>Всего</th><th>%</th></tr></thead><tbody>' + keys.map(function (k) { var m = map[k]; return '<tr><td>' + h(k) + '</td><td>' + m.c + '</td><td>' + m.t + '</td><td>' + Math.round(100 * m.c / m.t) + '%</td></tr>'; }).join('') + '</tbody></table>';
  }
  function resultView() {
    var s = state.sess, r = s.result, isT = s.mode === 'test';
    var msg = r.pct >= 90 ? 'Отличный результат!' : r.pct >= 75 ? 'Хорошо.' : r.pct >= 50 ? 'Неплохо, но есть что повторить.' : 'Стоит повторить материал в режиме обучения и словаре.';
    var items = r.items.map(function (it, i) {
      return '<details class="rev"><summary><span class="' + (it.ok ? 'mark-ok' : 'mark-bad') + '">' + (it.ok ? '✓' : '✗') + '</span> Вопрос ' + (i + 1) + '. ' + h(it.q.text.length > 90 ? it.q.text.slice(0, 90) + '…' : it.q.text) + '</summary>' +
        '<p>' + h(it.q.text) + '</p><p>Ваш ответ: ' + (it.ans == null ? '<i>нет ответа</i>' : '«' + h(it.q.options[it.ans]) + '»') + '</p>' + (it.ok ? '' : '<p>Правильный ответ: <b>«' + h(it.q.options[it.q.correct]) + '»</b></p>') +
        (it.q.explDef ? '<p class="muted">Определение понятия «' + h(it.q.explName) + '»: ' + h(it.q.explDef) + '</p>' : '') + '</details>';
    }).join('');
    return '<div class="quiz"><h1>' + (isT ? 'Результаты теста' : 'Итоги обучения') + '</h1><div class="card"><div class="score">' + r.correct + ' из ' + r.total + ' · ' + r.pct + '%</div><p>' + msg + '</p>' +
      '<p class="muted small">Отвечено: ' + r.answered + ' из ' + r.total + (isT ? '' : ' · использовано подсказок: ' + r.hints) + ' · время: ' + Math.max(1, Math.round((Date.now() - s.started) / 60000)) + ' мин.' + (isT ? (s.saved ? ' Результат сохранён в профиле.' : ' Не удалось сохранить результат в профиле.') : '') + '</p></div>' +
      '<div class="card"><h2>Статистика</h2><div class="tablewrap">' + statTable(r.byCat, 'По категориям понятий') + '</div><div class="tablewrap" style="margin-top:14px">' + statTable(r.byType, 'По типам вопросов') + '</div></div>' +
      '<div class="card"><h2>Разбор вопросов</h2>' + items + '</div>' +
      '<div class="row" style="margin-top:16px"><button class="btn primary" data-act="restart">Пройти ещё раз</button>' + (isT ? '<button class="btn" data-act="nav" data-v="learn">Перейти к обучению</button>' : '<button class="btn" data-act="nav" data-v="test">Пройти тест</button>') + '<button class="btn" data-act="nav" data-v="dict">Открыть словарь</button></div></div>';
  }
  function pickOpt(k) {
    var s = state.sess; if (!s || s.finished) return;
    if (s.mode === 'learn' && s.checked[s.i]) return;
    if (k >= s.qs[s.i].options.length) return;
    s.ans[s.i] = k; render();
  }

  /* ================= настройки ================= */
  function settingsView() {
    var st = state.settings, on = state.onto;
    var types = Object.keys(Q.TYPES).map(function (k) { return '<label class="check"><input type="checkbox" data-st="type" data-k="' + k + '"' + (st.types[k] ? ' checked' : '') + '> <span>' + Q.TYPES[k] + '</span></label>'; }).join('');
    var eff = effSettings();
    var cats = on.categories.map(function (c) { var on_ = !eff.cats || eff.cats.indexOf(c) >= 0; return '<label class="check"><input type="checkbox" data-st="cat" data-k="' + h(c) + '"' + (on_ ? ' checked' : '') + '> <span>' + h(c) + '</span></label>'; }).join('');
    return '<div class="quiz" style="max-width:760px"><h1>Настройки</h1><div class="card"><div class="field"><label for="s-count">Число вопросов в сеансе: <span id="s-count-v">' + st.count + '</span></label><input type="range" id="s-count" min="3" max="50" value="' + st.count + '"><div class="hint">От 3 до 50. Если подходящих вопросов меньше, будет задано сколько есть.</div></div>' +
      '<div class="field"><label for="s-depth">Глубина поиска по связям: <span id="s-depth-v">' + st.depth + '</span></label><input type="range" id="s-depth" min="1" max="4" value="' + st.depth + '"><div class="hint">Насколько далеко вверх и вниз по иерархии («является», «пример») программа ищет правильный ответ в вопросах о связях. 1 — только ближайшие понятия.</div></div>' +
      '<fieldset style="border:0;padding:0;margin:0 0 14px"><legend style="font-weight:600;margin-bottom:4px">Типы вопросов</legend>' + types + '</fieldset>' +
      '<fieldset style="border:0;padding:0;margin:0 0 6px"><legend style="font-weight:600;margin-bottom:4px">Категории понятий в вопросах</legend>' + cats + '<div class="hint">Список категорий зависит от выбранной онтологии.</div></fieldset>' +
      '<div id="s-msg" aria-live="polite"></div><div class="row"><button class="btn" data-act="resetset">Сбросить к стандартным</button></div></div></div>';
  }
  function settingsChanged() {
    var count = parseInt($('s-count').value, 10), depth = parseInt($('s-depth').value, 10);
    $('s-count-v').textContent = count; $('s-depth-v').textContent = depth;
    var types = {}; document.querySelectorAll('[data-st=type]').forEach(function (c) { types[c.dataset.k] = c.checked; });
    var cats = []; document.querySelectorAll('[data-st=cat]').forEach(function (c) { if (c.checked) cats.push(c.dataset.k); });
    var errs = [];
    if (!Object.keys(types).some(function (k) { return types[k]; })) errs.push('Выберите хотя бы один тип вопросов.');
    if (!cats.length) errs.push('Выберите хотя бы одну категорию понятий.');
    if (errs.length) { $('s-msg').innerHTML = errs.map(function (e) { return '<div class="err">' + h(e) + ' Пока это не исправлено, изменения не сохраняются.</div>'; }).join(''); return; }
    var all = cats.length === state.onto.categories.length;
    state.settings = { count: count, depth: depth, types: types, cats: all ? null : cats };
    S.saveSettings(state.user, state.settings);
    var avail = Q.count(state.onto, effSettings());
    $('s-msg').innerHTML = '<div class="' + (avail ? 'okmsg' : 'err') + '">Сохранено. При таких настройках доступно вопросов: ' + avail + (avail ? '' : ' — расширьте типы или категории') + '.</div>';
    renderStatus();
  }

  /* ================= профиль ================= */
  function profileView() {
    var hist = S.history(state.user), avg = hist.length ? Math.round(hist.reduce(function (a, x) { return a + x.pct; }, 0) / hist.length) : 0;
    var mine = S.visible(state.user).filter(function (o) { return S.canEdit(o, state.user); }).length;
    var rows = hist.map(function (x) { return '<tr><td>' + fmtDate(x.date) + '</td><td>' + h(x.ontName) + '</td><td>' + x.correct + ' из ' + x.total + (x.early ? ' (досрочно)' : '') + '</td><td><b>' + x.pct + '%</b></td></tr>'; }).join('');
    return '<div class="quiz" style="max-width:900px"><h1>Профиль: ' + h(state.user) + '</h1><div class="card"><div class="meta" style="margin:0"><span>Пройдено тестов: <b>' + hist.length + '</b></span><span>Средний результат: <b>' + (hist.length ? avg + '%' : '—') + '</b></span><span>Ваших онтологий: <b>' + mine + '</b></span></div></div>' +
      '<div class="card"><div class="row between"><h2>История тестов</h2>' + (hist.length ? '<button class="btn small danger" data-act="clearhist">Очистить историю</button>' : '') + '</div>' +
      (hist.length ? '<div class="tablewrap"><table><thead><tr><th>Дата</th><th>Онтология</th><th>Правильно</th><th>Результат</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="muted">Пока нет ни одного теста. Пройдите тест в разделе «Тест» — результат появится здесь.</p>') + '</div></div>';
  }

  /* ================= события ================= */
  document.addEventListener('click', async function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var act = t.dataset.act, s = state.sess;
    switch (act) {
      case 'home': if (state.user) go('library'); break;
      case 'nav': go(t.dataset.v); break;
      case 'about': aboutBox(); break;
      case 'logout': logout(); break;
      case 'authtab': state.authTab = t.dataset.t; render(); $('a-login').focus(); break;
      case 'useont': setOntology(t.dataset.id); state.dictCat = 'all'; render(); toast('Выбрана онтология «' + state.meta.name + '»'); break;
      case 'dlont': download(t.dataset.id); break;
      case 'renont': { var o = S.get(t.dataset.id, state.user); var nm = await promptBox({ title: 'Переименовать онтологию', label: 'Новое название', value: o && o.name }); if (nm) { var r = S.rename(t.dataset.id, state.user, nm); if (!r.ok) toast(r.error); else { if (state.ontId === t.dataset.id) setOntology(t.dataset.id); render(); } } break; }
      case 'visont': { var o2 = S.get(t.dataset.id, state.user); if (!o2) break; var r2 = S.setVisibility(t.dataset.id, state.user, o2.visibility === 'public' ? 'private' : 'public'); if (!r2.ok) toast(r2.error); render(); break; }
      case 'delont': { var o3 = S.get(t.dataset.id, state.user); if (!o3) break; if (await confirmBox({ title: 'Удалить онтологию?', text: 'Онтология «' + o3.name + '» будет удалена безвозвратно' + (o3.visibility === 'public' ? ', и другие пользователи тоже потеряют к ней доступ' : '') + '. Скачайте файл заранее, если он может понадобиться.', ok: 'Удалить', danger: true })) { var r3 = S.deleteOntology(t.dataset.id, state.user); if (!r3.ok) toast(r3.error); else { if (state.ontId === t.dataset.id) setOntology(S.BUILTIN_ID); render(); toast('Онтология удалена'); } } break; }
      case 'gzoom': if (state.graph) { var d = t.dataset.d; d === 'in' ? state.graph.zoomIn() : d === 'out' ? state.graph.zoomOut() : state.graph.fit(); } break;
      case 'gsel': if (state.graph) state.graph.select(t.dataset.id); break;
      case 'dcat': state.dictCat = t.dataset.c; render(); break;
      case 'start': startSession(t.dataset.m); break;
      case 'opt': pickOpt(+t.dataset.k); break;
      case 'hint': s.hint[s.i] = true; render(); break;
      case 'check': s.checked[s.i] = true; render(); break;
      case 'next': s.i++; render(true); break;
      case 'prev': s.i--; render(true); break;
      case 'goq': s.i = +t.dataset.k; render(true); break;
      case 'finish': {
        var un = s.ans.filter(function (a) { return a == null; }).length;
        if (un && !(await confirmBox({ title: 'Есть вопросы без ответа', text: 'Без ответа осталось вопросов: ' + un + '. Они будут засчитаны как неверные. Завершить?', ok: 'Завершить' }))) break;
        finish(false); break;
      }
      case 'earlyfinish': {
        var un2 = s.ans.filter(function (a) { return a == null; }).length;
        if (await confirmBox({ title: 'Завершить тест досрочно?', text: 'Будет подсчитан результат по уже данным ответам' + (un2 ? '; вопросов без ответа: ' + un2 + ' — они считаются неверными' : '') + '.', ok: 'Показать результат' })) finish(true); break;
      }
      case 'abort':
        if (await confirmBox({ title: 'Прервать сеанс?', text: 'Ответы будут потеряны' + (s.mode === 'test' ? ', результат не сохранится' : '') + '.', ok: 'Прервать', cancel: 'Продолжить', danger: true })) { state.sess = null; render(true); }
        break;
      case 'restart': startSession(s.mode); break;
      case 'resetset': state.settings = Object.assign({}, Q.DEFAULTS, { types: Object.assign({}, Q.DEFAULTS.types) }); S.saveSettings(state.user, state.settings); render(); toast('Настройки сброшены'); break;
      case 'clearhist': if (await confirmBox({ title: 'Очистить историю?', text: 'Все сохранённые результаты тестов будут удалены.', ok: 'Очистить', danger: true })) { S.clearHistory(state.user); render(); } break;
    }
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id === 'auth-form') { e.preventDefault(); authSubmit(); }
    else if (e.target.id === 'up-form') { e.preventDefault(); upload(); }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'd-search') { state.dictQ = t.value; $('d-list').innerHTML = dictList(); }
    else if (t.id === 'g-search' && state.graph) { var n = state.graph.search(t.value); t.setAttribute('aria-label', 'Поиск понятия на графе' + (t.value ? ': найдено ' + n : '')); }
    else if (t.id === 's-count' || t.id === 's-depth' || t.dataset.st) settingsChanged();
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'a-show') { ['a-pass', 'a-pass2'].forEach(function (id) { if ($(id)) $(id).type = t.checked ? 'text' : 'password'; }); }
    else if (t.id === 'g-labels' && state.graph) state.graph.labels(t.checked);
    else if (t.id === 'up-file' && t.files[0] && !$('up-name').value) $('up-name').value = t.files[0].name.replace(/\.(ont|json)$/i, '');
  });
  document.addEventListener('keydown', function (e) {
    if ($('modal-root').firstChild || !state.sess || state.sess.finished || !/^(learn|test)$/.test(state.view)) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key >= '1' && e.key <= '9') pickOpt(+e.key - 1);
  });

  /* ================= запуск ================= */
  var u = S.getSession();
  if (u && S.users().some(function (x) { return x.login === u; })) enter(u); else render(true);
})();
