/* Генерация вопросов по онтологии. */
(function () {
  var TYPES = {
    def2term: 'Определение → понятие',
    term2def: 'Понятие → определение',
    relations: 'Связи между понятиями',
    category: 'Категория понятия'
  };
  var STD_CATS = ['Модель', 'Метод', 'Задача', 'Ресурс'];
  var DEFAULTS = { count: 10, depth: 2, types: { def2term: true, term2def: true, relations: true, category: true }, cats: null };

  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a, n) { return shuffle(a).slice(0, n); }
  function q(s) { return '«' + s + '»'; }

  /* distractors: n вершин из candidates, сначала из той же категории */
  function distract(candidates, cat, n) {
    var same = shuffle(candidates.filter(function (x) { return x.cat === cat; }));
    var rest = shuffle(candidates.filter(function (x) { return x.cat !== cat; }));
    return same.concat(rest).slice(0, n);
  }

  function build(onto, st) {
    st = st || DEFAULTS;
    var depth = st.depth || 2;
    var catOK = function (n) { return !st.cats || st.cats.indexOf(n.cat) >= 0; };
    var subjects = onto.list.filter(catOK);
    var pool = { def2term: [], term2def: [], relations: [], category: [] };
    var nodes = onto.list;
    var NOPT = 4;

    function mk(type, text, correctText, wrongTexts, subj, extra) {
      var opts = shuffle([{ t: correctText, ok: true }].concat(wrongTexts.map(function (w) { return { t: w, ok: false }; })));
      return Object.assign({ type: type, text: text, options: opts.map(function (o) { return o.t; }),
        correct: opts.findIndex(function (o) { return o.ok; }), subject: subj.id, cat: subj.cat }, extra);
    }

    if (st.types.def2term) subjects.forEach(function (s) {
      if (!s.def) return;
      var cands = nodes.filter(function (x) { return x.id !== s.id && x.name !== s.name; });
      var ds = distract(cands, s.cat, NOPT - 1); if (ds.length < NOPT - 1) return;
      pool.def2term.push(mk('def2term', 'Какому понятию соответствует определение: «' + s.def + '»?', s.name,
        ds.map(function (d) { return d.name; }), s,
        { hint: 'Категория искомого понятия — «' + s.cat + '». Первая буква ответа: «' + s.name.charAt(0).toUpperCase() + '».', answerId: s.id }));
    });

    if (st.types.term2def) subjects.forEach(function (s) {
      if (!s.def) return;
      var cands = nodes.filter(function (x) { return x.id !== s.id && x.def && x.def !== s.def; });
      var seen = {}, ds = distract(cands, s.cat, 12).filter(function (d) { if (seen[d.def]) return false; seen[d.def] = 1; return true; }).slice(0, NOPT - 1);
      if (ds.length < NOPT - 1) return;
      var rel = onto.describe(s.id).slice(0, 3).map(function (r) { return r.text + ' ' + q(r.name); }).join('; ');
      pool.term2def.push(mk('term2def', 'Выберите правильное определение понятия ' + q(s.name) + '.', s.def,
        ds.map(function (d) { return d.def; }), s,
        { hint: 'Категория: «' + s.cat + '».' + (rel ? ' Связи в онтологии: ' + rel + '.' : ''), answerId: s.id }));
    });

    if (st.types.relations) {
      // иерархия: общее понятие (вверх) и частные случаи (вниз), в пределах глубины поиска
      subjects.forEach(function (s) {
        var up = onto.ancestors(s.id, depth), upAll = onto.ancestors(s.id, Infinity);
        var ids = Object.keys(up);
        if (ids.length) {
          var a = onto.nodes[ids[rnd(ids.length)]];
          var cands = nodes.filter(function (x) { return x.id !== s.id && !upAll[x.id]; });
          var ds = distract(cands, a.cat, NOPT - 1);
          if (ds.length === NOPT - 1) pool.relations.push(mk('relations',
            (up[a.id] === 1 && depth === 1 ? 'Какое понятие является непосредственно более общим («родителем») для ' : 'Какое понятие является более общим (до ' + depth + ' шаг. вверх по иерархии) для ') + q(s.name) + '?',
            a.name, ds.map(function (d) { return d.name; }), s, { hint: 'Ищите по связям «является разновидностью» и «является примером» от ' + q(s.name) + ' вверх. ' + (s.def ? 'Определение: ' + s.def : ''), answerId: a.id, key: 'up' + s.id }));
        }
        var down = onto.descendants(s.id, depth), downAll = onto.descendants(s.id, Infinity);
        var dids = Object.keys(down);
        if (dids.length) {
          var b = onto.nodes[dids[rnd(dids.length)]];
          var cands2 = nodes.filter(function (x) { return x.id !== s.id && !downAll[x.id]; });
          var ds2 = distract(cands2, b.cat, NOPT - 1);
          if (ds2.length === NOPT - 1) pool.relations.push(mk('relations',
            'Какое из понятий является частным случаем (разновидностью или примером) понятия ' + q(s.name) + '?',
            b.name, ds2.map(function (d) { return d.name; }), s, { hint: (s.def ? 'Определение понятия ' + q(s.name) + ': ' + s.def : 'Ищите понятие, лежащее ниже ' + q(s.name) + ' в иерархии.'), answerId: b.id, key: 'down' + s.id }));
        }
      });
      // прочие связи: напрямую
      var PH = {
        a_part_of: [function (s) { return 'Частью какого понятия является ' + q(s) + '?'; }, function (d) { return 'Какое из понятий входит в состав понятия ' + q(d) + '?'; }],
        use: [function (s) { return 'Какое понятие использует ' + q(s) + '?'; }, function (d) { return 'Какое из понятий использует понятие ' + q(d) + '?'; }],
        use_for: [function (s) { return 'Для решения какой задачи (в какой области) применяется ' + q(s) + '?'; }, function (d) { return 'Что применяется для ' + q(d) + '?'; }],
        input: [function (s) { return 'Входным параметром какого понятия является ' + q(s) + '?'; }, function (d) { return 'Какое из понятий является входным параметром для ' + q(d) + '?'; }],
        output: [function (s) { return 'Выходным параметром какого понятия является ' + q(s) + '?'; }, function (d) { return 'Какое из понятий является выходным параметром для ' + q(d) + '?'; }]
      };
      onto.rels.forEach(function (r) {
        if (HIERTYPE(r.type)) return;
        var S = onto.nodes[r.s], D = onto.nodes[r.d];
        var ph = PH[r.type] || [function (s) { return 'С каким понятием связано ' + q(s) + ' отношением «' + r.type + '»?'; }, function (d) { return 'Какое из понятий связано с ' + q(d) + ' отношением «' + r.type + '»?'; }];
        if (catOK(S)) {
          var bad = {}; onto.out[S.id].forEach(function (e) { if (e.type === r.type) bad[e.d] = 1; });
          var ds = distract(nodes.filter(function (x) { return x.id !== S.id && !bad[x.id]; }), D.cat, NOPT - 1);
          if (ds.length === NOPT - 1) pool.relations.push(mk('relations', ph[0](S.name), D.name, ds.map(function (d) { return d.name; }), S,
            { hint: S.def ? 'Определение понятия ' + q(S.name) + ': ' + S.def : 'Вспомните, с чем связано это понятие.', answerId: D.id, key: 'f' + r.id }));
        }
        if (catOK(D)) {
          var bad2 = {}; onto.inn[D.id].forEach(function (e) { if (e.type === r.type) bad2[e.s] = 1; });
          var ds2 = distract(nodes.filter(function (x) { return x.id !== D.id && !bad2[x.id]; }), S.cat, NOPT - 1);
          if (ds2.length === NOPT - 1) pool.relations.push(mk('relations', ph[1](D.name), S.name, ds2.map(function (d) { return d.name; }), D,
            { hint: D.def ? 'Определение понятия ' + q(D.name) + ': ' + D.def : 'Вспомните, какие понятия связаны с этим.', answerId: S.id, key: 'b' + r.id }));
        }
      });
    }
    function HIERTYPE(t) { return t === 'is_a' || t === 'is_instance'; }

    if (st.types.category) {
      var cats = STD_CATS.filter(function (c) { return onto.categories.indexOf(c) >= 0; });
      if (cats.length >= 3) subjects.forEach(function (s) {
        if (cats.indexOf(s.cat) < 0) return;
        pool.category.push(mk('category', 'К какой категории относится понятие ' + q(s.name) + '?', s.cat,
          cats.filter(function (c) { return c !== s.cat; }), s,
          { hint: s.def ? 'Определение: ' + s.def : 'Посмотрите, к какому корневому понятию ведут связи этого понятия.', answerId: s.id }));
      });
    }
    return pool;
  }

  function count(onto, st) { var p = build(onto, st), n = 0; for (var k in p) n += p[k].length; return n; }

  /* Составляет набор вопросов: поровну по включённым типам, без повторов */
  function generate(onto, st) {
    var pool = build(onto, st), keys = Object.keys(pool).filter(function (k) { return pool[k].length; });
    var lists = keys.map(function (k) { return shuffle(pool[k]); }), res = [], used = {}, i = 0;
    while (res.length < st.count && lists.some(function (l) { return l.length; })) {
      var l = lists[i % lists.length]; i++;
      var x = l.shift(); if (!x) continue;
      var key = x.type + '|' + x.text; if (used[key]) continue; used[key] = 1;
      x.typeLabel = TYPES[x.type]; x.def = (onto.nodes[x.subject] || {}).def || '';
      x.subjectName = (onto.nodes[x.subject] || {}).name || '';
      var an = onto.nodes[x.answerId]; x.explName = an ? an.name : ''; x.explDef = an ? an.def : '';
      res.push(x);
    }
    return shuffle(res).map(function (x, n) { x.n = n; return x; });
  }

  window.Questions = { TYPES: TYPES, DEFAULTS: DEFAULTS, generate: generate, count: count };
})();
