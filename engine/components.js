// Explainer components layered on engine.js (load after it): full-bleed scenes with page turns, summary
// illustrations, vocab "translation cards" that avoid faces and text, tri-language quote columns (zh / ja / en),
// brush-kanji opener, gates / ladder / trio / loop diagrams, and overrides that keep layouts clear of the subtitle box.
const C_TEAL = "#4f7f7a", C_GOLD = "#a8843c", ZH = '"KaiTi", "STKaiti", "Kaiti SC", "SimSun", "Noto Serif SC", serif';

function kenOf(sh, t) {   // push/pull: sh.kf = {z:[from,to], fx:[..], fy:[..]} eased over the whole shot
  const u = eInOut(sat((t - sh.t0) / Math.max(1, sh.t1 - sh.t0))), k = sh.kf || {};
  const L = (a, d) => a ? lerp(a[0], a[1], u) : d;
  return [L(k.z, lerp(1.0, 1.08, u)), L(k.fx, 0.5), L(k.fy, 0.5)];
}
function mist(g, t, seed) {   // hold-time micro motion: two drifting mist banks + a faint light sweep every 7 s
  for (let i = 0; i < 2; i++) {
    const sp = 22 + 14 * i, x = ((t * sp + hash(i, seed) * W) % (W + 1200)) - 600, y = H * (0.35 + 0.3 * hash(i + 3, seed));
    const gr = g.createRadialGradient(x, y, 0, x, y, 520);
    gr.addColorStop(0, "rgba(255,255,255,0.20)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.save(); g.globalCompositeOperation = "screen"; g.fillStyle = gr; g.translate(x, y); g.scale(1.9, 0.55); g.translate(-x, -y); g.fillRect(x - 520, y - 520, 1040, 1040); g.restore();
  }
  const ph = (t % 7) / 7, sx = lerp(-800, W + 800, ph), gr = g.createLinearGradient(sx - 300, 0, sx + 300, H * 0.35);
  gr.addColorStop(0, "rgba(255,248,230,0)"); gr.addColorStop(0.5, "rgba(255,248,230,0.10)"); gr.addColorStop(1, "rgba(255,248,230,0)");
  g.save(); g.globalCompositeOperation = "screen"; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
}
function tagChip(g, sh, tl) {   // small top-left label: what this shot is about
  if (!sh.tag) return;
  const a = eOut((tl - 0.4) / 0.6) * (1 - eOut((tl - 5.5) / 1.0)); if (a <= 0) return;
  font(g, 26, MIND); const w = g.measureText(sh.tag).width + 56;
  g.save(); g.globalAlpha = a * 0.88; g.fillStyle = PAPER; g.fillRect(40, 66, w, 50); g.restore();
  hair(g, 40, 66, 40, 116, a, RED, 4);
  txt(g, sh.tag, 66, 100, 26, { fam: MIND, alpha: a });
}
function subTop(t0, t1) {   // highest top edge (incl. speaker tag) of any subtitle shown in [t0, t1)
  let top = 840; const g = LC.getContext("2d");
  TL.subs.filter(s => s[1] > t0 && s[0] < t1).forEach(s => { top = Math.min(top, SUB.bottom - subLayout(g, s).bh - 34 - 18); });
  return top;
}

// the top-right corner belongs to vocab cards: long titles shrink, the rule stops left of the card
head = function (g, sh, tl, x = 120) {
  const a = eOut(tl / 0.7);
  if (sh.tag) { g.save(); g.globalAlpha = a; g.fillStyle = RED; g.fillRect(x, 92, 12, 12); g.restore(); txt(g, sh.tag, x + 24, 104, 22, { color: GREY, alpha: a, fam: GO, ls: 1 }); }
  if (sh.title) { let fs = 54; font(g, fs, MIND); while (fs > 30 && g.measureText(sh.title).width > 1250 - x) { fs -= 2; font(g, fs, MIND); } txt(g, sh.title, x, 172, fs, { alpha: a, fam: MIND }); }
  hair(g, x, 196, 1330, 196, .22 * a);
};
// table: starts lower (header clear of the card corner), bottom stays above the subtitle box; long 2-column tables split in two blocks
DRAW.table = (g, sh, t) => {
  const tl = t - sh.t0; head(g, sh, tl);
  const n = sh.rows.length, half = sh.cols.length <= 2 && n > 7 ? Math.ceil(n / 2) : n, gap = 60;
  const parts = half < n ? [[0, half], [half, n]] : [[0, n]], wAll = parts.length > 1 ? (1680 - gap) / 2 : 1680;
  const ws = (sh.w || sh.cols.map(() => 1 / sh.cols.length)).map(f => f * wAll), room = 470 - (sh.note ? 50 : 0);
  let fs = 30, hs;
  const fit = () => { hs = parts.map(([a, b]) => tableRows(g, { ...sh, rows: sh.rows.slice(a, b) }, 0, wAll, fs)); return Math.max(...hs.map(h => h.reduce((x, y) => x + y, 0))); };
  while (fit() > room && fs > 21) fs -= 1;
  const a0 = eOut(tl / .6); let yEnd = 0;
  parts.forEach(([a, b], p) => {
    const x0 = 120 + p * (wAll + gap); let y = 300, x = x0;
    sh.cols.forEach((c, j) => { txt(g, c, x + 18, y + 34, 24, { color: GREY, fam: GO, alpha: a0, ls: 1 }); x += ws[j]; });
    y += 52; hair(g, x0, y, x0 + wAll, y, .7 * a0, INK, 1.4);
    for (let i = a; i < b; i++) {
      const h = hs[p][i - a], on = shown(sh, i, t), dim = sh.hl === undefined || sh.hl === i ? 1 : 0.42, al = on * dim;
      if (sh.hl === i && on > 0) { g.save(); g.globalAlpha = 0.10 * on; g.fillStyle = RED; g.fillRect(x0, y, wAll, h); g.restore(); hair(g, x0, y, x0, y + h, on, RED, 4); }
      let x = x0;
      sh.rows[i].forEach((c, j) => { para(g, c, x + 18, y + 17 + fs, j === 0 ? fs + 2 : fs, ws[j] - 36, fs * 1.42, { fam: j === 0 ? MIND : MIN, alpha: al, color: j === 0 ? INK : "#2c2925" }); x += ws[j]; });
      y += h; hair(g, x0, y, x0 + wAll, y, .22 * on);
    }
    yEnd = Math.max(yEnd, y);
  });
  if (sh.note) txt(g, sh.note, 120, yEnd + 44, 24, { color: GREY, alpha: a0, fam: GO });
};
// summary illustration: shown whole, framed, bottom edge above the tallest subtitle during the shot (not full-bleed)
function summary(g, sh, t) {
  const im = IMG[sh.img]; if (!im) return;
  if (sh.bot === undefined) sh.bot = subTop(sh.t0, sh.t1);
  const tl = t - sh.t0, top = 58, h = sh.bot - top, w = h * im.width / im.height, x = (W - w) / 2, a = eOut(sat(tl / 0.7)), y = top + (1 - a) * 24;
  const z = 1 + 0.01 * eInOut(sat(tl / Math.max(1, sh.t1 - sh.t0)));   // slow drift so the hold does not read as a frozen video
  g.save(); g.translate(W / 2, y + h / 2); g.scale(z, z); g.translate(-W / 2, -(y + h / 2)); g.globalAlpha = a;
  g.shadowColor = "rgba(40,30,20,0.3)"; g.shadowBlur = 30; g.fillStyle = PAPER; g.fillRect(x - 10, y - 10, w + 20, h + 20); g.shadowBlur = 0;
  g.drawImage(im, x, y, w, h); g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(x - 10, y - 10, w + 20, h + 20); g.restore();
}
// full-bleed scene: push/pull + mist; sh.from = previous image, peeled away like a page turn
DRAW.scene = (g, sh, t) => {
  if (sh.sum) return summary(g, sh, t);
  const tl = t - sh.t0, [z, fx, fy] = kenOf(sh, t);
  cover(g, IMG[sh.img], 0, 0, W, H, z, fx, fy);
  mist(g, t, sh.si * 5 + 1);
  if (sh.from) {
    const p = eInOut(sat(tl / 1.5)); if (p < 1) {
      const s = lerp(W + H, -260, p), fw = 160 * Math.sin(Math.PI * p) + 40;   // fold line x+y=s; old page stays where x+y<s
      g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.max(0, s), 0); g.lineTo(0, Math.max(0, s)); g.closePath(); g.clip();
      cover(g, IMG[sh.from], 0, 0, W, H, sh.fromZ ?? 1.1, 0.5, 0.5); g.restore();
      const gr = g.createLinearGradient(s / 2, s / 2, (s + fw) / 2, (s + fw) / 2);
      gr.addColorStop(0, "rgba(232,226,212,1)"); gr.addColorStop(0.7, "rgba(214,206,190,1)"); gr.addColorStop(1, "rgba(60,50,40,0.25)");
      g.save(); g.beginPath(); g.moveTo(s, 0); g.lineTo(s + fw, 0); g.lineTo(0, s + fw); g.lineTo(0, s); g.closePath(); g.fillStyle = gr; g.fill(); g.restore();
    }
  }
  trisInit();
  if (!TRIS.some(c => c.mode === "top" && t >= c.t0 - 0.2 && t < c.t1 + 0.6)) tagChip(g, sh, tl - (sh.from ? 1.2 : 0));
};
// list: bottom stays above the subtitle box
DRAW.list = (g, sh, t) => {
  const tl = t - sh.t0; head(g, sh, tl);
  const n = sh.items.length, x0 = 140, wText = sh.side ? 900 : 1500;
  let y = 270; const step = Math.min(190, 500 / n);
  sh.items.forEach((it, i) => {
    const a = shown(sh, i, t) * (sh.hl === undefined || sh.hl === i ? 1 : 0.45);
    txt(g, it.n, x0 + 30, y + 64, it.n.length > 1 ? 54 : 84, { align: "center", color: RED, fam: MIND, alpha: a });
    txt(g, it.t, x0 + 120, y + 44, 44, { fam: MIND, alpha: a });
    para(g, it.d, x0 + 122, y + 88, 26, wText, 34, { color: GREY, alpha: a });
    hair(g, x0, y + step - 10, x0 + wText + 120, y + step - 10, .15 * a);
    y += step;
  });
  if (sh.note) txt(g, sh.note, x0, y + 30, 22, { color: GREY, alpha: eOut(tl / .6), fam: GO });
};
// title: the whole group sits higher so sub/small lines never enter the subtitle box
DRAW.title = (g, sh, t) => {
  const tl = t - sh.t0, u = sat(tl / (sh.t1 - sh.t0));
  cover(g, IMG[sh.img], 0, 0, W, H, lerp(1.0, 1.06, u), .5, .5);
  const gr = g.createLinearGradient(0, 400, 0, H); gr.addColorStop(0, "rgba(243,238,227,0)"); gr.addColorStop(0.4, "rgba(243,238,227,0.9)"); gr.addColorStop(1, "rgba(243,238,227,1)");
  g.fillStyle = gr; g.fillRect(0, 400, W, H - 400);
  const a = eOut((tl - 0.6) / 1.2), b = eOut((tl - 1.4) / 1.0), c = eOut((tl - 2.0) / 1.0);
  txt(g, sh.title, W / 2, 660 - 20 * (1 - a), 112, { align: "center", fam: MIND, alpha: a, ls: 10 });
  hair(g, W / 2 - 360 * b, 692, W / 2 + 360 * b, 692, .8 * b, RED, 2);
  txt(g, sh.sub, W / 2, 748, 40, { align: "center", alpha: b, ls: 4 });
  txt(g, sh.small || "", W / 2, 792, 24, { align: "center", color: GREY, alpha: c, fam: GO, ls: 2 });
};
// gates: the "today: three things" overview; sh.now lights the current one
DRAW.gates = (g, sh, t) => {
  const tl = t - sh.t0;
  if (sh.img) { cover(g, IMG[sh.img], 0, 0, W, H, lerp(1.05, 1.12, sat(tl / 20)), 0.5, 0.6); g.save(); g.globalAlpha = 0.55; g.fillStyle = PAPER; g.fillRect(0, 0, W, H); g.restore(); }
  sh.items.forEach((it, i) => {
    const a = shown(sh, i, t), x = 380 + i * 580, y = 640 - i * 150, on = sh.now === i;
    g.save(); g.globalAlpha = a; g.strokeStyle = on ? RED : INK; g.lineWidth = on ? 6 : 3;
    g.beginPath(); g.moveTo(x - 120, y); g.lineTo(x - 120, y - 230); g.moveTo(x + 120, y); g.lineTo(x + 120, y - 230);
    g.moveTo(x - 165, y - 230); g.quadraticCurveTo(x, y - 262, x + 165, y - 230); g.moveTo(x - 138, y - 192); g.lineTo(x + 138, y - 192); g.stroke(); g.restore();
    txt(g, it.n, x, y - 92, 76, { align: "center", fam: MIND, color: on ? RED : INK, alpha: a });
    para(g, it.t, x, y + 54, 34, 470, 46, { align: "center", fam: MIND, alpha: a });
    if (it.d) para(g, it.d, x, y + 108 + (measureLines(g, it.t, 34, 470, MIND) - 1) * 46, 22, 440, 30, { align: "center", fam: LAT, color: EN, alpha: a });
  });
  if (sh.now !== undefined) txt(g, sh.nowLabel || "今回", 380 + sh.now * 580, 640 - sh.now * 150 - 300, 26, { align: "center", fam: GO, color: RED, w: "bold", alpha: eOut((tl - 1) / 0.6), ls: 4 });
};
// ladder: one step per stage, lit with the narration; optional sh.climber (cast id) walks up.
// The lowest step clears the subtitle box, the highest stays below the top-right card.
DRAW.ladder = (g, sh, t) => {
  const tl = t - sh.t0; head(g, sh, tl);
  if (sh.band === undefined) { trisInit(); sh.band = TRIS.some(c => c.mode === "band" && c.t0 < sh.t1 && c.t1 > sh.t0); }
  const n = sh.steps.length, x0 = 150, y0 = sh.band ? 640 : 750, dx = (W - 300) / n, dy = Math.min((sh.band ? 330 : 420) / n, (y0 - 470) / Math.max(1, n - 1));
  let cur = -1;
  sh.steps.forEach((s, i) => {
    const a = shown(sh, i, t); if (a > 0.5) cur = i;
    const x = x0 + i * dx, y = y0 - i * dy;
    g.save(); g.globalAlpha = a; g.fillStyle = i <= cur ? "rgba(79,127,122,0.16)" : "rgba(255,255,255,0.3)"; g.fillRect(x, y - 16, dx - 14, 16);
    g.fillStyle = INK; g.fillRect(x, y - 16, dx - 14, 3); g.restore();
    txt(g, s.t, x + (dx - 14) / 2, y - 70, 52, { align: "center", fam: MIND, alpha: a, color: i === cur ? RED : INK });
    txt(g, s.y || "", x + (dx - 14) / 2, y - 30, 20, { align: "center", fam: GO, color: GREY, alpha: a });
    if (s.w) para(g, s.w, x + (dx - 14) / 2, y + 34, 21, dx - 20, 26, { align: "center", fam: GO, color: C_TEAL, alpha: a * 0.95 });
  });
  if (cur >= 0 && sh.climber) {
    const Q = i => [x0 + i * dx + (dx - 14) / 2, y0 - i * dy - 152], k = shown(sh, cur, t), [ax, ay] = Q(Math.max(0, cur - 1)), [bx, by] = Q(cur);
    faceChip(g, sh.climber, lerp(ax, bx, k), lerp(ay, by, k) - 20 * Math.sin(Math.PI * k), 34, 1);
  }
};
// trio: three columns, each a big character + one line + an optional western equivalent
DRAW.trio = (g, sh, t) => {
  const tl = t - sh.t0; head(g, sh, tl);
  const n = sh.cols.length, cw = 1600 / n;
  sh.cols.forEach((c, i) => {
    const a = shown(sh, i, t), x = 160 + i * cw + cw / 2;
    txt(g, c.k, x, 470, 190, { align: "center", fam: MIND, alpha: a, color: sh.hl === i ? RED : INK });
    inkbar(g, x - 90, 520, 180, 12, a, sh.hl === i ? RED : INK, 3 + i);
    para(g, c.t, x, 600, 36, cw - 80, 48, { align: "center", fam: MIND, alpha: a });
    if (c.w) para(g, c.w, x, 690, 24, cw - 80, 32, { align: "center", fam: GO, color: C_TEAL, alpha: a });
  });
};

// ── vocab cards (drawn over every shot): slide in, then fly into the word book; memo cards just fade ──
const CARDS = [], BOOK = [44, 990], FACES = {};
// six candidate slots: top-right, top-left, right-low, left-low, top-centre, bottom-centre
const CARD_POS = [[W - 650, 96], [50, 132], [W - 650, 520], [50, 520], [W / 2 - 300, 58], [W / 2 - 300, 520]];
function cardsInit() {
  if (CARDS.length || !BOARD.cards) return;
  trisInit();
  BOARD.cards.forEach(c => { const L = LN[c.sec]?.[c.k]; if (L) CARDS.push({ ...c, t0: L.at + (c.f || 0) * L.len - 0.15, t1: L.at + L.len + (c.hold ?? 1.4) }); });
  CARDS.sort((a, b) => a.t0 - b.t0);   // sections can be reordered: sort before chaining
  CARDS.forEach((c, i) => { const nx = CARDS[i + 1]; if (nx && nx.t0 < c.t1 + 0.3) c.t1 = nx.t0 - 0.3; });
  CARDS.forEach(c => {
    const over = SHOTS.filter(s => s.t0 < c.t1 + 0.7 && s.t1 > c.t0);
    c.compact = over.some(s => !["scene", "kanji", "title"].includes(s.type));   // diagrams: small card tucked in the corner
    const sum = over.find(s => s.sum && s.t0 > c.t0); if (sum) c.t1 = Math.max(c.t0 + 1.2, sum.t0 - 0.7);   // leave before a summary image
    if (c.compact) return;
    const tri = m => TRIS.some(x => x.mode === m && x.t0 < c.t1 + 0.7 && x.t1 > c.t0);
    const ok = CARD_POS.filter((p, i) => !((i === 1 || i === 4) && tri("top")) && !(p[1] > 300 && tri("band")));
    let best = ok[0], hit = faceHit(c, over, best);
    for (const p of ok.slice(1)) { if (hit === 0) break; const h = faceHit(c, over, p); if (h < hit) { best = p; hit = h; } }
    c.pos = best; c.faceHit = hit;
  });
}
function facesOf(img) {   // assets/faces.json (tools/faces.py): {"kv/x": {w, h, f: [[x0,y0,x1,y1] in 0..1]}}
  if (!("all" in FACES)) {
    const x = new XMLHttpRequest(); x.open("GET", `${P}/assets/faces.json`, false); x.send();
    FACES.all = x.status === 200 ? JSON.parse(x.responseText) : {};
  }
  return FACES.all[img.slice(4)];
}
// worst fraction of any single face covered by a card at slot (rx0, ry0), following each shot's push/pull
function faceHit(c, over, [rx0, ry0]) {
  const rx1 = rx0 + 600, ry1 = ry0 + 250;
  let hit = 0;
  for (const s of over) {
    const fc = s.type === "scene" && !s.sum && facesOf(s.img); if (!fc) continue;
    for (const t of [c.t0 + 0.5, (c.t0 + c.t1) / 2, c.t1]) {
      if (t < s.t0 || t >= s.t1) continue;
      const [z, fx, fy] = kenOf(s, t), k = Math.max(W / fc.w, H / fc.h) * z, dw = fc.w * k, dh = fc.h * k, ox = (W - dw) * fx, oy = (H - dh) * fy;
      for (const [u0, v0, u1, v1] of fc.f) {
        const ix = Math.min(rx1, ox + u1 * dw) - Math.max(rx0, ox + u0 * dw), iy = Math.min(ry1, oy + v1 * dh) - Math.max(ry0, oy + v0 * dh);
        if (ix > 0 && iy > 0) hit = Math.max(hit, ix * iy / ((u1 - u0) * dw * (v1 - v0) * dh));   // a small face fully covered is worse than a big one clipped
      }
    }
  }
  return hit;
}
function vocabCard(g, c, t) {
  const into = eOut((t - c.t0) / 0.5), out = eInOut(sat((t - c.t1) / 0.6)); if (into <= 0 || out >= 1) return;
  const w = 600, h = 250, k0 = c.compact ? 0.8 : 1, [tx, ty] = BOOK;
  const [x0, y0] = c.compact ? [W - w * k0 - 34, 58] : c.pos, side = x0 > W / 2 ? 80 : -80;
  const fly = c.memo ? 0 : out;
  const x = lerp(lerp(x0 + side, x0, into), tx, fly), y = lerp(y0, ty, fly), sc = lerp(k0, 0.06, fly), a = into * (1 - out * (c.memo ? 1 : 0.4));
  g.save(); g.translate(x, y); g.scale(sc, sc); g.rotate(lerp(0.025, 0, into)); g.globalAlpha = a;
  g.shadowColor = "rgba(40,30,20,0.25)"; g.shadowBlur = 26; g.fillStyle = PAPER; g.fillRect(0, 0, w, h); g.shadowBlur = 0;
  g.fillStyle = c.memo ? C_GOLD : RED; g.fillRect(0, 0, 8, h);
  if (c.memo) {   // a work cited as an example: title + medium + what it shows
    txt(g, BOARD.memoLabel || "作品メモ", 36, 44, 18, { fam: GO, color: GREY, ls: 3 });
    font(g, 18, GO); const mw = g.measureText(c.yomi).width + 24;
    g.strokeStyle = C_GOLD; g.lineWidth = 1.5; g.strokeRect(w - 36 - mw, 24, mw, 30); txt(g, c.yomi, w - 36 - mw / 2, 45, 18, { align: "center", fam: GO, color: C_GOLD });
    let fs = 40; font(g, fs, MIND); while (fs > 24 && g.measureText(c.term).width > w - 72) { fs -= 2; font(g, fs, MIND); }
    txt(g, c.term, 36, 104, fs, { fam: MIND });
    hair(g, 36, 128, w - 36, 128, 0.25);
    para(g, c.desc, 36, 170, 25, w - 72, 34, { fam: MIN, color: "#2c2925" });
    g.restore(); return;
  }
  const fs = c.term.length > 5 ? 40 : 52;
  txt(g, c.term, 36, 76, fs, { fam: MIND });
  font(g, fs, MIND); const tw = g.measureText(c.term).width;
  txt(g, c.yomi || "", 50 + tw, 72, 20, { fam: GO, color: GREY });
  para(g, c.desc, 36, 126, 25, w - 70, 34, { fam: MIN, color: "#2c2925" });
  hair(g, 36, 176, w - 36, 176, 0.25);
  txt(g, "≒ " + c.west, 36, 212, c.west.length > 16 ? 22 : 27, { fam: MIND, color: C_TEAL });
  if (c.wen) txt(g, c.wen, w - 30, 238, 17, { align: "right", fam: LAT, color: EN });
  g.restore();
}
function wordBook(g, t) {   // bottom-left: the word book with the number of collected cards
  const n = CARDS.filter(c => !c.memo && t > c.t1 + 0.5).length; if (!n && !CARDS.some(c => !c.memo && t > c.t0)) return;
  const a = 0.85, [x, y] = BOOK;
  g.save(); g.globalAlpha = a; g.fillStyle = PAPER; g.fillRect(x, y, 150, 44); g.strokeStyle = C_TEAL; g.lineWidth = 2; g.strokeRect(x, y, 150, 44);
  g.fillStyle = C_TEAL; g.fillRect(x - 6, y - 4, 10, 52); g.fillRect(x + 146, y - 4, 10, 52); g.restore();
  txt(g, BOARD.bookLabel || "単語帳", x + 18, y + 30, 20, { fam: MIND, alpha: a });
  txt(g, String(n), x + 132, y + 31, 24, { align: "right", fam: MONO, color: RED, alpha: a, w: "bold" });
}
const chrome0 = chrome;
chrome = function (g, t, sh) {
  chrome0(g, t, sh); cardsInit();
  wordBook(g, t);
  for (const c of CARDS) if (t >= c.t0 - 0.1 && t < c.t1 + 0.7) vocabCard(g, c, t);
};

// ── tri-language quotes: when the source text is Chinese, show it; columns left to right = zh / ja / en ──
// BOARD.tris: [{sec, k, zh, ja, en, mode, src?}]; "band" = bottom band (that line's subtitle steps aside),
// "top" = top panel (subtitles stay)
const TRIS = [];
function trisInit() {
  if (TRIS.length || !BOARD.tris) return;
  BOARD.tris.forEach(c => { const L = LN[c.sec]?.[c.k]; if (L) TRIS.push({ ...c, t0: L.at - 0.25, t1: L.at + L.len + (c.hold ?? 0.5) }); });
  TRIS.sort((a, b) => a.t0 - b.t0);
  TRIS.forEach((c, i) => { const nx = TRIS.slice(i + 1).find(x => x.mode === c.mode); if (nx && nx.t0 < c.t1 + 0.2) c.t1 = nx.t0 - 0.05; });
}
const TRI_SZ = { page: [[62, 40, 30], [86, 58, 40], [0.36, 0.34, 0.30]], band: [[56, 31, 24], [72, 42, 31], [0.42, 0.33, 0.25]], top: [[34, 24, 19], [46, 33, 25], [0.36, 0.34, 0.30]] };
function triCols(g, c, a, x0, y0, w, h, mode) {   // Chinese (kaiti) | Japanese (mincho) | English; Chinese leads
  const [fz, lh, r] = TRI_SZ[mode], cw = r.map(f => w * f), X = [x0, x0 + cw[0], x0 + cw[0] + cw[1]];
  ["中文", "日本語", "English"].forEach((l, i) => txt(g, l, X[i] + 20, y0 + 26, 16, { fam: i === 2 ? LAT : GO, color: GREY, alpha: a * 0.8, ls: 2 }));
  [1, 2].forEach(i => hair(g, X[i], y0 + 10, X[i], y0 + h - 10, 0.25 * a));
  const body = (s, i) => {
    const fam = [ZH, MIND, LAT][i], top = y0 + 44 + lh[i];
    font(g, fz[i], fam); const ls = i === 2 ? wrapWords(g, s, cw[i] - 44) : wrap(g, s, cw[i] - 44);
    const y = Math.max(top, y0 + (h - (ls.length - 1) * lh[i]) / 2 + fz[i] * 0.35);
    ls.forEach((l, j) => txt(g, l, X[i] + 22, y + j * lh[i], fz[i], { fam, alpha: a, color: i === 0 ? INK : i === 1 ? "#2c2925" : EN }));
  };
  body(c.zh, 0); body(c.ja, 1); body(c.en, 2);
}
function triQuote(g, c, t) {
  const a = eOut((t - c.t0) / 0.5) * (1 - eOut((t - c.t1) / 0.4)); if (a <= 0) return;
  if (c.mode === "band") {
    const y0 = 820, h = 240, gr = g.createLinearGradient(0, y0 - 60, 0, H);
    gr.addColorStop(0, "rgba(243,238,227,0)"); gr.addColorStop(0.3, "rgba(243,238,227,0.9)"); gr.addColorStop(1, "rgba(243,238,227,0.96)");
    g.save(); g.globalAlpha = a; g.fillStyle = gr; g.fillRect(0, y0 - 60, W, H - y0 + 60); g.restore();
    triCols(g, c, a, 60, y0, W - 120, h, "band");
    if (c.src) txt(g, c.src, W - 76, y0 + 26, 16, { align: "right", fam: GO, color: GREY, alpha: a * 0.8 });   // source on the label row
  } else {
    const x0 = 50, y0 = 96, w = 1180, h = 250;
    g.save(); g.globalAlpha = a * 0.9; g.fillStyle = PAPER; g.shadowColor = "rgba(40,30,20,0.18)"; g.shadowBlur = 20; g.fillRect(x0, y0, w, h); g.restore();
    hair(g, x0, y0, x0, y0 + h, a, RED, 4);
    triCols(g, c, a, x0, y0, w, h, "top");
    if (c.src) txt(g, c.src, x0 + w - 16, y0 + h - 14, 16, { align: "right", fam: GO, color: GREY, alpha: a });
  }
}
DRAW.tri = (g, sh, t) => {   // a whole shot of one quote in three big columns
  const tl = t - sh.t0; head(g, sh, tl);
  triCols(g, sh, eOut((tl - 0.3) / 0.8), 100, 370, W - 200, 430, "page");
  if (sh.foot) txt(g, sh.foot, W / 2, 860, 30, { align: "center", color: GREY, fam: MIND, alpha: eOut((tl - 1.2) / 0.8) });
};
const subtitle0 = subtitle;
subtitle = function (g, t) {
  trisInit();
  if (TRIS.some(c => c.mode === "band" && t >= c.t0 && t < c.t1 + 0.3)) return;
  subtitle0(g, t);
};
const chrome1 = chrome;
chrome = function (g, t, sh) {
  chrome1(g, t, sh); trisInit();
  for (const c of TRIS) if (t >= c.t0 - 0.1 && t < c.t1 + 0.5) triQuote(g, c, t);
};

// kanji opener: brush-write one character, then it grows and fades while the key image rises out of it
DRAW.kanji = (g, sh, t) => {
  const tl = t - sh.t0, size = 560, cx = W / 2, cy = 470, tm = sh.mount ?? 4.2;
  const mt = eInOut(sat((tl - tm) / 1.8)), drift = sat((tl - tm - 1.8) / Math.max(1, sh.t1 - sh.t0 - tm - 1.8));
  if (mt > 0) { g.save(); g.globalAlpha = mt; cover(g, IMG[sh.img], 0, 0, W, H, lerp(1.3, 1.08, mt) + 0.05 * drift, sh.fx ?? 0.5, lerp(0.8, sh.fy ?? 0.5, mt)); g.restore(); mist(g, t, 7); }
  if (mt < 1) glyph(sh.ch, cx, lerp(cy, cy - 80, mt), lerp(size, size * 2.4, mt), (tl - 0.3) / 1.8, INK, 1 - mt, 7, g);
  if (sh.gloss) txt(g, sh.gloss, cx, cy + 340, 30, { align: "center", fam: MIND, color: RED, alpha: eOut((tl - 2.4) / 0.6) * (1 - mt), ls: 6 });
};
// causal loop: nodes on an ellipse, arcs chase each other, "R" (reinforcing) in the middle
DRAW.loop = (g, sh, t) => {
  const tl = t - sh.t0; head(g, sh, tl);
  const n = sh.nodes.length, cx = W / 2 - 60, cy = 600, rx = 470, ry = 250;
  const Q = a => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)], A = i => -Math.PI / 2 + i * 2 * Math.PI / n;
  sh.nodes.forEach((nd, i) => {
    const b = shown(sh, (i + 1) % n === 0 ? n - 1 : i + 1, t); if (b <= 0) return;
    const a0 = A(i) + 0.32, a1 = A(i + 1) - 0.32, m = 24;
    g.save(); g.globalAlpha = b; g.strokeStyle = RED; g.lineWidth = 3; g.beginPath();
    for (let j = 0; j <= m; j++) { const [x, y] = Q(lerp(a0, a1, j / m)); j ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.restore();
    const [ex, ey] = Q(a1), [px, py] = Q(a1 - 0.04); arrow(g, px, py, ex, ey, b, RED);
  });
  sh.nodes.forEach((nd, i) => {
    const a = shown(sh, i, t), [x, y] = Q(A(i)); if (a <= 0) return;
    font(g, 38, MIND); const w = g.measureText(nd).width + 70;
    g.save(); g.globalAlpha = a; g.fillStyle = PAPER; g.fillRect(x - w / 2, y - 44, w, 80); g.strokeStyle = INK; g.lineWidth = 1.6; g.strokeRect(x - w / 2, y - 44, w, 80); g.restore();
    txt(g, nd, x, y + 10, 38, { align: "center", fam: MIND, alpha: a });
  });
  const r = shown(sh, n - 1, t);
  txt(g, "R", cx, cy + 34, 110, { align: "center", fam: LAT, color: RED, alpha: r, w: "bold" });
  if (sh.mid) txt(g, sh.mid, cx, cy + 86, 26, { align: "center", fam: GO, color: GREY, alpha: r, ls: 4 });
};

// diagrams get micro-motion (0.8% push, 3 px sway): a pixel-still hold reads as a frozen video.
// Pivot at y=400 so the lowest text moves at most ~4 px toward the subtitle box.
["table", "list", "ladder", "loop", "trio", "gates", "tri", "flow", "quote", "compare", "axis"].forEach(k => {
  const f = DRAW[k]; if (!f) return;
  DRAW[k] = (g, sh, t) => {
    const u = sat((t - sh.t0) / Math.max(1, sh.t1 - sh.t0)), s = 1 + 0.008 * eInOut(u), dx = 3 * Math.sin((t - sh.t0) * 0.5);
    g.save(); g.translate(W / 2 + dx, 400); g.scale(s, s); g.translate(-W / 2, -400); f(g, sh, t); g.restore();
  };
});
