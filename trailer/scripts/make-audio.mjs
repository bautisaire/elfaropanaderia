// Genera la banda sonora del trailer: assets/music.wav y assets/sfx.wav
// Uso: node scripts/make-audio.mjs   (desde la carpeta trailer/)
// Todo es sintetizado y determinista (semilla fija): 120 bpm, 1 compás = 2 s, 20 s en total.
import { writeFileSync, mkdirSync } from "node:fs";

const SR = 44100;
const DUR = 20;
const N = SR * DUR;

let seed = 20261113;
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const noise = () => rnd() * 2 - 1;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const TAU = Math.PI * 2;
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const sq = (ph, d = 0.5) => (ph - Math.floor(ph) < d ? 1 : -1);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lp = (cut) => {
  let y = 0;
  const a = 1 - Math.exp((-TAU * cut) / SR);
  return (x) => (y += a * (x - y));
};
const hp = (cut) => {
  const l = lp(cut);
  return (x) => x - l(x);
};
const newBuf = () => [new Float32Array(N), new Float32Array(N)];

function add(b, t0, len, fn, gain = 1, pan = 0) {
  const s = Math.floor(t0 * SR);
  const n = Math.floor(len * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < n; i++) {
    const j = s + i;
    const v = fn(i / SR);
    if (j < 0 || j >= N) continue;
    b[0][j] += v * gl;
    b[1][j] += v * gr;
  }
}
const tail = (t, len, r = 0.02) => clamp01((len - t) / r);

// ---------- instrumentos ----------
function kick(b, t, g = 1) {
  let ph = 0;
  add(b, t, 0.4, (tt) => {
    ph += (48 + 130 * Math.exp(-tt / 0.035)) / SR;
    return Math.sin(TAU * ph) * Math.exp(-tt / 0.13) * tail(tt, 0.4);
  }, g);
}
function clap(b, t, g = 1) {
  const h = hp(1100), l = lp(6500);
  add(b, t, 0.22, (tt) => {
    const e = Math.exp(-tt / 0.055) + (tt > 0.012 && tt < 0.03 ? 0.5 : 0);
    return l(h(noise())) * e + Math.sin(TAU * 190 * tt) * Math.exp(-tt / 0.03) * 0.5;
  }, g, 0.1);
}
function hat(b, t, g = 1, dec = 0.022) {
  const h = hp(7000);
  add(b, t, 0.14, (tt) => h(noise()) * Math.exp(-tt / dec), g, 0.25);
}
function bass(b, t, len, m, g = 1) {
  const f = mtof(m), l = lp(480);
  let ph = 0;
  add(b, t, len, (tt) => {
    ph += f / SR;
    const e = clamp01(tt / 0.005) * Math.exp(-tt / 0.4) * tail(tt, len);
    return l(saw(ph) * 0.7 + sq(ph * 0.5) * 0.45) * e;
  }, g);
}
function stab(b, t, len, notes, g = 1, cut = 2400, dec = 0.12) {
  notes.forEach((m, k) => {
    const f = mtof(m), l = lp(cut);
    let p1 = 0, p2 = 0;
    add(b, t, len, (tt) => {
      p1 += (f * 1.004) / SR;
      p2 += (f * 0.996) / SR;
      const e = clamp01(tt / 0.004) * Math.exp(-tt / dec) * tail(tt, len);
      return l(saw(p1) + saw(p2)) * 0.5 * e;
    }, g, (k - 1) * 0.45);
  });
}
function lead(b, t, len, m, g = 1, duty = 0.25) {
  const f = mtof(m), l = lp(5200);
  let ph = 0;
  add(b, t, len, (tt) => {
    const vib = 1 + 0.004 * Math.sin(TAU * 6 * tt) * clamp01(tt / 0.15);
    ph += (f * vib) / SR;
    const e = clamp01(tt / 0.006) * (0.55 + 0.45 * Math.exp(-tt / 0.1)) * tail(tt, len, 0.03);
    return l(sq(ph, duty)) * e;
  }, g, -0.15);
}
function pad(b, t, len, notes, g = 1, cut = 900, att = 0.6) {
  notes.forEach((m, k) => {
    const f = mtof(m), l = lp(cut);
    let p1 = 0, p2 = 0;
    add(b, t, len, (tt) => {
      p1 += (f * 1.003) / SR;
      p2 += (f * 0.997) / SR;
      const e = clamp01(tt / att) * tail(tt, len, 0.5) * (0.85 + 0.15 * Math.sin(TAU * 3 * tt));
      return l(saw(p1) + saw(p2)) * 0.4 * e;
    }, g, (k % 2 ? 0.4 : -0.4));
  });
}
function riser(b, t, len, g = 1) {
  let y = 0;
  add(b, t, len, (tt) => {
    const p = tt / len;
    const a = 1 - Math.exp((-TAU * (400 + 7000 * p * p)) / SR);
    y += a * (noise() - y);
    return y * p * p * tail(tt, len, 0.01);
  }, g);
}

// ---------- música ----------
const M = newBuf();
const BAR = 2, E8 = 0.25, S16 = 0.125;

// B · groove alegre en Re mayor
const CH = {
  D: { notes: [62, 66, 69], root: 38 },
  Bm: { notes: [59, 62, 66], root: 35 },
  G: { notes: [55, 59, 62], root: 43 },
  A: { notes: [57, 61, 64], root: 45 },
  Fs: { notes: [54, 58, 61], root: 42 },
};
const MEL = {
  D: [74, 0, 78, 81, 0, 78, 74, 0],
  Bm: [71, 0, 74, 78, 0, 74, 71, 0],
  G: [67, 0, 71, 74, 0, 76, 74, 71],
  A: [73, 0, 76, 81, 0, 79, 76, 73],
  D2: [86, 0, 81, 78, 0, 81, 86, 0],
  A2: [73, 76, 79, 81, 76, 81, 85, 88],
};
function happyBar(tb, ch, mel) {
  const c = CH[ch];
  for (let i = 0; i < 4; i++) kick(M, tb + i * 0.5, 0.9);
  clap(M, tb + 0.5, 0.5);
  clap(M, tb + 1.5, 0.5);
  for (let i = 0; i < 8; i++) hat(M, tb + i * E8, i % 2 ? 0.3 : 0.15);
  const bp = [0, null, 12, 0, null, 0, 12, 7];
  bp.forEach((o, i) => o !== null && bass(M, tb + i * E8, 0.24, c.root + o, 0.75));
  for (let i = 1; i < 8; i += 2) stab(M, tb + i * E8, 0.2, c.notes, 0.2);
  MEL[mel].forEach((m, i) => m && lead(M, tb + i * E8, 0.23, m, 0.2));
}
function tada(t, len) {
  kick(M, t, 1);
  clap(M, t, 0.6);
  stab(M, t, len, [50, 62, 66, 69, 74], 0.3, 3200, 0.9);
  bass(M, t, 1.2, 38, 0.8);
  lead(M, t, 0.9, 86, 0.16);
  [0, 1, 2, 3].forEach((k) => lead(M, t + k * 0.07, 0.5, [74, 78, 81, 86][k], 0.1, 0.5));
}
// 9 compases (0–18 s) y acorde final a los 18 s
[["D", "D"], ["Bm", "Bm"], ["G", "G"], ["A", "A"], ["D", "D2"], ["Bm", "Bm"], ["G", "G"], ["A", "A2"], ["D", "D"]].forEach(([c, m], k) =>
  happyBar(k * BAR, c, m),
);
tada(18, 2);
pad(M, 18, 2, [50, 62, 66, 69], 0.2, 1400, 0.05);

// ---------- efectos ----------
const X = newBuf();
function boom(t, g = 1) {
  let ph = 0;
  const l = lp(380);
  add(X, t, 2.2, (tt) => {
    ph += (42 + 110 * Math.exp(-tt / 0.12)) / SR;
    return (Math.sin(TAU * ph) * Math.exp(-tt / 0.6) + l(noise()) * 0.9 * Math.exp(-tt / 0.22)) * tail(tt, 2.2, 0.1);
  }, g);
}
function pop(t, g = 0.5, f0 = 520) {
  let ph = 0;
  add(X, t, 0.07, (tt) => {
    ph += (f0 + 700 * (tt / 0.07)) / SR;
    return Math.sin(TAU * ph) * Math.exp(-tt / 0.025);
  }, g);
}
function whoosh(t, len = 0.45, g = 0.5) {
  let y = 0;
  add(X, t, len, (tt) => {
    const p = tt / len;
    const a = 1 - Math.exp((-TAU * (300 + 5000 * Math.sin(Math.PI * p))) / SR);
    y += a * (noise() - y);
    return y * Math.sin(Math.PI * p);
  }, g);
}
function growl(t, g = 0.7) {
  let ph = 0;
  const l = lp(360);
  add(X, t, 1.1, (tt) => {
    const f = 58 * (1 + 0.28 * Math.sin(TAU * 7 * tt) + 0.14 * Math.sin(TAU * 19 * tt));
    ph += f / SR;
    const e = Math.sin(Math.PI * clamp01(tt / 1.1)) * (0.6 + 0.4 * Math.sin(TAU * 26 * tt));
    return l(saw(ph) + noise() * 0.3) * e * 2;
  }, g);
}
function scratch(t, g = 0.6) {
  let ph = 0;
  const h = hp(500);
  add(X, t, 0.38, (tt) => {
    ph += (1100 * Math.exp(-tt / 0.11) + 70) / SR;
    return h(saw(ph) * 0.6 + noise() * 0.5 * Math.abs(Math.sin(TAU * 38 * tt))) * tail(tt, 0.38, 0.05);
  }, g);
}
function alarm(t, len, g = 0.22) {
  let ph = 0;
  const l = lp(3200);
  add(X, t, len, (tt) => {
    const f = Math.floor(tt / 0.25) % 2 ? 698 : 932;
    ph += f / SR;
    return l(sq(ph, 0.5)) * clamp01(tt / 0.02) * tail(tt, len, 0.25);
  }, g);
}
function bell(t, f, len = 1.2, g = 0.45) {
  add(X, t, len, (tt) =>
    (Math.sin(TAU * f * tt) + 0.45 * Math.sin(TAU * f * 2.76 * tt) * Math.exp(-tt / 0.15) + 0.2 * Math.sin(TAU * f * 5.4 * tt) * Math.exp(-tt / 0.06)) *
    Math.exp(-tt / (len / 4)) * tail(tt, len, 0.05), g);
}
function crunch(t, g = 0.7) {
  const h = hp(1400);
  add(X, t, 0.22, (tt) => {
    const e = Math.exp(-tt / 0.012) + (tt > 0.05 ? Math.exp(-(tt - 0.05) / 0.015) * 0.8 : 0) + (tt > 0.11 ? Math.exp(-(tt - 0.11) / 0.02) * 0.6 : 0);
    return h(noise()) * e;
  }, g);
}
function thud(t, g = 0.9) {
  let ph = 0;
  const l = lp(900);
  add(X, t, 0.35, (tt) => {
    ph += (60 + 140 * Math.exp(-tt / 0.02)) / SR;
    return Math.sin(TAU * ph) * Math.exp(-tt / 0.09) + l(noise()) * Math.exp(-tt / 0.03) * 0.7;
  }, g);
}
function moto(t, len, g = 0.2) {
  let ph = 0;
  const l = lp(1000);
  add(X, t, len, (tt) => {
    const f = 85 + 30 * Math.sin(TAU * 0.45 * tt) + 25 * (tt / len);
    ph += f / SR;
    const am = 0.6 + 0.4 * sq(ph * 0.5, 0.4);
    return l(saw(ph) * am) * clamp01(tt / 0.3) * tail(tt, len, 0.5);
  }, g);
}
function bark(t, g = 0.5) {
  let ph = 0;
  const l = lp(1700);
  add(X, t, 0.15, (tt) => {
    ph += (460 - 1400 * tt) / SR;
    return l(saw(ph) + noise() * 0.5) * Math.sin(Math.PI * clamp01(tt / 0.15));
  }, g);
}
function wind(t, len, g = 0.45) {
  let y = 0;
  add(X, t, len, (tt) => {
    const p = tt / len;
    const a = 1 - Math.exp((-TAU * (500 + 900 * Math.sin(TAU * 1.3 * tt) + 1200 * Math.sin(Math.PI * p))) / SR);
    y += a * (noise() - y);
    return y * Math.sin(Math.PI * p);
  }, g);
}

// 1 · pedir
pop(1.0);
pop(2.2);
pop(3.8, 0.6);
[0, 1, 2, 3, 4].forEach((k) => bell(4.05 + k * 0.07, [1175, 1480, 1760, 2349, 2960][k], 0.9, 0.14));
whoosh(5.85, 0.35, 0.35);
// 2 · panadería: notificación
bell(6.7, 1318.5, 0.7, 0.45);
bell(6.88, 1760, 1.0, 0.45);
pop(7.6, 0.4);
whoosh(9.85, 0.35, 0.35);
// 3 · armado
for (let i = 0; i < 6; i++) pop(10.55 + i * 0.25, 0.35, 420 + i * 40);
thud(12.3, 0.6);
bell(13.0, 1568, 0.8, 0.35);
whoosh(13.85, 0.35, 0.35);
// 4 · entrega
moto(14, 1.5, 0.16);
thud(16.2, 0.45);
bell(16.6, 659.3, 0.9, 0.4);
bell(16.85, 880, 1.1, 0.4);
moto(16.6, 1.2, 0.12);
// 5 · final
whoosh(17.85, 0.35, 0.4);

// ---------- salida ----------
function finish(b, peak) {
  let mx = 0;
  for (const ch of b) for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(ch[i]));
  const k = 1.4 / mx;
  let mx2 = 0;
  for (const ch of b)
    for (let i = 0; i < N; i++) {
      ch[i] = Math.tanh(ch[i] * k);
      mx2 = Math.max(mx2, Math.abs(ch[i]));
    }
  const fadeN = SR * 1.2;
  for (const ch of b)
    for (let i = 0; i < N; i++) {
      let g = peak / mx2;
      if (i > N - fadeN) g *= (N - i) / fadeN;
      ch[i] *= g;
    }
}
function wav(path, b) {
  const data = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b[0][i])) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b[1][i])) * 32767), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}
mkdirSync("assets", { recursive: true });
finish(M, 0.62);
finish(X, 0.5);
wav("assets/music.wav", M);
wav("assets/sfx.wav", X);
console.log("ok: assets/music.wav, assets/sfx.wav (" + DUR + " s)");
