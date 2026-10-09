// kaisetsu-kit engine: renderAt(t) draws one 1920x1080 frame as a pure function of t.
// Opened as engine/index.html?p=<project>; the server root is the repo root.
// Time comes only from projects/<p>/src/timeline.json (tools/plan.py), layout only from src/board.json.
// Each shot is drawn on a transparent layer and multiplied onto paper; shots inside a section cross-fade,
// a new section bleeds in through an ink mask.
"use strict";
const W = 1920, H = 1080;
const cv = document.getElementById("c"), ctx = cv.getContext("2d");
const PROJ = new URLSearchParams(location.search).get("p"), P = `/projects/${PROJ}`;
const INK = "#1c1a17", GREY = "#6e675e", PALE = "#b9b1a5", TEAL = "#3d6b67", RED = "#9b2d24", PAPER = "#f3eee3";
const LAT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif', EN = "#4a6670";
const MIN = '"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif JP", serif', MIND = '"Yu Mincho Demibold", "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif';
const GO = '"Yu Gothic", "YuGothic", "Hiragino Sans", "Noto Sans JP", "Meiryo", sans-serif', MONO = 'Consolas, "Courier New", monospace';
let TL, BOARD, PANELS, CAST = {}, SHOTS = [], LN = {}, SECS = [];
const IMG = {};

// ── math ──
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), sat = x => clamp(x, 0, 1);
const eOut = x => 1 - Math.pow(1 - sat(x), 3);
const eInOut = x => { x = sat(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = x => { x = sat(x); return x * x * (3 - 2 * x); };
function hash(n, s) { const x = Math.sin(n * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }
function noise1(x, s) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i, s), hash(i + 1, s), u); }
function noise2(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), u = smooth(x - xi), v = smooth(y - yi), h = (i, j) => hash(i * 57 + j * 131, s);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}
function fbm(x, y, s) { let a = 0, f = 1, w = .5; for (let i = 0; i < 4; i++) { a += w * noise2(x * f, y * f, s + i); f *= 2; w *= .5; } return a; }
function mk(w, h) { const c = document.createElement("canvas"); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
function loadImg(src) { return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => { console.warn("missing", src); res(null); }; im.src = src; }); }
const getJ = p => fetch(p).then(r => { if (!r.ok) throw new Error(`${r.status} ${p}`); return r.json(); });

// ── ink-bleed masks: brighter = covered earlier; generated from noise, no image files ──
const MAPS = {}, MW = 480, MH = 270, MASK = mk(MW, MH), MASKB = mk(W, H);
function makeMaps() {
  const blob = (u, v, x, y, r) => 1 - Math.hypot((u - x) * 1.78, v - y) / r;
  const shapes = {
    drop: (u, v) => blob(u, v, .5, .5, 1),
    stroke: (u, v) => 1 - u + .25 * Math.sin(v * 7),
    splash: (u, v) => Math.max(blob(u, v, .3, .4, .8), blob(u, v, .72, .62, .7), blob(u, v, .55, .2, .6)),
  };
  Object.entries(shapes).forEach(([n, f], si) => {
    const a = new Float32Array(MW * MH); let lo = 1e9, hi = -1e9;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const u = x / MW, v = y / MH, q = f(u, v) + .45 * (fbm(u * 7, v * 4, si * 10) - .47);
      a[y * MW + x] = q; lo = Math.min(lo, q); hi = Math.max(hi, q);
    }
    for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / (hi - lo);
    MAPS[n] = a;
  });
}
function inkMask(name, flip, k) {
  const m = MAPS[name], soft = 0.035, th = 1 - k * (1 + soft), g = MASK.getContext("2d"), a = g.createImageData(MW, MH);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) a.data[(y * MW + x) * 4 + 3] = sat((m[y * MW + (flip ? MW - 1 - x : x)] - th) / soft) * 255;
  g.putImageData(a, 0, 0);
  const gb = MASKB.getContext("2d"); gb.clearRect(0, 0, W, H); gb.imageSmoothingQuality = "high"; gb.drawImage(MASK, 0, 0, W, H);
  return MASKB;
}
function makePaper() {   // warm paper: low-frequency clouds + per-pixel grain
  const c = mk(W, H), g = c.getContext("2d"), lw = 240, lh = 135, low = mk(lw, lh), lg = low.getContext("2d"), ld = lg.createImageData(lw, lh);
  for (let i = 0; i < lw * lh; i++) { const v = (fbm((i % lw) / 30, Math.floor(i / lw) / 30, 5) - .47) * 2; ld.data[i * 4 + 3] = clamp(Math.abs(v) * 90, 0, 255); ld.data[i * 4] = ld.data[i * 4 + 1] = ld.data[i * 4 + 2] = v > 0 ? 255 : 120; }
  lg.putImageData(ld, 0, 0);
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H); g.globalAlpha = .35; g.drawImage(low, 0, 0, W, H); g.globalAlpha = 1;
  const d = g.getImageData(0, 0, W, H), p = d.data;
  for (let i = 0; i < W * H; i++) { const n = (hash(i, 3) - .5) * 9; p[i * 4] += n; p[i * 4 + 1] += n; p[i * 4 + 2] += n * 1.1; }
  g.putImageData(d, 0, 0);
  return c;
}

// ── text ──
function font(g, size, fam = MIN, weight = "") { g.font = `${weight} ${size}px ${fam}`; }
const NOHEAD = "、。，．・：；？！」』）】〕ーぁぃぅぇぉっゃゅょァィゥェォッャュョ…—";
function wrapWords(g, s, maxW) {   // English: wrap on spaces
  const out = []; let cur = "";
  for (const w of String(s).split(" ")) { const nx = cur ? cur + " " + w : w; if (g.measureText(nx).width > maxW && cur) { out.push(cur); cur = w; } else cur = nx; }
  if (cur) out.push(cur); return out;
}
function wrap(g, s, maxW) {   // CJK: per character, with line-start kinsoku; \n forces a break
  const out = [];
  for (const para of String(s).split("\n")) {
    let cur = "";
    for (const ch of para) {
      if (g.measureText(cur + ch).width > maxW && cur && !NOHEAD.includes(ch)) { out.push(cur); cur = ch; }
      else cur += ch;
    }
    out.push(cur);
  }
  const n = out.length;   // never leave a single orphan character on the last line
  if (n > 1 && [...out[n - 1]].length === 1 && [...out[n - 2]].length > 3) { const prev = [...out[n - 2]]; out[n - 1] = prev.pop() + out[n - 1]; out[n - 2] = prev.join(""); }
  return out;
}
function txt(g, s, x, y, size, o = {}) {
  if ((o.alpha ?? 1) <= 0 || s === undefined) return;
  g.save(); g.globalAlpha *= o.alpha ?? 1; font(g, size, o.fam || MIN, o.w || "");
  g.fillStyle = o.color || INK; g.textAlign = o.align || "left"; g.textBaseline = o.base || "alphabetic";
  if (o.ls) g.letterSpacing = `${o.ls}px`;
  g.fillText(s, x, y); g.restore();
}
function para(g, s, x, y, size, maxW, lh, o = {}) {   // multi-line text, returns the bottom y
  font(g, size, o.fam || MIN, o.w || ""); const ls = wrap(g, s, maxW);
  ls.forEach((l, i) => txt(g, l, x, y + i * lh, size, o));
  return y + ls.length * lh;
}
function measureLines(g, s, size, maxW, fam = MIN, w = "") { font(g, size, fam, w); return wrap(g, s, maxW).length; }

// ── primitives ──
function cover(g, im, x, y, w, h, z = 1, fx = .5, fy = .5) {
  if (!im) return;
  const s = Math.max(w / im.width, h / im.height) * z, dw = im.width * s, dh = im.height * s;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.drawImage(im, x + (w - dw) * fx, y + (h - dh) * fy, dw, dh); g.restore();
}
function contain(g, im, x, y, w, h, alpha = 1) {
  if (!im) return [x, y, 0, 0];
  const s = Math.min(w / im.width, h / im.height), dw = im.width * s, dh = im.height * s, dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
  g.save(); g.globalAlpha *= alpha; g.drawImage(im, dx, dy, dw, dh); g.restore();
  return [dx, dy, dw, dh];
}
const FEA = {};
function soft(g, im, x, y, w, h, alpha = 1) {   // feathered edges so no paper-coloured box shows
  if (!im || alpha <= 0) return;
  const key = `${Math.round(w)}x${Math.round(h)}`;
  if (!FEA[key]) { const m = mk(w, h), mg = m.getContext("2d"), f = Math.min(w, h) * 0.06; mg.filter = `blur(${f}px)`; mg.fillStyle = "#fff"; mg.fillRect(f * 1.5, f * 1.5, w - f * 3, h - f * 3); FEA[key] = m; }
  const L = mk(w, h), lg = L.getContext("2d"); lg.drawImage(im, 0, 0, w, h); lg.globalCompositeOperation = "destination-in"; lg.drawImage(FEA[key], 0, 0);
  g.save(); g.globalAlpha *= alpha; g.drawImage(L, x, y); g.restore();
}
const accent = id => CAST[id]?.accent || INK;
const nameOf = id => CAST[id]?.name || id || "";
function faceChip(g, id, cx, cy, r, alpha = 1, ring) {   // face from cast, or a plain initial chip
  if (alpha <= 0) return;
  const im = IMG[`face:${id}`];
  g.save(); g.globalAlpha *= alpha; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.closePath();
  if (im) { g.save(); g.clip(); g.drawImage(im, cx - r, cy - r, r * 2, r * 2); g.restore(); }
  else { g.fillStyle = PAPER; g.fill(); g.fillStyle = accent(id); g.font = `700 ${r}px ${GO}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText([...nameOf(id)][0] || "?", cx, cy + r * 0.05); }
  g.lineWidth = 3; g.strokeStyle = ring || accent(id); g.stroke(); g.restore();
}
function arrow(g, x0, y0, x1, y1, alpha = 1, color = INK) {
  if (alpha <= 0) return;
  g.save(); g.globalAlpha *= alpha; g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2.4;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - Math.abs(x1 - x0) * 0.06;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
  const a = Math.atan2(y1 - my, x1 - mx);
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - 16 * Math.cos(a - .4), y1 - 16 * Math.sin(a - .4)); g.lineTo(x1 - 16 * Math.cos(a + .4), y1 - 16 * Math.sin(a + .4)); g.closePath(); g.fill();
  g.restore();
}
function hair(g, x0, y0, x1, y1, alpha = .25, color = INK, w = 1) { g.save(); g.globalAlpha *= alpha; g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.restore(); }
function head(g, sh, tl, x = 120) {   // top-left: source tag + title
  const a = eOut(tl / 0.7);
  if (sh.tag) { g.save(); g.globalAlpha = a; g.fillStyle = RED; g.fillRect(x, 92, 12, 12); g.restore(); txt(g, sh.tag, x + 24, 104, 22, { color: GREY, alpha: a, fam: GO, ls: 1 }); }
  if (sh.title) txt(g, sh.title, x, 172, 54, { alpha: a, fam: MIND });
  hair(g, x, 196, W - 120, 196, .22 * a);
}
// time when line k of a section starts speaking (+ f of its length + s seconds)
function lineT(sec, k, f = 0, s = 0) { const L = LN[sec][Math.min(k, LN[sec].length - 1)]; return L.at + (f || 0) * L.len + (s || 0); }
// item i appears with its line (sh.reveal[i] = line index) or on a fixed stagger
function shown(sh, i, t) { const r = sh.reveal; if (!r || r[i] === undefined) return eOut((t - sh.t0 - 0.25 - i * 0.28) / 0.6); return eOut((t - Math.max(sh.t0 + 0.2 + i * 0.12, lineT(sh.sec, r[i]) - 0.25)) / 0.6); }

// ── video clips: per-frame JPGs in assets/video/frames/<id>/ (tools/frames.py); prefetched before drawing ──
let VID = {};
const CF = new Map();
const clipIdx = (id, start, t) => clamp(Math.floor((t - start) * 24 + 1e-6), 0, (VID[id] || 1) - 1);
const clipImg = (id, start, t) => VID[id] ? CF.get(`${id}:${clipIdx(id, start, t)}`) || null : null;
function mangaState(sh, t) {
  const times = sh.seq.map(e => lineT(sh.sec, e[0], e[2], e[3]) - 0.2);
  let cur = 0; times.forEach((tt, i) => { if (t >= tt) cur = i; });
  return { times, cur };
}
function clipNeeds(sh, t) {   // frames this shot needs at t: [[id, start]]
  if (sh.clip) return [[sh.clip, sh.t0 + (sh.clipDelay ?? 0.3)]];
  if (sh.type === "manga" && sh.clips) {
    const { times, cur } = mangaState(sh, t), out = [];
    if (sh.clips[cur]) out.push([sh.clips[cur], times[cur] + 0.3]);
    if (cur > 0 && sh.clips[cur - 1]) out.push([sh.clips[cur - 1], times[cur - 1] + 0.3]);
    return out;
  }
  return [];
}
async function prefetch(sh, t) {
  for (const [id, start] of clipNeeds(sh, t)) {
    if (!VID[id]) continue;
    const i = clipIdx(id, start, t), key = `${id}:${i}`;
    if (!CF.has(key)) { CF.set(key, await loadImg(`${P}/assets/video/frames/${id}/${String(i + 1).padStart(4, "0")}.jpg`)); if (CF.size > 40) CF.delete(CF.keys().next().value); }
  }
}

// ── shots ──
const DRAW = {};
DRAW.illus = (g, sh, t) => {
  const u = sat((t - sh.t0) / (sh.t1 - sh.t0)), z = sh.z || [1, 1.08];
  const cs = sh.clip ? sh.t0 + (sh.clipDelay ?? 0.3) : 0, cf = sh.clip && t >= cs ? clipImg(sh.clip, cs, t) : null;
  cover(g, cf || IMG[sh.img], 0, 0, W, H, sh.still ? 1 : cf ? lerp(1.0, 1.03, eInOut(u)) : lerp(z[0], z[1], eInOut(u)), sh.fx ?? .5, sh.fy ?? .5);
  if (sh.label || sh.cap) {
    const a = eOut((t - sh.t0 - 0.3) / 0.8) * (1 - eOut((t - sh.t0 - 6) / 1.2));
    if (a > 0) {
      font(g, 46, MIND); const w = Math.max(g.measureText(sh.cap || "").width, 200) + 80;
      g.save(); g.globalAlpha = a * 0.9; g.fillStyle = PAPER; g.fillRect(80, 70, w, 128); g.restore();
      hair(g, 96, 84, 96, 184, a, RED, 3);
      txt(g, sh.label || "", 118, 112, 20, { color: RED, fam: MONO, alpha: a, ls: 3 });
      txt(g, sh.cap || "", 116, 170, 46, { alpha: a, fam: MIND });
    }
  }
};
DRAW.title = (g, sh, t) => {
  const tl = t - sh.t0, u = sat(tl / (sh.t1 - sh.t0));
  const cs = sh.clip ? sh.t0 + (sh.clipDelay ?? 0.3) : 0, cf = sh.clip && t >= cs ? clipImg(sh.clip, cs, t) : null;
  cover(g, cf || IMG[sh.img], 0, 0, W, H, cf ? lerp(1.0, 1.03, u) : lerp(1.0, 1.06, u), .5, .5);
  const gr = g.createLinearGradient(0, 520, 0, H); gr.addColorStop(0, "rgba(243,238,227,0)"); gr.addColorStop(0.45, "rgba(243,238,227,0.9)"); gr.addColorStop(1, "rgba(243,238,227,1)");
  g.fillStyle = gr; g.fillRect(0, 520, W, H - 520);
  const a = eOut((tl - 0.6) / 1.2), b = eOut((tl - 1.4) / 1.0), c = eOut((tl - 2.0) / 1.0);
  txt(g, sh.title, W / 2, 790 - 20 * (1 - a), 112, { align: "center", fam: MIND, alpha: a, ls: 10 });
  hair(g, W / 2 - 360 * b, 822, W / 2 + 360 * b, 822, .8 * b, RED, 2);
  txt(g, sh.sub, W / 2, 878, 40, { align: "center", alpha: b, ls: 4 });
  txt(g, sh.small || "", W / 2, 924, 24, { align: "center", color: GREY, alpha: c, fam: GO, ls: 2 });
};
DRAW.quote = (g, sh, t) => {
  const tl = t - sh.t0; head(g, { tag: sh.tag }, tl);
  const n = sh.lines.length, y0 = 520 - (n - 1) * 62;
  sh.lines.forEach((l, i) => { const a = eOut((tl - 0.3 - i * 0.45) / 0.8); txt(g, l, W / 2, y0 + i * 124 + 16 * (1 - a), 76, { align: "center", fam: MIND, alpha: a, ls: 4 }); });
  const a = eOut((tl - 0.6 - n * 0.45) / 0.8);
  hair(g, W / 2 - 300 * a, y0 + n * 124 - 40, W / 2 + 300 * a, y0 + n * 124 - 40, .9 * a, RED, 2);
  if (sh.foot) txt(g, sh.foot, W / 2, y0 + n * 124 + 20, 30, { align: "center", color: GREY, alpha: a });
};
DRAW.flow = (g, sh, t) => {
  const tl = t - sh.t0; head(g, sh, tl);
  const n = sh.nodes.length, bw = Math.min(380, (1560 - (n - 1) * 90) / n), bh = 230, gap = (1680 - n * bw) / Math.max(1, n - 1), y = 400;
  sh.nodes.forEach((nd, i) => {
    const a = shown(sh, i, t), x = 120 + i * (bw + gap);
    g.save(); g.globalAlpha = a; g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(x, y, bw, bh); g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(x, y, bw, bh); g.restore();
    txt(g, String(i + 1).padStart(2, "0"), x + 18, y + 34, 20, { fam: MONO, color: RED, alpha: a });
    font(g, 44, MIND); const fs = g.measureText(nd.t).width > bw - 40 ? Math.floor(44 * (bw - 40) / g.measureText(nd.t).width) : 44;
    txt(g, nd.t, x + bw / 2, y + 112, fs, { align: "center", fam: MIND, alpha: a });
    para(g, nd.d || "", x + bw / 2, y + 160, 26, bw - 40, 34, { align: "center", color: GREY, alpha: a });
    if (i < n - 1) arrow(g, x + bw + 12, y + bh / 2, x + bw + gap - 12, y + bh / 2, shown(sh, i + 1, t));
  });
};
DRAW.list = (g, sh, t) => {
  const tl = t - sh.t0; head(g, sh, tl);
  const n = sh.items.length, x0 = 140, wText = sh.side ? 900 : 1500;
  let y = 290; const step = Math.min(200, 620 / n);
  sh.items.forEach((it, i) => {
    const a = shown(sh, i, t) * (sh.hl === undefined || sh.hl === i ? 1 : 0.45);
    txt(g, it.n, x0 + 30, y + 64, it.n.length > 1 ? 54 : 84, { align: "center", color: RED, fam: MIND, alpha: a });
    txt(g, it.t, x0 + 120, y + 44, 44, { fam: MIND, alpha: a });
    para(g, it.d, x0 + 122, y + 92, 28, wText, 38, { color: GREY, alpha: a });
    hair(g, x0, y + step - 14, x0 + wText + 120, y + step - 14, .15 * a);
    y += step;
  });
};
function tableRows(g, sh, x0, wAll, fs) {
  const ws = (sh.w || sh.cols.map(() => 1 / sh.cols.length)).map(f => f * wAll), lh = fs * 1.42;
  return sh.rows.map(r => Math.max(...r.map((c, j) => measureLines(g, c, j === 0 ? fs + 2 : fs, ws[j] - 36, j === 0 ? MIND : MIN))) * lh + 34);
}
DRAW.table = (g, sh, t) => {
  const tl = t - sh.t0; head(g, sh, tl);
  const x0 = 120, wAll = 1680, ws = (sh.w || sh.cols.map(() => 1 / sh.cols.length)).map(f => f * wAll);
  let fs = 30, hs = tableRows(g, sh, x0, wAll, fs);
  while (fs > 21 && hs.reduce((a, b) => a + b, 0) > 600 - (sh.note ? 50 : 0)) { fs -= 1; hs = tableRows(g, sh, x0, wAll, fs); }
  let y = 232; const a0 = eOut(tl / .6);
  let x = x0; sh.cols.forEach((c, j) => { txt(g, c, x + 18, y + 34, 24, { color: GREY, fam: GO, alpha: a0, ls: 1 }); x += ws[j]; });
  y += 52; hair(g, x0, y, x0 + wAll, y, .7 * a0, INK, 1.4);
  sh.rows.forEach((r, i) => {
    const on = shown(sh, i, t), dim = sh.hl === undefined || sh.hl === i ? 1 : 0.42, a = on * dim;
    if (sh.hl === i && on > 0) { g.save(); g.globalAlpha = 0.10 * on; g.fillStyle = RED; g.fillRect(x0, y, wAll, hs[i]); g.restore(); hair(g, x0, y, x0, y + hs[i], on, RED, 4); }
    let x = x0;
    r.forEach((c, j) => { para(g, c, x + 18, y + 17 + fs, j === 0 ? fs + 2 : fs, ws[j] - 36, fs * 1.42, { fam: j === 0 ? MIND : MIN, alpha: a, color: j === 0 ? INK : "#2c2925" }); x += ws[j]; });
    y += hs[i]; hair(g, x0, y, x0 + wAll, y, .22 * on);
  });
  if (sh.note) txt(g, sh.note, x0, y + 44, 24, { color: GREY, alpha: a0, fam: GO });
};
DRAW.compare = (g, sh, t) => {
  const tl = t - sh.t0; head(g, sh, tl);
  sh.rows.forEach((row, i) => {
    const y = 330 + i * 230, a = eOut((tl - 0.3 - i * 0.9) / 0.7);
    txt(g, row.h, 140, y + 70, 34, { fam: MIND, alpha: a, color: i ? RED : GREY });
    const bw = 380, x0 = 520;
    row.n.forEach((nd, j) => {
      const x = x0 + j * (bw + 70), b = eOut((tl - 0.4 - i * 0.9 - j * 0.25) / 0.6);
      g.save(); g.globalAlpha = b; g.strokeStyle = i ? RED : INK; g.lineWidth = 1.6; g.strokeRect(x, y, bw, 110); g.restore();
      font(g, 36, MIND); const fs = g.measureText(nd).width > bw - 30 ? Math.floor(36 * (bw - 30) / g.measureText(nd).width) : 36;
      txt(g, nd, x + bw / 2, y + 68, fs, { align: "center", fam: MIND, alpha: b });
      if (j < row.n.length - 1) arrow(g, x + bw + 8, y + 55, x + bw + 62, y + 55, b);
    });
  });
  if (sh.foot) txt(g, sh.foot, W / 2, 860, 32, { align: "center", color: GREY, alpha: eOut((tl - 2.2) / 0.8) });
};
DRAW.axis = (g, sh, t) => {   // a spectrum: nodes (with a face or initial chip) placed between two poles
  const tl = t - sh.t0; head(g, sh, tl);
  const y = 470, x0 = 170, x1 = W - 170, a0 = eOut(tl / .8);
  hair(g, x0, y, x1, y, .8 * a0, INK, 2); arrow(g, x1 - 60, y, x1 + 10, y, a0); arrow(g, x0 + 60, y, x0 - 10, y, a0);
  txt(g, "← " + sh.left, x0 - 20, y - 220, 32, { fam: MIND, color: TEAL, alpha: a0 });
  txt(g, sh.right + " →", x1 + 20, y - 220, 32, { fam: MIND, color: RED, alpha: a0, align: "right" });
  const n = sh.nodes.length, step = (x1 - x0 - 120) / Math.max(1, n - 1);
  sh.nodes.forEach((nd, i) => {
    const a = shown(sh, i, t), cx = x0 + 60 + i * step;
    if (nd.face) faceChip(g, nd.face, cx, y - 105, 70, a);
    g.save(); g.globalAlpha = a; g.fillStyle = nd.face ? accent(nd.face) : RED; g.beginPath(); g.arc(cx, y, 9, 0, 7); g.fill(); g.restore();
    txt(g, nd.t, cx, y + 58, 32, { align: "center", fam: MIND, alpha: a });
    txt(g, nd.w || "", cx, y + 96, 21, { align: "center", color: GREY, alpha: a, fam: GO });
    para(g, nd.d || "", cx, y + 140, 23, 300, 32, { align: "center", alpha: a });
  });
};
DRAW.manga = (g, sh, t) => {   // whole page on the left, current panel enlarged on the right (panels from src/panels.json)
  const page = IMG[`page:${sh.page}`], boxes = PANELS[sh.page]; if (!page) return;
  const ps = 1000 / page.height, px = 100, py = 40, pw = page.width * ps;
  const { times, cur } = mangaState(sh, t);
  const pan = sh.seq[cur][1], prevPan = cur > 0 ? sh.seq[cur - 1][1] : pan, sw = eOut((t - times[cur]) / 0.55);
  g.drawImage(page, px, py, pw, page.height * ps);
  boxes.forEach((b, i) => { if (i === pan) return; const k = i === prevPan ? 1 - sw : 1; g.save(); g.globalAlpha = 0.5 * k; g.fillStyle = PAPER; g.fillRect(px + b[0] * ps, py + b[1] * ps, (b[2] - b[0]) * ps, (b[3] - b[1]) * ps); g.restore(); });
  const bb = boxes[pan]; g.save(); g.globalAlpha = sw; g.strokeStyle = RED; g.lineWidth = 3; g.strokeRect(px + bb[0] * ps - 3, py + bb[1] * ps - 3, (bb[2] - bb[0]) * ps + 6, (bb[3] - bb[1]) * ps + 6); g.restore();
  txt(g, `${sh.page}　｜　${cur + 1} / ${sh.seq.length}`, px, py + 1000 + 30, 18, { fam: MONO, color: GREY });
  const zx = 830, zy = 50, zw = 1000, zh = 840;
  const drawPanel = (b, alpha, drift) => {
    const m = 6, sx = b[0] - m, sy = b[1] - m, sW = b[2] - b[0] + 2 * m, sH = b[3] - b[1] + 2 * m;
    const s = Math.min(zw / sW, zh / sH, 1.45) * (1 + 0.035 * drift), dw = sW * s, dh = sH * s;
    g.save(); g.globalAlpha = alpha; g.drawImage(page, sx, sy, sW, sH, zx + (zw - dw) / 2, zy + (zh - dh) / 2, dw, dh); g.restore();
  };
  const tEnd = cur + 1 < times.length ? times[cur + 1] : sh.t1, drift = sat((t - times[cur]) / Math.max(1, tEnd - times[cur]));
  if (sw < 1 && cur > 0) drawPanel(boxes[prevPan], 1 - sw, 1);
  drawPanel(bb, cur > 0 ? sw : eOut((t - sh.t0) / 0.6), drift);
  const cid = sh.clips && sh.clips[cur], cst = times[cur] + 0.3, cfr = cid && t >= cst ? clipImg(cid, cst, t) : null;
  if (cfr) {   // this panel has a clip: dissolve from the still into it
    const s = Math.min(zw / cfr.width, zh / cfr.height) * (1 + 0.02 * drift), dw = cfr.width * s, dh = cfr.height * s;
    g.save(); g.globalAlpha = eOut((t - cst) / 0.4); g.fillStyle = PAPER; g.fillRect(zx, zy, zw, zh); g.drawImage(cfr, zx + (zw - dw) / 2, zy + (zh - dh) / 2, dw, dh); g.restore();
  }
};
function inkbar(g, x, y, w, h, k, color = INK, seed = 1) {   // brushed bar: heavy start, dry-brush tail
  if (k <= 0) return;
  const L = w * eOut(k), n = 24;
  g.save(); g.fillStyle = color; g.beginPath(); g.moveTo(x, y + h * 0.1);
  for (let i = 0; i <= n; i++) { const u = i / n; g.lineTo(x + L * u, y + h * (0.06 + 0.06 * noise1(u * 6, seed))); }
  for (let i = n; i >= 0; i--) { const u = i / n; g.lineTo(x + L * u, y + h * (0.94 - 0.08 * noise1(u * 5 + 3, seed) - 0.25 * Math.pow(u, 6))); }
  g.closePath(); g.globalAlpha *= 0.9; g.fill(); g.restore();
}
function stamp(g, x, y, s, label, alpha, rot = -0.06) {   // red seal, "|" breaks lines
  if (alpha <= 0) return;
  g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha *= alpha;
  g.fillStyle = RED; g.fillRect(-s / 2, -s / 2, s, s);
  g.strokeStyle = "rgba(244,239,230,0.85)"; g.lineWidth = s * 0.04; g.strokeRect(-s * 0.42, -s * 0.42, s * 0.84, s * 0.84);
  g.fillStyle = PAPER; g.textAlign = "center"; g.textBaseline = "middle";
  const rows = label.split("|"), fs = Math.min(0.26, 0.72 / Math.max(...rows.map(r => r.length))) * s;
  g.font = `700 ${fs}px ${MIN}`; rows.forEach((r, i) => g.fillText(r, 0, (i - (rows.length - 1) / 2) * fs * 1.15));
  g.restore();
}
function brushWrite(g, s, x, y, size, t, t0) { if (typeof writeLine === "function") writeLine(s, x, y, size, size * 1.02, t, t0, INK, 1, false, 7, g); }
function feathered(g, im, x, y, w, h, z = 1, fx = .5, fy = .5, alpha = 1) {   // cover-crop into a box, edges fade into paper
  if (!im || alpha <= 0) return;
  const L = mk(w, h), lg = L.getContext("2d"); cover(lg, im, 0, 0, w, h, z, fx, fy);
  const key = `c${Math.round(w)}x${Math.round(h)}`;
  if (!FEA[key]) { const m = mk(w, h), mg = m.getContext("2d"), f = Math.min(w, h) * 0.05; mg.filter = `blur(${f}px)`; mg.fillStyle = "#fff"; mg.fillRect(f * 1.6, f * 1.6, w - f * 3.2, h - f * 3.2); FEA[key] = m; }
  lg.globalCompositeOperation = "destination-in"; lg.drawImage(FEA[key], 0, 0);
  g.save(); g.globalAlpha *= alpha; g.drawImage(L, x, y); g.restore();
}
DRAW.opener = (g, sh, t) => {   // section opener: brush-written kanji + number + heading; optional image on the right
  const tl = t - sh.t0, u = sat((t - sh.t0) / (sh.t1 - sh.t0)), hasImg = !!sh.img;
  if (hasImg) feathered(g, IMG[sh.img], 860, 70, 1000, 760, lerp(1.0, 1.07, eInOut(u)), sh.fx ?? .5, sh.fy ?? .5, eOut((tl - 0.6) / 1.2));
  const n = [...sh.kanji].length, cx = hasImg ? 420 : (n > 1 ? 470 : 540), size = hasImg ? (n > 1 ? 230 : 300) : (n > 1 ? 270 : 360);
  brushWrite(g, sh.kanji, cx, hasImg ? 330 : 500, size, t, sh.t0 + 0.15);
  const A = k => eOut((tl - k) / 0.7), tx = hasImg ? 120 : 900, ty = hasImg ? 640 : 440, fs = hasImg ? 50 : 62, lh = hasImg ? 64 : 80, mw = hasImg ? 700 : 900;
  const extra = (measureLines(g, sh.head, fs, mw, MIND) - 1) * lh;
  txt(g, sh.num || "", tx, ty, 24, { fam: MONO, color: RED, alpha: A(1.0), ls: 3 });
  para(g, sh.head, tx, ty + 70, fs, mw, lh, { fam: MIND, alpha: A(1.2) });
  inkbar(g, tx, ty + (hasImg ? 110 : 130) + extra, 260, 14, sat((tl - 1.5) / 0.8), RED, 3);
  if (sh.sub) para(g, sh.sub, tx, ty + (hasImg ? 180 : 210) + extra, 28, hasImg ? 700 : 880, 42, { color: GREY, alpha: A(1.8) });
  if (sh.stamp) stamp(g, hasImg ? 760 : 1730, 250, 130, sh.stamp, sat((tl - 2.2) / 0.35));
};
DRAW.split = (g, sh, t) => {   // image (or a cast figure) on one side, title + bullet points revealed with the lines
  const tl = t - sh.t0, u = sat((t - sh.t0) / (sh.t1 - sh.t0)), left = (sh.side || "left") === "left";
  const px = left ? 50 : 1000, tx = left ? 1010 : 110, tw = 790;
  const fig = sh.fig && IMG[`cast:${sh.fig}`];
  if (fig) { const h = 1000, w = fig.width * h / fig.height; soft(g, fig, (left ? 500 : 1440) - w / 2, 40 + 10 * (1 - eOut(tl / .8)), w, h, eOut(tl / .8)); }
  else feathered(g, IMG[sh.img], px, 80, 870, 780, lerp(sh.z?.[0] ?? 1.0, sh.z?.[1] ?? 1.08, eInOut(u)), sh.fx ?? .5, sh.fy ?? .5, eOut(tl / .9));
  const A = k => eOut((tl - k) / 0.7);
  if (sh.tag) { g.save(); g.globalAlpha = A(0.2); g.fillStyle = RED; g.fillRect(tx, 112, 12, 12); g.restore(); txt(g, sh.tag, tx + 24, 124, 21, { color: GREY, fam: GO, alpha: A(0.2), ls: 1 }); }
  let y = para(g, sh.title, tx, 206, 56, tw, 70, { fam: MIND, alpha: A(0.35) });
  inkbar(g, tx, y - 34, 220, 13, sat((tl - 0.6) / 0.8), RED, 5);
  y += 52;
  (sh.items || []).forEach((it, i) => {
    const a = shown(sh, i, t), hl = sh.hl === undefined || sh.hl === i;
    g.save(); g.globalAlpha = a * (hl ? 1 : 0.45); g.fillStyle = hl && sh.hl !== undefined ? RED : INK; g.beginPath(); g.arc(tx + 10, y - 14, 8, 0, 7); g.fill(); g.restore();
    y = para(g, it.t, tx + 36, y, 40, tw - 36, 52, { fam: MIND, alpha: a * (hl ? 1 : 0.45) });
    if (it.d) y = para(g, it.d, tx + 36, y + 6, 28, tw - 36, 40, { color: GREY, alpha: a * (hl ? 1 : 0.45) });
    y += 30;
  });
  if (sh.stamp) stamp(g, left ? 1780 : 840, 820, 120, sh.stamp, sat((t - lineT(sh.sec, sh.stampK ?? 0, sh.stampF ?? 0.5)) / 0.35));
};

// ── shot table ──
function buildShots() {
  for (const L of TL.lines) (LN[L.sec] = LN[L.sec] || [])[L.k] = L;
  BOARD.secs.forEach((sec, si) => {
    SECS.push(sec.id);
    sec.shots.forEach(sh0 => {
      let sh = { ...sh0 };
      if (sh.ref !== undefined) { const base = sec.shots.find(x => x.type === sh.type && x.ref === undefined); sh = { ...base, ...sh0 }; }   // same diagram again, new highlight
      sh.sec = sec.id; sh.si = si; sh.label0 = sec.label;
      sh.t0 = (sh.k === 0 && !sh.f && !sh.s) ? TL.secs[sec.id][0] : lineT(sec.id, sh.k, sh.f, sh.s) - 0.3;
      if (sh.img) sh.img = `img:${sh.img}`;
      if (sh.from) sh.from = `img:${sh.from}`;
      SHOTS.push(sh);
    });
  });
  SHOTS.forEach((s, i) => s.t1 = i + 1 < SHOTS.length ? SHOTS[i + 1].t0 : TL.dur);
}
async function loadAll() {
  [TL, BOARD, PANELS] = await Promise.all([getJ(`${P}/src/timeline.json`), getJ(`${P}/src/board.json`), getJ(`${P}/src/panels.json`).catch(() => ({}))]);
  const cj = await getJ(`${P}/assets/cast/cast.json`).catch(() => ({ cast: [] }));
  cj.cast.forEach(c => CAST[c.id] = c);
  buildShots();
  VID = await getJ(`${P}/assets/video/frames/index.json`).catch(() => ({}));
  const want = new Map();
  for (const s of SHOTS) {
    for (const k of [s.img, s.from]) if (k) want.set(k, `${P}/assets/${k.slice(4)}.png`);
    if (s.page) want.set(`page:${s.page}`, `${P}/assets/manga/${s.page}.png`);
  }
  for (const c of Object.values(CAST)) {
    if (c.face) want.set(`face:${c.id}`, `${P}/assets/cast/${c.face}`);
    if (c.image) want.set(`cast:${c.id}`, `${P}/assets/cast/${c.image}`);
  }
  await Promise.all([...want].map(async ([k, src]) => { IMG[k] = await loadImg(src); }));
  makeMaps();
  IMG.paper = makePaper();
  if (typeof presample === "function") presample();
  await document.fonts.load(`40px ${MIN}`); await document.fonts.load(`40px ${GO}`);
}

// ── compositing ──
const LA = mk(W, H), LB = mk(W, H), LC = mk(W, H);
function shotLayer(L, sh, t) { const g = L.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, W, H); DRAW[sh.type](g, sh, t); return L; }
function paper(g) { g.drawImage(IMG.paper, 0, 0, W, H); }
// subtitle box geometry for one cue; also used by components to keep things above it
const SUB = { x: 300, w: 1320, bottom: 1050 };
function subLayout(g, s, bw = SUB.w) {
  const chip = IMG[`face:${s[3]}`] ? 118 : 24;
  font(g, 27, LAT); const es = s[4] ? wrapWords(g, s[4], bw - chip - 50) : [];
  font(g, 40, GO, "bold"); const ls = wrap(g, s[2], bw - chip - 50);
  return { chip, ls, es, bh: 42 + ls.length * 54 + (es.length ? 10 + es.length * 36 : 0) };
}
function subtitle(g, t) {   // Japanese line + its English line, speaker tag above the box
  const s = TL.subs.find(x => t >= x[0] && t < x[1]); if (!s) return;
  const a = sat((t - s[0]) / 0.18) * sat((s[1] - t) / 0.18), who = s[3];
  const sh = SHOTS.find(x => t >= x.t0 && t < x.t1), manga = sh && sh.type === "manga";
  const bx = manga ? 820 : SUB.x, bw = manga ? 1030 : SUB.w;
  const { chip, ls, es, bh } = subLayout(g, s, bw), by = SUB.bottom - bh;
  g.save(); g.globalAlpha = a * 0.9; g.fillStyle = PAPER; g.shadowColor = "rgba(40,30,20,0.18)"; g.shadowBlur = 24; g.fillRect(bx, by, bw, bh); g.restore();
  hair(g, bx, by, bx, by + bh, a, accent(who), 5);
  if (IMG[`face:${who}`]) faceChip(g, who, bx + 64, by + bh / 2, 40, a);
  const nm = nameOf(who);
  if (nm) {
    font(g, 20, GO, "bold"); const nw = g.measureText(nm).width + 28;
    g.save(); g.globalAlpha = a * 0.92; g.fillStyle = PAPER; g.fillRect(bx, by - 34, nw, 34); g.restore();
    txt(g, nm, bx + 14, by - 10, 20, { color: accent(who), fam: GO, w: "bold", alpha: a });
  }
  ls.forEach((l, i) => txt(g, l, bx + chip + 18, by + 64 + i * 54, 40, { fam: GO, w: "bold", alpha: a, color: INK }));
  es.forEach((l, i) => txt(g, l, bx + chip + 18, by + 64 + ls.length * 54 + 4 + i * 36, 27, { fam: LAT, alpha: a * 0.95, color: EN }));
}
function chrome(g, t, sh) {   // corner marks: film mark / section label + number / optional signature
  if (sh.type === "title") return;
  const a = 0.75;
  txt(g, BOARD.mark || "", 40, 40, 17, { color: GREY, fam: GO, alpha: a, ls: 3 });
  if (BOARD.brand) txt(g, BOARD.brand, W - 40, H - 14, 16, { align: "right", color: GREY, fam: LAT, alpha: 0.8, ls: 1 });
  txt(g, `${sh.label0}　${String(sh.si + 1).padStart(2, "0")} / ${String(SECS.length).padStart(2, "0")}`, W - 40, 40, 17, { align: "right", color: GREY, fam: MONO, alpha: a, ls: 2 });
}
async function renderAt(t) {
  let i = 0; for (let k = 0; k < SHOTS.length; k++) if (t >= SHOTS[k].t0) i = k;
  const sh = SHOTS[i];
  await prefetch(sh, t); if (i > 0) await prefetch(SHOTS[i - 1], t);
  ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; paper(ctx);
  const cur = shotLayer(LA, sh, t);
  let comp = cur;
  const newSec = i > 0 && SHOTS[i - 1].sec !== sh.sec, TR = newSec ? 1.1 : 0.6, k = (t - sh.t0) / TR;
  if (i > 0 && k < 1 && !sh.cut) {   // cut: the shot handles its own transition
    const prev = shotLayer(LB, SHOTS[i - 1], t), g = LC.getContext("2d");
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.clearRect(0, 0, W, H);
    if (newSec) {
      const m = inkMask(["stroke", "drop", "splash"][sh.si % 3], sh.si % 2, eInOut(k));
      g.drawImage(prev, 0, 0); g.globalCompositeOperation = "destination-out"; g.drawImage(m, 0, 0);
      const M = LB.getContext("2d"); M.globalCompositeOperation = "source-over"; M.clearRect(0, 0, W, H); M.drawImage(cur, 0, 0);
      M.globalCompositeOperation = "destination-in"; M.drawImage(m, 0, 0); M.globalCompositeOperation = "source-over";
      g.globalCompositeOperation = "source-over"; g.drawImage(LB, 0, 0);
    } else {
      const e = eInOut(k); g.globalAlpha = 1 - e; g.drawImage(prev, 0, 0); g.globalAlpha = e; g.drawImage(cur, 0, 0); g.globalAlpha = 1;
    }
    comp = LC;
  }
  ctx.globalCompositeOperation = "multiply"; ctx.drawImage(comp, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  chrome(ctx, t, sh);
  subtitle(ctx, t);
  const fi = sat(t / 0.8), fo = sat((TL.dur - t) / 1.2);
  if (fi < 1 || fo < 1) { ctx.fillStyle = `rgba(20,18,16,${1 - Math.min(fi, fo)})`; ctx.fillRect(0, 0, W, H); }
}
window.renderAt = renderAt;
loadAll().then(() => { window.READY = `${PROJ} ${SHOTS.length} shots ${TL.dur}s`; const q = new URLSearchParams(location.search).get("t"); renderAt(q ? +q : 0); }, e => { window.LOAD_ERROR = String(e); });
