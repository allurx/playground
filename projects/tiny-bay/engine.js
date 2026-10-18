
/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';
// ───────────────────────────── math & helpers ─────────────────────────────
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  madd: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

// quaternions are [x, y, z, w]
const qt = {
  id: () => [0, 0, 0, 1],
  mul(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
  },
  conj: (q) => [-q[0], -q[1], -q[2], q[3]],
  norm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; },
  rot(q, v) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
  },
  axis(ax, ang) { const s = Math.sin(ang / 2), n = v3.norm(ax); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(ang / 2)]; },
  // shortest rotation taking unit vector a onto unit vector b
  between(a, b) {
    const d = v3.dot(a, b);
    if (d < -0.99999) {
      let ax = v3.cross([1, 0, 0], a);
      if (v3.len(ax) < 1e-4) ax = v3.cross([0, 0, 1], a);
      return qt.axis(ax, Math.PI);
    }
    const c = v3.cross(a, b);
    return qt.norm([c[0], c[1], c[2], 1 + d]);
  },
  // rotation whose local x, y, z axes are the given orthonormal vectors
  basis(x, y, z) {
    const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
    const tr = m00 + m11 + m22;
    let q;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]; }
    else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
    else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]; }
    else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]; }
    return qt.norm(q);
  },
  // integrate angular velocity w over h
  integrate(q, w, h) {
    const hx = 0.5 * h * w[0], hy = 0.5 * h * w[1], hz = 0.5 * h * w[2];
    const r = [
      q[0] + hx * q[3] + hy * q[2] - hz * q[1],
      q[1] + hy * q[3] + hz * q[0] - hx * q[2],
      q[2] + hz * q[3] + hx * q[1] - hy * q[0],
      q[3] - hx * q[0] - hy * q[1] - hz * q[2],
    ];
    return qt.norm(r);
  },
};

// 4x4 matrices, column-major Float32Array(16)
const M4 = {
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = far / (near - far); m[11] = -1; m[14] = (far * near) / (near - far);
    return m;
  },
  lookAt(eye, at, up) {
    const z = v3.norm(v3.sub(eye, at)), x = v3.norm(v3.cross(up, z)), y = v3.cross(z, x), m = new Float32Array(16);
    m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
    m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
    m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
    m[12] = -v3.dot(x, eye); m[13] = -v3.dot(y, eye); m[14] = -v3.dot(z, eye); m[15] = 1;
    return m;
  },
  mul(a, b) {
    const m = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      m[c * 4 + r] = s;
    }
    return m;
  },
  invert(m) {
    const a = m, inv = new Float32Array(16);
    const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4];
    const b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
    const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12];
    const b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return inv;
    det = 1 / det;
    inv[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det; inv[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
    inv[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det; inv[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
    inv[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det; inv[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
    inv[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det; inv[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
    inv[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det; inv[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
    inv[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det; inv[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
    inv[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det; inv[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
    inv[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det; inv[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
    return inv;
  },
  apply(m, p) {
    const x = p[0], y = p[1], z = p[2], w = p.length > 3 ? p[3] : 1;
    return [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w,
      m[2] * x + m[6] * y + m[10] * z + m[14] * w, m[3] * x + m[7] * y + m[11] * z + m[15] * w];
  },
};


// ───────────────────────────── the diorama: a square block of sea with an island ─────────────────────────────
// Block-local coordinates: origin at the centre of the base, y up, x/z in [-HALF, HALF].
const HALF = 2.35, SIDE = 2 * HALF, WL0 = 1.3, GN = 128, GDX = SIDE / GN, GRAV = 9.8;

function terrainH(x,z) {
 const r=Math.hypot((x+.25)/1.08,(z+.39)/.84);
 let h=.42+.018*Math.sin(x*2.4+z)*Math.cos(z*2.1);
 h=lerp(h,1.495,1-smooth(.58,1.02,r));
 h+=.026*Math.sin(x*7)*Math.cos(z*6)*(1-smooth(.55,.85,r));
 return h;
}
function terrainNormal(x, z, out) {
  const e = 0.01;
  const dx = (terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e);
  const dz = (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e);
  const l = Math.hypot(dx, 1, dz);
  out[0] = -dx / l; out[1] = 1 / l; out[2] = -dz / l;
  return out;
}
// the terrain sampled on the water grid (cell centres) — reused by the sim and uploaded once to the GPU
function terrainGrid() {
  const T = new Float32Array(GN * GN);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) T[j * GN + i] = terrainH(-HALF + (i + 0.5) * GDX, -HALF + (j + 0.5) * GDX);
  return T;
}

// ───────────────────────────── the sea: linear shallow-water waves in a block of jelly ─────────────────────────────
// Heights live at cell centres, velocities on cell faces (staggered grid). Wave speed is sqrt(g·depth), so waves
// slow down and steepen over the sandbar and around the island. A small surface-tension term makes short ripples
// springy — the jelly part. Tilting the block feeds the in-plane component of gravity in as a body force, so the
// water sloshes towards the low side and settles level again.
class Water {
  constructor() {
    const N = GN;
    this.N = N;
    this.T = terrainGrid();
    this.h = new Float32Array(N * N);
    this.lap = new Float32Array(N * N);
    this.u = new Float32Array((N + 1) * N);      // x-faces: index j*(N+1)+i, face between cell i-1 and i
    this.w = new Float32Array(N * (N + 1));      // z-faces: index j*N+i, face between row j-1 and j
    this.D = new Float32Array(N * N);
    this.fx = new Float32Array((N + 1) * N);     // depth at x-faces (0 = closed)
    this.fz = new Float32Array(N * (N + 1));
    this.tex = new Float32Array(N * N * 4);     // h, dh/dx, dh/dz, terrain — uploaded each frame
    this.level = WL0; this.tide = 0;
    this.gEff = 2.6; this.tension = 0.00012; this.damp = 0.4; this.firm = 0.5;
    this.ax = 0; this.az = 0;                    // in-plane gravity from tilting (block frame)
    this.mean = 0;
    this.energy = 0;
    this.setLevel(WL0);
  }
  setLevel(L) {
    const N = this.N, T = this.T, D = this.D;
    this.level = L;
    for (let k = 0; k < N * N; k++) { const d = L - T[k]; D[k] = d > 0.012 ? d : 0; if (!D[k]) this.h[k] = 0; }
    for (let j = 0; j < N; j++) for (let i = 0; i <= N; i++) {
      const k = j * (N + 1) + i;
      this.fx[k] = (i === 0 || i === N) ? 0 : Math.min(D[j * N + i - 1], D[j * N + i]);
      if (!this.fx[k]) this.u[k] = 0;
    }
    for (let j = 0; j <= N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      this.fz[k] = (j === 0 || j === N) ? 0 : Math.min(D[(j - 1) * N + i], D[j * N + i]);
      if (!this.fz[k]) this.w[k] = 0;
    }
  }
  reset() { this.h.fill(0); this.u.fill(0); this.w.fill(0); this.energy = 0; this.mean = 0; }

  step(dt) {
    const N = this.N, h = this.h, u = this.u, w = this.w, D = this.D, fx = this.fx, fz = this.fz, lap = this.lap;
    const g = this.gEff * (0.75 + 0.5 * this.firm), sig = this.tension * (0.5 + this.firm), inv = 1 / GDX;
    const keep = Math.exp(-(0.18 + 1.6 * this.damp) * dt);
    const ax = this.ax * g / GRAV * 0.6, az = this.az * g / GRAV * 0.6;   // jelly water half-holds its shape
    // curvature for the surface-tension term
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (!D[k]) { lap[k] = 0; continue; }
      const c = h[k];
      const l = i > 0 && D[k - 1] ? h[k - 1] : c, r = i < N - 1 && D[k + 1] ? h[k + 1] : c;
      const b = j > 0 && D[k - N] ? h[k - N] : c, t = j < N - 1 && D[k + N] ? h[k + N] : c;
      lap[k] = (l + r + b + t - 4 * c) * inv * inv;
    }
    // momentum
    for (let j = 0; j < N; j++) for (let i = 1; i < N; i++) {
      const f = j * (N + 1) + i;
      if (!fx[f]) continue;
      const a = j * N + i - 1, b = a + 1;
      u[f] = (u[f] + dt * (-g * (h[b] - h[a]) * inv + ax + sig * (lap[b] - lap[a]) * inv)) * keep;
    }
    for (let j = 1; j < N; j++) for (let i = 0; i < N; i++) {
      const f = j * N + i;
      if (!fz[f]) continue;
      const a = (j - 1) * N + i, b = a + N;
      w[f] = (w[f] + dt * (-g * (h[b] - h[a]) * inv + az + sig * (lap[b] - lap[a]) * inv)) * keep;
    }
    // continuity (and a slow pull of the mean level back to rest, which undoes clamping and finger losses)
    const corr = this.mean * Math.min(1, dt * 1.5);
    let sum = 0, cnt = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (!D[k]) continue;
      const fl = j * (N + 1) + i;
      const div = (fx[fl + 1] * u[fl + 1] - fx[fl] * u[fl]) + (fz[k + N] * w[k + N] - fz[k] * w[k]);
      let v = h[k] - dt * div * inv - corr;
      if (v < -D[k] * 0.9) v = -D[k] * 0.9;
      else if (v > 0.45) v = 0.45;
      h[k] = v; sum += v; cnt++;
    }
    this.mean = cnt ? sum / cnt : 0;
  }

  // bilinear height offset and flow at a block-local point
  sample(x, z, out) {
    const N = this.N;
    const fx = (x + HALF) / GDX - 0.5, fz = (z + HALF) / GDX - 0.5;
    const i0 = clamp(Math.floor(fx), 0, N - 2), j0 = clamp(Math.floor(fz), 0, N - 2);
    const tx = clamp(fx - i0, 0, 1), tz = clamp(fz - j0, 0, 1), h = this.h;
    const k = j0 * N + i0;
    out.h = (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + N] * (1 - tx) + h[k + N + 1] * tx) * tz;
    out.d = (this.D[k] * (1 - tx) + this.D[k + 1] * tx) * (1 - tz) + (this.D[k + N] * (1 - tx) + this.D[k + N + 1] * tx) * tz;
    out.gx = ((h[k + 1] - h[k]) * (1 - tz) + (h[k + N + 1] - h[k + N]) * tz) / GDX;
    out.gz = ((h[k + N] - h[k]) * (1 - tx) + (h[k + N + 1] - h[k + 1]) * tx) / GDX;
    const ic = clamp(Math.round(fx), 0, N - 1), jc = clamp(Math.round(fz), 0, N - 1);
    out.u = 0.5 * (this.u[jc * (N + 1) + ic] + this.u[jc * (N + 1) + ic + 1]);
    out.w = 0.5 * (this.w[jc * N + ic] + this.w[(jc + 1) * N + ic]);
    return out;
  }
  surfaceY(x, z) {
    const N = this.N, fx = (x + HALF) / GDX - 0.5, fz = (z + HALF) / GDX - 0.5;
    const i0 = clamp(Math.floor(fx), 0, N - 2), j0 = clamp(Math.floor(fz), 0, N - 2);
    const tx = clamp(fx - i0, 0, 1), tz = clamp(fz - j0, 0, 1), h = this.h, k = j0 * N + i0;
    return this.level + (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + N] * (1 - tx) + h[k + N + 1] * tx) * tz;
  }
  // Splashes, pointer strokes and floating bodies add (vol > 0) or remove (vol < 0) a smooth volume profile.
  addVolume(x, z, vol, rad) {
    const N = this.N, h = this.h, D = this.D;
    const r = Math.max(rad, GDX * 1.5), s2 = r * r * 0.5;
    const i0 = Math.max(0, Math.floor((x - 2 * r + HALF) / GDX)), i1 = Math.min(N - 1, Math.ceil((x + 2 * r + HALF) / GDX));
    const j0 = Math.max(0, Math.floor((z - 2 * r + HALF) / GDX)), j1 = Math.min(N - 1, Math.ceil((z + 2 * r + HALF) / GDX));
    let wsum = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!D[j * N + i]) continue;
      const dx = -HALF + (i + 0.5) * GDX - x, dz = -HALF + (j + 0.5) * GDX - z;
      wsum += Math.exp(-(dx * dx + dz * dz) / s2);
    }
    if (wsum < 1e-6) return;
    const amp = vol / (wsum * GDX * GDX);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * N + i;
      if (!D[k]) continue;
      const dx = -HALF + (i + 0.5) * GDX - x, dz = -HALF + (j + 0.5) * GDX - z;
      h[k] = clamp(h[k] + amp * Math.exp(-(dx * dx + dz * dz) / s2), -D[k] * 0.9, 0.45);
    }
  }
  // a finger drawn through the water: a moving dent whose wake does the rest
  stir(x, z, speed) {
    const s = clamp(speed, 0, 3);
    this.addVolume(x, z, -0.0016 * (0.35 + s), 0.085);
  }
  pack() {
    const N = this.N, h = this.h, D = this.D, t = this.tex, T = this.T, inv = 0.5 / GDX;
    let e = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, c = h[k];
      const l = i > 0 && D[k - 1] ? h[k - 1] : c, r = i < N - 1 && D[k + 1] ? h[k + 1] : c;
      const b = j > 0 && D[k - N] ? h[k - N] : c, f = j < N - 1 && D[k + N] ? h[k + N] : c;
      const o = 4 * k;
      t[o] = c; t[o + 1] = (r - l) * inv; t[o + 2] = (f - b) * inv; t[o + 3] = T[k];
      e += c * c;
    }
    this.energy = e;
  }
  bad() { for (let k = 0; k < this.h.length; k += 7) if (!Number.isFinite(this.h[k])) return true; return false; }
}

// ───────────────────────────── the block: tilting on the table, quivering like jelly ─────────────────────────────
const TILT_MAX = 0.24, BLOCK_H = 2.0;
class Block {
  constructor() {
    this.firm = 0.5; this.damp = 0.3;
    this.reset();
  }
  reset() {
    this.t = [0, 0]; this.tv = [0, 0];          // tilt about world x and z axes, and its rate
    this.hold = null;                            // target tilt while the hand holds it
    this.s = [0, 0]; this.sv = [0, 0];          // shear wobble of the jelly (top relative to base), block frame
    this.q = 0; this.qv = 0;                     // vertical squash wobble
    this.prevTv = [0, 0];
    this.gel=[0,0,0];this.gelV=[0,0,0];this.gelHold=null;this.gelAnchor=[0,.3,HALF];
    this.update();
  }
  // Collisions and splashes push the base from within; dir is block-local and strength approximates a velocity change.
  kick(dx, dz, squash) {
    this.sv[0] += dx * 0.25; this.sv[1] += dz * 0.25;
    this.qv += squash * 0.3;
  }
  step(h) {
    const t = this.t, tv = this.tv;
    const omega=TAU*(1.65+1.8*this.firm),damping=2*(.20+.43*this.damp)*omega;
    for(let a=0;a<3;a++){
      const target=this.gelHold?this.gelHold[a]:0;
      this.gelV[a]+=((target-this.gel[a])*omega*omega-damping*this.gelV[a])*h;
      this.gelV[a]=clamp(this.gelV[a],-3,3);
      const limit=a===1?.15:.34;
      const next=this.gel[a]+this.gelV[a]*h;
      this.gel[a]=clamp(next,-limit,limit);
      if(next!==this.gel[a])this.gelV[a]*=-.12;
    }
    for (let a = 0; a < 2; a++) {
      let acc;
      if (this.hold) acc = 160 * (this.hold[a] - t[a]) - 18 * tv[a];
      else acc = -70 * t[a] - 7.5 * tv[a];
      tv[a] += acc * h;
      const before = t[a];
      t[a] += tv[a] * h;
      if (Math.abs(t[a]) > TILT_MAX) { t[a] = Math.sign(t[a]) * TILT_MAX; tv[a] *= -0.2; }
      // settling back onto its base is a soft thunk that sets the jelly quivering
      if (!this.hold && before * t[a] < 0 && Math.abs(tv[a]) > 0.3) this.qv -= Math.abs(tv[a]) * 0.5;
    }
    // inertia: when the tilt rate changes, the top of the jelly lags behind (block frame: tilt about x moves the top along z)
    const ax = (tv[0] - this.prevTv[0]) / h, az = (tv[1] - this.prevTv[1]) / h;
    this.prevTv[0] = tv[0]; this.prevTv[1] = tv[1];
    const om = TAU * (2.0 + 2.2 * this.firm), K = om * om, C = 2 * (0.1 + 0.32 * this.damp) * om;
    const drive = [-az * 0.9, -ax * 0.9];               // shear x lags a tip towards +x, shear z lags a tip towards +z
    for (let a = 0; a < 2; a++) {
      this.sv[a] += (-K * this.s[a] - C * this.sv[a] + drive[a]) * h;
      this.s[a] = clamp(this.s[a] + this.sv[a] * h, -0.12, 0.12);
    }
    const oq = TAU * (2.6 + 2.4 * this.firm);
    this.qv += (-oq * oq * this.q - 2 * (0.12 + 0.3 * this.damp) * oq * this.qv) * h;
    this.q = clamp(this.q + this.qv * h, -0.08, 0.08);
    this.update();
  }
  // local → world: rotate by the tilt, then lift so the lowest base corner rests on the table
  update() {
    const R = qt.mul(qt.axis([1, 0, 0], this.t[0]), qt.axis([0, 0, 1], -this.t[1]));
    this.R = R;
    let lo = 0;
    for (const cx of [-HALF, HALF]) for (const cz of [-HALF, HALF]) lo = Math.min(lo, qt.rot(R, [cx, 0, cz])[1]);
    this.lift = -lo;
    const ex = qt.rot(R, [1, 0, 0]), ey = qt.rot(R, [0, 1, 0]), ez = qt.rot(R, [0, 0, 1]);
    const M = new Float32Array(16);
    M[0] = ex[0]; M[1] = ex[1]; M[2] = ex[2];
    M[4] = ey[0]; M[5] = ey[1]; M[6] = ey[2];
    M[8] = ez[0]; M[9] = ez[1]; M[10] = ez[2];
    M[13] = this.lift; M[15] = 1;
    this.M = M; this.Minv = M4.invert(M);
    const g = qt.rot(qt.conj(R), [0, -GRAV, 0]);
    this.g = g;                                  // gravity in the block frame
  }
  toWorld(p) { return v3.add(qt.rot(this.R, p), [0, this.lift, 0]); }
  toLocal(p) { return qt.rot(qt.conj(this.R), [p[0], p[1] - this.lift, p[2]]); }
  dirToLocal(d) { return qt.rot(qt.conj(this.R), d); }
}

// ───────────────────────────── Arctic diorama ─────────────────────────────
// Procedural Arctic inhabitants. All geometry is generated here; no external assets.
const PALM_VERT = 12;
class ArcticMesh {
  constructor() { this.v=[]; this.i=[]; this.parts=[]; }
  vertex(p,n,c,e=0) { const k=this.v.length/12; this.v.push(...p,...n,0,0,...c,e); return k; }
  tri(a,b,c,col,e=0) {
    const n=v3.norm(v3.cross(v3.sub(b,a),v3.sub(c,a)));
    const k=this.vertex(a,n,col,e); this.vertex(b,n,col,e);this.vertex(c,n,col,e);this.i.push(k,k+1,k+2);
  }
  quad(a,b,c,d,col,e=0) { this.tri(a,b,c,col,e);this.tri(a,c,d,col,e); }
  ell(p,s,c,az=0,n=24,m=14,e=0) {
    const start=this.v.length/12,cs=Math.cos(az),sn=Math.sin(az);
    for(let j=0;j<=m;j++) for(let k=0;k<=n;k++) {
      const ph=Math.PI*j/m,th=TAU*k/n;
      const a=[Math.sin(ph)*Math.cos(th),Math.cos(ph),Math.sin(ph)*Math.sin(th)];
      const x=a[0]*s[0],y=a[1]*s[1],z=a[2]*s[2];
      const nr=v3.norm([a[0]/s[0],a[1]/s[1],a[2]/s[2]]);
      this.vertex([p[0]+cs*x+sn*z,p[1]+y,p[2]-sn*x+cs*z],[cs*nr[0]+sn*nr[2],nr[1],-sn*nr[0]+cs*nr[2]],c,e);
    }
    for(let j=0;j<m;j++)for(let k=0;k<n;k++){const a=start+j*(n+1)+k,b=a+n+1;this.i.push(a,a+1,b,a+1,b+1,b);}
  }
  box(p,s,c,az=0,e=0) {
    const cs=Math.cos(az),sn=Math.sin(az),vs=[];
    for(let j=0;j<8;j++){const x=(j&1?1:-1)*s[0]/2,y=(j&2?1:-1)*s[1]/2,z=(j&4?1:-1)*s[2]/2;vs.push([p[0]+cs*x+sn*z,p[1]+y,p[2]-sn*x+cs*z]);}
    for(const [a,b,cc,d] of [[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])this.quad(vs[a],vs[b],vs[cc],vs[d],c,e);
  }
  tube(a,b,r,c,n=10,e=0) {
    const d=v3.norm(v3.sub(b,a)),u=v3.norm(v3.cross(d,Math.abs(d[1])>.9?[1,0,0]:[0,1,0])),v=v3.cross(d,u);
    for(let k=0;k<n;k++){
      const get=(p,t)=>v3.add(p,v3.add(v3.scale(u,Math.cos(t)*r),v3.scale(v,Math.sin(t)*r)));
      const t=k/n*TAU,tt=(k+1)/n*TAU;
      this.quad(get(a,t),get(b,t),get(b,tt),get(a,tt),c,e);
      this.tri(b,get(b,t),get(b,tt),c,e);this.tri(a,get(a,tt),get(a,t),c,e);
    }
  }
  part(kind,opts,fn) { const start=this.v.length/12;fn();this.parts.push({kind,...opts,start,end:this.v.length/12}); }
  floe(rx,rz,seed) {
    const random=makeRng(seed),n=10,edge=[];
    for(let i=0;i<n;i++){const a=TAU*i/n,r=.85+random()*.15;edge.push([Math.cos(a)*rx*r,.035+random()*.014,Math.sin(a)*rz*r]);}
    for(let i=0;i<n;i++) {
      const a=edge[i],b=edge[(i+1)%n],aa=[a[0]*.87,-.045,a[2]*.87],bb=[b[0]*.87,-.045,b[2]*.87];
      this.tri([0,.06,0],b,a,[.87,.96,1]); this.quad(a,b,bb,aa,[.43,.76,.86]);this.tri([0,-.055,0],aa,bb,[.36,.67,.78]);
    }
  }
  whale() {
    const dark=[.075,.19,.25],pale=[.62,.78,.80];
    const blend=(a,b,t)=>a.map((v,k)=>lerp(v,b[k],t));
    // One continuous smooth hull from peduncle to the broad rounded rostrum.
    const profile=[[-.69,.015,.02],[-.55,.045,.055],[-.37,.075,.095],[-.15,.145,.18],[.10,.18,.215],[.34,.155,.185],[.51,.09,.13],[.575,.003,.003]];
    const shape=x=>{
      let i=0;while(i<profile.length-2&&x>profile[i+1][0])i++;
      const a=profile[i],b=profile[i+1],t=smooth(0,1,(x-a[0])/(b[0]-a[0]));
      return [lerp(a[1],b[1],t),lerp(a[2],b[2],t)];
    };
    const surface=(x,t)=>{const [ry,rz]=shape(x);return [x,Math.cos(t)*ry+.018*Math.sin((x+.69)*2.4),Math.sin(t)*rz];};
    const start=this.v.length/12,n=112,m=64;
    for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){
      const x=lerp(-.689,.574,i/n),t=TAU*j/m,p=surface(x,t);
      const tx=v3.sub(surface(Math.min(.574,x+.001),t),surface(Math.max(-.689,x-.001),t));
      const tt=v3.sub(surface(x,t+.001),surface(x,t-.001));
      const norm=v3.norm(v3.cross(tt,tx));
      const underside=smooth(.1,.64,-Math.cos(t))*(.70+.30*smooth(-.5,-.05,x));
      const fleck=.97+.035*Math.sin(x*83+Math.sin(t*17)*3)*Math.sin(t*37);
      this.vertex(p,norm,blend(dark,pale,underside).map(v=>v*fleck));
    }
    for(let i=0;i<n;i++)for(let j=0;j<m;j++){const a=start+i*(m+1)+j,b=a+m+1;this.i.push(a,a+1,b,a+1,b+1,b);}
    // Swept tapered fins, with closed elliptical sections and smooth normals.
    const fin=(center,width,thick,col,n=32)=>{
      const base=this.v.length/12,sides=18;
      for(let i=0;i<=n;i++){
        const t=i/n,p=center(t),tangent=v3.norm(v3.sub(center(Math.min(1,t+.003)),center(Math.max(0,t-.003))));
        const u=v3.norm(v3.cross([0,1,0],tangent)),v=v3.norm(v3.cross(tangent,u));
        const w=Math.max(.001,width(t)),h=Math.max(.001,thick(t));
        for(let j=0;j<=sides;j++){
          const a=TAU*j/sides,c=Math.cos(a),s=Math.sin(a);
          const point=v3.add(p,v3.add(v3.scale(u,c*w),v3.scale(v,s*h)));
          const normal=v3.norm(v3.add(v3.scale(u,c/w),v3.scale(v,s/h)));
          this.vertex(point,normal,blend(col,pale,Math.max(0,-normal[1])*.6));
        }
      }
      for(let i=0;i<n;i++)for(let j=0;j<sides;j++){const a=base+i*(sides+1)+j,b=a+sides+1;this.i.push(a,a+1,b,a+1,b+1,b);}
    };
    for(const side of [-1,1]){
      fin(t=>[.02-.28*t-.035*Math.sin(t*Math.PI),-.06-.10*Math.sin(t*Math.PI*.8),side*(.16+.40*t)],t=>.018+.047*Math.sin(Math.PI*t),t=>.012*(1-t)+.001,dark);
      fin(t=>[-.64-.085*Math.sin(t*Math.PI)+.025*t,.005+.04*t,side*(.012+.35*t)],t=>.025+.11*Math.sin(Math.PI*t),t=>.014*Math.sin(Math.PI*t)+.002,dark);
      // Glossy eyes, pale scars and small rostral tubercles.
      this.ell([.345,.031,side*.180],[.014,.016,.009],[.008,.013,.018],0,20,14);
      this.ell([.349,.037,side*.187],[.004,.004,.002],[.87,.96,1],0,12,8);
      for(let j=0;j<6;j++){
        const x=.27+j*.037,[ry,rz]=shape(x);
        this.ell([x,ry*.49+.018,side*rz*.84],[.010,.009,.009],blend(dark,pale,.30),0,10,8);
      }
      // Closed mouth contour, following the hull instead of a separate jaw blob.
      for(let j=0;j<25;j++){
        const x=.12+j*.016,x2=x+.016,[,rz]=shape(x),[,rz2]=shape(x2);
        this.tube([x,-.032,side*rz*.977],[x2,-.032,side*rz2*.977],.0019,[.035,.10,.135],6);
      }
    }
    // Dorsal fin, and ventral throat grooves conforming to the same body.
    fin(t=>[-.22-.10*t,.15+.15*t,0],t=>.055*(1-t)+.001,t=>.018*(1-t)+.001,dark,24);
    for(let j=0;j<9;j++){
      const angle=Math.PI+(j-4)*.10;
      for(let k=0;k<20;k++){
        const x=-.12+k*.026,a=surface(x,angle),b=surface(x+.026,angle);
        a[1]-=.001;b[1]-=.001;this.tube(a,b,.0014,[.32,.52,.58],5);
      }
    }
  }
  seal(p=[0,0,0],size=1) {
    const ell=(q,s,c,az=0,n=18,m=10)=>this.ell(v3.add(p,v3.scale(q,size)),v3.scale(s,size),c,az,n,m);
    const grey=[.54,.62,.66],cream=[.80,.84,.83],black=[.016,.028,.037];
    ell([0,.105,0],[.18,.11,.095],grey);ell([.105,.15,0],[.088,.085,.084],cream);
    ell([.166,.143,0],[.037,.029,.052],cream);ell([.192,.156,0],[.016,.011,.019],black);
    for(const sign of [-1,1]){
      ell([.145,.179,sign*.064],[.012,.013,.008],black);ell([.148,.184,sign*.070],[.004,.004,.003],[1,1,1],0,10,6);
      const front=this.v.length;
      ell([-.035,.041,sign*.092],[.09,.025,.04],grey,sign*.5);
      for(let k=front;k<this.v.length;k+=12)this.v[k+6]=sign;
      const rear=this.v.length;
      ell([-.19,.059,sign*.043],[.07,.025,.046],grey,sign*.45);
      for(let k=rear;k<this.v.length;k+=12)this.v[k+6]=sign*2;
      for(let j=0;j<3;j++)this.tube(v3.add(p,v3.scale([.18,.14-j*.006,sign*.035],size)),v3.add(p,v3.scale([.20+j*.004,.14-j*.014,sign*(.085+j*.008)],size)),.0013*size,[.30,.39,.43],4);
    }
    for(let j=0;j<9;j++){const a=j*.86;ell([-.08+Math.cos(a)*.07,.18+Math.sin(a)*.012,Math.sin(a)*.05],[.015,.004,.009],[.41,.5,.55],a,10,6);}
  }
}
class Palms {
  constructor() {
    this.list=[];this.time=0;this.breeze=0;this.weather='lagoon';this.storm=false;
    this.whaleCall=0;this.whaleLift=0;this.boat={x:.87,z:.55,angle:-.55,held:false};
    const m=new ArcticMesh(),snow=[.87,.94,.97],ice=[.54,.77,.86],wood=[.30,.19,.115];
    // Separate planks, window frames and snow preserve the cabin structure in close orbit views.
    const cx=-.27,cz=-.44,base=1.515,front=cz+.305,back=cz-.305;
    const timber=[.34,.105,.065],trim=[.66,.71,.69],slate=[.09,.15,.18];
    m.box([cx,base-.025,cz],[.68,.085,.66],[.29,.34,.36]);
    m.box([cx,base+.185,cz],[.62,.37,.59],timber);
    for(let k=0;k<14;k++){
      const x=cx-.299+k*.046,tint=.87+(k%4)*.045;
      m.box([x,base+.19,front],[.043,.375,.015],timber.map(v=>v*tint));
      m.box([x,base+.19,back],[.043,.375,.015],timber.map(v=>v*tint));
    }
    for(let k=0;k<13;k++){
      const z=back+.012+k*.048,tint=.9+(k%3)*.045;
      for(const side of [-1,1])m.box([cx+side*.314,base+.19,z],[.013,.375,.043],timber.map(v=>v*tint));
    }
    m.tri([cx-.316,base+.37,front],[cx+.316,base+.37,front],[cx,base+.63,front],timber);
    m.tri([cx+.316,base+.37,back],[cx-.316,base+.37,back],[cx,base+.63,back],timber);

    // Dark eaves support a thick snow layer with softened roof ridges and edges.
    for(const side of [-1,1]){
      const eave=cx+side*.38;
      const roof=[[cx,base+.65,front+.075],[eave,base+.345,front+.075],[eave,base+.345,back-.075],[cx,base+.65,back-.075]];
      if(side<0)roof.reverse();
      m.quad(...roof,slate);
      m.quad(...roof.map(([x,y,z])=>[x,y+.027,z]),snow);
      m.tube([eave,base+.365,back-.075],[eave,base+.365,front+.075],.018,snow,12);
      m.tube([cx,base+.642,front+.08],[eave,base+.337,front+.08],.016,trim,8);
      for(let k=0;k<6;k++){
        const z=back+.025+k*.10,len=.028+(k%3)*.012;
        m.ell([eave,base+.337-len/2,z],[.005,len/2,.007],ice,0,8,6);
      }
    }
    m.tube([cx,base+.68,back-.08],[cx,base+.68,front+.08],.022,snow,12);
    m.box([cx-.19,base+.65,cz-.14],[.075,.27,.08],[.18,.22,.23]);
    m.box([cx-.19,base+.79,cz-.14],[.106,.025,.11],slate);
    m.box([cx-.19,base+.807,cz-.14],[.09,.009,.10],snow);

    // Windows, handles and sills use separate geometry; restrained emission preserves day and night shading.
    m.box([cx+.14,base+.143,front+.014],[.15,.286,.019],[.12,.17,.18]);
    m.box([cx+.14,base+.202,front+.027],[.092,.098,.008],[1,.49,.12],0,.52);
    m.ell([cx+.19,base+.115,front+.031],[.008,.008,.005],[.68,.54,.29],0,10,8);
    const wx=cx-.14,wy=base+.23,wz=front+.025;
    m.box([wx,wy,wz],[.17,.15,.011],[1,.58,.21],0,.58);
    for(const dx of [-.092,0,.092])m.box([wx+dx,wy,wz+.01],[.012,.172,.019],trim);
    for(const dy of [-.081,.081])m.box([wx,wy+dy,wz+.01],[.19,.012,.019],trim);
    m.box([wx,wy-.092,wz+.022],[.216,.015,.06],snow);
    m.box([cx+.326,base+.24,cz-.045],[.011,.135,.15],[1,.53,.16],0,.5);
    for(const dz of [-.084,0,.084])m.box([cx+.34,base+.24,cz-.045+dz],[.018,.158,.009],trim);
    for(const dy of [-.077,.077])m.box([cx+.34,base+.24+dy,cz-.045],[.018,.012,.18],trim);
    m.box([cx+.35,base+.15,cz-.045],[.06,.02,.205],snow);

    // Steps, footprints and snowbanks ground the cabin in the surrounding terrain.
    for(let k=0;k<3;k++)m.box([cx+.14,base-.02-k*.035,front+.08+k*.072],[.22,.04,.08],[.43,.34,.24]);
    for(const [x,z,rx,rz] of [[cx-.27,front,.17,.09],[cx+.28,back,.16,.12],[cx-.32,cz-.12,.07,.18]])
      m.ell([x,terrainH(x,z)+.014,z],[rx,.034,rz],snow,0,20,10);
    for(let k=0;k<7;k++){
      const x=cx+.2+k*.066,z=.105+Math.sin(k*.7)*.03;
      m.ell([x,terrainH(x,z)+.003,z],[.013,.002,.026],[.65,.76,.8],-.65,10,5);
    }
    // Pier with planks, frost, posts and a little lantern.
    for(let k=0;k<9;k++){
      const z=-.10+k*.062;
      m.box([.40,1.38,z],[.30,.042,.055],k%3?[.40,.28,.18]:[.34,.22,.14]);
      if(k<3)m.box([.40,1.405,z],[.28,.009,.044],snow);
    }
    for(const x of [.26,.54])for(const z of [-.1,.36]){
      m.tube([x,.72,z],[x,1.5,z],.017,wood);m.ell([x,1.5,z],[.027,.008,.027],snow,0,10,6);
    }
    m.box([.54,1.56,.36],[.066,.10,.066],[.14,.21,.25]);
    m.box([.54,1.56,.397],[.043,.06,.008],[1,.44,.07],0,1);
    m.box([.54,1.619,.36],[.082,.019,.082],snow);
    // Snow ridges at the rear and small sculpted blue icicles.
    for(const [x,z,s] of [[-.66,-.66,.11],[-.53,-.82,.08],[.06,-.74,.09],[.17,-.44,.045]])
      m.ell([x,terrainH(x,z)+.006,z],[s,s*.42,s*.7],snow,-.3,20,10);
    for(let k=0;k<9;k++){
      const x=-.62+k*.092,z=.09+Math.sin(k)*.018,y=terrainH(x,z);
      m.ell([x,y-.06,z],[.018,.10,.023],[.53,.79,.89],0,12,10);
    }
    // A flag flutters independently of the island.
    const fx=-.72,fz=-.32,fy=terrainH(fx,fz);
    m.tube([fx,fy,fz],[fx,fy+.53,fz],.008,[.30,.42,.48]);
    m.part('flag',{p:[fx,fy+.44,fz]},()=>{
      for(let i=0;i<14;i++){
        const a=i/14*.19,b=(i+1)/14*.19;
        m.quad([a,-.07,0],[b,-.07,0],[b,.06,0],[a,.06,0],[.91,.20,.095]);
      }
    });
    // Seals: one on snow, one sharing a floating ice raft.
    m.part('seal',{p:[.10,terrainH(.10,-.015)+.006,-.015],a:-.4},()=>m.seal([0,0,0],.82));
    m.part('raft',{p:[-1.03,1.31,.39],a:.3,seed:7},()=>m.floe(.29,.22,7));
    m.part('raftSeal',{p:[-1.03,1.375,.39],a:.3},()=>m.seal([0,0,0],.75));
    for(const [x,z,rx,rz,seed] of [[-1.7,-.85,.25,.18,3],[1.47,-.81,.29,.22,6],[1.24,1.62,.22,.14,13],[-1.34,1.44,.17,.12,17],[1.90,.28,.18,.16,25],[-.08,-1.64,.24,.15,32],[-1.78,.7,.17,.12,42],[.4,1.91,.12,.08,51]]){
      m.part('floe',{p:[x,1.30,z],a:seed*.3,seed},()=>m.floe(rx,rz,seed));
    }
    // Wooden orange expedition skiff. Separate object so it can be pulled by the user.
    m.part('boat',{p:[this.boat.x,1.30,this.boat.z]},()=>{
      m.ell([0,.02,0],[.105,.062,.235],[.63,.16,.055],0,28,14);
      m.ell([0,.055,0],[.082,.032,.2],[.25,.14,.075],0,28,12);
      for(const z of [-.08,.065])m.box([0,.075,z],[.178,.018,.037],[.64,.44,.25]);
      m.ell([0,.08,-.13],[.05,.027,.04],[.82,.69,.46],0,16,8);
      for(const side of [-1,1]){
        m.tube([side*.04,.08,.04],[side*.25,.018,-.12],.006,[.64,.44,.25]);
        m.ell([side*.247,.018,-.12],[.033,.007,.062],[.71,.47,.24],side*.6,14,8);
      }
      m.tube([0,.065,-.15],[0,.065,-.23],.005,[.93,.81,.61]);
    });
    // Humpback whale, animated tail and paired flippers. Pale ventral pleats catch the caustics.
    m.part('whale',{p:[0,.81,1.32]},()=>m.whale());
    // Tiny suspended snowflakes. Their paths stay in the miniature, not across the interface.
    const r=makeRng(180);
    for(let k=0;k<96;k++)m.part('snow',{p:[(r()*2-1)*1.65,1.6+r()*1.3,(r()*2-1)*1.65],seed:r()*9},()=>m.ell([0,0,0],[.006,.006,.006],[.93,.98,1],0,5,3));
    for(let slot=0;slot<2;slot++)for(let k=0;k<14;k++)
      m.part('spray',{p:[0,0,0],slot,seed:k},()=>m.ell([0,0,0],[.009,.014,.009],[.66,.87,.96],0,6,4));
    this.vertices=new Float32Array(m.v);this.rest=this.vertices.slice();this.indices=new Uint32Array(m.i);this.parts=m.parts;
    this.reset();
  }
  reset() {
    this.whaleCall=0;this.whaleLift=0;
    Object.assign(this.boat,{x:.87,z:.55,y:WL0,angle:-.55,held:false,vx:0,vz:0,roll:0,rollV:0,pitch:0,pitchV:0,risk:0,capsized:false,flipSign:1,splashed:false});
    this.raft={x:-1.03,z:.39,y:WL0,rx:0,rz:0};
    this.seal={mode:'raft',x:-1.03,z:.39,y:WL0+.065,vx:0,vz:0,vy:0,angle:.3,roll:0,risk:0,age:0,stroke:0,dir:[-1,0]};
    this.splashes=[{age:10,p:[0,0,0]},{age:10,p:[0,0,0]}];
  }
  step() {}
  coconutSpots(){return [];}
  whalePose(time) {
    const t=time*.16,dx=.68*.16*Math.cos(t),dz=-.17*.16*Math.sin(t);
    return {x:Math.sin(t)*.68,z:1.32+Math.cos(t)*.17,
      y:.81+Math.sin(time*.7)*.035+this.whaleLift*.25,
      angle:Math.atan2(-dz,dx),dx,dz};
  }
  seaReading(W,x,z) {
    const s=W.sample(x,z,{}),r=.15;
    // Average across the hull, so a single noisy grid slope cannot overturn it.
    const gx=(W.surfaceY(x+r,z)-W.surfaceY(x-r,z))/(2*r);
    const gz=(W.surfaceY(x,z+r)-W.surfaceY(x,z-r))/(2*r);
    const danger=Math.abs(s.h)*.80+Math.max(0,Math.hypot(gx,gz)-.22)*.13;
    return {h:s.h,u:s.u,w:s.w,gx,gz,danger};
  }
  splash(W,slot,x,z,strength) {
    this.splashes[slot]={age:0,p:[x,W.surfaceY(x,z),z]};
    W.addVolume(x,z,-strength,.10);W.addVolume(x,z,strength,.22);
  }
  stepReactions(W,dt,time) {
    const raft=this.raft,seal=this.seal,b=this.boat;
    raft.x=-1.03+Math.sin(time*.18+7)*.025;raft.z=.39+Math.cos(time*.20+7)*.022;
    const rw=this.seaReading(W,raft.x,raft.z);
    raft.y=W.level+rw.h;raft.rx=clamp(Math.atan(rw.gz)*.7,-.5,.5);raft.rz=clamp(-Math.atan(rw.gx)*.7,-.5,.5);
    if(dt<=0)return;
    const n=Math.max(1,Math.ceil(dt*120)),h=dt/n;
    for(let i=0;i<n;i++){
      for(const splash of this.splashes)splash.age+=h;
      const bw=this.seaReading(W,b.x,b.z),ca=Math.cos(b.angle),sa=Math.sin(b.angle);
      const roll=-Math.atan(bw.gx*ca-bw.gz*sa)*.75;
      const pitch=Math.atan(bw.gx*sa+bw.gz*ca)*.60;
      b.risk=clamp(b.risk+h*(b.held?-.8:bw.danger>.10?(bw.danger-.10)*12:-.75),0,.4);
      if(!b.capsized&&!b.held&&b.risk>.14){b.capsized=true;b.flipSign=Math.sign(roll||bw.u||1);}
      const target=b.capsized?b.flipSign*Math.PI+roll*.16:roll;
      b.rollV=clamp(b.rollV+((target-b.roll)*24-b.rollV*7.2)*h,-5.5,5.5);b.roll+=b.rollV*h;
      b.pitchV+=(pitch-b.pitch)*28*h-b.pitchV*8*h;b.pitch+=b.pitchV*h;
      if(b.capsized&&!b.splashed&&Math.abs(b.roll)>Math.PI*.48){
        b.splashed=true;this.splash(W,1,b.x,b.z,.0008);
      }
      if(!b.held){
        b.vx=clamp(b.vx+(clamp(bw.u,-1,1)*.18-bw.gx*.025-b.vx*1.5)*h,-.22,.22);
        b.vz=clamp(b.vz+(clamp(bw.w,-1,1)*.18-bw.gz*.025-b.vz*1.5)*h,-.22,.22);
        const x=clamp(b.x+b.vx*h,-HALF+.30,HALF-.30),z=clamp(b.z+b.vz*h,-HALF+.30,HALF-.30);
        if(terrainH(x,z)<W.level-.12){b.x=x;b.z=z;}else{b.vx*=.4;b.vz*=.4;}
      }else{b.vx=0;b.vz=0;}
      b.y=W.surfaceY(b.x,b.z)+(b.capsized?.023:0);
      if(seal.mode==='raft'){
        seal.x=raft.x;seal.z=raft.z;seal.y=raft.y+.065;seal.angle=.3;
        seal.risk=clamp(seal.risk+h*(rw.danger>.09?(rw.danger-.09)*12:-.8),0,.4);
        if(seal.risk>.12){
          let dx=-rw.gx,dz=-rw.gz,len=Math.hypot(dx,dz);
          if(len<.1){dx=-.8;dz=.6;len=1;}
          dx/=len;dz/=len;
          const ox=raft.x+.25,oz=raft.z+.39,ol=Math.hypot(ox,oz);
          if(dx*ox/ol+dz*oz/ol<.3){dx=ox/ol;dz=oz/ol;}
          if(terrainH(raft.x+dx*.45,raft.z+dz*.45)>W.level-.15){dx=-.8;dz=.6;}
          seal.dir=[dx,dz];seal.mode='slip';seal.age=0;seal.start=[seal.x,seal.y,seal.z];
          seal.angle=Math.atan2(-dz,dx);seal.rollSign=dx<0?1:-1;
        }
      }else if(seal.mode==='slip'){
        seal.age+=h;const t=clamp(seal.age/.38,0,1),travel=.34*smooth(0,1,t);
        seal.x=seal.start[0]+seal.dir[0]*travel;seal.z=seal.start[2]+seal.dir[1]*travel;
        seal.y=lerp(seal.start[1],W.surfaceY(seal.x,seal.z)+.015,t);
        seal.roll=seal.rollSign*t*.85;
        if(t===1){seal.mode='fall';seal.age=0;seal.vx=seal.dir[0]*.52;seal.vz=seal.dir[1]*.52;seal.vy=-.25;}
      }else if(seal.mode==='fall'){
        seal.age+=h;seal.x+=seal.vx*h;seal.z+=seal.vz*h;seal.vy-=2.8*h;seal.y+=seal.vy*h;
        seal.roll+=seal.rollSign*2*h;
        if(seal.y<W.surfaceY(seal.x,seal.z)-.07||seal.age>.8){
          seal.mode='swim';seal.age=0;seal.vy=0;this.splash(W,0,seal.x,seal.z,.0012);
        }
      }else{
        seal.age+=h;const sw=this.seaReading(W,seal.x,seal.z);
        const y=W.level+sw.h-.075;
        seal.vy=clamp(seal.vy+((y-seal.y)*40-seal.vy*9)*h,-1.3,1.3);seal.y+=seal.vy*h;
        // Active swimming, with anticipation of the shore and glass boundaries.
        const fx=Math.cos(seal.angle),fz=-Math.sin(seal.angle);
        let sx=fx+Math.sin(seal.age*.6)*fz*.12*h,sz=fz-Math.sin(seal.age*.6)*fx*.12*h;
        const margin=HALF-.65;
        if(Math.abs(seal.x)>margin)sx-=Math.sign(seal.x)*(Math.abs(seal.x)-margin)*7;
        if(Math.abs(seal.z)>margin)sz-=Math.sign(seal.z)*(Math.abs(seal.z)-margin)*7;
        const aheadX=seal.x+fx*.45,aheadZ=seal.z+fz*.45;
        if(terrainH(aheadX,aheadZ)>W.level-.20){sx+=(seal.x+.25)*2;sz+=(seal.z+.39)*2;}
        const heading=Math.atan2(-sz,sx),turn=Math.atan2(Math.sin(heading-seal.angle),Math.cos(heading-seal.angle));
        seal.angle+=clamp(turn,-1.8*h,1.8*h);
        seal.stroke+=h*7.2;
        const speed=.14+.035*Math.sin(seal.stroke)*Math.sin(seal.stroke);
        seal.vx+=(Math.cos(seal.angle)*speed+clamp(sw.u,-1,1)*.018-seal.vx)*h*4;
        seal.vz+=(-Math.sin(seal.angle)*speed+clamp(sw.w,-1,1)*.018-seal.vz)*h*4;
        const x=clamp(seal.x+seal.vx*h,-HALF+.2,HALF-.2),z=clamp(seal.z+seal.vz*h,-HALF+.2,HALF-.2);
        if(terrainH(x,z)<W.level-.14){seal.x=x;seal.z=z;}else{seal.vx*=.3;seal.vz*=.3;seal.angle+=h*1.8;}
        seal.roll*=Math.exp(-4*h);
      }
    }
  }
  update(world,time,dt) {
    const W=world.water,ws={};this.whaleCall=Math.max(0,this.whaleCall-dt);
    this.stepReactions(W,dt,time);
    const desired=this.whaleCall>0?1:0;this.whaleLift+=(desired-this.whaleLift)*Math.min(1,dt*1.5);
    for(const p of this.parts){
      let [x,y,z]=p.p,a=p.a||0,rx=0,rz=0,scale=1;
      if(p.kind==='whale'){
        const pose=this.whalePose(time);x=pose.x;y=pose.y;z=pose.z;a=pose.angle;
      }else if(p.kind==='boat'){
        x=this.boat.x;z=this.boat.z;y=this.boat.y;a=this.boat.angle+Math.sin(time*.45)*.04;rx=this.boat.pitch;rz=this.boat.roll;
      }else if(p.kind==='raft'){
        x=this.raft.x;z=this.raft.z;y=this.raft.y;rx=this.raft.rx;rz=this.raft.rz;
      }else if(p.kind==='raftSeal'){
        const s=this.seal;x=s.x;y=s.y;z=s.z;a=s.angle;
        rx=s.mode==='raft'?this.raft.rx:Math.sin(time*3)*.05;rz=s.mode==='raft'?this.raft.rz:s.roll;
      }else if(p.kind==='spray'){
        const s=this.splashes[p.slot],t=s.age,angle=p.seed/14*TAU;
        scale=t<.68?Math.max(.15,1-t/.68):0;
        x=s.p[0]+Math.cos(angle)*t*.50;y=s.p[1]+t*(1.5+(p.seed%3)*.16)-2.7*t*t;z=s.p[2]+Math.sin(angle)*t*.50;
        if(!scale)y=-2;
      }else if(p.kind==='floe'){
        x+=Math.sin(time*.18+p.seed)*.025;z+=Math.cos(time*.20+p.seed)*.022;
        W.sample(x,z,ws);y=W.level+ws.h;
        rx=clamp(ws.gz*.6,-.25,.25);rz=clamp(-ws.gx*.6,-.25,.25);
      }else if(p.kind==='seal'){rx=Math.sin(time*1.2)*.015;}
      else if(p.kind==='snow'){
        const storm=this.storm||this.weather==='raspberry';
        y=1.30+((p.p[1]+3-time*(storm?.68:.09)+p.seed)%1.6+1.6)%1.6;
        x=p.p[0]+Math.sin(time*.8+p.seed)*.04+(storm?Math.sin(time+p.seed)*.15:0);
      }
      const ca=Math.cos(a),sa=Math.sin(a),cx=Math.cos(rx),sx=Math.sin(rx),cz=Math.cos(rz),sz=Math.sin(rz);
      const rot=(xx,yy,zz)=>{let y1=yy*cx-zz*sx,z1=yy*sx+zz*cx,x2=xx*cz-y1*sz,y2=xx*sz+y1*cz;return [x2*ca+z1*sa,y2,-x2*sa+z1*ca];};
      for(let j=p.start;j<p.end;j++){
        const k=j*12,R=this.rest;let xx=R[k],yy=R[k+1],zz=R[k+2],nx=R[k+3],ny=R[k+4],nz=R[k+5];
        xx*=scale;yy*=scale;zz*=scale;
        if(p.kind==='seal'||p.kind==='raftSeal'){
          const swimming=p.kind==='raftSeal'&&this.seal.mode==='swim';
          const size=p.kind==='seal'?.82:.75,phase=swimming?this.seal.stroke:time*1.25;
          const joint=R[k+6],side=Math.sign(joint),rear=Math.abs(joint)>1.5;
          if(joint){
            const pivotY=(rear?.059:.041)*size,pivotZ=side*(rear?.018:.062)*size;
            const flap=side*Math.sin(phase+(rear?1.2:side*.5))*(swimming?(rear?.85:.70):.10);
            const c=Math.cos(flap),s=Math.sin(flap),dy=yy-pivotY,dz=zz-pivotZ;
            yy=pivotY+c*dy-s*dz;zz=pivotZ+s*dy+c*dz;
            const nY=ny;ny=c*ny-s*nz;nz=s*nY+c*nz;
          }
          if(swimming){
            const tail=clamp((-xx-.02*size)/(.20*size),0,1);
            zz+=Math.sin(phase+xx*7)*tail*.019;
            yy+=Math.sin(phase*.5)*.005*smooth(0,.05*size,yy);
          }else{
            yy+=Math.sin(phase)*.006*smooth(.02*size,.10*size,yy);
            if(xx>.055*size&&yy>.09*size){
              const yaw=Math.sin(time*.75+(p.kind==='seal'?1:0))*.16;
              const c=Math.cos(yaw),s=Math.sin(yaw),dx=xx-.055*size;
              xx=.055*size+c*dx+s*zz;zz=-s*dx+c*zz;
              const nX=nx;nx=c*nx+s*nz;nz=-s*nX+c*nz;
            }
          }
        }
        if(p.kind==='whale')yy+=Math.max(0,-xx-.19)*.19*Math.sin(time*2.1+xx*4);
        if(p.kind==='flag')zz+=Math.sin(time*(this.storm?9:1.1+world.wind*4)+xx*23)*xx*(this.storm?.22:.02+world.wind*.22);
        if(p.kind==='snow'&&!(this.storm||this.weather==='raspberry')){xx*=.45;yy*=.45;zz*=.45;}
        const pos=rot(xx,yy,zz),n=rot(nx,ny,nz);
        this.vertices[k]=x+pos[0];this.vertices[k+1]=y+pos[1];this.vertices[k+2]=z+pos[2];
        this.vertices[k+3]=n[0];this.vertices[k+4]=n[1];this.vertices[k+5]=n[2];
      }
    }
  }
}

// ───────────────────────────── rigid bodies and bubbles ─────────────────────────────
// Rigid spheres in the block frame: gravity follows the tilt, the jelly sea gives buoyancy and a heavy drag,
// floating things ride the surface flow, and every change of submerged volume is pushed back into the waves.
const B_OFF = 0, B_ATTACHED = 1, B_FREE = 2, B_HELD = 3;
const RHO_WATER = 1.0, BODY_CAP = 40, BUBBLE_CAP = 260, DECOR_BUBBLES = 46;
const INST_B = 16;

class Bodies {
  constructor(water, palms, block) {
    this.water = water; this.palms = palms; this.block = block;
    this.rnd = makeRng(91);
    this.list = [];
    for (let i = 0; i < BODY_CAP; i++) this.list.push({ id: i, state: B_OFF });
    this.inst = new Float32Array(BODY_CAP * INST_B);
    this.bub = new Float32Array(BUBBLE_CAP * 8);      // x y z r | vy life seed static
    this.nBub = 0;
    this.binst = new Float32Array(BUBBLE_CAP * 4);
    this.nInst = 0; this.nBinst = 0;
    this.hold = null;
    this.dV = new Float32Array(BODY_CAP);
    this.ws = { h: 0, d: 0, u: 0, w: 0, gx: 0, gz: 0 };
    this.tn = [0, 1, 0];
    this.stats = { afloat: 0, sunk: 0, ashore: 0 };
    this.reset();
  }
  reset() {
    for (const b of this.list) b.state = B_OFF;
    this.hold = null; this.nBub = 0;
    const rnd = makeRng(7);
    // Initialize rigid bodies at attachment points.
    for (const p of this.palms.list) for (const s of this.palms.coconutSpots(p)) this.spawn('coconut', s, [0, 0, 0], { palm: p, rest: s });
    // Initialize ground bodies at predefined positions.
    const spots = [];
    for (const [x, z] of spots) {
      const r = 0.04 + rnd() * 0.022;
      this.spawn('pebble', [x, terrainH(x, z) + r + 0.002, z], [0, 0, 0], { r, tone: rnd() });
    }
    // a scatter of tiny air bubbles caught in the jelly
    const W = this.water;
    for (let k = 0; k < DECOR_BUBBLES; k++) {
      for (let t = 0; t < 30; t++) {
        const x = (rnd() * 2 - 1) * (HALF - 0.05), z = (rnd() * 2 - 1) * (HALF - 0.05), T = terrainH(x, z);
        if (T > W.level - 0.08) continue;
        const y = lerp(T + 0.03, W.level - 0.04, rnd());
        this.addBubble(x, y, z, 0.004 + rnd() * rnd() * 0.012, true);
        break;
      }
    }
  }
  spawn(kind, x, v, o = {}) {
    let b = this.list.find((q) => q.state === B_OFF);
    if (!b) {
      // Reuse the oldest free body when capacity is exhausted.
      let old = null;
      for (const q of this.list) if (q.state === B_FREE && (!old || q.age < old.age)) old = q;
      if (!old) return null;
      b = old;
    }
    const rnd = this.rnd;
    const coco = kind === 'coconut';
    const r = coco ? 0.072 : (o.r || 0.04 + rnd() * 0.022);
    Object.assign(b, {
      kind, coco, r, rho: coco ? 0.62 : 2.4, x: x.slice(), v: v.slice(), q: qt.norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]),
      w: [0, 0, 0], tone: o.tone !== undefined ? o.tone : rnd(), state: o.palm ? B_ATTACHED : B_FREE, palm: o.palm || null, rest: o.rest || null,
      sub: 0, vsub: 0, sleep: false, still: 0, age: performance.now() + rnd(), squash: 0, squashV: 0, trail: 0, wet: false,
    });
    if (coco) b.q = qt.mul(qt.axis([0, 1, 0], rnd() * TAU), qt.axis([1, 0, 0], 0.3 * (rnd() - 0.5)));
    return b;
  }
  drop(kind) {
    const W = this.water, rnd = this.rnd;
    for (let t = 0; t < 40; t++) {
      const x = (rnd() * 2 - 1) * (HALF - 0.25), z = (rnd() * 2 - 1) * (HALF - 0.25);
      if (terrainH(x, z) > W.level - 0.15) continue;
      return this.spawn(kind, [x, 2.7, z], [0, -0.5, 0]);
    }
    return this.spawn(kind, [1.0, 2.7, 1.0], [0, -0.5, 0]);
  }
  addBubble(x, y, z, r, stat) {
    if (this.nBub >= BUBBLE_CAP) return;
    const o = 8 * this.nBub++, B = this.bub;
    B[o] = x; B[o + 1] = y; B[o + 2] = z; B[o + 3] = r; B[o + 4] = 0; B[o + 5] = 0; B[o + 6] = this.rnd() * 100; B[o + 7] = stat ? 1 : 0;
  }
  burst(x, y, z, n, spread) {
    for (let k = 0; k < n; k++) {
      const rnd = this.rnd;
      this.addBubble(x + (rnd() - 0.5) * spread, y - rnd() * spread * 0.6, z + (rnd() - 0.5) * spread, 0.006 + rnd() * rnd() * 0.02, false);
    }
  }
  // Transform an attached body from its rest position into the current deformed frame.
  attachedPos(b, out) { return this.palms.deform(b.palm, b.rest, 1, out); }

  step(h) {
    const W = this.water, g = this.block.g, ws = this.ws, tn = this.tn, list = this.list;
    for (const b of list) {
      if (b.state === B_ATTACHED) { this.attachedPos(b, b.x); continue; }
      if (b.state !== B_FREE && b.state !== B_HELD) continue;
      if (b.state === B_HELD) {
        const tg = this.hold.target;
        let vx = (tg[0] - b.x[0]) * 20, vy = (tg[1] - b.x[1]) * 20, vz = (tg[2] - b.x[2]) * 20;
        const s = Math.hypot(vx, vy, vz); if (s > 9) { vx *= 9 / s; vy *= 9 / s; vz *= 9 / s; }
        b.v[0] += (vx - b.v[0]) * 0.5; b.v[1] += (vy - b.v[1]) * 0.5; b.v[2] += (vz - b.v[2]) * 0.5;
        b.sleep = false;
      } else if (b.sleep) {
        // something nearby may have woken it: a wave lifting a floater, or the block tipping
        if (b.sub > 0.02 || Math.hypot(g[0], g[2]) > 0.6) { b.sleep = false; b.still = 0; } else continue;
      }
      // water: buoyancy, drag towards the local flow, and the volume we displace
      W.sample(b.x[0], b.x[2], ws);
      const surf = W.level + ws.h, r = b.r;
      const wet = ws.d > 0;
      const depthIn = wet ? surf - (b.x[1] - r) : -1;
      const sub = wet ? smooth(0, 2 * r, depthIn) : 0;
      if (b.state === B_FREE) {
        // buoyancy pushes along the jelly surface's normal, so floaters slide down its world-space slope
        const buoy = sub * RHO_WATER / b.rho, gl = Math.hypot(g[0], g[1], g[2]);
        const nl = Math.hypot(ws.gx, 1, ws.gz), bx = -ws.gx / nl, by = 1 / nl, bz = -ws.gz / nl;
        b.v[0] += (g[0] + bx * gl * buoy) * h; b.v[1] += (g[1] + by * gl * buoy) * h; b.v[2] += (g[2] + bz * gl * buoy) * h;
        if (sub > 0) {
          const k = 1 - Math.exp(-(1.8 + 5.5 * sub) * sub * h);
          b.v[0] -= (b.v[0] - ws.u * 0.5) * k; b.v[1] -= b.v[1] * k * 1.2; b.v[2] -= (b.v[2] - ws.w * 0.5) * k;
          const kw = Math.exp(-3 * sub * h); b.w[0] *= kw; b.w[1] *= kw; b.w[2] *= kw;
        } else { const d = Math.exp(-0.05 * h); b.v[0] *= d; b.v[1] *= d; b.v[2] *= d; }
      }
      // entering the water: a crater, a squash and a handful of bubbles
      if (sub > 0 && b.sub === 0 && b.v[1] < -0.6) {
        const sp = -b.v[1], vol = 4.19 * r * r * r;
        W.addVolume(b.x[0], b.x[2], -vol * Math.min(sp, 6) * 0.9, r * 2.2);
        this.burst(b.x[0], surf - r, b.x[2], b.coco ? 8 : 6 + Math.floor(sp * 2), r * 1.4);
        b.squashV -= Math.min(sp, 6) * 0.6;
        this.block.kick((this.rnd() - 0.5) * sp * 0.12, (this.rnd() - 0.5) * sp * 0.12, sp * 0.035 * (b.coco ? 1.6 : 1));
      }
      const vs = sub * 4.19 * r * r * r;
      this.dV[b.id] += vs - b.vsub;
      b.vsub = vs; b.sub = sub;
      // a sinking pebble leaves the odd bubble
      if (sub > 0.95 && b.v[1] < -0.12) { b.trail += h; if (b.trail > 0.12) { b.trail = 0; this.addBubble(b.x[0], b.x[1] + r * 0.5, b.x[2], 0.004 + this.rnd() * 0.006, false); } }

      b.x[0] += b.v[0] * h; b.x[1] += b.v[1] * h; b.x[2] += b.v[2] * h;
      // the jelly walls of the block
      const lim = HALF - r;
      for (const a of [0, 2]) {
        if (b.x[a] > lim) { b.x[a] = lim; if (b.v[a] > 0) b.v[a] *= -0.35; }
        else if (b.x[a] < -lim) { b.x[a] = -lim; if (b.v[a] < 0) b.v[a] *= -0.35; }
      }
      if (b.x[1] > 4) { b.x[1] = 4; b.v[1] = Math.min(b.v[1], 0); }
      // sand
      let grounded = false;
      const T = terrainH(b.x[0], b.x[2]);
      terrainNormal(b.x[0], b.x[2], tn);
      const dist = (b.x[1] - T) * tn[1], pen = r - dist;
      if (pen > 0) {
        const vn = b.v[0] * tn[0] + b.v[1] * tn[1] + b.v[2] * tn[2];
        if (vn < 0) {
          const e = -vn > 0.8 && sub < 0.5 ? 0.3 : 0.05;
          b.v[0] -= tn[0] * vn * (1 + e); b.v[1] -= tn[1] * vn * (1 + e); b.v[2] -= tn[2] * vn * (1 + e);
          if (-vn > 0.8) {
            b.squashV -= Math.min(-vn, 6) * 0.5;
            if (sub < 0.5) this.block.kick(0, 0, -vn * 0.2 * (b.coco ? 1 : 0.5));
          }
        }
        b.x[0] += tn[0] * pen; b.x[1] += tn[1] * pen; b.x[2] += tn[2] * pen;
        this.roll(b, tn, h, sub);
        grounded = true;
      }
      // Detect contacts between rigid bodies and column-shaped supports.
      for (const p of this.palms.list) this.trunkContact(b, p);
      b.q = qt.integrate(b.q, b.w, h);
      // squash spring for the jelly-ish bounce
      b.squashV += (-900 * b.squash - 22 * b.squashV) * h;
      b.squash = clamp(b.squash + b.squashV * h, -0.25, 0.2);
      if (b.state === B_FREE && grounded && sub < 0.98 && Math.hypot(b.v[0], b.v[1], b.v[2]) < 0.03 && Math.abs(depthIn) > 0.02) {
        b.still += h; if (b.still > 0.8 && sub === 0) { b.sleep = true; b.v = [0, 0, 0]; b.w = [0, 0, 0]; }
      } else if (b.state === B_FREE && grounded && sub >= 0.98 && Math.hypot(b.v[0], b.v[1], b.v[2]) < 0.02) {
        b.still += h; if (b.still > 1.2) { b.sleep = true; b.v = [0, 0, 0]; b.w = [0, 0, 0]; }
      } else b.still = 0;
    }
    // bodies against bodies
    for (let i = 0; i < list.length; i++) {
      const a = list[i]; if (a.state === B_OFF) continue;
      for (let j = i + 1; j < list.length; j++) {
        const c = list[j]; if (c.state === B_OFF) continue;
        if (a.state === B_ATTACHED && c.state === B_ATTACHED) continue;
        const dx = c.x[0] - a.x[0], dy = c.x[1] - a.x[1], dz = c.x[2] - a.x[2], d = Math.hypot(dx, dy, dz), m = a.r + c.r;
        if (d >= m || d < 1e-6) continue;
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const ma = a.state === B_FREE ? a.r ** 3 * a.rho : 0, mc = c.state === B_FREE ? c.r ** 3 * c.rho : 0;
        const ms = ma + mc; if (!ms) continue;
        const wa = mc / ms, wc = ma / ms;      // the lighter one gives way
        const pen = m - d;
        a.x[0] -= nx * pen * wa; a.x[1] -= ny * pen * wa; a.x[2] -= nz * pen * wa;
        c.x[0] += nx * pen * wc; c.x[1] += ny * pen * wc; c.x[2] += nz * pen * wc;
        const vn = (c.v[0] - a.v[0]) * nx + (c.v[1] - a.v[1]) * ny + (c.v[2] - a.v[2]) * nz;
        if (vn < 0) {
          const j2 = -vn * 1.25;
          a.v[0] -= nx * j2 * wa; a.v[1] -= ny * j2 * wa; a.v[2] -= nz * j2 * wa;
          c.v[0] += nx * j2 * wc; c.v[1] += ny * j2 * wc; c.v[2] += nz * j2 * wc;
          if (a.state === B_FREE) a.sleep = false;
          if (c.state === B_FREE) c.sleep = false;
        }
      }
    }
    this.stepBubbles(h);
  }
  roll(b, n, h, sub) {
    const r = b.r, w = b.w, v = b.v;
    const cx = w[1] * n[2] - w[2] * n[1], cy = w[2] * n[0] - w[0] * n[2], cz = w[0] * n[1] - w[1] * n[0];
    let sx = v[0] - r * cx, sy = v[1] - r * cy, sz = v[2] - r * cz;
    const sn = sx * n[0] + sy * n[1] + sz * n[2];
    sx -= n[0] * sn; sy -= n[1] * sn; sz -= n[2] * sn;
    const dvx = -sx / 3.5, dvy = -sy / 3.5, dvz = -sz / 3.5;
    v[0] += dvx; v[1] += dvy; v[2] += dvz;
    const k = -2.5 / r;
    w[0] += k * (n[1] * dvz - n[2] * dvy); w[1] += k * (n[2] * dvx - n[0] * dvz); w[2] += k * (n[0] * dvy - n[1] * dvx);
    // rolling resistance in soft sand: a Coulomb-like deceleration (stones sink in and stay put on slopes under ~30°)
    const g = this.block.g, gn = Math.abs(g[0] * n[0] + g[1] * n[1] + g[2] * n[2]);
    const mu = (b.coco ? 0.42 : 0.62) * (1 - 0.6 * sub);
    const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    let tx = v[0] - n[0] * vn, ty = v[1] - n[1] * vn, tz = v[2] - n[2] * vn;
    const ts = Math.hypot(tx, ty, tz), dec = mu * gn * h * 1.4;
    const k2 = ts > dec ? (ts - dec) / ts : 0;
    v[0] = tx * k2 + n[0] * vn; v[1] = ty * k2 + n[1] * vn; v[2] = tz * k2 + n[2] * vn;
    const ws = k2 < 1e-6 ? 0.9 : Math.exp(-2 * h); w[0] *= ws; w[1] *= ws; w[2] *= ws;
  }
  trunkContact(b, p) {
    for (let k = 0; k < 4; k++) {
      const t0 = k / 4, t1 = (k + 1) / 4;
      const A = this.palms.deform(p, this.palms.trunkPoint(p, t0), t0 * t0, [0, 0, 0]);
      const B = this.palms.deform(p, this.palms.trunkPoint(p, t1), t1 * t1, [0, 0, 0]);
      const ab = v3.sub(B, A), l2 = v3.dot(ab, ab);
      const t = clamp(v3.dot(v3.sub(b.x, A), ab) / l2, 0, 1);
      const c = v3.madd(A, ab, t), d = v3.sub(b.x, c), dl = v3.len(d), m = b.r + 0.045 * (1 - 0.35 * (t0 + t1) / 2);
      if (dl < m && dl > 1e-6) {
        const n = v3.scale(d, 1 / dl);
        b.x = v3.madd(c, n, m);
        const vn = v3.dot(b.v, n);
        if (vn < 0) { b.v = v3.madd(b.v, n, -vn * 1.3); p.bv[0] -= n[0] * vn * 0.4; p.bv[1] -= n[2] * vn * 0.4; }
      }
    }
  }
  stepBubbles(h) {
    const B = this.bub, W = this.water;
    let k = 0;
    for (let i = 0; i < this.nBub; i++) {
      const o = 8 * i;
      let x = B[o], y = B[o + 1], z = B[o + 2], r = B[o + 3], vy = B[o + 4], life = B[o + 5] + h;
      const stat = B[o + 7] > 0.5;
      if (!stat) {
        const term = 0.12 + r * 9;                       // the jelly lets bubbles up slowly
        vy += (term - vy) * Math.min(1, h * 6);
        y += vy * h;
        const s = B[o + 6];
        x += Math.sin(life * 7 + s) * 0.03 * h; z += Math.cos(life * 6 + s) * 0.03 * h;
        const surf = W.surfaceY(x, z);
        if (y + r > surf) { W.addVolume(x, z, -r * r * r * 3, 0.05); continue; }     // pop
      }
      const p = 8 * k++;
      B[p] = x; B[p + 1] = y; B[p + 2] = z; B[p + 3] = r; B[p + 4] = vy; B[p + 5] = life; B[p + 6] = B[o + 6]; B[p + 7] = B[o + 7];
    }
    this.nBub = k;
  }
  // per frame: hand accumulated volume changes to the sea
  flush() {
    for (const b of this.list) {
      const dv = this.dV[b.id];
      if (Math.abs(dv) > 1e-7 && b.state !== B_OFF) this.water.addVolume(b.x[0], b.x[2], dv * 0.85, b.r * 1.8);
      this.dV[b.id] = 0;
    }
  }
  pick(o, d) {
    let best = null;
    for (const b of this.list) {
      if (b.state === B_OFF) continue;
      const ox = o[0] - b.x[0], oy = o[1] - b.x[1], oz = o[2] - b.x[2];
      const bb = ox * d[0] + oy * d[1] + oz * d[2], rr = b.r * 1.35 + 0.02;
      const disc = bb * bb - (ox * ox + oy * oy + oz * oz - rr * rr);
      if (disc < 0) continue;
      const t = -bb - Math.sqrt(disc);
      if (t > 0 && (!best || t < best.t)) best = { b, t };
    }
    return best;
  }
  grab(b, target) {
    if (b.state === B_ATTACHED) { b.palm.bv[0] += (this.rnd() - 0.5) * 0.6; b.palm.bv[1] += (this.rnd() - 0.5) * 0.6; }
    b.state = B_HELD; b.sleep = false; b.palm = null;
    this.hold = { b, target: target.slice() };
  }
  release(vel) {
    const H = this.hold; if (!H) return;
    const b = H.b;
    b.state = B_FREE; b.still = 0;
    if (vel) { const s = Math.hypot(vel[0], vel[1], vel[2]), k = s > 10 ? 10 / s : 1; b.v = [vel[0] * k, vel[1] * k, vel[2] * k]; }
    b.w = [b.v[2] / b.r * 0.4, (this.rnd() - 0.5) * 4, -b.v[0] / b.r * 0.4];
    this.hold = null;
  }
  tally() {
    let afloat = 0, sunk = 0, ashore = 0;
    for (const b of this.list) {
      if (b.state !== B_FREE) continue;
      if (b.sub > 0.97 && !b.coco) sunk++;
      else if (b.sub > 0.08) afloat++;
      else ashore++;
    }
    this.stats.afloat = afloat; this.stats.sunk = sunk; this.stats.ashore = ashore;
    return this.stats;
  }
  pack() {
    const I = this.inst;
    let k = 0;
    for (const b of this.list) {
      if (b.state === B_OFF) continue;
      const o = INST_B * k++;
      I[o] = b.x[0]; I[o + 1] = b.x[1]; I[o + 2] = b.x[2]; I[o + 3] = b.r;
      I[o + 4] = b.q[0]; I[o + 5] = b.q[1]; I[o + 6] = b.q[2]; I[o + 7] = b.q[3];
      I[o + 8] = b.coco ? 1 : 0; I[o + 9] = b.tone; I[o + 10] = b.squash; I[o + 11] = b.sub;
      I[o + 12] = 0; I[o + 13] = 0; I[o + 14] = 0; I[o + 15] = 0;
    }
    this.nInst = k;
    const BI = this.binst, B = this.bub;
    for (let i = 0; i < this.nBub; i++) { BI[4 * i] = B[8 * i]; BI[4 * i + 1] = B[8 * i + 1]; BI[4 * i + 2] = B[8 * i + 2]; BI[4 * i + 3] = B[8 * i + 3]; }
    this.nBinst = this.nBub;
  }
  bad() { for (const b of this.list) if (b.state !== B_OFF && !Number.isFinite(b.x[0] + b.x[1] + b.x[2] + b.q[3])) return true; return false; }
}

// ───────────────────────────── fixed-step orchestration ─────────────────────────────
const BODY_H = 1 / 240, WATER_H = 1 / 240;
class World {
  constructor() {
    this.block = new Block();
    this.water = new Water();
    this.palms = new Palms();
    this.bodies = new Bodies(this.water, this.palms, this.block);
    this.accB = 0; this.accW = 0; this.reduced = false; this.time = 0; this.shimmer = 0;
  }
  setFirm(v) { this.block.firm = v; this.water.firm = v; }
  setDamp(v) { this.block.damp = v; this.water.damp = v; }
  setTide(v) { this.water.setLevel(WL0 + v); }
  reset() {
    this.block.reset(); this.water.reset(); this.palms.reset(); this.bodies.reset();
    this.accB = 0; this.accW = 0;
  }
  advance(dt) {
    this.time += dt;
    this.accB += dt; this.accW += dt;
    let n = 0;
    const B = this.block;
    while (this.accB >= BODY_H && n < 10) {
      const t0 = B.tv[0], t1 = B.tv[1];
      B.step(BODY_H);
      const alpha = [(B.tv[0] - t0) / BODY_H, (B.tv[1] - t1) / BODY_H];
      this.palms.step(BODY_H, B.g, alpha, this.reduced);
      this.bodies.step(BODY_H);
      this.accB -= BODY_H; n++;
    }
    if (n >= 10) this.accB = 0;
    this.bodies.flush();
    // the sea feels the tilt as an in-plane pull
    this.water.ax = B.g[0]; this.water.az = B.g[2];
    // a faint shimmer so the caustics never quite stand still (not with reduced motion)
    if (!this.reduced) {
      this.shimmer -= dt;
      if (this.shimmer <= 0) {
        this.shimmer = 0.35 + Math.random() * 0.5;
        const x = (Math.random() * 2 - 1) * (HALF - 0.2), z = (Math.random() * 2 - 1) * (HALF - 0.2);
        if (terrainH(x, z) < this.water.level - 0.1) this.water.addVolume(x, z, (Math.random() < 0.5 ? -1 : 1) * 0.00022, 0.07);
      }
    }
    let m = 0;
    while (this.accW >= WATER_H && m < 12) { this.water.step(WATER_H); this.accW -= WATER_H; m++; }
    if (m >= 12) this.accW = 0;
  }
  bad() { return this.water.bad() || this.bodies.bad() || !Number.isFinite(this.block.t[0] + this.block.t[1] + this.block.s[0]); }
}

// ───────────────────────────── meshes (block-local) ─────────────────────────────
// Generic vertex: position(3) normal(3) uv(2).
function meshOut(pos, nrm, uv, idx) {
  const n = pos.length / 3, v = new Float32Array(n * 8);
  for (let i = 0; i < n; i++) {
    v[8 * i] = pos[3 * i]; v[8 * i + 1] = pos[3 * i + 1]; v[8 * i + 2] = pos[3 * i + 2];
    v[8 * i + 3] = nrm[3 * i]; v[8 * i + 4] = nrm[3 * i + 1]; v[8 * i + 5] = nrm[3 * i + 2];
    v[8 * i + 6] = uv[2 * i]; v[8 * i + 7] = uv[2 * i + 1];
  }
  return { v, i: new Uint32Array(idx) };
}
// sand and seabed
function buildTerrainMesh() {
  const M = 128, pos = [], nrm = [], uv = [], idx = [], n = [0, 1, 0];
  for (let j = 0; j <= M; j++) for (let i = 0; i <= M; i++) {
    const x = -HALF + SIDE * i / M, z = -HALF + SIDE * j / M;
    pos.push(x, terrainH(x, z), z); terrainNormal(x, z, n); nrm.push(n[0], n[1], n[2]); uv.push(i / M, j / M);
  }
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const a = j * (M + 1) + i, b = a + 1, c = a + M + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  return meshOut(pos, nrm, uv, idx);
}
// the four cut faces of the ground: from the base up to the sand line. uv = (distance along the rim, height)
function edgePoint(e, s) {
  // e: 0 = +z (front), 1 = +x (right), 2 = -z (back), 3 = -x (left); s in [0,1] runs anticlockwise seen from above
  const t = -HALF + SIDE * s;
  if (e === 0) return [t, HALF, [0, 0, 1]];
  if (e === 1) return [HALF, -t, [1, 0, 0]];
  if (e === 2) return [-t, -HALF, [0, 0, -1]];
  return [-HALF, t, [-1, 0, 0]];
}
function buildSoilMesh() {
  const M=160,H=14,pos=[],nrm=[],uv=[],idx=[];let nv=0;
  for(let e=0;e<4;e++){
    const s0=nv;
    for(let k=0;k<=M;k++){
      const s=k/M,[x,z,n]=edgePoint(e,s),top=terrainH(x,z);
      for(let j=0;j<=H;j++){const y=top*j/H;pos.push(x,y,z);nrm.push(...n);uv.push(e*SIDE+s*SIDE,y);nv++;}
    }
    for(let k=0;k<M;k++)for(let j=0;j<H;j++){const a=s0+k*(H+1)+j,b=a+H+1;idx.push(a,b,a+1,a+1,b,b+1);}
  }
  const b=nv;
  for(const [x,z] of [[-HALF,-HALF],[HALF,-HALF],[HALF,HALF],[-HALF,HALF]]){pos.push(x,0,z);nrm.push(0,-1,0);uv.push(0,0);}
  idx.push(b,b+1,b+2,b,b+2,b+3);return meshOut(pos,nrm,uv,idx);
}
// the water surface: a full grid over the block; heights come from the sim texture in the vertex shader
function buildWaterMesh() {
  const M = GN, pos = [], nrm = [], uv = [], idx = [];
  for (let j = 0; j <= M; j++) for (let i = 0; i <= M; i++) { pos.push(-HALF + GDX * i, 0, -HALF + GDX * j); nrm.push(0, 1, 0); uv.push(0, 0); }
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const a = j * (M + 1) + i, b = a + 1, c = a + M + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  return meshOut(pos, nrm, uv, idx);
}
// the four cut faces of the sea: bottom on the sand line, top on the moving surface (uv.x: 0 bottom, 1 top)
function buildWaterWallMesh() {
  const M=GN,H=20,pos=[],nrm=[],uv=[],idx=[];let nv=0;
  for(let e=0;e<4;e++){
    const s0=nv;
    for(let k=0;k<=M;k++){
      const [x,z,n]=edgePoint(e,k/M),T=terrainH(x,z);
      for(let j=0;j<=H;j++){pos.push(x,T,z);nrm.push(...n);uv.push(j/H,e);nv++;}
    }
    for(let k=0;k<M;k++)for(let j=0;j<H;j++){const a=s0+k*(H+1)+j,b=a+H+1;idx.push(a,b,a+1,a+1,b,b+1);}
  }
  return meshOut(pos,nrm,uv,idx);
}
// the caustics grid: one vertex per water cell
function buildCausticMesh() {
  const M = GN, pos = [], nrm = [], uv = [], idx = [];
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) { pos.push(-HALF + GDX * (i + 0.5), 0, -HALF + GDX * (j + 0.5)); nrm.push(0, 1, 0); uv.push(i, j); }
  for (let j = 0; j < M - 1; j++) for (let i = 0; i < M - 1; i++) {
    const a = j * M + i, b = a + 1, c = a + M, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  return meshOut(pos, nrm, uv, idx);
}
function buildIcosphere(sub) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v3.norm);
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) {
    const cache = new Map(), nf = [];
    const mid = (a, b) => {
      const k = a < b ? a + '_' + b : b + '_' + a;
      if (!cache.has(k)) { verts.push(v3.norm(v3.lerp(verts[a], verts[b], 0.5))); cache.set(k, verts.length - 1); }
      return cache.get(k);
    };
    for (const [a, b, c] of faces) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    faces = nf;
  }
  const pos = [], nrm = [], uv = [], idx = [];
  for (const v of verts) { pos.push(...v); nrm.push(...v); uv.push(0, 0); }
  for (const f of faces) idx.push(f[0], f[1], f[2]);
  return meshOut(pos, nrm, uv, idx);
}

// ───────────────────────────── WGSL ─────────────────────────────
const WGSL_COMMON = /* wgsl */`
struct Frame {
  viewProj: mat4x4f, invViewProj: mat4x4f, model: mat4x4f, invModel: mat4x4f, shadowVP: mat4x4f,
  cam: vec4f, sun: vec4f, sunL: vec4f, res: vec4f, wobble: vec4f, water: vec4f, sigma: vec4f, waterTint: vec4f,
  sand: vec4f, sandWet: vec4f, leaf: vec4f, trunk: vec4f,
  s0: vec4f, s1: vec4f, s2: vec4f, s3: vec4f, s4: vec4f,
  bgTop: vec4f, bgBottom: vec4f, coconut: vec4f, pebble: vec4f,
  palm0: vec4f, palm1: vec4f,
  // environment.x scales sky radiance; sun.w independently controls direct light.
  environment: vec4f, misc: vec4f,
};
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> inst: array<vec4f>;
@group(0) @binding(2) var waterTex: texture_2d<f32>;
@group(0) @binding(3) var causticTex: texture_2d<f32>;
@group(0) @binding(4) var lin: sampler;
@group(0) @binding(5) var shadowTex: texture_depth_2d;
@group(0) @binding(6) var shadowCmp: sampler_comparison;
@group(0) @binding(7) var sceneTex: texture_2d<f32>;
@group(0) @binding(8) var distTex: texture_2d<f32>;
@group(0) @binding(9) var backTex: texture_2d<f32>;

const PI = 3.14159265;
const TAU = 6.28318531;

fn qrot(q: vec4f, v: vec3f) -> vec3f { let t = 2.0 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }
fn hash31(p: vec3f) -> f32 { var q = fract(p * 0.1031); q += dot(q, q.zyx + 31.32); return fract((q.x + q.y) * q.z); }
fn hash21(p: vec2f) -> f32 { var q = fract(vec3f(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn vnoise(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  let a = mix(mix(hash31(i), hash31(i + vec3f(1.0, 0.0, 0.0)), u.x), mix(hash31(i + vec3f(0.0, 1.0, 0.0)), hash31(i + vec3f(1.0, 1.0, 0.0)), u.x), u.y);
  let b = mix(mix(hash31(i + vec3f(0.0, 0.0, 1.0)), hash31(i + vec3f(1.0, 0.0, 1.0)), u.x), mix(hash31(i + vec3f(0.0, 1.0, 1.0)), hash31(i + vec3f(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(a, b, u.z);
}

// the jelly's shear and squash, applied to everything inside the block (block-local in, block-local out)
fn wob(p: vec3f) -> vec3f {
  let f = clamp(p.y / F.wobble.w, 0.0, 1.6);
  var q = p;
  q.x += F.wobble.x * f * f; q.z += F.wobble.y * f * f;
  q.y *= 1.0 + F.wobble.z * f;
  q.x *= 1.0 - 0.5 * F.wobble.z * f; q.z *= 1.0 - 0.5 * F.wobble.z * f;
  // A local grab deforms the lower gel; zero displacement at the table.
  let r=p.xz-F.palm1.xz;
  let influence=exp(-dot(r,r)/1.05)*(1.0-exp(-max(p.y,0.0)*12.0))*exp(-max(p.y-.42,0.0)*2.4);
  q+=F.palm0.xyz*influence;
  return q;
}
fn gelNormal(p:vec3f,n:vec3f)->vec3f {
  let axis=select(vec3f(0.0,1.0,0.0),vec3f(1.0,0.0,0.0),abs(n.y)>.9);
  let t=normalize(cross(axis,n));let b=cross(n,t);let e=.002;
  let dt=wob(p+t*e)-wob(p-t*e);let db=wob(p+b*e)-wob(p-b*e);
  return normalize((F.model*vec4f(normalize(cross(dt,db)),0.0)).xyz);
}
fn toWorld(p: vec3f) -> vec3f { return (F.model * vec4f(wob(p), 1.0)).xyz; }
fn dirToWorld(n: vec3f) -> vec3f { return normalize((F.model * vec4f(n, 0.0)).xyz); }
fn toLocal(p: vec3f) -> vec3f { return (F.invModel * vec4f(p, 1.0)).xyz; }

// the sea's state: (height offset, d/dx, d/dz, sand height), bilinear from the sim texture
fn wsample(xz: vec2f) -> vec4f {
  let N = F.water.w;
  let g = (xz + vec2f(F.water.z)) / F.water.y - 0.5;
  let i0 = clamp(floor(g), vec2f(0.0), vec2f(N - 2.0));
  let t = clamp(g - i0, vec2f(0.0), vec2f(1.0));
  let c = vec2i(i0);
  let a = textureLoad(waterTex, c, 0); let b = textureLoad(waterTex, c + vec2i(1, 0), 0);
  let d = textureLoad(waterTex, c + vec2i(0, 1), 0); let e = textureLoad(waterTex, c + vec2i(1, 1), 0);
  return mix(mix(a, b, t.x), mix(d, e, t.x), t.y);
}
fn causticAt(lp: vec3f) -> vec3f {
  let uv = lp.xz / (2.0 * F.water.z) + 0.5;
  let raw=textureSampleLevel(causticTex,lin,uv,0.0).rgb;
  return raw*1.4/(vec3f(1.0)+raw*.75);
}
fn shadowAt(wp: vec3f) -> f32 {
  let c = F.shadowVP * vec4f(wp, 1.0);
  let p = c.xyz / c.w;
  let uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || p.z > 1.0) { return 1.0; }
  let d = p.z - 0.0011;
  var s = 0.0;
  let tx = 1.0 / 2048.0;
  // Stable disk samples preserve contact edges; depth softens shadows seen through water.
  let underwater = max(F.water.x - toLocal(wp).y, 0.0);
  let radius = mix(2.4, 5.6, F.sunL.w) + max(wp.y, 0.0) * 1.2 + min(underwater * 12.0, 18.0);
  for (var k = 0; k < 12; k++) {
    let a = f32(k) * 2.39996323;
    let r = sqrt((f32(k) + 0.5) / 12.0) * radius;
    s += textureSampleCompareLevel(shadowTex, shadowCmp, uv + vec2f(cos(a), sin(a)) * r * tx, d);
  }
  return s / 12.0;
}
// Broad sky illumination and a soft solar halo, shared by every reflective material.
fn studio(d: vec3f, boxGain: f32) -> vec3f {
  let horizon = mix(vec3f(.69,.79,.81), vec3f(.94,.67,.47), F.misc.x);
  let zenith = mix(vec3f(.36,.53,.66), vec3f(.35,.42,.54), F.misc.x);
  var c = mix(horizon, zenith, smoothstep(0.0, .9, d.y));
  c = mix(c, mix(horizon, vec3f(.62,.71,.75), .55), F.sunL.w * .55);
  c = mix(c, vec3f(.22,.28,.29), smoothstep(.02, -.45, d.y));
  c *= mix(1.0, .095, F.misc.z) * F.environment.x;
  let sunColor = mix(vec3f(1.0,.94,.83), vec3f(1.0,.57,.28), F.misc.x);
  c += sunColor * pow(max(dot(d,F.sun.xyz),0.0), 42.0) * boxGain * .48 * F.sun.w;
  if(F.misc.z>.5){
    let t=F.cam.w;let band=pow(max(0.0,1.0-abs(d.y-.28-.10*sin(d.x*5.0+t*.15))*5.0),3.0);
    c+=vec3f(.025,.28,.16)*band*(.6+.4*sin(d.x*28.0+t*.3));
  }
  return c;
}
fn skyLight(n: vec3f) -> vec3f {
  let up = n.y * .5 + .5;
  let ground = mix(vec3f(.22,.28,.30), vec3f(.24,.25,.29), F.misc.x);
  let sky = mix(vec3f(.43,.52,.58), vec3f(.38,.43,.54), F.misc.x);
  return mix(ground, sky, up) * mix(1.0, .27, F.misc.z) * mix(1.0, 1.12, F.sunL.w) * F.environment.x;
}
fn dielectric(n: vec3f, v: vec3f, l: vec3f, rough: f32, f0: f32) -> f32 {
  let h = normalize(v+l);
  let nv = max(dot(n,v), .001); let nl = max(dot(n,l), .001);
  let nh = max(dot(n,h), 0.0); let vh = max(dot(v,h), 0.0);
  let a = rough * rough; let a2 = a * a;
  let d = a2 / max(PI * pow(nh*nh*(a2-1.0)+1.0, 2.0), .0000001);
  let k = pow(rough+1.0,2.0) / 8.0;
  let g = nv / (nv*(1.0-k)+k) * nl / (nl*(1.0-k)+k);
  let f = f0 + (1.0-f0) * pow(1.0-vh,5.0);
  return d*g*f / max(4.0*nv*nl,.001);
}
struct OOut { @location(0) color: vec4f, @location(1) dist: vec4f };
fn oout(col: vec3f, wp: vec3f) -> OOut {
  var o: OOut; o.color = vec4f(col, 1.0); o.dist = vec4f(length(wp - F.cam.xyz), 0.0, 0.0, 1.0); return o;
}
// how much sun reaches a block-local point: direct above the sea, through the waves (caustics) below it
fn sunlight(lp: vec3f, wp: vec3f) -> vec3f {
  let sh = shadowAt(wp);
  let s = wsample(lp.xz);
  let surf = F.water.x + s.x;
  let under = smoothstep(surf + 0.004, surf - 0.01, lp.y) * step(s.w, F.water.x - 0.004);
  let day = mix(vec3f(1.0, .95, .86), vec3f(1.12, .65, .34), F.misc.x);
  let color = mix(day,vec3f(.39,.61,.78),F.misc.z) * F.sun.w;
  let direct = color * sh;
  let wet = causticAt(lp) * color * sh * .90;
  return mix(direct, wet, under);
}
`;

const WGSL_SCENE = /* wgsl */`
struct VIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f };
struct SOut { @builtin(position) clip: vec4f, @location(0) wp: vec3f, @location(1) lp: vec3f, @location(2) n: vec3f, @location(3) uv: vec2f };

// ── backdrop and floor: a paper sweep; the block casts a tinted, caustic-flecked shadow ──
struct BOut { @builtin(position) clip: vec4f, @location(0) ndc: vec2f };
@vertex fn vsFull(@builtin(vertex_index) vi: u32) -> BOut {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u)) * 2.0 - 1.0;
  var o: BOut; o.clip = vec4f(p, 0.99999, 1.0); o.ndc = p; return o;
}
@fragment fn fsBackdrop(i: BOut) -> OOut {
  let a = F.invViewProj * vec4f(i.ndc, 0.0, 1.0);
  let b = F.invViewProj * vec4f(i.ndc, 1.0, 1.0);
  let ro = a.xyz / a.w; let rd = normalize(b.xyz / b.w - ro);
  var col = mix(F.bgBottom.rgb, F.bgTop.rgb, smoothstep(0.05, 0.95, i.ndc.y * 0.5 + 0.5));
  var o: OOut;
  o.dist = vec4f(1e4, 0.0, 0.0, 1.0);
  if (rd.y < -1e-4) {
    let t = -ro.y / rd.y; let p = ro + rd * t;
    var fl = mix(F.bgBottom.rgb * 0.97, F.bgBottom.rgb, smoothstep(1.5, 7.0, length(p.xz)));
    // contact shading around the base
    let lp = toLocal(p);
    let dbox = max(abs(lp.x), abs(lp.z)) - F.water.z;
    fl *= 1.0 - 0.20 * exp(-max(dbox, 0.0) * 9.0);
    // light through the jelly block: tinted, with the caustic pattern carried along
    let L = F.sun.xyz;
    let ld = (F.invModel * vec4f(L, 0.0)).xyz;
    let top = F.water.x;
    var tmin = 0.0; var tmax = 1e3;
    let lo = vec3f(-F.water.z, 0.0, -F.water.z); let hi = vec3f(F.water.z, top, F.water.z);
    for (var k = 0; k < 3; k++) {
      let inv = 1.0 / select(ld[k], 1e-6, abs(ld[k]) < 1e-6);
      let t0 = (lo[k] - lp[k]) * inv; let t1 = (hi[k] - lp[k]) * inv;
      tmin = max(tmin, min(t0, t1)); tmax = min(tmax, max(t0, t1));
    }
    if (tmax > tmin && tmax > 0.0) {
      let len = tmax - max(tmin, 0.0);
      let ex = lp + ld * tmax;
      let cau = causticAt(ex);
      // light that went through the jelly is tinted and flecked with the caustics, never brighter than open floor
      let T = exp(-F.sigma.rgb * len * 0.42);
      let tint = min(T * (0.78 + 0.25 * dot(cau, vec3f(0.333))), vec3f(1.0));
      fl *= mix(vec3f(1.0), tint, 0.55);
    }
    // A sun shadow removes direct light; the open sky still illuminates the floor.
    fl *= mix(1.0, shadowAt(p), .34 * F.sun.w);
    col = mix(fl, col, smoothstep(6.0, 18.0, t));
    o.dist = vec4f(t, 0.0, 0.0, 1.0);
  }
  if(F.misc.z>.5){
    let uv=i.ndc;let t=F.cam.w;
    let curve=.55+.12*sin(uv.x*3.2+t*.15)+.04*sin(uv.x*9.0-t*.12);
    let curtain=exp(-abs(uv.y-curve)*8.0)*smoothstep(-.15,.55,uv.y);
    let rays=.55+.45*pow(.5+.5*sin(uv.x*90.0+sin(uv.x*12.0+t*.2)*6.0),2.0);
    col+=mix(vec3f(.035,.27,.15),vec3f(.11,.075,.23),.5+.5*sin(uv.x*2.0))*curtain*rays*.65;
    let grid=floor(uv*vec2f(420.0,260.0));let cell=fract(uv*vec2f(420.0,260.0));
    col+=vec3f(.5,.65,.7)*step(.9985,hash21(grid))*exp(-length(cell-.5)*8.0)*smoothstep(.05,.8,uv.y);
    // An occasional shooting star quietly crosses the aurora.
    let phase=fract(t/19.0);
    let travel=clamp(phase/.10,0.0,1.0);
    let head=vec2f(-.40+travel*1.2,.90-travel*.62);
    let delta=uv-head;
    let along=dot(delta,normalize(vec2f(-1.2,.62)));
    let across=abs(dot(delta,normalize(vec2f(.62,1.2))));
    let tail=exp(-across*600.0)*smoothstep(0.0,.012,along)*(1.0-smoothstep(.02,.25,along));
    let flash=smoothstep(0.0,.015,phase)*(1.0-smoothstep(.085,.11,phase));
    col+=vec3f(.6,.84,.85)*(tail+exp(-length(delta)*450.0))*flash*F.misc.y;
  }
  o.color = vec4f(col, 1.0);
  return o;
}

// ── sand and seabed ──
@vertex fn vsTerrain(v: VIn) -> SOut {
  var o: SOut; o.lp = v.pos; o.wp = toWorld(v.pos); o.clip = F.viewProj * vec4f(o.wp, 1.0); o.n = gelNormal(v.pos,v.nrm); o.uv = v.uv;
  return o;
}
@fragment fn fsTerrain(i: SOut) -> OOut {
  let lp = i.lp; let N0 = normalize(i.n); let V = normalize(F.cam.xyz - i.wp); let L = F.sun.xyz;
  let s = wsample(lp.xz);
  let surf = F.water.x + s.x;
  // Wind-packed snow has soft, broad variation and a fine crystalline surface.
  let gp = lp * 84.0;
  let e = 0.16;
  let n0 = vnoise(gp);
  let g = vec3f(vnoise(gp + vec3f(e, 0.0, 0.0)) - n0, 0.0, vnoise(gp + vec3f(0.0, 0.0, e)) - n0) / e;
  let N = normalize(N0 - (F.model * vec4f(g, 0.0)).xyz * 0.035);
  let wetBand = smoothstep(surf + 0.07, surf - 0.005, lp.y);
  var base = mix(F.sand.rgb, F.sandWet.rgb, wetBand);
  base *= 0.95 + 0.065 * vnoise(lp * vec3f(12.0, 7.0, 22.0)) - 0.025 * n0;
  let light = sunlight(lp, i.wp);
  let ndl = max(dot(N, L), 0.0);
  let under = 1.0 - smoothstep(surf - 0.01, surf + 0.004, lp.y);
  let amb = mix(skyLight(N), vec3f(.24,.37,.40) * mix(1.0,.28,F.misc.z) * F.environment.x, under);
  let snowWrap = pow(clamp(dot(-N,L) * .5 + .5, 0.0, 1.0), 3.0) * .075 * (1.0-under);
  var col = base * (amb + light * (ndl * .76 + snowWrap));
  col += dielectric(N,V,L,mix(.62,.28,wetBand),.028) * light * ndl * .45;
  let fres = .028 + .972 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
  col = mix(col, studio(reflect(-V,N),.5), fres * .24 * wetBand * (1.0-under));
  return oout(col, i.wp);
}

// ── glacial cross-section: compacted ice, thin cloudy seams and trapped air ──
@vertex fn vsSoil(v: VIn) -> SOut {
  var o: SOut; o.lp = v.pos; o.wp = toWorld(v.pos); o.clip = F.viewProj * vec4f(o.wp, 1.0); o.n = gelNormal(v.pos,v.nrm); o.uv = v.uv;
  return o;
}
@fragment fn fsSoil(i: SOut) -> OOut {
  let V=normalize(F.cam.xyz-i.wp);let L=F.sun.xyz;
  let top=max(.12,wsample(i.lp.xz).w);
  let y=i.lp.y;let u=i.uv.x;
  let wave=.009*sin(u*2.6)+.004*sin(u*8.7+.8);
  let layer=(y+wave)/top;
  var c=mix(F.s4.rgb,F.s3.rgb,smoothstep(.20,.24,layer));
  c=mix(c,F.s2.rgb,smoothstep(.49,.515,layer));
  c=mix(c,F.s1.rgb,smoothstep(.565,.595,layer));
  c=mix(c,F.s0.rgb,smoothstep(.87,.91,layer));
  // Rounded-looking wet edges, with a continuous physical silhouette below.
  let bevel=(exp(-max(y,0.0)*75.0)*-.45+exp(-abs(top-y)*55.0)*.55);
  let N=normalize(i.n+dirToWorld(vec3f(0.0,bevel,0.0)));
  let nv=clamp(dot(N,V),0.0,1.0);
  let Vl=normalize((F.invModel*vec4f(-V,0.0)).xyz);
  let safeD=select(vec3f(.0001),Vl,abs(Vl)>vec3f(.0001));
  let hi=(vec3f(F.water.z,top,-F.water.z)-i.lp)/safeD;
  let lo=(vec3f(-F.water.z,0.0,F.water.z)-i.lp)/safeD;
  let far=max(hi,lo);
  let thickness=clamp(min(far.x,min(far.y,far.z)),.05,4.0);
  let absorption=mix(vec3f(.72,.30,.19),vec3f(.32,.16,.10),smoothstep(.82,1.0,layer));
  let transmittance=exp(-absorption*thickness);
  let light= mix(1.0,.25,F.misc.z);
  let transmitted=mix(F.bgBottom.rgb*.66,F.bgTop.rgb,.3)*transmittance;
  let wrap=clamp(dot(N,L)*.5+.5,0.0,1.0);
  let cloudy = vnoise(i.lp*vec3f(9.0,36.0,9.0));
  var col=transmitted*.20+c*(skyLight(N)+sunlight(i.lp,i.wp)*wrap*.46)*(.88+.12*cloudy);
  // A sparse population of inclusions sits beneath the polished cut face.
  let cell=vec2f(u*22.0,y*28.0);let ci=floor(cell);
  let off=vec2f(hash21(ci+4.1),hash21(ci+9.2))*.55+.225;
  let r=length((fract(cell)-off)*vec2f(1.0,.8));
  let bead=(1.0-smoothstep(.055,.105,r))*step(.91,hash21(ci));
  col=mix(col,vec3f(.75,.88,.91)*light,bead*.22);
  let fres=.045+.955*pow(1.0-nv,5.0);
  col=mix(col,studio(reflect(-V,N),.8),min(.35,fres*.65));
  col+=dielectric(N,V,L,.24,.035)*sunlight(i.lp,i.wp)*max(dot(N,L),0.0)*.6;
  let seam=exp(-abs(layer-.515)*160.0)+exp(-abs(layer-.90)*150.0);
  col+=vec3f(.04,.06,.065)*seam*light;
  return oout(col,i.wp);
}

// ── scene objects ──
// The cabin, ice floes, animals and pier share a scene mesh; vertex data distinguishes their materials.
struct PIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f, @location(3) ex: vec4f };
struct POut { @builtin(position) clip: vec4f, @location(0) wp: vec3f, @location(1) lp: vec3f, @location(2) n: vec3f, @location(3) uv: vec2f, @location(4) col: vec4f };
fn palmPos(v: PIn) -> vec3f { return v.pos; }
@vertex fn vsPalm(v: PIn) -> POut {
  var o:POut;o.lp=v.pos;o.wp=toWorld(v.pos);o.clip=F.viewProj*vec4f(o.wp,1.0);o.n=dirToWorld(v.nrm);o.uv=v.uv;o.col=v.ex;return o;
}
@fragment fn fsPalm(i:POut,@builtin(front_facing) ff:bool) -> OOut {
  var N=normalize(i.n);if(!ff){N=-N;}
  let V=normalize(F.cam.xyz-i.wp);let L=F.sun.xyz;
  // The generated palette identifies snow, ice and timber without another mesh pass.
  let snow=smoothstep(.71,.85,min(i.col.r,min(i.col.g,i.col.b)))*step(i.col.r,i.col.b+.025);
  let timber=smoothstep(.04,.14,i.col.r-i.col.b)*(1.0-step(.72,i.col.r));
  let ice=smoothstep(.08,.22,i.col.b-i.col.r)*smoothstep(.40,.65,i.col.g)*(1.0-snow);
  let grain=vnoise(i.lp*mix(vec3f(150.0),vec3f(12.0,140.0,22.0),timber));
  let gp=i.lp*125.0;let noise=vnoise(gp);
  let gradient=vec3f(vnoise(gp+vec3f(.18,0.0,0.0))-noise,vnoise(gp+vec3f(0.0,.18,0.0))-noise,vnoise(gp+vec3f(0.0,0.0,.18))-noise)/.18;
  N=normalize(N-(F.model*vec4f(gradient,0.0)).xyz*(.013*snow+.009*timber));
  let light=sunlight(i.lp,i.wp);
  let night=F.misc.z;
  let ndl=max(dot(N,L),0.0);
  let wet=1.0-smoothstep(F.water.x-.008,F.water.x+.025,i.lp.y);
  let rough=mix(mix(mix(.36,.70,timber),.63,snow),.24,ice);
  let roughness=mix(rough,.19,wet*.75);
  let albedo=i.col.rgb*(1.0+(grain-.5)*(.075*snow+.16*timber+.025));
  let ground=wsample(i.lp.xz).w;
  let contact=.80+.20*smoothstep(.0,.12,i.lp.y-ground);
  var col=albedo*(skyLight(N)*contact+light*ndl*.77);
  // Snow scatters light into its shaded edges; ice retains a restrained clear coat.
  col+=albedo*light*.085*snow*pow(max(dot(-N,L)*.5+.5,0.0),2.0);
  col+=dielectric(N,V,L,roughness,mix(.028,.045,ice))*light*ndl*.7;
  let fres=.035+.965*pow(1.0-clamp(dot(N,V),0.0,1.0),5.0);
  col=mix(col,studio(reflect(-V,N),.6),fres*(ice*.30+wet*.18));
  let warmth=exp(-length(i.lp-vec3f(-.25,1.55,.05))*7.0)*night;
  col+=vec3f(1.0,.32,.055)*warmth*.34;
  col=mix(col,i.col.rgb*(1.4+night*.9),clamp(i.col.a,0.0,1.0));
  return oout(col,i.wp);
}

// ── rigid body shapes and materials ──
fn bodyShape(d: vec3f, kind: f32, tone: f32) -> vec3f {
  if (kind > 0.5) {
    // Three soft longitudinal ridges shape the ellipsoid surface.
    let a = atan2(d.z, d.x);
    let rid = 1.0 + 0.045 * cos(3.0 * a) * (1.0 - d.y * d.y);
    return d * vec3f(0.95, 1.1, 0.95) * rid;
  }
  let n = vnoise(d * 1.8 + vec3f(tone * 17.0)) - 0.5;
  return d * vec3f(1.0, 0.62 + 0.1 * tone, 0.82) * (1.0 + 0.12 * n);
}
struct EOut { @builtin(position) clip: vec4f, @location(0) wp: vec3f, @location(1) lp: vec3f, @location(2) n: vec3f, @location(3) d: vec3f, @location(4) @interpolate(flat) b: vec4f };
@vertex fn vsBody(v: VIn, @builtin(instance_index) ii: u32) -> EOut {
  let A = inst[ii * 4u]; let q = inst[ii * 4u + 1u]; let B = inst[ii * 4u + 2u];
  let d = v.pos;
  let s = bodyShape(d, B.x, B.y);
  var p = qrot(q, s * A.w);
  // squash along the block's up axis
  p.y *= 1.0 + B.z; p.x *= 1.0 - 0.5 * B.z; p.z *= 1.0 - 0.5 * B.z;
  let sc = select(vec3f(1.0, 0.62 + 0.1 * B.y, 0.82), vec3f(0.95, 1.1, 0.95), B.x > 0.5);
  var o: EOut; o.lp = A.xyz + p; o.wp = toWorld(o.lp); o.clip = F.viewProj * vec4f(o.wp, 1.0);
  o.n = dirToWorld(normalize(qrot(q, d / sc))); o.d = d; o.b = B;
  return o;
}
@fragment fn fsBody(i: EOut) -> OOut {
  let N = normalize(i.n); let V = normalize(F.cam.xyz - i.wp); let L = F.sun.xyz; let H = normalize(L + V);
  let light = sunlight(i.lp, i.wp);
  let ndl = clamp(dot(N, L) * 0.7 + 0.3, 0.0, 1.0);
  var col: vec3f;
  if (i.b.x > 0.5) {
    // Combine fibrous grain with specular highlights and environment reflections.
    let fib = vnoise(vec3f(atan2(i.d.z, i.d.x) * 6.0, i.d.y * 30.0, i.b.y * 9.0));
    var c = F.coconut.rgb * (0.8 + 0.35 * fib);
    c = mix(c, c * vec3f(0.8, 1.15, 0.6), smoothstep(0.6, 1.0, i.d.y) * 0.5);
    col = c * (0.3 + 0.85 * ndl * light);
    col += vec3f(1.0, 0.95, 0.88) * pow(max(dot(N, H), 0.0), 120.0) * 0.9 * light;
    let fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
    col = mix(col, studio(reflect(-V, N), 6.0), fres * 0.5);
    col += F.coconut.rgb * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0) * 0.2;
  } else {
    // Add fine granular highlights over a muted base color.
    let t = i.b.y;
    var c = mix(F.pebble.rgb, vec3f(0.78, 0.74, 0.86), step(0.33, t));
    c = mix(c, vec3f(0.7, 0.84, 0.76), step(0.66, t));
    c = mix(c, vec3f(0.95, 0.9, 0.82), step(0.85, t));
    c *= 0.9 + 0.12 * vnoise(i.d * 9.0 + vec3f(t * 13.0));
    col = c * (0.42 + 0.7 * ndl * light);
    let sp = floor(i.d * 90.0 + vec3f(t * 50.0));
    col += vec3f(step(0.97, hash31(sp))) * pow(max(dot(N, H), 0.0), 20.0) * 1.2 * light;
    col += vec3f(1.0) * pow(max(dot(N, H), 0.0), 30.0) * 0.12 * light;
  }
  return oout(col, i.wp);
}

// ── bubbles (seen through the water pass, so they pick up its colour) ──
@vertex fn vsBubble(v: VIn, @builtin(instance_index) ii: u32) -> SOut {
  let A = inst[ii];
  var o: SOut; o.lp = A.xyz + v.pos * A.w; o.wp = toWorld(o.lp); o.clip = F.viewProj * vec4f(o.wp, 1.0); o.n = dirToWorld(v.nrm); o.uv = vec2f(0.0);
  return o;
}
@fragment fn fsBubble(i: SOut) -> OOut {
  let N = normalize(i.n); let V = normalize(F.cam.xyz - i.wp); let L = F.sun.xyz;
  let nv = clamp(dot(N, V), 0.0, 1.0);
  let rim = pow(1.0 - nv, 1.6);
  var col = mix(F.waterTint.rgb * 0.7 + vec3f(0.25), vec3f(1.0, 1.0, 0.98), rim);
  col += vec3f(1.0) * pow(max(dot(N, normalize(L + V)), 0.0), 80.0) * 2.0;
  return oout(col, i.wp);
}

// ── shadow casters ──
@vertex fn vsShadowTerrain(v: VIn) -> @builtin(position) vec4f { return F.shadowVP * vec4f(toWorld(v.pos), 1.0); }
@vertex fn vsShadowPalm(v: PIn) -> @builtin(position) vec4f { return F.shadowVP * vec4f(toWorld(palmPos(v)), 1.0); }
@vertex fn vsShadowBody(v: VIn, @builtin(instance_index) ii: u32) -> @builtin(position) vec4f {
  let A = inst[ii * 4u]; let q = inst[ii * 4u + 1u]; let B = inst[ii * 4u + 2u];
  return F.shadowVP * vec4f(toWorld(A.xyz + qrot(q, bodyShape(v.pos, B.x, B.y) * A.w)), 1.0);
}

// ── caustics: refract a grid through the waves onto the sand; brightness = how much each triangle shrinks ──
struct CaOut { @builtin(position) clip: vec4f, @location(0) oldP: vec2f, @location(1) newP: vec2f, @location(2) att: vec3f, @location(3) wet: f32 };
@vertex fn vsCaustic(v: VIn) -> CaOut {
  let s = textureLoad(waterTex, vec2i(v.uv), 0);
  let level = F.water.x;
  let surf = level + s.x;
  let n = normalize(vec3f(-s.y, 1.0, -s.z));
  let Lin = -normalize(F.sunL.xyz);
  let r = refract(Lin, n, 0.75); let r0 = refract(Lin, vec3f(0.0, 1.0, 0.0), 0.75);
  let p = vec3f(v.pos.x, surf, v.pos.z);
  var t = max(surf - s.w, 0.001) / max(-r.y, 0.25);
  let hit0 = p + r * t;
  let T2 = wsample(hit0.xz).w;
  t = max(surf - T2, 0.001) / max(-r.y, 0.25);
  let hit = p + r * t;
  let t0 = max(level - s.w, 0.001) / max(-r0.y, 0.25);
  let old = v.pos.xz + r0.xz * t0;
  var o: CaOut;
  o.clip = vec4f(hit.x / F.water.z, -hit.z / F.water.z, 0.0, 1.0);
  o.oldP = old; o.newP = hit.xz;
  o.att = exp(-F.sigma.rgb * t);
  o.wet = select(0.0, 1.0, s.w < level - 0.006);
  return o;
}
@fragment fn fsCaustic(i: CaOut) -> @location(0) vec4f {
  let oa = length(dpdx(i.oldP)) * length(dpdy(i.oldP));
  let na = length(dpdx(i.newP)) * length(dpdy(i.newP));
  let k = clamp(oa / max(na, 1e-9), 0.0, 7.0);
  let w = select(0.0, 1.0, i.wet > 0.999);
  return vec4f(i.att * k * w, 1.0);
}

// ── the sea: surface and cut faces ──
struct WOut { @builtin(position) clip: vec4f, @location(0) wp: vec3f, @location(1) lp: vec3f, @location(2) n: vec3f, @location(3) top: f32, @location(4) @interpolate(flat) kind: f32 };
@vertex fn vsWaterSurf(v: VIn) -> WOut {
  let s = wsample(v.pos.xz);
  let lp = vec3f(v.pos.x, F.water.x + s.x, v.pos.z);
  var o: WOut; o.lp = lp; o.wp = toWorld(lp); o.clip = F.viewProj * vec4f(o.wp, 1.0);
  o.n = gelNormal(lp,normalize(vec3f(-s.y, 1.0, -s.z))); o.top = lp.y; o.kind = 0.0;
  return o;
}
@vertex fn vsWaterWall(v: VIn) -> WOut {
  let s = wsample(v.pos.xz);
  let top = F.water.x + s.x;
  let y = mix(min(v.pos.y,top),top,v.uv.x);
  let lp = vec3f(v.pos.x, y, v.pos.z);
  var o: WOut; o.lp = lp; o.wp = toWorld(lp); o.clip = F.viewProj * vec4f(o.wp, 1.0);
  o.n = gelNormal(lp,v.nrm); o.top = top; o.kind = 1.0;
  return o;
}
@fragment fn fsWaterBack(i: WOut) -> @location(0) vec4f {
  return vec4f(length(i.wp - F.cam.xyz), 0.0, 0.0, 1.0);
}
@fragment fn fsCopy(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(textureLoad(sceneTex, vec2i(pos.xy), 0).rgb, 1.0);
}
@vertex fn vsCopy(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u)) * 2.0 - 1.0;
  return vec4f(p, 0.0, 1.0);
}
@fragment fn fsWater(i: WOut) -> @location(0) vec4f {
  let px = vec2i(i.clip.xy);
  let res = F.res.xy;
  var N = normalize(i.n);
  if(i.kind < .5){
    // Small capillary waves break the broad reflection; simulated waves retain their shape.
    let p=i.lp.xz;let t=F.cam.w*F.misc.y;
    let amp=mix(.009,.020,F.misc.w);
    let wave=vec2f(
      cos(dot(p,vec2f(47.0,19.0))+t*1.5)+.46*cos(dot(p,vec2f(-31.0,71.0))-t*2.1),
      .54*cos(dot(p,vec2f(47.0,19.0))+t*1.5)+cos(dot(p,vec2f(-31.0,71.0))-t*2.1));
    N=normalize(N+(F.model*vec4f(wave.x,0.0,wave.y,0.0)).xyz*amp);
  }
  let V = normalize(F.cam.xyz - i.wp); let L = F.sun.xyz;
  let dist = length(F.cam.xyz - i.wp);
  let od = textureLoad(distTex, px, 0).r;
  let bd = textureLoad(backTex, px, 0).r;
  let path = clamp(min(od, bd) - dist, 0.0, 8.0);
  // refraction: look a little way along the bent ray, and fall back if that lands on something in front
  let rd = refract(-V, N, 1.0 / 1.333);
  let probe = i.wp + rd * clamp(path, 0.05, 0.9) * 0.7;
  let pc = F.viewProj * vec4f(probe, 1.0);
  var uv = vec2f(pc.x / pc.w * 0.5 + 0.5, 0.5 - pc.y / pc.w * 0.5);
  let uv0 = (vec2f(px) + 0.5) / res;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { uv = uv0; }
  let od2 = textureSampleLevel(distTex, lin, uv, 0.0).r;
  if (od2 < dist + 0.02) { uv = uv0; }
  let behind = textureSampleLevel(sceneTex, lin, uv, 0.0).rgb;
  // absorption along the path through the jelly, and the light it scatters back
  let sig = F.sigma.rgb;
  let T = exp(-sig * path);
  let depthBelow = max(i.top - i.lp.y, 0.0);
  let sunIn = exp(-sig * depthBelow * 0.8);
  let wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
  let amount = vec3f(1.0) - T;
  let ambientWater = mix(vec3f(.48,.65,.70),vec3f(.10,.23,.30),F.misc.z) * F.environment.x;
  var col = behind * T + F.waterTint.rgb * amount * (ambientWater + .40 * sunIn * wrap * F.sun.w) * F.waterTint.w;
  // shafts of light: the caustic pattern sampled through the depth along the view ray
  let Vl = normalize((F.invModel * vec4f(-V, 0.0)).xyz);
  var shaft = vec3f(0.0);
  let steps = 6;
  let sl = min(path, 2.0) / f32(steps);
  for (var k = 0; k < steps; k++) {
    let q = i.lp + Vl * sl * (f32(k) + 0.5);
    let c = causticAt(q);
    let d = max(F.water.x - q.y, 0.0);
    shaft += c * exp(-sig * (d * 0.5 + sl * (f32(k) + 0.5))) * sl;
  }
  col += shaft * F.waterTint.rgb * .075 * F.sun.w * (0.6 + 0.6 * pow(max(dot(-V, L), 0.0), 2.0));
  // reflection and glints
  let nv = clamp(dot(N, V), 0.0, 1.0);
  let fres = 0.0204 + 0.9796 * pow(1.0 - nv, 5.0);
  let refl = studio(reflect(-V, N), .75);
  col = mix(col, refl, fres);
  let normalVariance=dot(dpdx(N),dpdx(N))+dot(dpdy(N),dpdy(N));
  let rough=clamp(.085+sqrt(normalVariance)*.35,.085,.25);
  let sunColor=mix(vec3f(1.0,.94,.83),vec3f(1.0,.57,.28),F.misc.x);
  col += sunColor * dielectric(N,V,L,rough,.0204) * max(dot(N,L),0.0) * F.sun.w * .6;
  // the rim of the block, seen on the surface
  if (i.kind < 0.5) {
    let rimD = F.water.z - max(abs(i.lp.x), abs(i.lp.z));
    col = mix(col, refl, (1.0 - smoothstep(0.0, 0.007, rimD)) * 0.35);
  }
  // the cut edge: a thin bright meniscus where the face meets the surface, and soft corner lines
  if (i.kind > 0.5) {
    let men = 1.0 - smoothstep(0.0, 0.012, i.top - i.lp.y);
    col = mix(col, refl, men * 0.48);
    let corner = smoothstep(F.water.z - 0.008, F.water.z - 0.001, min(abs(i.lp.x), abs(i.lp.z)));
    col = mix(col, refl, corner * 0.22);
  }
  return vec4f(col, 1.0);
}
`;

const WGSL_COMPOSITE = /* wgsl */`
@group(0) @binding(0) var hdrTex: texture_2d<f32>;
@vertex fn vsFull(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u)) * 2.0 - 1.0;
  return vec4f(p, 0.0, 1.0);
}
fn shoulder(x: f32) -> f32 { return select(x, 0.8 + 0.2 * (1.0 - exp(-(x - 0.8) / 0.2)), x > 0.8); }
fn toSrgb(x: f32) -> f32 { return select(1.055 * pow(x, 1.0 / 2.4) - 0.055, 12.92 * x, x <= 0.0031308); }
@fragment fn fsComposite(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  var c = max(textureLoad(hdrTex, vec2i(pos.xy), 0).rgb, vec3f(0.0));
  c = vec3f(shoulder(c.r), shoulder(c.g), shoulder(c.b));
  let n = fract(sin(dot(pos.xy, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
  return vec4f(vec3f(toSrgb(c.r), toSrgb(c.g), toSrgb(c.b)) + n / 255.0, 1.0);
}
`;

// ───────────────────────────── WebGPU renderer ─────────────────────────────
const FRAME_FLOATS = 180, SHADOW_RES = 2048, CAUSTIC_RES = 512, MSAA = 4;
const GEN = [{ arrayStride: 32, attributes: [
  { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x2' }] }];
const PALM = [{ arrayStride: PALM_VERT * 4, attributes: [
  { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
  { shaderLocation: 2, offset: 24, format: 'float32x2' }, { shaderLocation: 3, offset: 32, format: 'float32x4' }] }];
const ADD = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };

function ortho(l, r, b, t, n, f) {
  const m = new Float32Array(16);
  m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = 1 / (n - f);
  m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = n / (n - f); m[15] = 1;
  return m;
}

class Renderer {
  static async create(canvas, world, onLost) {
    if (!navigator.gpu) throw new Error('nogpu');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('noadapter');
    const dev = await adapter.requestDevice();
    const r = new Renderer(canvas, dev, world, onLost);
    await r.checkShaders();
    return r;
  }
  constructor(canvas, dev, world, onLost) {
    this.canvas = canvas; this.dev = dev; this.world = world; this.lost = false;
    dev.addEventListener('uncapturederror', (e) => console.error('GPU error: ' + e.error.message));
    dev.lost.then((info) => { this.lost = true; if (info.reason !== 'destroyed' && onLost) onLost(info); });
    this.ctx = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device: dev, format: this.format, alphaMode: 'opaque' });
    this.size = [0, 0];
    this.frame = new Float32Array(FRAME_FLOATS);
    this.pal = null;
    const U = GPUBufferUsage, TU = GPUTextureUsage;
    const buf = (size, usage) => dev.createBuffer({ size: Math.max(16, Math.ceil(size / 16) * 16), usage });
    this.frameBuf = buf(FRAME_FLOATS * 4, U.UNIFORM | U.COPY_DST);
    this.bodyBuf = buf(BODY_CAP * INST_B * 4, U.STORAGE | U.COPY_DST);
    this.bubbleBuf = buf(BUBBLE_CAP * 16, U.STORAGE | U.COPY_DST);
    this.waterTex = dev.createTexture({ size: [GN, GN], format: 'rgba32float', usage: TU.TEXTURE_BINDING | TU.COPY_DST });
    this.causticTex = dev.createTexture({ size: [CAUSTIC_RES, CAUSTIC_RES], format: 'rgba16float', usage: TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING });
    this.shadowTex = dev.createTexture({ size: [SHADOW_RES, SHADOW_RES], format: 'depth32float', usage: TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING });
    this.dummy = {
      depth: dev.createTexture({ size: [1, 1], format: 'depth32float', usage: TU.TEXTURE_BINDING }).createView(),
      color: dev.createTexture({ size: [1, 1], format: 'rgba16float', usage: TU.TEXTURE_BINDING }).createView(),
      r32: dev.createTexture({ size: [1, 1], format: 'r32float', usage: TU.TEXTURE_BINDING }).createView(),
    };
    this.lin = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.cmp = dev.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    const mesh = (m) => {
      const vb = dev.createBuffer({ size: m.v.byteLength, usage: U.VERTEX | U.COPY_DST });
      dev.queue.writeBuffer(vb, 0, m.v);
      const ib = dev.createBuffer({ size: Math.ceil(m.i.byteLength / 4) * 4, usage: U.INDEX | U.COPY_DST });
      dev.queue.writeBuffer(ib, 0, m.i);
      return { vb, ib, count: m.i.length };
    };
    const P = world.palms;
    this.M = {
      terrain: mesh(buildTerrainMesh()), soil: mesh(buildSoilMesh()), surf: mesh(buildWaterMesh()), wall: mesh(buildWaterWallMesh()),
      caustic: mesh(buildCausticMesh()), body: mesh(buildIcosphere(3)), bubble: mesh(buildIcosphere(1)),
      palm: mesh({ v: P.vertices, i: P.indices }),
    };

    this.mod = dev.createShaderModule({ code: WGSL_COMMON + WGSL_SCENE, label: 'scene' });
    this.modComp = dev.createShaderModule({ code: WGSL_COMPOSITE, label: 'composite' });
    const S = GPUShaderStage, VF = S.VERTEX | S.FRAGMENT;
    this.bgl = dev.createBindGroupLayout({ entries: [
      { binding: 0, visibility: VF, buffer: { type: 'uniform' } },
      { binding: 1, visibility: VF, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: VF, texture: { sampleType: 'unfilterable-float' } },
      { binding: 3, visibility: VF, texture: { sampleType: 'float' } },
      { binding: 4, visibility: VF, sampler: { type: 'filtering' } },
      { binding: 5, visibility: VF, texture: { sampleType: 'depth' } },
      { binding: 6, visibility: VF, sampler: { type: 'comparison' } },
      { binding: 7, visibility: VF, texture: { sampleType: 'float' } },
      { binding: 8, visibility: VF, texture: { sampleType: 'float' } },
      { binding: 9, visibility: VF, texture: { sampleType: 'unfilterable-float' } }] });
    const layout = dev.createPipelineLayout({ bindGroupLayouts: [this.bgl] });
    const m = this.mod;
    const pipe = (o) => dev.createRenderPipeline({
      layout, vertex: { module: m, entryPoint: o.vs, buffers: o.buffers || [] },
      fragment: o.fs ? { module: m, entryPoint: o.fs, targets: o.targets } : undefined,
      primitive: { topology: 'triangle-list', cullMode: o.cull || 'none' },
      depthStencil: o.depth, multisample: { count: o.ms || 1 } });
    const shadowDepth = { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 3, depthBiasSlopeScale: 2.5 };
    const OPQ = [{ format: 'rgba16float' }, { format: 'rgba16float' }];
    const dW = { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' };
    const dR = { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' };
    const dA = { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' };
    this.pp = {
      sTerrain: pipe({ vs: 'vsShadowTerrain', buffers: GEN, depth: shadowDepth }),
      sPalm: pipe({ vs: 'vsShadowPalm', buffers: PALM, depth: shadowDepth }),
      sBody: pipe({ vs: 'vsShadowBody', buffers: GEN, depth: shadowDepth }),
      caustic: pipe({ vs: 'vsCaustic', fs: 'fsCaustic', buffers: GEN, targets: [{ format: 'rgba16float', blend: ADD }] }),
      backdrop: pipe({ vs: 'vsFull', fs: 'fsBackdrop', targets: OPQ, depth: dR, ms: MSAA }),
      terrain: pipe({ vs: 'vsTerrain', fs: 'fsTerrain', buffers: GEN, targets: OPQ, depth: dW, ms: MSAA }),
      soil: pipe({ vs: 'vsSoil', fs: 'fsSoil', buffers: GEN, targets: OPQ, depth: dW, ms: MSAA }),
      palm: pipe({ vs: 'vsPalm', fs: 'fsPalm', buffers: PALM, targets: OPQ, depth: dW, ms: MSAA }),
      body: pipe({ vs: 'vsBody', fs: 'fsBody', buffers: GEN, targets: OPQ, depth: dW, ms: MSAA }),
      bubble: pipe({ vs: 'vsBubble', fs: 'fsBubble', buffers: GEN, targets: OPQ, depth: dW, ms: MSAA }),
      backSurf: pipe({ vs: 'vsWaterSurf', fs: 'fsWaterBack', buffers: GEN, targets: [{ format: 'r32float' }], depth: dW, cull: 'front' }),
      backWall: pipe({ vs: 'vsWaterWall', fs: 'fsWaterBack', buffers: GEN, targets: [{ format: 'r32float' }], depth: dW, cull: 'front' }),
      copy: pipe({ vs: 'vsCopy', fs: 'fsCopy', targets: [{ format: 'rgba16float' }], depth: dA, ms: MSAA }),
      surf: pipe({ vs: 'vsWaterSurf', fs: 'fsWater', buffers: GEN, targets: [{ format: 'rgba16float' }], depth: dR, ms: MSAA, cull: 'back' }),
      wall: pipe({ vs: 'vsWaterWall', fs: 'fsWater', buffers: GEN, targets: [{ format: 'rgba16float' }], depth: dR, ms: MSAA, cull: 'back' }),
    };
    this.pp.comp = dev.createRenderPipeline({ layout: 'auto', vertex: { module: this.modComp, entryPoint: 'vsFull' },
      fragment: { module: this.modComp, entryPoint: 'fsComposite', targets: [{ format: this.format }] }, primitive: { topology: 'triangle-list' } });
    this.views = { caustic: this.causticTex.createView(), shadow: this.shadowTex.createView(), water: this.waterTex.createView() };
    // groups that do not depend on the canvas size
    this.bgShadow = this.group(this.bodyBuf, { shadow: this.dummy.depth });
    this.bgCaustic = this.group(this.bodyBuf, { caustic: this.dummy.color, shadow: this.dummy.depth });
    this.bgOpaqueBody = this.group(this.bodyBuf, {});
    this.bgOpaqueBubble = this.group(this.bubbleBuf, {});
  }
  group(instBuf, o) {
    const d = this.dummy;
    return this.dev.createBindGroup({ layout: this.bgl, entries: [
      { binding: 0, resource: { buffer: this.frameBuf } }, { binding: 1, resource: { buffer: instBuf } },
      { binding: 2, resource: this.views.water }, { binding: 3, resource: o.caustic || this.views.caustic }, { binding: 4, resource: this.lin },
      { binding: 5, resource: o.shadow || this.views.shadow }, { binding: 6, resource: this.cmp },
      { binding: 7, resource: o.scene || d.color }, { binding: 8, resource: o.dist || d.color }, { binding: 9, resource: o.back || d.r32 }] });
  }
  async checkShaders() {
    const errors = [];
    for (const mod of [this.mod, this.modComp]) {
      if (!mod.getCompilationInfo) continue;
      const info = await mod.getCompilationInfo();
      for (const msg of info.messages) if (msg.type === 'error') errors.push(mod.label + ' ' + msg.lineNum + ':' + msg.linePos + ' ' + msg.message);
    }
    if (errors.length) throw new Error('着色器编译失败：' + errors.join('\n'));
  }
  resize() {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = this.captureSize?.[0] || Math.max(1, Math.round(c.clientWidth * dpr));
    let h = this.captureSize?.[1] || Math.max(1, Math.round(c.clientHeight * dpr));
    const px = w * h, cap = 2.4e6;
    if (px > cap) { const k = Math.sqrt(cap / px); w = Math.round(w * k); h = Math.round(h * k); }
    if (w === this.size[0] && h === this.size[1]) return;
    this.size = [w, h]; c.width = w; c.height = h;
    const dev = this.dev, TU = GPUTextureUsage;
    for (const k of ['sceneMS', 'distMS', 'depthMS', 'scene', 'dist', 'back', 'backDepth', 'finalMS', 'final']) if (this[k]) this[k].destroy();
    const tex = (format, usage, sc = 1) => dev.createTexture({ size: [w, h], format, usage, sampleCount: sc });
    this.sceneMS = tex('rgba16float', TU.RENDER_ATTACHMENT, MSAA);
    this.distMS = tex('rgba16float', TU.RENDER_ATTACHMENT, MSAA);
    this.depthMS = tex('depth24plus', TU.RENDER_ATTACHMENT, MSAA);
    this.scene = tex('rgba16float', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
    this.dist = tex('rgba16float', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
    this.back = tex('r32float', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
    this.backDepth = tex('depth24plus', TU.RENDER_ATTACHMENT);
    this.finalMS = tex('rgba16float', TU.RENDER_ATTACHMENT, MSAA);
    this.final = tex('rgba16float', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
    const V = {};
    for (const k of ['sceneMS', 'distMS', 'depthMS', 'scene', 'dist', 'back', 'backDepth', 'finalMS', 'final']) V[k] = this[k].createView();
    this.V = V;
    this.bgBack = this.group(this.bodyBuf, {});
    this.bgWater = this.group(this.bodyBuf, { scene: V.scene, dist: V.dist, back: V.back });
    this.bgComp = dev.createBindGroup({ layout: this.pp.comp.getBindGroupLayout(0), entries: [{ binding: 0, resource: V.final }] });
  }
  setPalette(p) { this.pal = p; }
  fillFrame(view, time) {
    const f = this.frame, P = this.pal, W = this.world, B = W.block;
    const put = (o, a) => { for (let i = 0; i < a.length; i++) f[o + i] = a[i]; };
    f.set(view.vp, 0); f.set(view.ivp, 16); f.set(B.M, 32); f.set(B.Minv, 48);
    const weather = W.palms.weather;
    const L = v3.norm(weather === 'sunset' ? [-0.78, 0.46, 0.40] : [-0.50, 0.78, 0.38]);
    const cloud = W.palms.storm ? 1 : weather === 'raspberry' ? .82 : 0;
    const weatherSun = weather === 'lime' ? .24 : (weather === 'sunset' ? .84 : .92) * (1 - cloud * .48);
    const sunStrength = weatherSun * (.35 + W.light);
    const skyStrength = 1 + (W.light - .65) * .35;
    const absorption = 1.9 - W.clarity * 1.5;
    // the sun's shadow camera, centred on the block
    const c = [0, 1.0 + B.lift, 0], eye = v3.madd(c, L, 8);
    const sv = M4.lookAt(eye, c, Math.abs(L[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0]);
    this.shadowVP = M4.mul(ortho(-3.8, 3.8, -3.8, 3.8, 1, 16), sv);
    f.set(this.shadowVP, 64);
    put(80, [view.eye[0], view.eye[1], view.eye[2], time]);
    put(84, [L[0], L[1], L[2], sunStrength]);
    const Ll = B.dirToLocal(L);
    put(88, [Ll[0], Ll[1], Ll[2], cloud]);
    put(92, [this.size[0], this.size[1], 1 / this.size[0], 1 / this.size[1]]);
    put(96, [B.s[0], B.s[1], B.q, BLOCK_H]);
    put(100, [W.water.level, GDX, HALF, GN]);
    put(104, [P.sigma[0] * absorption, P.sigma[1] * absorption, P.sigma[2] * absorption, P.sigma[3]]);
    put(108, P.waterTint); put(112, P.sand); put(116, P.sandWet); put(120, P.leaf); put(124, P.trunk);
    put(128, P.s0); put(132, P.s1); put(136, P.s2); put(140, P.s3); put(144, P.s4);
    put(148, P.bgTop); put(152, P.bgBottom); put(156, P.coconut); put(160, P.pebble);
    for (const p of W.palms.list) put(164 + 4 * p.i, [p.b[0], p.b[1], p.h, 0]);
    put(164,[...B.gel,0]);put(168,[...B.gelAnchor,0]);
    put(172, [skyStrength, 0, 0, 0]);
    put(176, [W.palms.weather === 'sunset' ? 1 : 0, W.reduced ? 0 : 1, W.palms.weather === "lime" ? 1 : 0, W.palms.storm ? 1 : 0]);
  }
  render(view, time) {
    if (this.lost) return;
    const dev = this.dev, q = dev.queue, W = this.world, pp = this.pp, M = this.M;
    this.resize();
    this.fillFrame(view, time);
    q.writeBuffer(this.frameBuf, 0, this.frame);
    W.palms.update(W,time,W.frostDt||0);
    q.writeBuffer(M.palm.vb,0,W.palms.vertices);
    W.water.pack();
    q.writeTexture({ texture: this.waterTex }, W.water.tex, { bytesPerRow: GN * 16 }, [GN, GN]);
    const BD = W.bodies; BD.pack();
    if (BD.nInst) q.writeBuffer(this.bodyBuf, 0, BD.inst, 0, BD.nInst * INST_B);
    if (BD.nBinst) q.writeBuffer(this.bubbleBuf, 0, BD.binst, 0, BD.nBinst * 4);
    const enc = dev.createCommandEncoder();
    const draw = (p, m, n = 1) => { p.setVertexBuffer(0, m.vb); p.setIndexBuffer(m.ib, 'uint32'); p.drawIndexed(m.count, n); };
    // 1. sun shadow map
    {
      const p = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: this.views.shadow, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
      p.setBindGroup(0, this.bgShadow);
      p.setPipeline(pp.sTerrain); draw(p, M.terrain);
      p.setPipeline(pp.sPalm); draw(p, M.palm);
      if (BD.nInst) { p.setPipeline(pp.sBody); draw(p, M.body, BD.nInst); }
      p.end();
    }
    // 2. caustics on the sand
    {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: this.views.caustic, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }] });
      p.setBindGroup(0, this.bgCaustic); p.setPipeline(pp.caustic); draw(p, M.caustic);
      p.end();
    }
    const V = this.V;
    // 3. everything solid, with its distance from the eye
    {
      const p = enc.beginRenderPass({
        colorAttachments: [
          { view: V.sceneMS, resolveTarget: V.scene, clearValue: { r: 0.8, g: 0.78, b: 0.74, a: 1 }, loadOp: 'clear', storeOp: 'discard' },
          { view: V.distMS, resolveTarget: V.dist, clearValue: { r: 1e4, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'discard' }],
        depthStencilAttachment: { view: V.depthMS, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
      p.setBindGroup(0, this.bgOpaqueBody);
      p.setPipeline(pp.backdrop); p.draw(3);
      p.setPipeline(pp.terrain); draw(p, M.terrain);
      p.setPipeline(pp.soil); draw(p, M.soil);
      p.setPipeline(pp.palm); draw(p, M.palm);
      if (BD.nInst) { p.setPipeline(pp.body); draw(p, M.body, BD.nInst); }
      if (BD.nBinst) { p.setPipeline(pp.bubble); p.setBindGroup(0, this.bgOpaqueBubble); draw(p, M.bubble, BD.nBinst); }
      p.end();
    }
    // 4. where rays leave the sea
    {
      const p = enc.beginRenderPass({
        colorAttachments: [{ view: V.back, clearValue: { r: 1e4, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
        depthStencilAttachment: { view: V.backDepth, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } });
      p.setBindGroup(0, this.bgBack);
      p.setPipeline(pp.backSurf); draw(p, M.surf);
      p.setPipeline(pp.backWall); draw(p, M.wall);
      p.end();
    }
    // 5. the sea itself, over a copy of the solid scene
    {
      const p = enc.beginRenderPass({
        colorAttachments: [{ view: V.finalMS, resolveTarget: V.final, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'discard' }],
        depthStencilAttachment: { view: V.depthMS, depthLoadOp: 'load', depthStoreOp: 'discard' } });
      p.setBindGroup(0, this.bgWater);
      p.setPipeline(pp.copy); p.draw(3);
      p.setPipeline(pp.surf); draw(p, M.surf);
      p.setPipeline(pp.wall); draw(p, M.wall);
      p.end();
    }
    // 6. tone and dither to the canvas
    {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
      p.setPipeline(pp.comp); p.setBindGroup(0, this.bgComp); p.draw(3);
      p.end();
    }
    q.submit([enc.finish()]);
  }
}

// ───────────────────────────── flavours, camera, input, UI ─────────────────────────────
const PAPER=[.88,.935,.93,1],FLOOR=[.72,.82,.83,1];
const arctic={sigma:[.46,.19,.105,0],waterTint:[.075,.29,.32,1],
 sand:[.91,.955,.965,1],sandWet:[.53,.72,.74,1],leaf:[.8,.91,.96,1],trunk:[.5,.67,.75,1],
 s0:[.80,.90,.92,1],s1:[.57,.76,.79,1],s2:[.65,.80,.82,1],s3:[.40,.62,.68,1],s4:[.30,.49,.55,1],
 coconut:[.64,.84,.91,1],pebble:[.83,.91,.95,1],bgTop:PAPER,bgBottom:FLOOR};
const PALETTES={
 lagoon:{...arctic},
 raspberry:{...arctic,bgTop:[.49,.60,.65,1],bgBottom:[.51,.63,.66,1]},
 lime:{...arctic,bgTop:[.009,.020,.037,1],bgBottom:[.018,.035,.047,1],waterTint:[.035,.18,.21,1],sand:[.81,.90,.95,1]},
 sunset:{...arctic,bgTop:[.88,.67,.51,1],bgBottom:[.60,.55,.53,1],waterTint:[.12,.27,.29,1],sand:[.94,.94,.90,1],sandWet:[.56,.68,.68,1]},
};

const FOVY = 34 * Math.PI / 180;
const CAM0 = { az: 0.58, el: 0.48, dist: 10.4 };
const TARGET = [0, 0.82, 0];
const cam = { az: CAM0.az, el: CAM0.el, dist: CAM0.dist, target: TARGET.slice() };
const view = { w: 1, h: 1, eye: [0, 0, 0], vp: null, ivp: null, fwd: [0, 0, -1], sheet: 0, sheetFrac: 0, shiftX: 0 };
const layout = { left: 0, right: 0 };

function fitDist() {
  const a = view.w / Math.max(1, view.h);
  if (layout.right <= layout.left) return clamp(CAM0.dist * Math.min(3.5, 1.16 / Math.max(a, 0.1)), CAM0.dist, 34);
  const aw = (layout.right - layout.left) * 0.92;
  return clamp(Math.max(CAM0.dist, 6.15 * view.h / (2 * Math.tan(FOVY / 2) * aw)), CAM0.dist, 34);
}
function updateCamera(canvas, width = canvas.clientWidth, height = canvas.clientHeight) {
  view.w = width || 1; view.h = height || 1;
  const open = view.sheet * view.sheetFrac;
  const dist = cam.dist * (1 + 0.95 * open);
  const ce = Math.cos(cam.el);
  const eye = [cam.target[0] + dist * ce * Math.sin(cam.az), cam.target[1] + dist * Math.sin(cam.el), cam.target[2] + dist * ce * Math.cos(cam.az)];
  const v = M4.lookAt(eye, cam.target, [0, 1, 0]);
  const p = M4.perspective(FOVY, view.w / view.h, 0.2, 60);
  if (open > 1e-3) { const s = open * 0.85; for (let c = 0; c < 4; c++) p[c * 4 + 1] += s * p[c * 4 + 3]; }
  if (view.shiftX) for (let c = 0; c < 4; c++) p[c * 4] += view.shiftX * p[c * 4 + 3];
  view.eye = eye; view.vp = M4.mul(p, v); view.ivp = M4.invert(view.vp);
  view.fwd = v3.norm(v3.sub(cam.target, eye));
}
function screenRay(px, py) {
  const nx = px / view.w * 2 - 1, ny = 1 - py / view.h * 2;
  const a = M4.apply(view.ivp, [nx, ny, 0, 1]), b = M4.apply(view.ivp, [nx, ny, 1, 1]);
  const A = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], B = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
  return { o: view.eye.slice(), d: v3.norm(v3.sub(B, A)) };
}
function planeHit(ray, p0) {
  const dn = v3.dot(ray.d, view.fwd);
  if (Math.abs(dn) < 1e-4) return p0.slice();
  return v3.madd(ray.o, ray.d, v3.dot(v3.sub(p0, ray.o), view.fwd) / dn);
}
// ray (block-local) against the block's box; returns entry/exit distances and the entry face
function boxHit(o, d, top) {
  let t0 = 0, t1 = 1e9, face = -1;
  const lo = [-HALF, 0, -HALF], hi = [HALF, top, HALF];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) return null; continue; }
    let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k];
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) { t0 = a; face = k; }
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return { t0, t1, face };
}

// what is under the pointer
function pickAt(px, py, W) {
  const ray = screenRay(px, py), B = W.block;
  const o = B.toLocal(ray.o), d = B.dirToLocal(ray.d);
  const bh = W.bodies.pick(o, d);
  // Test ray intersections against bounding spheres sampled along each column-shaped support.
  let palm = null;
  for (const p of W.palms.list) {
    const top = W.palms.deform(p, p.top, 1, [0, 0, 0]);
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, c = W.palms.deform(p, W.palms.trunkPoint(p, t), t * t, [0, 0, 0]);
      const rad = k === 6 ? 0.2 : 0.07;
      const oc = v3.sub(o, c), b = v3.dot(oc, d), disc = b * b - (v3.dot(oc, oc) - rad * rad);
      if (disc < 0) continue;
      const tt = -b - Math.sqrt(disc);
      if (tt > 0 && (!palm || tt < palm.t)) palm = { p, t: tt, top };
    }
  }
  // the sea's surface, if the ray comes in through the top before meeting sand
  let water = null;
  const L = W.water.level;
  const box = boxHit(o, d, L + 0.25);
  if (box && d[1] < -1e-4) {
    let t = (L - o[1]) / d[1];
    for (let k = 0; k < 3; k++) { const q = v3.madd(o, d, t); t = (W.water.surfaceY(q[0], q[2]) - o[1]) / d[1]; }
    const q = v3.madd(o, d, t);
    if (Math.abs(q[0]) < HALF && Math.abs(q[2]) < HALF && t > 0) {
      // is there sand in the way first?
      let blocked = false;
      for (let s = 0; s < 48; s++) {
        const tt = box.t0 + (t - box.t0) * s / 48, r = v3.madd(o, d, tt);
        if (r[1] < terrainH(r[0], r[2])) { blocked = true; break; }
      }
      if (!blocked && terrainH(q[0], q[2]) < L - 0.01 && box.face === 1) water = { t, q };   // only through the top: the sides tip the block
    }
  }
  const cands = [];
  const boat=W.palms.boat,bc=[boat.x,W.water.surfaceY(boat.x,boat.z)+.04,boat.z];
  const bo=v3.sub(o,bc),bd=v3.dot(bo,d),disc=bd*bd-v3.dot(bo,bo)+.17*.17;
  if(disc>=0){const bt=-bd-Math.sqrt(disc);if(bt>0)cands.push({kind:'boat',t:bt,hit:{q:bc}});}
  // Favor rigid bodies overlapping a support unless they lie clearly behind it.
  if (bh) cands.push({ kind: 'body', t: bh.t - (palm && bh.t < palm.t + 0.4 ? 1 : 0.03), hit: bh });
  if (palm) cands.push({ kind: 'palm', t: palm.t, hit: palm });
  if (water) cands.push({ kind: 'water', t: water.t, hit: water });
  cands.sort((a, b) => a.t - b.t);
  if (cands.length) return { ...cands[0], ray, o, d };
  const solid = boxHit(o, d, Math.max(L, 1.8));
  if(solid){
    const q=v3.madd(o,d,solid.t0);
    if(solid.face!==1&&q[1]<terrainH(q[0],q[2])+.025)
      return {kind:'gel',t:solid.t0,hit:{q},ray,o,d};
    return {kind:'block',t:solid.t0,ray,o,d};
  }
  return { kind: 'none', ray, o, d };
}

// ───────────────────────────── boot ─────────────────────────────
(async function main() {
  const $ = (id) => document.getElementById(id);
  const canvas = $('stage');
  const st = { paused: false, palette: 'lagoon', drag: null, pointers: new Map(), pinch: null, zoom: 1, frames: 0 };
  const showFallback = (msg, interrupted = false) => {
    if (msg) $('fallbackText').textContent = msg;
    document.body.classList.add('scene-error');
    document.body.classList.remove('scene-ready');
    canvas.inert = true;
    $('panel').inert = true;
    document.querySelector('.bottom-bar').inert = true;
    const help = $('helpPopover');
    if (help.matches(':popover-open')) help.hidePopover();
    $('fallback').classList.add('show');
    $('dot').className = 'off'; $('statusText').textContent = interrupted ? '场景已中断' : '场景无法启动';
    window.dispatchEvent(new CustomEvent('scene:error', { detail: { message: $('fallbackText').textContent } }));
    $('fallbackTitle').focus({ preventScroll: true });
  };
  const world = new World();
  world.wind = .18;
  world.clarity = .6;
  world.light = .65;
  world.windClock = 0;
  const rm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  world.reduced = !!(rm && rm.matches);
  if (rm && rm.addEventListener) rm.addEventListener('change', () => { world.reduced = rm.matches; });
  let rd;
  try {
    rd = await Renderer.create(canvas, world, () => showFallback('图形设备的连接中断了。请重新加载页面，让小岛再次浮现。', true));
  } catch (e) {
    showFallback();
    console.error('Scene initialization failed:', e);
    return;
  }
  if (rd.lost) return;
  rd.setPalette(PALETTES.lagoon);

  // ── controls ──
  const getState = () => ({
    palette: st.palette, paused: st.paused, storm: world.palms.storm,
    tide: +$('tide').value, energy: world.water.energy,
    seal: world.palms.seal.mode, capsized: world.palms.boat.capsized,
    wind: world.wind, clarity: world.clarity, light: world.light,
  });
  const changed = () => window.dispatchEvent(new CustomEvent('scene:change', { detail: getState() }));
  const setPalette = (name) => {
    if (!PALETTES[name]) return;
    st.palette = name;
    rd.setPalette(PALETTES[name]);
    world.palms.weather = name;
    document.body.classList.toggle('night', name === 'lime');
    document.body.classList.toggle('sunset', name === 'sunset');
    document.body.dataset.weather = name;
    document.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.palette === name)));
    changed();
  };
  document.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => setPalette(b.dataset.palette)));
  const slider = (id, fn, fmt) => {
    const el = $(id), out = $(id + 'Out');
    const apply = () => {
      out.textContent = fmt ? fmt(+el.value) : el.value;
      if (fmt) el.setAttribute('aria-valuetext', out.textContent);
      fn(+el.value);
      changed();
    };
    el.addEventListener('input', apply); apply();
  };
  slider('firm', (v) => world.setFirm(v / 100));
  slider('damp', (v) => world.setDamp(v / 100));
  slider('tide', (v) => world.setTide(v / 100 * 0.1), (v) => (v > 0 ? '+' : '') + Math.round(v / 10) + ' 厘米');
  slider('wind', (v) => { world.wind = v / 100; });
  slider('clarity', (v) => { world.clarity = v / 100; });
  slider('light', (v) => { world.light = v / 100; });
  const setTide = (value) => {
    if (!Number.isFinite(value)) return;
    $('tide').value = clamp(value, -100, 100);
    $('tide').dispatchEvent(new Event('input', { bubbles: true }));
  };
  let meterT = 0;
  const callWhale = () => {
    if (st.paused) setPause(false);
    world.palms.whaleCall = 8;
    meterT = .3;
    window.dispatchEvent(new CustomEvent('scene:whale'));
  };
  const setStorm = (on) => {
    if (on && st.paused) setPause(false);
    world.palms.storm = Boolean(on);
    $('dropCoconut').textContent = on ? '停雪' : '风雪';
    $('dropCoconut').setAttribute('aria-pressed', String(Boolean(on)));
    changed();
  };
  const ripple = () => {
    if (st.paused) setPause(false);
    world.water.stir(.85, 1.12, 2.4);
    world.water.stir(-.65, 1.30, 1.6);
  };
  $('dropPebble').addEventListener('click',callWhale);
  $('dropCoconut').addEventListener('click', () => setStorm(!world.palms.storm));
  canvas.addEventListener('dblclick',callWhale);
  const reset = () => {
    endDrag();
    world.reset();
    world.stormClock = 0;
    world.windClock = 0;
    setStorm(false);
    setPause(false);
    setTide(0);
    for (const [id, value] of [['firm', 50], ['damp', 30], ['wind', 18], ['clarity', 60], ['light', 65]]) {
      $(id).value = value;
      $(id).dispatchEvent(new Event('input', { bubbles: true }));
    }
    setPalette('lagoon');
    meterT = 0;
  };
  $('reset').addEventListener('click', reset);
  const setPause = (on) => {
    st.paused = on;
    if (on) endDrag();
    $('pause').setAttribute('aria-pressed', String(on)); $('pause').textContent = on ? '继续' : '暂停';
    $('dot').className = on ? 'paused' : ''; $('statusText').textContent = on ? '时间暂歇' : '海湾已苏醒';
    changed();
  };
  $('pause').addEventListener('click', () => setPause(!st.paused));
  const resetView = () => { cam.az = CAM0.az; cam.el = CAM0.el; cam.target = TARGET.slice(); cam.dist = fitDist(); st.zoom = 1; };
  $('resetView').addEventListener('click', resetView);
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || rd.lost || document.querySelector('dialog[open], :popover-open')) return;
    if (e.target?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
    if (e.code === 'Space') { e.preventDefault(); callWhale(); }
    if (e.target === canvas) {
      const arrows = { ArrowLeft: [-.12, 0], ArrowRight: [.12, 0], ArrowUp: [0, .08], ArrowDown: [0, -.08] };
      if (arrows[e.code]) {
        e.preventDefault();
        cam.az += arrows[e.code][0];
        cam.el = clamp(cam.el + arrows[e.code][1], .02, 1.3);
      }
      if (e.key.toLowerCase() === 'w') ripple();
      if (e.key.toLowerCase() === 'p') setPause(!st.paused);
      if (e.key.toLowerCase() === 'r') resetView();
      if (e.key === '+' || e.key === '-' || e.key === '=') {
        e.preventDefault();
        cam.dist = clamp(cam.dist * (e.key === '-' ? 1.1 : .9), 3.2, 36);
        st.zoom = cam.dist / fitDist();
      }
    }
  });
  const panel = $('panel'), bar = $('sheetbar');
  const mobileQuery = window.matchMedia('(max-width: 900px)');
  const mobile = () => mobileQuery.matches;
  const syncPanel = () => {
    const collapsed = mobile() && !panel.classList.contains('open');
    if (collapsed && $('panelContent').contains(document.activeElement)) bar.focus();
    $('panelContent').inert = collapsed;
  };
  const setPanelOpen = (open) => {
    panel.classList.toggle('open', open); document.body.classList.toggle('sheet-open', open);
    bar.setAttribute('aria-expanded', String(open));
    syncPanel();
  };
  bar.addEventListener('click', () => setPanelOpen(!panel.classList.contains('open')));
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || rd.lost || document.querySelector('dialog[open], :popover-open')) return;
    if (event.key === 'Escape' && mobile() && panel.classList.contains('open')) {
      setPanelOpen(false);
      bar.focus();
    }
  });
  mobileQuery.addEventListener('change', syncPanel);
  syncPanel();

  // ── pointer interaction ──
  const rel = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const hist = [];
  function endDrag() {
    const d = st.drag;
    if (!d) return;
    if (d.kind === 'body') {
      let vel = null;
      const now = performance.now();
      while (hist.length > 2 && now - hist[0].t > 110) hist.shift();
      if (hist.length >= 2) {
        const a = hist[0], b = hist[hist.length - 1], dt = (b.t - a.t) / 1000;
        if (dt > 0.008) vel = v3.scale(v3.sub(b.p, a.p), 1 / dt);
      }
      world.bodies.release(vel);
    } else if (d.kind === 'palm') d.p.hold = null;
    else if(d.kind==='gel'){
      world.block.gelHold=null;
      world.block.kick(world.block.gelV[0]*.2,world.block.gelV[2]*.2,Math.abs(world.block.gelV[1])*.15);
      world.water.stir(clamp(d.anchor[0],-1.4,1.4),clamp(d.anchor[2],-1.4,1.4),.8);
    }
    else if (d.kind === 'block') world.block.hold = null;
    world.palms.boat.held=false;st.drag = null; hist.length = 0;
    canvas.classList.remove('is-grabbing');
  }
  function beginDrag(e, x, y) {
    if (e.button === 2) { st.drag = { kind: 'orbit', x, y }; return; }
    const pk = pickAt(x, y, world);
    const B = world.block;
    if (st.paused && pk.kind !== 'none') { st.drag = { kind: 'orbit', x, y }; return; }
    if(pk.kind==='boat'){st.drag={kind:'boat'};world.palms.boat.held=true;} else if (pk.kind === 'body') {
      const b = pk.hit.b, wc = B.toWorld(b.x);
      st.drag = { kind: 'body', b, plane: wc };
      world.bodies.grab(b, b.x);
      hist.length = 0; hist.push({ t: performance.now(), p: b.x.slice() });
    } else if (pk.kind === 'palm') {
      const p = pk.hit.p;
      st.drag = { kind: 'palm', p, plane: B.toWorld(p.top) };
      p.hold = [p.b[0], p.b[1]];
    } else if (pk.kind === 'water') {
      st.drag = { kind: 'water', last: pk.hit.q, lt: performance.now() };
      world.water.stir(pk.hit.q[0], pk.hit.q[2], 1.0);
    } else if(pk.kind==='gel'){
      const anchor=pk.hit.q.slice();
      if(Math.hypot(...B.gel)<.025)B.gelAnchor=anchor.slice();
      st.drag={kind:'gel',anchor,plane:B.toWorld(anchor),initial:B.gel.slice()};
      B.gelHold=B.gel.slice();
    } else if (pk.kind === 'block') {
      st.drag = { kind: 'block', x, y, t0: B.t.slice() };
      B.hold = B.t.slice();
    } else st.drag = { kind: 'orbit', x, y };
    canvas.classList.add('is-grabbing');
  }
  function moveDrag(x, y) {
    const d = st.drag, B = world.block;
    if (!d) return;
    if (d.kind === 'orbit') {
      cam.az -= (x - d.x) * 0.0062; cam.el = clamp(cam.el + (y - d.y) * 0.0048, 0.02, 1.3);
      d.x = x; d.y = y;
      return;
    }
    const ray = screenRay(x, y);
    if(d.kind==='gel'){
      const hit=B.toLocal(planeHit(ray,d.plane));
      B.gelHold=hit.map((v,a)=>clamp(d.initial[a]+(v-d.anchor[a])*1.25,a===1?-.12:-.30,a===1?.14:.30));
      return;
    }
    if(d.kind==='boat'){
      const o=B.toLocal(ray.o),dir=B.dirToLocal(ray.d);
      if(dir[1]<-.0001){const t=(world.water.level-o[1])/dir[1],q=v3.madd(o,dir,t);
        const x=clamp(q[0],-HALF+.25,HALF-.25),z=clamp(q[2],-HALF+.25,HALF-.25);
        if(terrainH(x,z)<world.water.level-.07){const boat=world.palms.boat;world.water.stir(x,z,1.4);boat.x=x;boat.z=z;}
      }return;
    }
    if (d.kind === 'body') {
      const hp = B.toLocal(planeHit(ray, d.plane));
      const b = d.b, r = b.r;
      hp[0] = clamp(hp[0], -HALF + r, HALF - r); hp[2] = clamp(hp[2], -HALF + r, HALF - r);
      hp[1] = Math.max(hp[1], terrainH(hp[0], hp[2]) + r);
      if (world.bodies.hold) world.bodies.hold.target = hp;
      hist.push({ t: performance.now(), p: hp.slice() });
      if (hist.length > 24) hist.shift();
    } else if (d.kind === 'palm') {
      const hp = B.toLocal(planeHit(ray, d.plane));
      const p = d.p, lim = 0.42 * p.h;
      let bx = hp[0] - p.top[0], bz = hp[2] - p.top[2];
      const l = Math.hypot(bx, bz); if (l > lim) { bx *= lim / l; bz *= lim / l; }
      p.hold = [bx, bz];
    } else if (d.kind === 'water') {
      const o = B.toLocal(ray.o), dir = B.dirToLocal(ray.d);
      if (dir[1] >= -1e-4) return;
      const L = world.water.level;
      const t = (L - o[1]) / dir[1], q = v3.madd(o, dir, t);
      if (Math.abs(q[0]) > HALF || Math.abs(q[2]) > HALF) { d.last = null; return; }
      const now = performance.now(), dt = Math.max(1, now - d.lt) / 1000;
      if (d.last) {
        const len = Math.hypot(q[0] - d.last[0], q[2] - d.last[2]);
        const sp = len / dt, n = Math.min(12, Math.ceil(len / 0.035));
        for (let k = 1; k <= n; k++) {
          const px = lerp(d.last[0], q[0], k / n), pz = lerp(d.last[2], q[2], k / n);
          if (terrainH(px, pz) < L - 0.01) world.water.stir(px, pz, sp);
        }
      }
      d.last = q; d.lt = now;
    } else if (d.kind === 'block') {
      // pull the top towards where the pointer goes: sideways → tip right/left, down → tip towards you
      const r = v3.norm(v3.cross(view.fwd, [0, 1, 0])), f = v3.norm([view.fwd[0], 0, view.fwd[2]]);
      const k = 0.0038, dx = (x - d.x) * k, dy = (y - d.y) * k;
      let tx = d.t0[1] + r[0] * dx - f[0] * dy, tz = d.t0[0] + r[2] * dx - f[2] * dy;
      const l = Math.hypot(tx, tz); if (l > TILT_MAX) { tx *= TILT_MAX / l; tz *= TILT_MAX / l; }
      B.hold = [tz, tx];
    }
  }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = rel(e);
    st.pointers.set(e.pointerId, [x, y]);
    if (st.pointers.size === 2) {
      endDrag();
      const [a, b] = [...st.pointers.values()];
      st.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), dist: cam.dist, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
      return;
    }
    if (st.pointers.size > 2) return;
    beginDrag(e, x, y);
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = rel(e);
    if (st.pointers.has(e.pointerId)) st.pointers.set(e.pointerId, [x, y]);
    if (st.pinch && st.pointers.size >= 2) {
      const [a, b] = [...st.pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      cam.dist = clamp(st.pinch.dist * st.pinch.d / Math.max(d, 1), 3.2, 36); st.zoom = cam.dist / fitDist();
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      cam.az -= (mx - st.pinch.mx) * 0.004; cam.el = clamp(cam.el + (my - st.pinch.my) * 0.003, 0.02, 1.3);
      st.pinch.mx = mx; st.pinch.my = my;
      return;
    }
    if (st.drag) { moveDrag(x, y); return; }
    if (e.pointerType === 'mouse') hover(x, y);
  });
  const up = (e) => {
    st.pointers.delete(e.pointerId);
    if (st.pinch) { if (st.pointers.size < 2) st.pinch = null; return; }
    endDrag();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);
  window.addEventListener('blur', () => { endDrag(); st.pointers.clear(); st.pinch = null; });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !st.drag) canvas.classList.remove('is-pick', 'is-water', 'is-tilt'); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0011), 3.2, 36); st.zoom = cam.dist / fitDist();
  }, { passive: false });
  let hoverAt=0;
  function hover(x,y){
    const now=performance.now();if(now-hoverAt<30)return;hoverAt=now;
    const pk=pickAt(x,y,world),k=pk.kind;
    canvas.classList.toggle('is-pick',k==='body'||k==='boat'||k==='gel');canvas.classList.toggle('is-water',k==='water');canvas.classList.toggle('is-tilt',k==='block');
  }

  // ── loop ──
  const ui = { afloat: $('nAfloat'), sunk: $('nSunk'), ashore: $('nAshore'), meter: $('meter') };
  let last = performance.now(), uiAt = 0, time = 0;
  resetView();
  function frame(now) {
    if (rd.lost) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    world.frostDt=st.paused?0:dt;
    if (!st.paused) {
      // Wind raises small waves along one side of the bay; the water simulation propagates them and moves the floes and boat.
      world.windClock += dt;
      if (world.windClock > .14 && world.wind > 0) {
        world.windClock = 0;
        world.water.stir(-2.03, Math.sin(time * .63) * 1.72, world.wind ** 2 * 1.1);
      }
      if(world.palms.storm||world.palms.weather==='raspberry'){
        world.stormClock=(world.stormClock||0)+dt;
        if(world.stormClock>.055){world.stormClock=0;const x=Math.sin(time*2.3)*1.35,z=Math.cos(time*1.7)*1.35;world.water.stir(x,z,world.palms.storm?3:.65);}
      }
      world.advance(dt); time += dt;
      if (world.bad()) { console.warn('simulation reset after an invalid state'); world.reset(); }
    }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const previousFit = fitDist();
    const panelRect = panel.getBoundingClientRect();
    const side = getComputedStyle(panel).getPropertyValue('--panel-placement').trim() === 'side';
    const want = !side && mobile() && panel.classList.contains('open') ? 1 : 0;
    view.sheet += (want - view.sheet) * Math.min(1, dt * 9 + 0.02);
    view.sheetFrac = !side && mobile() ? clamp(panelRect.height / Math.max(1, h), 0, 0.7) : 0;

    // Reserve the visible side panel, including its opening transition, without moving the scene upward.
    const sideOpen = side ? (mobile() ? clamp((h - panelRect.top - bar.offsetHeight) / Math.max(1, panelRect.height - bar.offsetHeight), 0, 1) : 1) : 0;
    if (sideOpen > 0) {
      layout.left = 32 * sideOpen;
      layout.right = lerp(w, panelRect.left - 20, sideOpen);
      view.shiftX = ((layout.left + layout.right) / 2 - w / 2) * 2 / Math.max(1, w);
    } else { view.shiftX = 0; layout.left = 0; layout.right = 0; }
    view.w = w; view.h = h;
    const nextFit = fitDist();
    if (nextFit !== previousFit) cam.dist = clamp(nextFit * st.zoom, 3.2, 36);
    updateCamera(canvas);
    rd.render(view, time);
    meterT = Math.max(0, meterT - dt * 0.8);
    if (now - uiAt > 120) {
      uiAt = now;
      const seal=world.palms.seal,boat=world.palms.boat;
      const reaction='海豹 · '+({raft:'打盹',slip:'滑落',fall:'入水',swim:'游泳'}[seal.mode])+'　小船 · '+(boat.capsized?'翻船':'漂浮');
      if($('seaReactions').textContent!==reaction)$('seaReactions').textContent=reaction;
      const s = world.bodies.tally();
      ui.afloat.textContent = s.afloat; ui.sunk.textContent = s.sunk; ui.ashore.textContent = s.ashore;
      // the meter shows how lively the sea is
      const e = clamp(Math.sqrt(world.water.energy) * 0.9, 0, 1);
      ui.meter.style.width = Math.round(Math.max(e, meterT) * 100) + '%';
    }
    st.frames++;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /**
   * Compose a separate photo frame. Render and copy in the same task before WebGPU clears the presented canvas.
   * Temporary output dimensions leave CSS layout intact; restore the camera, panel offset and render size after copying.
   */
  const capture = async () => {
    if (rd.lost) throw new Error('图形设备已断开，请重新加载后拍摄。');
    const photo = document.createElement('canvas');
    photo.width = 1687;
    photo.height = 900;
    const context = photo.getContext('2d');
    if (!context) throw new Error('浏览器未能创建照片画布。');
    const savedView = { ...view }, savedDistance = cam.dist, savedDt = world.frostDt;
    try {
      cam.dist = clamp(CAM0.dist * savedDistance / fitDist(), 5, 20);
      view.shiftX = 0;
      view.sheet = 0;
      rd.captureSize = [photo.width, photo.height];
      world.frostDt = 0;
      updateCamera(canvas, photo.width, photo.height);
      rd.render(view, time);
      context.drawImage(canvas, 0, 0, photo.width, photo.height);
    } finally {
      rd.captureSize = null;
      cam.dist = savedDistance;
      Object.assign(view, savedView);
      updateCamera(canvas);
      rd.render(view, time);
      world.frostDt = savedDt;
    }
    return photo;
  };

  // UI controls use semantic scene operations without directly changing physics objects or GPU state.
  window.scene = Object.freeze({
    get ready() { return !rd.lost; },
    getState, setPalette, setPause, setStorm, setTide,
    callWhale, ripple, reset, resetView, capture,
  });
  document.body.classList.add('scene-ready');
  canvas.inert = false;
  panel.inert = false;
  syncPanel();
  $('statusText').textContent = '海湾已苏醒';
  window.dispatchEvent(new CustomEvent('scene:ready'));
})();
