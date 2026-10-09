// Brush writer: draws kanji stroke by stroke with dry-brush texture. Stroke data: strokes.js (KanjiVG, CC BY-SA 3.0).
const SAMP = {};
function presample() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.style.position = "absolute"; svg.style.left = "-9999px"; document.body.appendChild(svg);
  for (const ch in STROKES) {
    SAMP[ch] = STROKES[ch].map(d => {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d); svg.appendChild(p);
      const len = p.getTotalLength(), n = Math.max(10, Math.ceil(len / 0.6)), pts = [];
      for (let i = 0; i <= n; i++) { const q = p.getPointAtLength(len * i / n); pts.push([q.x, q.y]); }
      return { pts, len };
    });
  }
}
function drawStroke(g, pts, sp, sc, seed, color, size, weight) {
  const n = pts.length, m = Math.max(2, Math.round((n - 1) * sp) + 1);
  if (sp <= 0) return;
  const base = size * 0.07 * weight, Ls = [], Rs = [], Ws = [], Ns = [];
  for (let i = 0; i < m; i++) {
    const s = i / (n - 1);
    let w = base * (0.85 + 0.22 * Math.exp(-Math.pow((s - 0.06) / 0.1, 2))) * (1 - 0.62 * smooth((s - 0.7) / 0.3));
    w *= 0.86 + 0.28 * noise1(s * 4 + 0.3, seed);
    w += size * 0.006 * (noise1(i * 0.8, seed + 7) - 0.5);
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(n - 1, i + 2)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const x = pts[i][0] * sc, y = pts[i][1] * sc;
    Ls.push([x + nx * w / 2, y + ny * w / 2]); Rs.push([x - nx * w / 2, y - ny * w / 2]); Ws.push(w); Ns.push([nx, ny]);
  }
  g.fillStyle = color; g.beginPath(); g.moveTo(Ls[0][0], Ls[0][1]);
  for (let i = 1; i < m; i++) g.lineTo(Ls[i][0], Ls[i][1]);
  for (let i = m - 1; i >= 0; i--) g.lineTo(Rs[i][0], Rs[i][1]);
  g.closePath(); g.fill();
  g.beginPath(); g.arc(pts[0][0] * sc, pts[0][1] * sc, Ws[0] * 0.46, 0, 7); g.fill();
  const e = m - 1; g.beginPath(); g.arc(pts[e][0] * sc, pts[e][1] * sc, Ws[e] * 0.5, 0, 7); g.fill();
  g.save(); g.globalCompositeOperation = "destination-out"; g.lineCap = "round";
  const i0 = Math.floor((n - 1) * 0.4);
  for (let j = 0; j < 7; j++) {
    const o = (j / 6 - 0.5) * 0.78; g.lineWidth = base * 0.07; g.strokeStyle = "rgba(0,0,0,0.92)";
    g.beginPath(); let pen = false;
    for (let i = i0; i < m; i++) {
      const s = i / (n - 1), dry = 0.12 + 0.8 * smooth((s - 0.45) / 0.55);
      const on = noise1(i * 0.42 + j * 17.3, seed + j * 3) < dry * 0.75;
      const x = pts[i][0] * sc + Ns[i][0] * Ws[i] * o, y = pts[i][1] * sc + Ns[i][1] * Ws[i] * o;
      if (on) { if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y); } else pen = false;
    }
    g.stroke();
  }
  g.restore();
}
function paintGlyph(g, ch, size, p, seed, color, weight) {
  const S = SAMP[ch]; if (!S) return;
  const w = S.map(s => s.len + 22), tot = w.reduce((a, b) => a + b, 0);
  let acc = 0; const T = S.map((s, k) => { const a = acc / tot; acc += w[k]; return [a, acc / tot]; });
  const sc = size / 109;
  g.save(); g.translate(size * 0.15, size * 0.15);
  for (let k = 0; k < S.length; k++) {
    const [a, b] = T[k]; let sp = (p - a) / (b - a); if (sp <= 0) break;
    sp = sat(sp / 0.86); sp = 0.5 - 0.5 * Math.cos(Math.PI * sp);
    drawStroke(g, S[k].pts, sp, sc, seed * 31 + k * 7, color, size, weight);
  }
  g.restore();
}
const glyphDur = ch => { const S = SAMP[ch]; return S ? clamp(0.3 + S.length * 0.07, 0.4, 1.3) : 0.8; };
function glyph(ch, x, y, size, p, color, alpha, seed, G = ctx) {
  if (p <= 0 || alpha <= 0) return;
  const box = size * 1.3, tmp = mk(box, box), g = tmp.getContext("2d");
  paintGlyph(g, ch, size, sat(p), seed, color, 1);
  G.save(); G.globalAlpha = alpha;
  G.filter = "blur(" + (size * 0.012).toFixed(1) + "px)"; G.globalAlpha = alpha * 0.35; G.drawImage(tmp, x - box / 2, y - box / 2);
  G.filter = "none"; G.globalAlpha = alpha; G.drawImage(tmp, x - box / 2, y - box / 2);
  G.restore();
}
// write a string glyph by glyph (vertical=true for a column); G = target canvas
function writeLine(text, x, y, size, gap, t, t0, color, alpha, vertical, seed, G = ctx) {
  let tt = t0;
  [...text].forEach((c, i) => {
    const d = glyphDur(c);
    const gx = vertical ? x : x + (i - ([...text].length - 1) / 2) * gap, gy = vertical ? y + i * gap : y;
    glyph(c, gx, gy, size, (t - tt) / d, color, alpha, (seed || 11) + i * 13, G);
    tt += d * 0.9;
  });
}
