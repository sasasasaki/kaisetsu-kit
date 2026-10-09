// Motion-comic route: the camera travels over whole manga pages (engine/comic.html?p=<project>).
// Same contract as the explainer: canvas#c 1920x1080, window.READY, async renderAt(t), every frame a pure function of t.
// Time comes from projects/<p>/src/timeline.json (tools/plan_comic.py). The speaking panel is fully visible
// (zoom capped at 1.45 output px per source px), other panels are dimmed. A video clip is pasted back at its exact
// crop box in page space, so pushing the camera onto that box makes the still come alive. Page changes: turn / slide / push / flash.
const W = 1920, H = 1080, SUB_H = 96, VIEW_H = H - SUB_H, CAP = 1.45;
const BG = "#10100e", INK = "#f3eee5", ACC = "#aa4c42";
const PROJ = new URLSearchParams(location.search).get("p"), P = `/projects/${PROJ}`;
const cv = document.getElementById("c"), g = cv.getContext("2d");
const LA = mk(), LB = mk(), FR = new Map();
let TL, PAGES = {}, FRAMES = {};

function mk() { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; }
const sat = x => Math.max(0, Math.min(1, x));
const lerp = (a, b, u) => a + (b - a) * u;
const eio = u => (u = sat(u), u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const eout = u => 1 - Math.pow(1 - sat(u), 3);
const img = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("missing " + src)); i.src = src; });

// ── camera ──
function viewOf(page, box, fill) {   // fit box in the visible area above the subtitle band: [s, ox, oy] (screen = src * s + o)
  const m = fill ? 0 : 18, bw = box[2] - box[0] + 2 * m, bh = box[3] - box[1] + 2 * m;
  const s = fill ? Math.min(W / bw, H / bh) : Math.min(W / bw, VIEW_H / bh, CAP);
  const vh = fill ? H : VIEW_H, cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, [pw, ph] = page.size;
  let ox = W / 2 - cx * s, oy = vh / 2 - cy * s;
  if (!fill) {
    if (pw * s <= W) ox = (W - pw * s) / 2; else ox = Math.min(0, Math.max(W - pw * s, ox));
    if (ph * s > vh) oy = Math.min(0, Math.max(vh - ph * s, oy));
  }
  return [s, ox, oy];
}
const mixView = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
function push(v, k, box) {   // slow push around the panel centre while holding
  const cx = v[0] * (box[0] + box[2]) / 2 + v[1], cy = v[0] * (box[1] + box[3]) / 2 + v[2];
  return [v[0] * k, cx - (cx - v[1]) * k, cy - (cy - v[2]) * k];
}
function camera(pg, t) {
  const ps = TL.panels.filter(p => p.page === pg.id);
  let i = ps.findIndex(p => t < p.end); if (i < 0) i = ps.length - 1;
  const p = ps[i], prev = i > 0 ? ps[i - 1] : null;
  const vP = viewOf(pg, p.box, false);
  let v = vP;
  if (prev && t < p.arrive) v = mixView(viewOf(pg, prev.box, false), vP, eio((t - p.a) / (p.arrive - p.a)));
  else v = push(vP, 1 + 0.03 * sat((t - p.arrive) / Math.max(1, p.end - p.arrive)), p.box);
  const c = TL.clips.find(c => c.panel === p.id);
  if (c) {   // clip: push to its crop box = full screen, pull back before it ends (unless it holds)
    const vC = viewOf(pg, c.box, true);
    const kin = c.t0 === 0 ? 1 : eio((t - c.t0 + 0.2) / 0.9), kout = c.hold ? 0 : eio((t - c.t1 + 0.1) / 0.9);
    v = mixView(v, vC, sat(kin) * (1 - sat(kout)));
  }
  return { v, p, i, prev };
}
function shake(t) {
  let dx = 0, dy = 0;
  for (const f of TL.fx) if (f.kind === "shake" && t >= f.t && t < f.t + 0.5) { const u = (t - f.t) / 0.5, a = 14 * (1 - u) * (1 - u); dx += a * Math.sin(u * 47); dy += a * 0.6 * Math.cos(u * 39); }
  return [dx, dy];
}

// ── one page onto a layer ──
async function frameOf(c, t) {
  const n = FRAMES[c.id]; if (!n) return null;
  const k = Math.max(1, Math.min(n, 1 + Math.floor((t - c.t0) * TL.fps))), key = `${c.id}:${k}`;
  if (!FR.has(key)) { FR.set(key, await img(`${P}/assets/video/frames/${c.id}/${String(k).padStart(4, "0")}.jpg`)); if (FR.size > 40) FR.delete(FR.keys().next().value); }
  return FR.get(key);
}
async function drawPage(cx, pg, t, view, cur) {
  const im = PAGES[pg.id], [s, ox, oy] = view, [dx, dy] = shake(t);
  cx.save(); cx.fillStyle = BG; cx.fillRect(0, 0, W, H);
  cx.translate(ox + dx, oy + dy); cx.scale(s, s);
  cx.shadowColor = "rgba(0,0,0,0.6)"; cx.shadowBlur = 40 / s; cx.drawImage(im, 0, 0, pg.size[0], pg.size[1]); cx.shadowBlur = 0;
  for (const p of TL.panels) {   // dim every panel except the one the camera is on
    if (p.page !== pg.id) continue;
    const on = p.id === cur.p.id ? eio((t - p.a) / 0.5) : (cur.prev && p.id === cur.prev.id ? 1 - eio((t - cur.p.a) / 0.5) : 0);
    const b = p.box; cx.fillStyle = `rgba(16,16,14,${0.62 * (1 - on)})`; cx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
  }
  for (const c of TL.clips) {   // clips sit on their crop box; balloons were kept out of the crop, so the page art stays legible
    if (c.page !== pg.id || t < c.t0 - 0.05) continue;
    const hold = c.hold || c.t0 === 0;
    if (!hold && t > c.t1 + 0.6) continue;
    const fr = await frameOf(c, t); if (!fr) continue;
    const a = (c.t0 === 0 ? 1 : eout((t - c.t0) / 0.5)) * (hold ? 1 : 1 - eout((t - c.t1) / 0.6));
    const b = c.box; cx.globalAlpha = a; cx.drawImage(fr, b[0], b[1], b[2] - b[0], b[3] - b[1]); cx.globalAlpha = 1;
  }
  for (const f of TL.fx) {   // knock: the sound-effect lettering itself pops on each hit
    if (f.kind !== "knock" || f.panel !== cur.p.id) continue;
    const q = f.rect, r = [q[0] + q[2] * 0.08, q[1] + q[3] * 0.08, q[2] * 0.84, q[3] * 0.84], cxr = r[0] + r[2] / 2, cyr = r[1] + r[3] / 2;
    for (const d of [0, 0.42]) {
      const u = (t - f.t - d) / 0.32; if (u < 0 || u > 1) continue;
      const k = 1 + 0.1 * Math.sin(Math.PI * u), w = r[2] * k, h = r[3] * k;
      cx.drawImage(im, r[0], r[1], r[2], r[3], cxr - w / 2, cyr - h / 2, w, h);
    }
  }
  cx.restore();
  const vg = cx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.45)"); cx.fillStyle = vg; cx.fillRect(0, 0, W, H);
}

// ── page transitions: LA = last frame of the old page, LB = first panel of the new one ──
function composite(tr, u) {
  if (tr === "turn") {   // peel from bottom-right to top-left with a paper-back strip on the fold
    const s = lerp(W + H, -300, eio(u)), fw = 180 * Math.sin(Math.PI * eio(u)) + 30;
    g.drawImage(LB, 0, 0);
    g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.max(0, s), 0); g.lineTo(0, Math.max(0, s)); g.closePath(); g.clip(); g.drawImage(LA, 0, 0); g.restore();
    const gr = g.createLinearGradient(s / 2, s / 2, (s + fw) / 2, (s + fw) / 2);
    gr.addColorStop(0, "rgba(236,228,212,1)"); gr.addColorStop(0.75, "rgba(200,190,172,1)"); gr.addColorStop(1, "rgba(0,0,0,0.35)");
    g.save(); g.beginPath(); g.moveTo(s, 0); g.lineTo(s + fw, 0); g.lineTo(0, s + fw); g.lineTo(0, s); g.closePath(); g.fillStyle = gr; g.fill(); g.restore();
  } else if (tr === "slide") {
    const e = eio(u), x = -W * e;
    g.drawImage(LA, x, 0); g.drawImage(LB, x + W, 0);
    const sh = g.createLinearGradient(x + W - 60, 0, x + W, 0); sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = sh; g.fillRect(x + W - 60, 0, 60, H);
  } else if (tr === "push") {   // dive into the old page, then the new one rises from dark (never both at once)
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    if (u < 0.5) { const e = eio(u / 0.5); g.save(); g.translate(W / 2, H / 2); g.scale(1 + 0.5 * e, 1 + 0.5 * e); g.drawImage(LA, -W / 2, -H / 2); g.restore(); g.fillStyle = `rgba(16,16,14,${e})`; g.fillRect(0, 0, W, H); }
    else { const e = eout((u - 0.5) / 0.5); g.save(); g.globalAlpha = e; g.translate(W / 2, H / 2); g.scale(0.86 + 0.14 * e, 0.86 + 0.14 * e); g.drawImage(LB, -W / 2, -H / 2); g.restore(); }
  } else {   // flash: white flash hard cut
    g.drawImage(u < 0.5 ? LA : LB, 0, 0);
    g.fillStyle = `rgba(255,252,244,${Math.sin(Math.PI * sat(u))})`; g.fillRect(0, 0, W, H);
  }
}

// ── subtitles: the original language is in the balloons, so only the translation; narration/sfx in grey italics ──
function subtitle(t) {
  const s = TL.subs.find(x => t >= x[0] && t < x[1]); if (!s) return;
  const a = sat((t - s[0]) / 0.18) * sat((s[1] - t) / 0.18), nm = TL.names[s[3]], en = s[4];
  g.save(); g.globalAlpha = a;
  const gr = g.createLinearGradient(0, H - SUB_H - 20, 0, H); gr.addColorStop(0, "rgba(16,16,14,0)"); gr.addColorStop(0.35, "rgba(16,16,14,0.85)"); gr.addColorStop(1, "rgba(16,16,14,0.95)");
  g.fillStyle = gr; g.fillRect(0, H - SUB_H - 20, W, SUB_H + 20);
  g.textAlign = "center"; g.textBaseline = "alphabetic";
  if (nm) {
    g.font = '600 40px Georgia, "Times New Roman", serif'; const tw = g.measureText(en).width;
    g.font = '700 18px "Segoe UI", Arial, sans-serif'; const nw = g.measureText(nm[0]).width + 18;
    const x0 = W / 2 - (tw + nw) / 2;
    g.fillStyle = nm[1]; g.textAlign = "left"; g.fillText(nm[0], x0, H - 40);
    g.fillStyle = INK; g.font = '600 40px Georgia, "Times New Roman", serif'; g.fillText(en, x0 + nw, H - 38);
  } else {
    g.fillStyle = "rgba(243,238,227,0.75)"; g.font = 'italic 34px Georgia, "Times New Roman", serif'; g.fillText(en, W / 2, H - 40);
  }
  g.restore();
}
function titles(t) {   // opening: the opener clip sets the scene, the title lands after it; ending: title hold
  const show = a => {
    g.save(); g.globalAlpha = a; g.textAlign = "left";
    g.fillStyle = "rgba(16,16,14,0.45)"; g.fillRect(0, H - 330, 980, 230);
    g.fillStyle = ACC; g.fillRect(120, H - 300, 6, 170);
    g.fillStyle = INK; g.font = '500 30px "Yu Mincho", "YuMincho", "Noto Serif JP", serif'; g.fillText(TL.chapter || "", 150, H - 262);
    g.font = '600 96px "Yu Mincho", "YuMincho", "Noto Serif JP", serif'; g.fillText(TL.title || "", 150, H - 180);
    g.font = 'italic 28px Georgia, serif'; g.fillStyle = "rgba(243,238,227,0.8)"; g.fillText(TL.subtitle || "", 152, H - 132);
    g.restore();
  };
  const o = TL.clips.find(c => c.t0 === 0), oe = o ? o.len : 5;
  if (t > 2.0 && t < oe + 0.8) show(eout((t - 2.0) / 0.9) * (1 - eout((t - oe) / 0.8)));
  if (t > TL.end) show(eout((t - TL.end) / 1.0));
}

window.renderAt = async function (t) {
  let pi = TL.pages.findIndex(p => t < p.t1); if (pi < 0) pi = TL.pages.length - 1;
  const pg = TL.pages[pi], cur = camera(pg, t);
  if (pi > 0 && t < pg.t0 + pg.tin) {   // transition: old page frozen on its last frame, new page on its first panel
    const prev = TL.pages[pi - 1], tp = prev.t1 - 0.001, cp = camera(prev, tp);
    await drawPage(LA.getContext("2d"), prev, tp, cp.v, cp);
    const tn = pg.t0 + pg.tin, cn = camera(pg, tn);
    await drawPage(LB.getContext("2d"), pg, tn, cn.v, cn);
    composite(pg.trans, (t - pg.t0) / pg.tin);
  } else {
    await drawPage(g, pg, t, cur.v, cur);
  }
  if (t > TL.end) { g.fillStyle = `rgba(16,16,14,${0.5 * eout((t - TL.end) / 1.2)})`; g.fillRect(0, 0, W, H); }
  subtitle(t);
  titles(t);
  g.fillStyle = `rgba(0,0,0,${1 - eout(t / 0.6)})`; g.fillRect(0, 0, W, H);
  if (t > TL.dur - 0.8) { g.fillStyle = `rgba(0,0,0,${eout((t - TL.dur + 0.8) / 0.8)})`; g.fillRect(0, 0, W, H); }
};

(async () => {
  TL = await (await fetch(`${P}/src/timeline.json`)).json();
  for (const p of TL.pages) PAGES[p.id] = await img(`${P}/${p.image}`);
  try { FRAMES = await (await fetch(`${P}/assets/video/frames/index.json`)).json(); } catch (e) { FRAMES = {}; }
  await document.fonts.load('600 40px Georgia'); await document.fonts.load('600 96px "Yu Mincho"');
  window.READY = `${PROJ} ${TL.pages.length} pages ${TL.dur}s`;
})().catch(e => { window.LOAD_ERROR = String(e); });
