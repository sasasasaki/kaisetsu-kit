// Every line gets a reaction: a beat layer drawn above the shot and below cards/subtitles. Load after components.js.
// board.beats: [{sec, k, at: "substring of the line", do: "cam|write|strike|circle|tag|inset|slot|fill|paper|formula|board2|clear|rest", ...}]
// Time = the line's file start + when the first character of `at` is spoken (assets/voice/align.json from tools/align.py; without it, the
// position of `at` in the line). Rewrite the script and the beats re-time themselves as long as the substring is still there.
// Named boxes on a scene image: assets/regions.json {"kv/x": {"w":..,"h":..,"r": {"bar": [x0,y0,x1,y1] (0-1)}}}; boxes follow the push/pull.
// Rules learned in production: a cut clears every layer stacked on the previous shot (slot excepted); a carrier (slot) appears only when its
// first entry is written; every written word/tag carries an English line (`en`); circles and strikes use the same brush as the title calligraphy.
// Placement: tags, written words and insets stay out of the subtitle box (tallest subtitle while they show), off the edges and header, clear of
// cards, tri bands and the faces of the current shot (assets/faces.json through the push/pull), searching the nearest free spot.
// `mark` underlines a spoken word inside the subtitle (gap filler; tools/fill_marks.py).
const XB = { list: [], align: {}, regions: {}, ready: false };
const TEA = "#7a5a32";

function xbJ(p) { const x = new XMLHttpRequest(); x.open("GET", p, false); x.send(); return x.status === 200 ? JSON.parse(x.responseText) : {}; }
function xbInit() {
  if (XB.ready) return; XB.ready = true;
  XB.align = xbJ(`${P}/assets/voice/align.json`); XB.regions = xbJ(`${P}/assets/regions.json`);
  const sorted = (BOARD.beats || []).map(b => ({ ...b, t: xbTime(b) }));
  sorted.sort((a, b) => a.t - b.t);
  sorted.forEach(b => { for (const [f, to] of [['fixAt', 'fixT'], ['rightAt', 'rt'], ['stoneAt', 'stoneT']]) if (b[f]) b[to] = xbTime({ sec: b.sec, k: b.k, at: b[f], frac: b[f + 'Frac'] }); });
  const secEnd = s => TL.secs[s][1];
  sorted.forEach(b => {
    const L = LN[b.sec][b.k];
    b.t1 = b.until !== undefined ? b.t + b.until : b.hold === "sec" ? secEnd(b.sec) - 0.8 : b.hold === "next" ? null : Math.max(b.t + 1.4, L.at + L.len + (b.hold ?? 0.6));
  });
  sorted.forEach((b, i) => { if (b.t1 === null) { const nx = sorted.slice(i + 1).find(x => x.do === b.do && (x.slot ?? x.id) === (b.slot ?? b.id)); b.t1 = nx ? nx.t - 0.1 : TL.secs[b.sec][1] - 0.8; } });
  sorted.filter(b => b.do === "clear").forEach(c => sorted.forEach(b => { if (b !== c && b.id && c.ids.includes(b.id) && b.t < c.t && b.t1 > c.t) b.t1 = c.t; }));
  const cuts = SHOTS.map(s => s.t0).sort((a, b) => a - b);
  sorted.forEach(b => {
    if (b.do === "slot") { const f = sorted.find(z => z.do === "fill" && z.sec === b.sec); if (f) b.t = f.t - 0.05; return; }
    if (b.do === "mark") return;
    const c = cuts.find(c => c > b.t + 0.05); if (c === undefined) return;
    b.cut = c; b.t1 = Math.min(b.t1, Math.max(b.t + 0.3, c - 0.35));
  });
  XB.list = sorted;
  for (const sh of SHOTS) if (sh.type === "scene" && !sh.sum) sh.track = xbTrack(sh);
}
function xbTime(b) {
  const L = LN[b.sec][b.k]; if (!b.at) return L.at + (b.dt || 0);
  const A = XB.align[L.id], base = L.at - (L.lead || 0);
  if (!A) return L.at + L.len * (b.frac || 0) + (b.dt || 0);
  const i = A.text.indexOf(b.at); if (i < 0) throw new Error(`beat「${b.at}」not in ${L.id}`);
  return base + A.t[i] + (b.dt || 0);
}

function xbCover(img, box, fill) {
  const R = XB.regions[img], w = R?.w || 1672, h = R?.h || 941, s0 = Math.max(W / w, H / h);
  const bw = (box[2] - box[0]) * w * s0, bh = (box[3] - box[1]) * h * s0;
  const z = clamp(Math.min(fill * H / bh, fill * W / bw), 1.12, 1.42)
  , dw = w * s0 * z, dh = h * s0 * z;
  const uc = (box[0] + box[2]) / 2, vc = (box[1] + box[3]) / 2;
  const fx = dw > W ? sat((W / 2 - uc * dw) / (W - dw)) : 0.5, fy = dh > H ? sat((H / 2 - vc * dh) / (H - dh)) : 0.5;
  return [z, fx, fy];
}
function xbTrack(sh) {
  const k0 = sh.kf || {}, a = [k0.z?.[0] ?? 1, k0.fx?.[0] ?? 0.5, k0.fy?.[0] ?? 0.5];
  const keys = [[sh.t0, ...a]];
  const img = sh.img.replace(/^img:/, "");
  for (const b of XB.list) {
    if (b.do !== "cam" || b.t < sh.t0 || b.t >= sh.t1 || (b.img && b.img !== img)) continue;
    const box = b.box === "full" ? [0, 0, 1, 1] : XB.regions[img]?.r?.[b.box]; if (!box) throw new Error(`region ${b.box} missing on ${img}`);
    const tgt = b.box === "full" ? [1.0, 0.5, 0.5] : xbCover(img, box, b.fill ?? 0.6);
    keys.push([b.t - 0.1, null], [b.t - 0.1 + (b.dur ?? 0.8), ...tgt, b.ease || "io"]);
  }
  if (keys.length === 1) return null;
  for (let i = 1; i < keys.length; i += 2) keys[i] = [keys[i][0], ...keys[i - 1].slice(1, 4)];
  return keys;
}
function xbCam(sh, t) {
  const K = sh.track; let i = 0; while (i + 1 < K.length && K[i + 1][0] <= t) i++;
  if (i + 1 >= K.length) { const k = K[K.length - 1], d = t - k[0]; return [k[1] * (1 + 0.015 * sat(d / 6)), k[2], k[3]]; }
  const a = K[i], b = K[i + 1]; if (a[1] === b[1] && a[2] === b[2] && a[3] === b[3]) { const d = t - a[0]; return [a[1] * (1 + 0.015 * sat(d / 6)), a[2], a[3]]; }
  const u = sat((t - a[0]) / Math.max(0.01, b[0] - a[0])), e = b[4] === "out" ? 1 - Math.pow(1 - u, 4) : eInOut(u);
  return [lerp(a[1], b[1], e), lerp(a[2], b[2], e), lerp(a[3], b[3], e)];
}
const xbKen0 = kenOf;
kenOf = function (sh, t) { xbInit(); return sh.track ? xbCam(sh, t) : xbKen0(sh, t); };

function xbRect(img, name, t) {
  const sh = SHOTS.find(s => s.type === "scene" && s.img === "img:" + img && t >= s.t0 - 0.01 && t < s.t1 + 0.6); if (!sh) return null;
  const R = XB.regions[img], box = name === "full" ? [0, 0, 1, 1] : R?.r?.[name]; if (!box) return null;
  const w = R.w, h = R.h, [z, fx, fy] = kenOf(sh, t), s = Math.max(W / w, H / h) * z, dw = w * s, dh = h * s, ox = (W - dw) * fx, oy = (H - dh) * fy;
  return [ox + box[0] * dw, oy + box[1] * dh, ox + box[2] * dw, oy + box[3] * dh];
}
function xbWhere(b, t) {   // the screen point is fixed at first draw: following the box let a later push carry a fading tag off screen
  if (b.whAt) return b.whAt;
  const w = xbWhere0(b, t); if (w && t >= b.t) b.whAt = w;
  return w;
}
function xbWhere0(b, t) {
  if (b.pos) return [b.pos[0] * W, b.pos[1] * H];
  const r = xbRect(b.img, b.box, t); if (!r) return null;
  const sd = b.side || "top";
  return sd === "top" ? [(r[0] + r[2]) / 2, r[1] - 18] : sd === "bottom" ? [(r[0] + r[2]) / 2, r[3] + 52] : sd === "left" ? [r[0] - 20, (r[1] + r[3]) / 2] : [r[2] + 20, (r[1] + r[3]) / 2];
}

function xbEn(g, s, x, y, fs, a) { if (s) txt(g, s, x, y, fs, { align: "center", fam: LAT, color: EN, alpha: a }); }
function xbSubTop(g, t0, t1) {
  let top = H - 30;
  for (const s of TL.subs) {
    if (s[1] <= t0 || s[0] >= t1) continue;
    const sh = SHOTS.find(x => s[0] >= x.t0 && s[0] < x.t1), bw = sh && sh.type === "manga" ? 1030 : 1320, chip = 118;
    g.save(); font(g, 27, LAT); const es = s[4] ? wrapWords(g, s[4], bw - chip - 50) : [];
    font(g, 40, GO, "bold"); const ls = wrap(g, s[2], bw - chip - 50); g.restore();
    top = Math.min(top, 1050 - (42 + ls.length * 54 + (es.length ? 10 + es.length * 36 : 0)) - 34);
  }
  return top;
}
function xbLifeObs(b) {   // cards, tri bands, circles and strikes that show during this reaction's life: avoided on first placement
  const o = [], t0 = b.t - 0.1, t1 = b.t1 + 0.4;
  o.push(...cardsForBeats(t0, t1));
  if (typeof TRIS !== "undefined") for (const c of TRIS) if (c.t0 - 0.2 < t1 && c.t1 + 0.4 > t0) o.push(c.mode === "band" ? [0, 760, W, H] : [40, 86, 1240, 356]);
  for (const c of XB.list) {
    if (c === b || (c.do !== "circle" && c.do !== "strike") || c.t > t1 || c.t1 < t0) continue;
    const q = c.rect ? c.rect.map((v, i) => v * (i % 2 ? H : W)) : c.img && c.box ? xbRect(c.img, c.box, c.t + 0.3) : null;
    if (q) o.push([q[0] - 22, q[1] - 18, q[2] + 22, q[3] + 18]);
  }
  return o;
}
function xbFit(g, b, x0, y0, x1, y1) {   // placed once on first draw, then kept: re-fitting every frame made labels jump when other layers came and went
  const L = 24, T = 64, R = W - 24, B = (b.subTop ??= xbSubTop(g, b.t - 0.1, b.t1 + 0.6)) - 14;
  const bx = x0 < L ? L - x0 : x1 > R ? R - x1 : 0, by = y1 > B ? Math.max(T - y0, B - y1) : y0 < T ? T - y0 : 0;
  if (b.fitAt) { XB.placed.push([x0 + b.fitAt[0], y0 + b.fitAt[1], x1 + b.fitAt[0], y1 + b.fitAt[1]]); return b.fitAt; }
  const obs = [...XB.placed, ...xbLifeObs(b)];
  const free = (dx, dy) => x0 + dx >= L - 0.5 && x1 + dx <= R + 0.5 && y0 + dy >= T - 0.5 && y1 + dy <= B + 0.5 && !obs.some(p => x0 + dx < p[2] + 6 && x1 + dx > p[0] - 6 && y0 + dy < p[3] + 6 && y1 + dy > p[1] - 6);
  let best = [bx, by];
  if (!free(bx, by)) {
    const C = [];
    for (let ix = -8; ix <= 8; ix++) for (let iy = -10; iy <= 10; iy++) C.push([bx + ix * 60, by + iy * 30]);
    C.sort((a, b) => Math.hypot(a[0] - bx, (a[1] - by) * 1.4) - Math.hypot(b[0] - bx, (b[1] - by) * 1.4));
    best = C.find(c => free(c[0], c[1])) || best;
  }
  XB.placed.push([x0 + best[0], y0 + best[1], x1 + best[0], y1 + best[1]]);
  b.fitAt = best;
  return best;
}
function xbPaperPatch(g, x, y, w, h, a) { g.save(); g.globalAlpha = a * 0.86; g.shadowColor = "rgba(40,30,20,0.25)"; g.shadowBlur = 24; g.fillStyle = PAPER; g.fillRect(x, y, w, h); g.restore(); }
function xbWrite(g, b, t) {
  const wh = xbWhere(b, t); if (!wh) return; const size = b.size || 96, s = [...b.text], gap = size * 1.02, a = 1 - sat((t - b.t1) / 0.5);
  const efs = Math.round(clamp(size * 0.22, 22, 34)); font(g, efs, LAT); const ew = b.en ? g.measureText(b.en).width : 0;
  const hw = (Math.max(s.length * gap, ew) + 60) / 2, [fx, fy] = xbFit(g, b, wh[0] - hw, wh[1] - size * 0.75, wh[0] + hw, wh[1] + size * 0.75 + (b.en ? efs + 18 : 0)), x = wh[0] + fx, y = wh[1] + fy;
  if (b.patch !== false) { const pw = Math.max(s.length * gap, ew) + 60; xbPaperPatch(g, x - pw / 2, y - size * 0.75, pw, size * 1.5 + (b.en ? efs + 18 : 0), a * sat((t - b.t + 0.1) / 0.3)); }
  g.save(); g.globalAlpha = a;
  let tt = b.t;
  s.forEach((c, i) => {
    const gx = x + (i - (s.length - 1) / 2) * gap, d = typeof SAMP !== "undefined" && SAMP[c] ? clamp(0.3 + SAMP[c].length * 0.07, 0.4, 1.0) * (b.speed || 0.7) : 0.25;
    if (typeof SAMP !== "undefined" && SAMP[c]) glyph(c, gx, y, size, (t - tt) / d, b.color || INK, a, (b.seed || 7) + i * 13, g);
    else txt(g, c, gx, y + size * 0.36, size * 0.92, { align: "center", fam: MIND, color: b.color || INK, alpha: a * sat((t - tt) / 0.3) });
    tt += d * 0.85;
  });
  g.restore();
  xbEn(g, b.en, x, y + size * 0.75 + efs * 0.6, efs, a * sat((t - tt + 0.2) / 0.4));
}
const CINNABAR = "#b8321e";
function xbInk(g, pts, k, color, wdt, seed, alpha = 1) {
  if (k <= 0 || alpha <= 0) return;
  const tmp = XB.ink || (XB.ink = mk(W, H)), tg = tmp.getContext("2d");
  let x0 = W, y0 = H, x1 = 0, y1 = 0; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = wdt * 2 + 8; x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad)); x1 = Math.min(W, Math.ceil(x1 + pad)); y1 = Math.min(H, Math.ceil(y1 + pad));
  if (x1 <= x0 || y1 <= y0) return;
  tg.clearRect(x0, y0, x1 - x0, y1 - y0);
  drawStroke(tg, pts, sat(k), 1, seed, color, wdt / 0.07, 1);
  g.save(); g.filter = "blur(1.2px)"; g.globalAlpha = alpha * 0.35; g.drawImage(tmp, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  g.filter = "none"; g.globalAlpha = alpha * 0.94; g.drawImage(tmp, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0); g.restore();
}
function xbBrushLine(g, x0, y0, x1, y1, k, color, wdt, seed) {
  const n = 48, len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1), bow = len * 0.025 * (seed % 2 ? 1 : -1);
  const pts = []; for (let i = 0; i <= n; i++) { const u = i / n, o = bow * Math.sin(Math.PI * u); pts.push([lerp(x0, x1, u) + nx * o, lerp(y0, y1, u) + ny * o]); }
  xbInk(g, pts, k, color === RED ? CINNABAR : color, wdt * 1.25, seed);
}
function xbStrike(g, b, t) {
  const r = b.rect ? b.rect.map((v, i) => v * (i % 2 ? H : W)) : xbRect(b.img, b.box, t); if (!r) return;
  const k = eOut((t - b.t) / 0.35), a = 1 - sat((t - b.t1) / 0.5); if (a <= 0) return;
  g.save(); g.globalAlpha = a;
  if (b.style === "x") { xbBrushLine(g, r[0], r[1], r[2], r[3], sat(k * 2), RED, 16, 3); xbBrushLine(g, r[2], r[1], r[0], r[3], sat(k * 2 - 1), RED, 16, 5); }
  else xbBrushLine(g, r[0] - 10, r[3] - 0.15 * (r[3] - r[1]), r[2] + 10, r[1] + 0.15 * (r[3] - r[1]), k, RED, 18, 4);
  g.restore();
}
function xbCircle(g, b, t) {
  const r = b.rect ? b.rect.map((v, i) => v * (i % 2 ? H : W)) : xbRect(b.img, b.box, t); if (!r) return;
  const k = eOut((t - b.t) / 0.6), a = 1 - sat((t - b.t1) / 0.5); if (a <= 0) return;
  const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, rx = (r[2] - r[0]) / 2 + 18, ry = (r[3] - r[1]) / 2 + 14;
  const n = 90, sd = (b.seed || 3) + Math.round(cx), pts = [];
  for (let i = 0; i <= n; i++) { const th = -2.2 + i / n * Math.PI * 2.12, wob = 1 + 0.035 * Math.sin(i * 0.21 + sd) + 0.04 * i / n; pts.push([cx + rx * wob * Math.cos(th), cy + ry * wob * Math.sin(th)]); }
  xbInk(g, pts, k, b.color === "tea" ? TEA : CINNABAR, 11, sd, a);
}
function xbTag(g, b, t) {
  let wh = xbWhere(b, t); if (!wh) return; const a = eOut((t - b.t) / 0.35) * (1 - sat((t - b.t1) / 0.5)); if (a <= 0) return;
  const fs = b.size || 38, efs = Math.round(fs * 0.58); font(g, fs, MIND); let w = g.measureText(b.text).width + 44;
  if (b.en) { font(g, efs, LAT); w = Math.max(w, g.measureText(b.en).width + 44); }
  const eh = b.en ? efs + 10 : 0, h = fs + 26 + eh, col = b.color === "red" ? RED : TEA;
  if (b.side === "bottom" && b.img) wh = [wh[0], wh[1] - 52 + 18 + h];
  if (b.flipTop === undefined) b.flipTop = b.side === "bottom" && wh[1] > (b.subTop ??= xbSubTop(g, b.t - 0.1, b.t1 + 0.6)) - 14;   // decided once
  if (b.flipTop) wh = xbWhere0({ ...b, side: "top" }, t) || wh;
  const [fx, fy] = xbFit(g, b, wh[0] - w / 2, wh[1] - h, wh[0] + w / 2, wh[1]), x = wh[0] + fx, y = wh[1] + fy;
  const yy = y - h * (1 - eOut((t - b.t) / 0.35)) * 0.3;
  g.save(); g.globalAlpha = a * 0.93; g.fillStyle = PAPER; g.shadowColor = "rgba(30,20,10,0.3)"; g.shadowBlur = 16; g.fillRect(x - w / 2, yy - h, w, h); g.shadowBlur = 0;
  g.fillStyle = col; g.fillRect(x - w / 2, yy - h, 6, h); g.restore();
  txt(g, b.text, x + 3, yy - 13 - eh, fs, { align: "center", fam: MIND, color: col, alpha: a });
  xbEn(g, b.en, x + 3, yy - 14, efs, a);
}
function xbInset(g, b, t) {
  const im = IMG["img:" + b.img]; if (!im) return;
  const a = eOut((t - b.t) / 0.45) * (1 - sat((t - b.t1) / 0.5)); if (a <= 0) return;
  let sx = 0, sy = 0, sw = im.width, sh2 = im.height;
  if (b.cols) { sw = im.width / b.cols; sx = sw * b.cell; }
  if (b.box) { const r = XB.regions[b.img]?.r?.[b.box]; if (r) { sx = r[0] * im.width; sy = r[1] * im.height; sw = (r[2] - r[0]) * im.width; sh2 = (r[3] - r[1]) * im.height; } }
  const hmax = b.hmax || 300, w = Math.min(b.w || 420, hmax * sw / sh2), h = w * sh2 / sw, dy = (1 - eOut((t - b.t) / 0.45)) * 60;
  const [fx, fy] = xbFit(g, b, b.pos[0] * W - w / 2 - 12, b.pos[1] * H - h / 2 - 12, b.pos[0] * W + w / 2 + 12, b.pos[1] * H + h / 2 + 12 + (b.caption ? 60 : 0) + (b.en ? 34 : 0)), cx = b.pos[0] * W + fx, cy = b.pos[1] * H + fy;
  g.save(); g.globalAlpha = a; g.shadowColor = "rgba(30,20,10,0.35)"; g.shadowBlur = 26; g.fillStyle = PAPER; g.fillRect(cx - w / 2 - 12, cy - h / 2 - 12 + dy, w + 24, h + 24); g.shadowBlur = 0;
  g.drawImage(im, sx, sy, sw, sh2, cx - w / 2, cy - h / 2 + dy, w, h); g.restore();
  if (b.caption) { font(g, 30, MIND); const cw = Math.max(g.measureText(b.caption).width, b.en ? (font(g, 22, LAT), g.measureText(b.en).width) : 0) + 36;   // paper backing: unreadable on dark images
    xbPaperPatch(g, cx - cw / 2, cy + h / 2 + 18 + dy, cw, b.en ? 84 : 50, a); txt(g, b.caption, cx, cy + h / 2 + 52 + dy, 30, { align: "center", fam: MIND, alpha: a }); }
  xbEn(g, b.en, cx, cy + h / 2 + 86 + dy, 22, a);
}
function xbSlot(g, b, t) {
  const a = eOut((t - b.t) / 0.5) * (1 - sat((t - b.t1) / 0.5)); if (a <= 0) return;
  const x = b.x ?? W - 330, y = b.y ?? 390, w = 280, rh = b.rh ?? 170, top = b.en ? 92 : 70;
  const fills = XB.list.filter(z => z.do === "fill" && z.sec === b.sec && t >= z.t), rows = fills.length ? Math.max(...fills.map(z => z.slot)) + 1 : 0;
  const grow = rows ? lerp(rows - 1, rows, eOut((t - fills.filter(z => z.slot === rows - 1)[0].t) / 0.4)) : 0, bh = top + rh * grow;
  g.save(); g.globalAlpha = a * 0.94; g.fillStyle = PAPER; g.shadowColor = "rgba(30,20,10,0.3)"; g.shadowBlur = 20; g.fillRect(x, y, w, bh); g.restore();
  hair(g, x, y, x, y + bh, a, RED, 5);
  txt(g, b.title, x + w / 2, y + 48, 32, { align: "center", fam: MIND, alpha: a });
  xbEn(g, b.en, x + w / 2, y + 78, 20, a);
  for (let i = 0; i < rows; i++) {
    const yy = y + top + i * rh; hair(g, x + 20, yy, x + w - 20, yy, 0.25 * a);
    txt(g, "①②③④"[i], x + 34, yy + 46, 34, { align: "center", fam: MIND, color: RED, alpha: a * sat((grow - i - 0.6) / 0.4) });
    const f = XB.list.filter(z => z.do === "fill" && z.sec === b.sec && z.slot === i && t >= z.t);
    f.forEach((z, j) => { const fa = a * eOut((t - z.t) / 0.4) * sat((grow - i - 0.6) / 0.4); txt(g, z.text, x + 64, yy + 42 + j * 64, 26, { fam: MIND, alpha: fa, color: z.color === "red" ? RED : INK }); if (z.en) txt(g, z.en, x + 64, yy + 68 + j * 64, 18, { fam: LAT, color: EN, alpha: fa }); });
    const lit = f.length ? 1 - sat((t - f[f.length - 1].t - 1.2) / 0.6) : 0;
    if (lit > 0) { g.save(); g.globalAlpha = 0.12 * lit * a; g.fillStyle = RED; g.fillRect(x + 6, yy + 2, w - 12, rh - 4); g.restore(); }
  }
}
function xbPaper(g, b, t) {
  const a = eOut((t - b.t) / 0.5) * (1 - sat((t - b.t1) / 0.5)); if (a <= 0) return;
  g.save(); g.globalAlpha = a * (b.level ?? 0.78); g.fillStyle = PAPER; g.fillRect(0, 0, W, H); g.restore();
}
function xbFormula(g, b, t) {
  const a = 1 - sat((t - b.t1) / 0.5); if (a <= 0) return;
  const y = b.y || 470, size = b.size || 150, parts = [b.left, b.op || "＝", b.right], gap = size * 1.25;
  parts.forEach((p, i) => {
    const x = W / 2 + (i - 1) * (gap + (i !== 1 ? p.length * size * 0.35 : 0));
    const tt = b.t + i * 0.45;
    txt(g, p, x, y + size * 0.35, size, { align: "center", fam: MIND, color: i === 1 ? (b.fixT && t > b.fixT ? RED : INK) : INK, alpha: a * eOut((t - tt) / 0.35) });
  });
  const fixed = b.fixT && t > b.fixT; xbEn(g, fixed ? b.enFix || b.en : b.en, W / 2, y + size * 0.95, 34, a * eOut((t - b.t - 0.9) / 0.4));
  if (b.fixT && t > b.fixT) xbBrushLine(g, W / 2 + size * 0.42, y - size * 0.55, W / 2 - size * 0.42, y + size * 0.55, eOut((t - b.fixT) / 0.3), RED, 14, 9);
}
function xbBoard2(g, b, t) {
  const a = 1 - sat((t - b.t1) / 0.5); if (a <= 0) return;
  [[0, b.left, TEA, b.lt ?? b.t], [1, b.right, RED, b.rt]].forEach(([i, s, col, tt]) => {
    if (tt === undefined || t < tt - 0.05) return;
    const x = W / 2 + (i ? 1 : -1) * 420, k = eOut((t - tt) / 0.5);
    txt(g, s.label, x, 300, 44, { align: "center", fam: MIND, color: col, alpha: a * k }); xbEn(g, s.enLabel, x, 342, 24, a * k);
    if (s.icon === "book") { g.save(); g.globalAlpha = a * k; g.fillStyle = col; g.fillRect(x - 110, 380, 220, 160); g.fillStyle = PAPER; g.fillRect(x - 4, 380, 8, 160); g.restore(); }
    if (s.icon === "go") {
      g.save(); g.globalAlpha = a * k; g.strokeStyle = INK; g.lineWidth = 2; for (let j = 0; j < 7; j++) { g.beginPath(); g.moveTo(x - 120 + j * 40, 380); g.lineTo(x - 120 + j * 40, 620); g.stroke(); g.beginPath(); g.moveTo(x - 120, 380 + j * 40); g.lineTo(x + 120, 380 + j * 40); g.stroke(); }
      const sp = eOut((t - (b.stoneT ?? tt)) / 0.25), sr = 22 * (1.5 - 0.5 * sp);
      if (t > (b.stoneT ?? 1e9)) { g.fillStyle = RED; g.globalAlpha = a * sp; g.beginPath(); g.arc(x, 500, sr, 0, 7); g.fill(); }
      g.restore();
    }
    txt(g, s.text, x, 690, 34, { align: "center", fam: MIND, color: INK, alpha: a * k }); xbEn(g, s.en, x, 728, 24, a * k);
  });
}
const XB_DRAW = { write: xbWrite, strike: xbStrike, circle: xbCircle, tag: xbTag, inset: xbInset, slot: xbSlot, paper: xbPaper, formula: xbFormula, board2: xbBoard2 };
const XB_ORDER = ["paper", "inset", "formula", "board2", "write", "tag", "circle", "strike", "slot"];   // written words before tags so a tag sees them
function xbDraw(g, t) {
  xbInit(); XB.placed = [];
  const sh = SHOTS.find(s => s.type === "scene" && !s.sum && t >= s.t0 && t < s.t1), fc = sh && typeof facesOf === "function" && facesOf(sh.img);
  const papered = XB.list.some(b => b.do === "paper" && t >= b.t && t < b.t1 + 0.3);
  if (fc && !papered) {
    const [z, fx, fy] = kenOf(sh, t), k = Math.max(W / fc.w, H / fc.h) * z, dw = fc.w * k, dh = fc.h * k, ox = (W - dw) * fx, oy = (H - dh) * fy;
    for (const f of fc.f) XB.placed.push([ox + f[0] * dw - 16, oy + f[1] * dh - 16, ox + f[2] * dw + 16, oy + f[3] * dh + 16]);
  }
  if (typeof TRIS !== "undefined") for (const c of TRIS) if (t >= c.t0 - 0.2 && t < c.t1 + 0.4) XB.placed.push(c.mode === "band" ? [0, 760, W, H] : [40, 86, 1240, 356]);
  if (typeof cardsInit === "function") { cardsInit(); for (const c of CARDS) if (t >= c.t0 - 0.2 && t < c.t1 + 0.4) {
    const k = c.compact ? 0.8 : 1, [x, y] = c.compact ? [W - 600 * k - 34, 58] : c.pos; XB.placed.push([x - 10, y - 10, x + 600 * k + 10, y + 250 * k + 10]); } }
  for (const kind of XB_ORDER) for (const b of XB.list) if (b.do === kind && t >= b.t - 0.05 && t < b.t1 + 0.6 && !(b.cut && t >= b.cut)) XB_DRAW[kind](g, b, t);
}
let xbPre = null;
function xbPreload() {
  if (!xbPre) xbPre = Promise.all([...new Set((BOARD.beats || []).filter(b => b.do === 'inset').map(b => b.img))].filter(k => !IMG['img:' + k]).map(async k => { IMG['img:' + k] = await loadImg(`${P}/assets/${k}.png`); }));
  return xbPre;
}
const xbRender0 = window.renderAt;
window.renderAt = async t => { await xbPreload(); return xbRender0(t); };
const xbChrome0 = chrome;
chrome = function (g, t, sh) { xbDraw(g, t); xbChrome0(g, t, sh); };
function xbMark(g, b, t) {
  const s = TL.subs.find(x => t >= x[0] && t < x[1]); if (!s || !s[2].includes(b.at)) return;
  if (typeof TRIS !== "undefined" && TRIS.some(c => c.mode === "band" && t >= c.t0 - 0.3 && t < c.t1 + 0.4)) return;
  const a = sat((t - s[0]) / 0.18) * sat((s[1] - t) / 0.18) * (1 - sat((t - b.t1) / 0.4)); if (a <= 0) return;
  const sh = SHOTS.find(x => t >= x.t0 && t < x.t1), manga = sh && sh.type === "manga";
  const bx = manga ? 820 : 300, bw = manga ? 1030 : 1320, chip = 118, en = s[4];
  font(g, 27, LAT); const es = en ? wrapWords(g, en, bw - chip - 50) : [];
  font(g, 40, GO, "bold"); const ls = wrap(g, s[2], bw - chip - 50), bh = 42 + ls.length * 54 + (es.length ? 10 + es.length * 36 : 0), by = 1050 - bh;
  const i = ls.findIndex(l => l.includes(b.at)); if (i < 0) return;
  const x0 = bx + chip + 18 + g.measureText(ls[i].slice(0, ls[i].indexOf(b.at))).width, w = g.measureText(b.at).width, y = by + 64 + i * 54 + 9;
  g.save(); g.globalAlpha = a; xbBrushLine(g, x0 - 4, y, x0 + w + 4, y, eOut((t - b.t) / 0.4), RED, 5, 3); g.restore();
}
const xbSub0 = subtitle;
subtitle = function (g, t) { xbSub0(g, t); for (const b of XB.list) if (b.do === "mark" && t >= b.t - 0.05 && t < b.t1 + 0.5) xbMark(g, b, t); };

// called by faceHit (components.js) when a card picks its slot: the share of what is being circled, tagged or pushed into that card r covers at t
function xbCardAvoid(t, r) {
  xbInit(); let hit = 0;
  for (const b of XB.list) {
    if (!["circle", "cam", "inset", "strike"].includes(b.do) || t < b.t || t > (b.do === "cam" ? b.t + 2.5 : b.t1)) continue;
    const q = b.rect ? b.rect.map((v, i) => v * (i % 2 ? H : W)) : b.img && b.box && b.box !== "full" ? xbRect(b.img, b.box, t) : null; if (!q) continue;
    const ix = Math.min(r[2], q[2]) - Math.max(r[0], q[0]), iy = Math.min(r[3], q[3]) - Math.max(r[1], q[1]);
    if (ix > 0 && iy > 0) hit = Math.max(hit, ix * iy / Math.max(1, (q[2] - q[0]) * (q[3] - q[1])));
  }
  return hit;
}
// card rects that show between t0 and t1 (card slots are fixed in cardsInit)
function cardsForBeats(t0, t1) {
  if (typeof CARDS === "undefined") return [];
  return CARDS.filter(c => c.t0 - 0.2 < t1 && c.t1 + 0.4 > t0 && (c.compact || c.pos)).map(c => { const k = c.compact ? 0.8 : 1, [x, y] = c.compact ? [W - 600 * k - 34, 58] : c.pos; return [x - 10, y - 10, x + 600 * k + 10, y + 250 * k + 10]; });
}
