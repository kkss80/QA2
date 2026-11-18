/* Разбор и анализ онтологий в формате .ont (JSON).
   Определение понятия хранится в атрибутах вершины: "attributes": {"definition": "..."} */
(function () {
  var ROOTS = ['модель', 'метод', 'задача', 'ресурс'];
  var ROOT_CAT = 'Корневое понятие', OTHER_CAT = 'Прочее';
  var CAT_ORDER = ['Модель', 'Метод', 'Задача', 'Ресурс', ROOT_CAT, OTHER_CAT];
  var HIER = { is_a: 1, is_instance: 1 };            // отношения «общее ← частное»
  var REL_RU = {
    is_a: 'является разновидностью', is_instance: 'является примером (экземпляром)',
    a_part_of: 'является частью', use: 'использует', use_for: 'применяется для',
    input: 'является входом для', output: 'является выходом для'
  };
  var REL_SHORT = { is_a: 'вид', is_instance: 'пример', a_part_of: 'часть', use: 'использует',
                    use_for: 'применяется для', input: 'вход', output: 'выход' };

  function norm(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase().replace(/ё/g, 'е'); }
  function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* Проверка структуры. Возвращает {ok, error, warnings, data}. */
  function validate(raw) {
    var data = raw, warnings = [];
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw.replace(/^﻿/, '')); }
      catch (e) { return { ok: false, error: 'Файл не является корректным JSON. Проверьте, что это файл онтологии в формате .ont, а не другой документ.' }; }
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'Неверная структура: ожидается объект с полями «nodes» и «relations».' };
    if (!Array.isArray(data.nodes)) return { ok: false, error: 'В файле нет списка вершин «nodes». Это не похоже на онтологию.' };
    if (data.nodes.length === 0) return { ok: false, error: 'Онтология пуста: в ней нет ни одной вершины.' };
    if (data.relations == null) { data.relations = []; warnings.push('В файле нет списка связей «relations» — загружены только вершины.'); }
    if (!Array.isArray(data.relations)) return { ok: false, error: 'Поле «relations» должно быть списком связей.' };
    var ids = {}, names = {};
    for (var i = 0; i < data.nodes.length; i++) {
      var n = data.nodes[i];
      if (!n || typeof n !== 'object' || n.id == null || typeof n.name !== 'string' || !n.name.trim())
        return { ok: false, error: 'Вершина №' + (i + 1) + ' записана неверно: у каждой вершины должны быть «id» и непустое «name».' };
      if (ids[String(n.id)]) return { ok: false, error: 'Повторяется идентификатор вершины: ' + n.id + '.' };
      ids[String(n.id)] = 1;
      if (names[norm(n.name)]) warnings.push('Название «' + n.name.trim() + '» встречается у нескольких вершин.');
      names[norm(n.name)] = 1;
    }
    for (var j = 0; j < data.relations.length; j++) {
      var r = data.relations[j];
      if (!r || ids[String(r.source_node_id)] !== 1 || ids[String(r.destination_node_id)] !== 1)
        return { ok: false, error: 'Связь №' + (j + 1) + ' ссылается на несуществующую вершину. Файл повреждён или создан в другой модели.' };
    }
    return { ok: true, data: data, warnings: warnings };
  }

  function Onto(data) {
    var self = this;
    this.data = data;
    this.nodes = {}; this.list = []; this.rels = []; this.out = {}; this.inn = {};
    data.nodes.forEach(function (n) {
      var def = n.attributes && typeof n.attributes.definition === 'string' ? n.attributes.definition.trim() : '';
      var o = { id: String(n.id), name: n.name.trim(), def: def, x: n.position_x, y: n.position_y, cat: null };
      self.nodes[o.id] = o; self.list.push(o); self.out[o.id] = []; self.inn[o.id] = [];
    });
    data.relations.forEach(function (r) {
      var e = { id: String(r.id), type: String(r.name || 'связь'), s: String(r.source_node_id), d: String(r.destination_node_id) };
      self.rels.push(e); self.out[e.s].push(e); self.inn[e.d].push(e);
    });
    this.list.forEach(function (n) { n.cat = self._category(n); });
    var seen = {};
    this.list.forEach(function (n) { seen[n.cat] = 1; });
    this.categories = CAT_ORDER.filter(function (c) { return seen[c]; });
    this.withDef = this.list.filter(function (n) { return n.def; });
  }

  /* Категория вершины: ближайшее корневое понятие (модель/метод/задача/ресурс) вверх по связям
     «является», «пример», «часть». */
  Onto.prototype._category = function (n) {
    if (ROOTS.indexOf(norm(n.name)) >= 0) return ROOT_CAT;
    var seen = {}, q = [[n.id, 0]], best = null;
    seen[n.id] = 1;
    while (q.length) {
      var cur = q.shift(), id = cur[0], dist = cur[1];
      if (best && dist > best[1]) break;
      var outs = this.out[id];
      for (var i = 0; i < outs.length; i++) {
        var e = outs[i];
        if (!(HIER[e.type] || e.type === 'a_part_of') || seen[e.d]) continue;
        seen[e.d] = 1;
        var rk = ROOTS.indexOf(norm(this.nodes[e.d].name));
        if (rk >= 0) { if (!best || rk < best[0]) best = [rk, dist + 1]; }
        else q.push([e.d, dist + 1]);
      }
    }
    return best ? capital(ROOTS[best[0]]) : OTHER_CAT;
  };

  /* Предки по иерархии «является/пример»: {id: расстояние}. maxDepth=Infinity — все. */
  Onto.prototype.ancestors = function (id, maxDepth) { return this._walk(id, maxDepth, true); };
  Onto.prototype.descendants = function (id, maxDepth) { return this._walk(id, maxDepth, false); };
  Onto.prototype._walk = function (id, maxDepth, up) {
    var res = {}, q = [[id, 0]], seen = {}; seen[id] = 1;
    while (q.length) {
      var c = q.shift(); if (c[1] >= maxDepth) continue;
      var es = up ? this.out[c[0]] : this.inn[c[0]];
      for (var i = 0; i < es.length; i++) {
        var e = es[i]; if (!HIER[e.type]) continue;
        var nx = up ? e.d : e.s; if (seen[nx]) continue;
        seen[nx] = 1; res[nx] = c[1] + 1; q.push([nx, c[1] + 1]);
      }
    }
    return res;
  };
  /* Связи вершины в виде читаемых строк */
  Onto.prototype.describe = function (id) {
    var self = this, res = [];
    this.out[id].forEach(function (e) { res.push({ id: e.d, text: REL_RU[e.type] || e.type, name: self.nodes[e.d].name, dir: 'out' }); });
    this.inn[id].forEach(function (e) { res.push({ id: e.s, text: 'связано отношением «' + (REL_SHORT[e.type] || e.type) + '» с', name: self.nodes[e.s].name, dir: 'in', type: e.type }); });
    return res;
  };
  Onto.prototype.defCoverage = function () { return Math.round(100 * this.withDef.length / this.list.length); };
  Onto.prototype.relTypes = function () { var t = {}; this.rels.forEach(function (r) { t[r.type] = 1; }); return Object.keys(t); };

  window.Ontology = { validate: validate, Onto: Onto, norm: norm, REL_RU: REL_RU, REL_SHORT: REL_SHORT,
                      ROOT_CAT: ROOT_CAT, OTHER_CAT: OTHER_CAT, CAT_ORDER: CAT_ORDER };
})();
