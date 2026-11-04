/*
 * Tiny QR code generator for the Pulse People tab.
 * Byte mode, error correction level M, versions 1-10 (up to 213 bytes, plenty for a link).
 * No dependencies. Usage: PulseQR.svg("https://...", { color: "#000" }) -> "<svg ...>"
 */
(function (root) {
  "use strict";

  // Level M, versions 1..10: error-correction codewords per block, and number of blocks.
  var ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  var NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  var ALIGN = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  function rawCodewords(ver) {
    var bits = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var n = Math.floor(ver / 7) + 2;
      bits -= (25 * n - 10) * n - 55;
      if (ver >= 7) bits -= 36;
    }
    return Math.floor(bits / 8);
  }
  function dataCodewords(ver) {
    return rawCodewords(ver) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
  }

  // Reed-Solomon over GF(256), polynomial 0x11D.
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    var res = [];
    for (var i = 0; i < degree - 1; i++) res.push(0);
    res.push(1);
    var r = 1;
    for (i = 0; i < degree; i++) {
      for (var j = 0; j < res.length; j++) {
        res[j] = gfMul(res[j], r);
        if (j + 1 < res.length) res[j] ^= res[j + 1];
      }
      r = gfMul(r, 0x02);
    }
    return res;
  }
  function rsRemainder(data, div) {
    var res = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ res.shift();
      res.push(0);
      div.forEach(function (c, i) { res[i] ^= gfMul(c, f); });
    });
    return res;
  }

  function utf8(text) {
    var s = unescape(encodeURIComponent(text)), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function encodeData(bytes) {
    var ver;
    for (ver = 1; ver <= 10; ver++) {
      var ccBits = ver <= 9 ? 8 : 16;
      if (4 + ccBits + bytes.length * 8 <= dataCodewords(ver) * 8) break;
    }
    if (ver > 10) throw new Error("Text too long for QR code");
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4);
    put(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    var cap = dataCodewords(ver) * 8;
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var cw = [];
    for (var i = 0; i < bits.length; i += 8) {
      var v = 0;
      for (var k = 0; k < 8; k++) v = (v << 1) | bits[i + k];
      cw.push(v);
    }
    return { ver: ver, data: cw };
  }

  function interleave(ver, data) {
    var nb = NUM_BLOCKS[ver], ecLen = ECC_PER_BLOCK[ver], raw = rawCodewords(ver);
    var numShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
    var div = rsDivisor(ecLen), blocks = [], k = 0;
    for (var i = 0; i < nb; i++) {
      var dat = data.slice(k, k + shortLen - ecLen + (i < numShort ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var out = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (var j = 0; j < blocks.length; j++) {
        if (i !== shortLen - ecLen || j >= numShort) out.push(blocks[j][i]);
      }
    }
    return out;
  }

  function build(ver, codewords) {
    var size = ver * 4 + 17, mods = [], fn = [];
    for (var y = 0; y < size; y++) { mods.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function setFn(x, y, dark) { mods[y][x] = dark; fn[y][x] = true; }

    for (var i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var al = ALIGN[ver], n = al.length;
    for (i = 0; i < n; i++) for (var j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (var dy2 = -2; dy2 <= 2; dy2++) for (var dx2 = -2; dx2 <= 2; dx2++)
        setFn(al[i] + dx2, al[j] + dy2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1);
    }
    function formatBits(mask) {
      var data = (0 << 3) | mask, rem = data; // level M = 00
      for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bits = ((data << 10) | rem) ^ 0x5412;
      function b(i) { return ((bits >>> i) & 1) !== 0; }
      for (i = 0; i <= 5; i++) setFn(8, i, b(i));
      setFn(8, 7, b(6)); setFn(8, 8, b(7)); setFn(7, 8, b(8));
      for (i = 9; i < 15; i++) setFn(14 - i, 8, b(i));
      for (i = 0; i < 8; i++) setFn(size - 1 - i, 8, b(i));
      for (i = 8; i < 15; i++) setFn(8, size - 15 + i, b(i));
      setFn(8, size - 8, true);
    }
    formatBits(0);
    if (ver >= 7) {
      var rem = ver;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (ver << 12) | rem;
      for (i = 0; i < 18; i++) {
        var bit = ((vb >>> i) & 1) !== 0, a = size - 11 + i % 3, c = Math.floor(i / 3);
        setFn(a, c, bit); setFn(c, a, bit);
      }
    }

    // Place data bits in the zigzag order.
    var bi = 0, total = codewords.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (var k = 0; k < 2; k++) {
        var x = right - k, up = ((right + 1) & 2) === 0, yy = up ? size - 1 - vert : vert;
        if (!fn[yy][x] && bi < total) {
          mods[yy][x] = ((codewords[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0;
          bi++;
        }
      }
    }

    function maskFn(m, x, y) {
      switch (m) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return (x * y) % 2 + (x * y) % 3 === 0;
        case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
        default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
      }
    }
    function applyMask(m) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++)
        if (!fn[y][x] && maskFn(m, x, y)) mods[y][x] = !mods[y][x];
    }
    function penalty() {
      var p = 0, dark = 0, x, y, run, prev;
      function line(get) {
        var s = 0, arr = [];
        for (var i = 0; i < size; i++) arr.push(get(i) ? 1 : 0);
        run = 1;
        for (i = 1; i <= size; i++) {
          if (i < size && arr[i] === arr[i - 1]) run++;
          else { if (run >= 5) s += 3 + (run - 5); run = 1; }
        }
        var pats = ["10111010000", "00001011101"], str = arr.join("");
        pats.forEach(function (pt) { var idx = str.indexOf(pt); while (idx !== -1) { s += 40; idx = str.indexOf(pt, idx + 1); } });
        return s;
      }
      for (y = 0; y < size; y++) p += line(function (i) { return mods[y][i]; });
      for (x = 0; x < size; x++) p += line(function (i) { return mods[i][x]; });
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
        prev = mods[y][x];
        if (prev === mods[y][x + 1] && prev === mods[y + 1][x] && prev === mods[y + 1][x + 1]) p += 3;
      }
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mods[y][x]) dark++;
      p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return p;
    }

    var best = 0, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); formatBits(m);
      var sc = penalty();
      if (sc < bestScore) { bestScore = sc; best = m; }
      applyMask(m);
    }
    applyMask(best); formatBits(best);
    return mods;
  }

  function matrix(text) {
    var enc = encodeData(utf8(String(text)));
    return build(enc.ver, interleave(enc.ver, enc.data));
  }

  function svg(text, opts) {
    opts = opts || {};
    var m = matrix(text), size = m.length, q = 4, dim = size + q * 2, d = "";
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++)
      if (m[y][x]) d += "M" + (x + q) + " " + (y + q) + "h1v1h-1z";
    var fg = opts.color || "#000", bg = opts.background || "#fff";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + " " + dim +
      '" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="' + dim +
      '" height="' + dim + '" fill="' + bg + '"/><path d="' + d + '" fill="' + fg + '"/></svg>';
  }

  var api = { matrix: matrix, svg: svg };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PulseQR = api;
})(typeof window !== "undefined" ? window : this);
