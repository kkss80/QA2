/* Небольшая реализация SHA-256 (работает и при открытии index.html двойным щелчком, без https). */
(function () {
  var K = [], H0 = [], cnt = 0;
  for (var c = 2; cnt < 64; c++) {
    var prime = true;
    for (var d = 2; d * d <= c; d++) if (c % d === 0) { prime = false; break; }
    if (!prime) continue;
    K[cnt] = (Math.pow(c, 1 / 3) % 1 * 4294967296) | 0;
    if (cnt < 8) H0[cnt] = (Math.pow(c, 1 / 2) % 1 * 4294967296) | 0;
    cnt++;
  }
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function sha256hex(str) {
    var bytes = Array.prototype.slice.call(new TextEncoder().encode(str));
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var hi = Math.floor(bitLen / 4294967296), lo = bitLen >>> 0;
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
               (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var h = H0.slice(), w = new Array(64);
    for (var i = 0; i < bytes.length; i += 64) {
      for (var t = 0; t < 16; t++)
        w[t] = (bytes[i + 4 * t] << 24) | (bytes[i + 4 * t + 1] << 16) | (bytes[i + 4 * t + 2] << 8) | bytes[i + 4 * t + 3];
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], cc = h[2], dd = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + K[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & cc) ^ (b & cc);
        var t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (dd + t1) | 0; dd = cc; cc = b; b = a; a = (t1 + t2) | 0;
      }
      h = [(h[0] + a) | 0, (h[1] + b) | 0, (h[2] + cc) | 0, (h[3] + dd) | 0,
           (h[4] + e) | 0, (h[5] + f) | 0, (h[6] + g) | 0, (h[7] + hh) | 0];
    }
    return h.map(function (x) { return (x >>> 0).toString(16).padStart(8, '0'); }).join('');
  }
  /* пароль хранится только в виде соли и многократного хеша */
  window.hashPassword = function (password, salt) {
    var x = salt + ':' + password;
    for (var i = 0; i < 2000; i++) x = sha256hex(x + salt);
    return x;
  };
  window.sha256hex = sha256hex;
})();
