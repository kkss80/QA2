/* Графический просмотр онтологии (SVG): положение вершин берётся из файла .ont. */
(function () {
  var SVGNS = 'http://www.w3.org/2000/svg';
  var CAT_COLORS = { 'Модель': '#2b6cb0', 'Метод': '#c05621', 'Задача': '#2f855a', 'Ресурс': '#7b52b5', 'Корневое понятие': '#475569', 'Прочее': '#64748b' };
  var REL_STYLES = [
    { color: '#334155', dash: '' }, { color: '#b45309', dash: '7 4' }, { color: '#0f766e', dash: '2 4' },
    { color: '#be185d', dash: '10 4 2 4' }, { color: '#4338ca', dash: '' }, { color: '#15803d', dash: '7 4' }, { color: '#a16207', dash: '2 4' }
  ];
  var FIXED = { is_a: 0, is_instance: 1, a_part_of: 2, use: 3, use_for: 4, input: 5, output: 6 };
  function relStyle(t, all) { var i = t in FIXED ? FIXED[t] : (7 + all.indexOf(t)) % REL_STYLES.length; return REL_STYLES[i]; }
  function el(name, attrs, parent) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e); return e;
  }

  function forceLayout(onto) {
    var ns = onto.list, n = ns.length, R = 130 * Math.sqrt(n);
    ns.forEach(function (v, i) { v.lx = R + R * Math.cos(2 * Math.PI * i / n); v.ly = R + R * Math.sin(2 * Math.PI * i / n); });
    for (var it = 0; it < 250; it++) {
      ns.forEach(function (a) { a.fx = 0; a.fy = 0; });
      for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
        var a = ns[i], b = ns[j], dx = a.lx - b.lx, dy = a.ly - b.ly, d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2), f = 90000 / d2;
        a.fx += f * dx / d; a.fy += f * dy / d; b.fx -= f * dx / d; b.fy -= f * dy / d;
      }
      onto.rels.forEach(function (r) {
        var a = onto.nodes[r.s], b = onto.nodes[r.d], dx = b.lx - a.lx, dy = b.ly - a.ly, d = Math.sqrt(dx * dx + dy * dy) + 0.01, f = (d - 220) * 0.03;
        a.fx += f * dx / d; a.fy += f * dy / d; b.fx -= f * dx / d; b.fy -= f * dy / d;
      });
      ns.forEach(function (a) { a.lx += Math.max(-20, Math.min(20, a.fx)); a.ly += Math.max(-20, Math.min(20, a.fy)); });
    }
    ns.forEach(function (v) { v.px = v.lx; v.py = v.ly; });
  }

  /* Раздвигает перекрывающиеся подписи, почти не меняя исходную раскладку из файла */
  function separate(ns) {
    for (var it = 0; it < 120; it++) {
      var moved = false;
      for (var i = 0; i < ns.length; i++) for (var j = i + 1; j < ns.length; j++) {
        var a = ns[i], b = ns[j], gap = 14;
        var ox = (a.w + b.w) / 2 + gap - Math.abs(a.px - b.px), oy = (a.h + b.h) / 2 + gap - Math.abs(a.py - b.py);
        if (ox > 0 && oy > 0) {
          moved = true;
          if (oy <= ox) { var d = oy / 2 + 0.5, sg = (a.py <= b.py) ? -1 : 1; a.py += sg * d; b.py -= sg * d; }
          else { var d2 = ox / 2 + 0.5, sg2 = (a.px <= b.px) ? -1 : 1; a.px += sg2 * d2; b.px -= sg2 * d2; }
        }
      }
      if (!moved) break;
    }
  }

  function render(container, onto, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var hasPos = onto.list.every(function (v) { return typeof v.x === 'number' && typeof v.y === 'number'; });
    if (hasPos) onto.list.forEach(function (v) { v.px = v.x; v.py = v.y; }); else forceLayout(onto);

    var types = onto.relTypes();
    var svg = el('svg', { 'class': 'graph-svg', role: 'img', 'aria-label': 'Граф онтологии: вершины — понятия, стрелки — связи', tabindex: '0' }, container);
    var defs = el('defs', {}, svg);
    types.forEach(function (t, i) {
      var st = relStyle(t, types);
      var m = el('marker', { id: 'arr' + i, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '9', markerHeight: '9', orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0,1 L10,5 L0,9 z', fill: st.color }, m);
    });
    var root = el('g', {}, svg), gE = el('g', {}, root), gN = el('g', {}, root);

    var FS = 20, H = 40;
    onto.list.forEach(function (v) { v.w = Math.max(84, v.name.length * 11.2 + 28); v.h = H; });
    separate(onto.list);

    var edgeEls = [], pairCount = {};
    onto.rels.forEach(function (r) {
      var a = onto.nodes[r.s], b = onto.nodes[r.d]; if (a === b) return;
      var key = [r.s, r.d].sort().join('|'); var idx = pairCount[key] = (pairCount[key] || 0) + 1;
      var dx = b.px - a.px, dy = b.py - a.py, len = Math.sqrt(dx * dx + dy * dy) || 1;
      var off = (idx - 1) * 34 * (r.s < r.d ? 1 : -1);
      var mx = (a.px + b.px) / 2 - dy / len * off, my = (a.py + b.py) / 2 + dx / len * off;
      function clip(n, tx, ty) {
        var ddx = tx - n.px, ddy = ty - n.py;
        var t = Math.min(ddx ? (n.w / 2 + 3) / Math.abs(ddx) : 1e9, ddy ? (n.h / 2 + 3) / Math.abs(ddy) : 1e9);
        return [n.px + ddx * Math.min(t, 1), n.py + ddy * Math.min(t, 1)];
      }
      var p1 = clip(a, mx, my), p2 = clip(b, mx, my);
      var st = relStyle(r.type, types), ti = types.indexOf(r.type);
      var g = el('g', { 'class': 'edge' }, gE);
      el('path', { d: 'M' + p1[0] + ',' + p1[1] + ' Q' + mx + ',' + my + ' ' + p2[0] + ',' + p2[1], fill: 'none', stroke: st.color, 'stroke-width': 2, 'stroke-dasharray': st.dash, 'marker-end': 'url(#arr' + ti + ')' }, g);
      var lab = el('text', { x: mx, y: my - 4, 'class': 'edge-label', 'text-anchor': 'middle', 'font-size': 14, fill: st.color }, g);
      lab.textContent = Ontology.REL_SHORT[r.type] || r.type;
      edgeEls.push({ g: g, lab: lab, s: r.s, d: r.d });
    });

    var nodeEls = {};
    onto.list.forEach(function (v) {
      var g = el('g', { 'class': 'gnode', transform: 'translate(' + v.px + ',' + v.py + ')', tabindex: '0', role: 'button', 'aria-label': v.name + ', категория ' + v.cat }, gN);
      var c = CAT_COLORS[v.cat] || CAT_COLORS['Прочее'];
      el('rect', { x: -v.w / 2, y: -v.h / 2, width: v.w, height: v.h, rx: 10, fill: c, 'fill-opacity': 0.16, stroke: c, 'stroke-width': 2 }, g);
      var t = el('text', { x: 0, y: 6, 'text-anchor': 'middle', 'font-size': FS, 'class': 'gtext' }, g);
      t.textContent = v.name;
      var ti = el('title', {}, g); ti.textContent = v.name + ' — ' + v.cat + (v.def ? '\n' + v.def : '');
      nodeEls[v.id] = g;
    });

    /* границы и масштаб */
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    onto.list.forEach(function (v) { minX = Math.min(minX, v.px - v.w / 2); maxX = Math.max(maxX, v.px + v.w / 2); minY = Math.min(minY, v.py - v.h / 2); maxY = Math.max(maxY, v.py + v.h / 2); });
    var pad = 40, full = { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
    var vb = Object.assign({}, full);
    function apply() { svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h); }
    function fit() {
      var r = svg.getBoundingClientRect(), ar = (r.width || 800) / (r.height || 500);
      var w = full.w, h = full.h;
      if (w / h < ar) { w = h * ar; } else { h = w / ar; }
      vb = { x: full.x - (w - full.w) / 2, y: full.y - (h - full.h) / 2, w: w, h: h }; apply();
    }
    function zoomAt(f, cx, cy) {
      var nw = Math.max(full.w / 12, Math.min(full.w * 3, vb.w * f)), k = nw / vb.w;
      var px = cx == null ? vb.x + vb.w / 2 : cx, py = cy == null ? vb.y + vb.h / 2 : cy;
      vb = { x: px - (px - vb.x) * k, y: py - (py - vb.y) * k, w: nw, h: vb.h * k }; apply();
    }
    function toSvg(ev) { var r = svg.getBoundingClientRect(); return [vb.x + (ev.clientX - r.left) / r.width * vb.w, vb.y + (ev.clientY - r.top) / r.height * vb.h]; }
    svg.addEventListener('wheel', function (ev) { ev.preventDefault(); var p = toSvg(ev); zoomAt(ev.deltaY < 0 ? 0.85 : 1.18, p[0], p[1]); }, { passive: false });
    var drag = null, moved = 0;
    svg.addEventListener('pointerdown', function (ev) { drag = { x: ev.clientX, y: ev.clientY, vb: Object.assign({}, vb) }; moved = 0; });
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    function onMove(ev) {
      if (!drag) return; var r = svg.getBoundingClientRect();
      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      if (moved > 4) { vb.x = drag.vb.x - dx / r.width * vb.w; vb.y = drag.vb.y - dy / r.height * vb.h; apply(); svg.classList.add('panning'); }
    }
    function onUp() { drag = null; svg.classList.remove('panning'); }

    var selected = null, found = {};
    function paint() {
      var near = {}; if (selected) { near[selected] = 1; onto.rels.forEach(function (r) { if (r.s === selected) near[r.d] = 1; if (r.d === selected) near[r.s] = 1; }); }
      var q = Object.keys(found).length;
      onto.list.forEach(function (v) {
        var g = nodeEls[v.id], dim = (selected && !near[v.id]) || (q && !found[v.id]);
        g.style.opacity = dim ? 0.22 : 1;
        g.classList.toggle('sel', v.id === selected); g.classList.toggle('found', !!found[v.id]);
      });
      edgeEls.forEach(function (e) { e.g.style.opacity = selected ? ((e.s === selected || e.d === selected) ? 1 : 0.12) : (q ? 0.15 : 1); });
    }
    function select(id) { selected = id; paint(); if (opts.onSelect) opts.onSelect(id); }
    onto.list.forEach(function (v) {
      var g = nodeEls[v.id];
      g.addEventListener('click', function (ev) { ev.stopPropagation(); if (moved <= 4) select(selected === v.id ? null : v.id); });
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(v.id); } });
    });
    svg.addEventListener('click', function () { if (moved <= 4 && selected) select(null); });

    fit(); window.addEventListener('resize', fit);
    return {
      select: select, fit: fit,
      zoomIn: function () { zoomAt(0.8); }, zoomOut: function () { zoomAt(1.25); },
      search: function (text) {
        found = {}; var t = Ontology.norm(text);
        if (t) onto.list.forEach(function (v) { if (Ontology.norm(v.name).indexOf(t) >= 0) found[v.id] = 1; });
        paint(); return Object.keys(found).length;
      },
      labels: function (on) { edgeEls.forEach(function (e) { e.lab.style.display = on ? '' : 'none'; }); },
      destroy: function () { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('resize', fit); }
    };
  }
  window.Graph = { render: render, CAT_COLORS: CAT_COLORS, relStyle: relStyle };
})();
