// Route 66 repair-cost figure: a crossover SUV with its near-side doors and
// fenders cut away, built with the Anatomy kit (figures/kit, MIT).
//
//   node figures/suv/build.mjs            writes dist/repair-suv.svg and the CSS module
//   node figures/suv/build.mjs --preview  also writes a standalone light preview page
//   node figures/suv/build.mjs --audit    runs the kit's geometry audit
//
// World units are centimetres: x across the car (near side negative), y from the
// rear bumper (0) to the front bumper (460), z up from the ground.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as A from '../kit/audit.mjs';
import * as k from '../kit/iso-kit.mjs';
import * as G from '../kit/lathe.mjs';
import { tubePieces, tubeSvg } from '../kit/tube.mjs';
import * as SH from './shell.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PREVIEW = process.argv.includes('--preview');

const W = 960;
const H = 540;
const AZIMUTH = 143;
const ELEVATION = 30;

const P = k.fitProjection(k.boxCorners({ x: -94, y: -2, w: 188, d: 466, r: 0 }, 0, 168), W, H, {
  pad: 10,
  azimuth: AZIMUTH,
  elevation: ELEVATION,
});
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- recorder

const R = A.recorder(P);
const record = R.solid;
function put(name, ref, svg, shapes = [], { bias = 0, sys, ...rest } = {}) {
  return R.put({ name, at: ref, bias, svg, shapes, piece: 'car', sys, ...rest });
}

// ---------------------------------------------------------------- prisms of any outline (from the arcade cabinet)

const signed = (poly) =>
  poly.reduce((a, [x, y], i) => {
    const [x2, y2] = poly[(i + 1) % poly.length];
    return a + x * y2 - x2 * y;
  }, 0);
const screenOriented = (pts) => (signed(pts) < 0 ? [...pts].reverse() : pts);
function runsOf(flags, want) {
  const count = flags.length;
  const runs = [];
  const start = flags.findIndex((flag, index) => flag !== flags[(index + count - 1) % count]);
  if (start < 0) return flags[0] === want ? [Array.from({ length: count + 1 }, (_, index) => index % count)] : [];
  let run = null;
  for (let step = 0; step < count; step++) {
    const index = (start + step) % count;
    if (flags[index] === want) {
      if (!run) run = [index];
      run.push((index + 1) % count);
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);
  return runs;
}
function prismPaths(F, poly, s0, s1) {
  const ring = signed(poly) > 0 ? poly : [...poly].reverse();
  const n = ring.length;
  const W3 = (s, [x, y]) => [
    F.o[0] + F.a[0] * s + F.u[0] * x + F.v[0] * y,
    F.o[1] + F.a[1] * s + F.u[1] * x + F.v[1] * y,
    F.o[2] + F.a[2] * s + F.u[2] * x + F.v[2] * y,
  ];
  const capNear = G.dot3(F.a, V) > 0;
  const [nearS, farS] = capNear ? [s1, s0] : [s0, s1];
  const near = ring.map((p) => at(W3(nearS, p)));
  const far = ring.map((p) => at(W3(farS, p)));
  const normals = ring.map(([x0, y0], i) => {
    const [x1, y1] = ring[(i + 1) % n];
    return G.unit3(G.add3(G.mul3(F.u, y1 - y0), G.mul3(F.v, -(x1 - x0))));
  });
  const facing = normals.map((m) => G.dot3(m, V) > 1e-9);
  const outline = [];
  const crease = [];
  for (const run of runsOf(facing, false)) outline.push(k.pathOf(run.map((i) => near[i])));
  for (const run of runsOf(facing, true)) {
    crease.push(k.pathOf(run.map((i) => near[i])));
    outline.push(k.pathOf(run.map((i) => far[i])));
  }
  for (let i = 0; i < n; i++) if (facing[(i + n - 1) % n] !== facing[i]) outline.push(k.pathOf([near[i], far[i]]));
  const parts = [k.pathOf(screenOriented(near), true), k.pathOf(screenOriented(far), true)];
  const buckets = [[], [], [], [], []];
  for (let i = 0; i < n; i++) {
    if (!facing[i]) continue;
    const quad = screenOriented([near[i], near[(i + 1) % n], far[(i + 1) % n], far[i]]);
    parts.push(k.pathOf(quad, true));
    buckets[G.toneOf(normals[i], P)].push(k.pathOf(quad, true));
  }
  const capTone = G.toneOf(capNear ? F.a : G.mul3(F.a, -1), P);
  buckets[capTone].push(k.pathOf(screenOriented(near), true));
  return {
    fill: parts.join(''),
    outline: outline.join(''),
    crease: crease.join(''),
    top: buckets[4].join(''),
    shades: buckets.slice(0, 4).map((b) => b.join('')),
  };
}

// A side profile (y, z) extruded across the car from x0 to x1.
const XF = G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
function board(name, poly, x0, x1, style = {}, { extra = '', inner = '', bias = 0, sys, ref, outside } = {}) {
  const shape = record(A.prism(XF, poly, x0, x1, { name }));
  const cy = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cz = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  put(name, ref ?? [(x0 + x1) / 2, cy, cz], S(prismPaths(XF, poly, x0, x1), { tone: 'mid', ...style, inner }) + extra, [shape], {
    bias,
    sys,
    outside,
  });
  return shape;
}
function prism(name, F, poly, s0, s1, style = {}, { extra = '', inner = '', bias = 0, sys, ref } = {}) {
  const shape = record(A.prism(F, poly, s0, s1, { name }));
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  const centre = G.add3(G.add3(G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), G.mul3(F.u, cx)), G.mul3(F.v, cy));
  put(name, ref ?? centre, S(prismPaths(F, poly, s0, s1), { tone: 'mid', ...style, inner }) + extra, [shape], { bias, sys });
  return shape;
}
function box(name, [x0, y0, z0], [x1, y1, z1], style = {}, { r = 0.6, steps = 3, bevel = 0, extra = '', inner = '', bias = 0, sys } = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r };
  const shape = record(A.slab(plan, z0, z1 - z0, { name }, steps));
  put(
    name,
    [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    S(k.slabOf(plan, z0, z1 - z0, P, steps, bevel), { tone: 'mid', ...style, inner }) + extra,
    [shape],
    { bias, sys },
  );
  return shape;
}
function turned(name, F, profile, style = {}, { extra = '', inner = '', bias = 0, smooth, steps, sys, ref } = {}) {
  const opts = { ...(smooth !== undefined ? { smooth } : {}), ...(steps ? { steps } : {}) };
  const paths = G.solidOf(profile, F, P, opts);
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const shape = record(A.solid(F, profile, { name }));
  put(name, ref ?? G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone: 'mid', ...style, inner }) + extra, [shape], { bias, sys });
  return shape;
}
const disc = (name, F, s0, s1, r, style = {}, options = {}) => turned(name, F, [[s0, r], [s1, r]], style, options);
const rect = (u0, u1, v0, v1) => [
  [u0, v0],
  [u1, v0],
  [u1, v1],
  [u0, v1],
];
const along = (o, a) => G.frameAlong(o, a);
const xFrame = (o, sign = 1) => G.frameOf(o, [sign, 0, 0], [0, 1, 0], [0, 0, 1]);
const yFrame = (o, sign = 1) => G.frameOf(o, [0, sign, 0], [1, 0, 0], [0, 0, 1]);
const zFrame = (o) => G.frameOf(o, [0, 0, 1], [1, 0, 0], [0, 1, 0]);
// Lines drawn on a vertical face at x (a door card, a timing cover).
const onX = (x, pts, closed = false) => path3(pts.map(([y, z]) => [x, y, z]), closed);
const onY = (y, pts, closed = false) => path3(pts.map(([x, z]) => [x, y, z]), closed);
const slotX = (x, y, z, w, h) => onX(x, k.roundedPlan({ x: y, y: z, w, d: h, r: Math.min(w, h) / 2 }, 4), true);
const slotY = (y, x, z, w, h) => onY(y, k.roundedPlan({ x, y: z, w, d: h, r: Math.min(w, h) / 2 }, 4), true);

function tube(name, points, r, { tone = 'mid', bend = 6, maxLength = 40, sys, caps = true, rings, touch } = {}) {
  const route = G.fillet(points, Math.max(bend, r * 2.6), 10, { P, tube: r });
  R.route(name, route, r, { piece: 'car', limp: true, touch });
  tubePieces(route, r, P, { maxLength, spacing: Math.max(0.6, Math.min(1.6, r)), caps, ...(rings ? { rings } : {}) }).forEach((piece, index) =>
    put(`${name}:${index}`, piece.mid, tubeSvg(piece, { tone }), [A.tube(piece.points, piece.radii)], { bias: 0.05, sys }),
  );
  return route;
}

function coilZ(cx, cy, r, z0, z1, turns) {
  const n = Math.round(turns * 32);
  const runs = { back: [], front: [] };
  let run = null;
  let side = null;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * turns * TAU;
    const p = at([cx + r * Math.cos(t), cy + r * Math.sin(t), z0 + ((z1 - z0) * i) / n]);
    const facing = Math.cos(t) * V[0] + Math.sin(t) * V[1] > 0 ? 'front' : 'back';
    if (facing !== side) {
      if (run) run.push(p);
      run = [p];
      runs[facing].push(run);
      side = facing;
    } else run.push(p);
  }
  return { back: runs.back.map((pts) => k.pathOf(pts)).join(''), front: runs.front.map((pts) => k.pathOf(pts)).join('') };
}

// ---------------------------------------------------------------- the vehicle's numbers

const roofTop = (y) => 166 - 0.0004 * (y - 170) ** 2;
const rb = (y) => roofTop(y) - 3.2;

const AX_F = 368; // front axle
const AX_R = 96; // rear axle (272 cm wheelbase)
const WZ = 36; // wheel centre height: 72 cm tyre
const ARCH = 41;
const SILL = 24;
const belt = (y) => 112 + ((330 - y) * 8) / 300;
const arcYZ = (cy, cz, r, a0, a1, n = 28) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cy + r * Math.cos(a), cz + r * Math.sin(a)];
  });
// Arches are superellipses (exponent SQ): flatter on top, squarer at the shoulders.
const SQ = 3.2;
const sq = (v) => Math.sign(v) * Math.abs(v) ** (2 / SQ);
const footAngle = (r) => -Math.asin(((WZ - SILL) / r) ** (SQ / 2));
const squareArc = (cy, cz, r, a0, a1, n = 36) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cy + r * sq(Math.cos(a)), cz + r * sq(Math.sin(a))];
  });
const FLARE = 41.5;
const FOOT = FLARE * sq(Math.cos(footAngle(FLARE))); // half-width of the arch at the sill
const arch = (cy, r = FLARE) => squareArc(cy, WZ, r, Math.PI - footAngle(r), footAngle(r));

// ================================================================ lofts: rounded, tapered solids between rings

// A rounded rectangle in plan, sampled with a fixed count per side so rings of
// different sizes line up point for point. z may be a number or a function of (x, y).
function rring(x0, x1, y0, y1, r, z, { side = 10, end = 4, corner = 5 } = {}) {
  const pts = [];
  const zf = typeof z === 'function' ? z : () => z;
  const push = (x, y) => pts.push([x, y, zf(x, y)]);
  const arcAt = (cx, cy, a0) => {
    for (let i = 0; i < corner; i++) {
      const a = a0 + ((Math.PI / 2) * i) / corner;
      push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
  };
  // counter-clockwise from above, starting at the rear near corner's bottom edge
  for (let i = 0; i < end; i++) push(x0 + r + ((x1 - x0 - 2 * r) * i) / end, y0);
  arcAt(x1 - r, y0 + r, -Math.PI / 2);
  for (let i = 0; i < side; i++) push(x1, y0 + r + ((y1 - y0 - 2 * r) * i) / side);
  arcAt(x1 - r, y1 - r, 0);
  for (let i = 0; i < end; i++) push(x1 - r - ((x1 - x0 - 2 * r) * i) / end, y1);
  arcAt(x0 + r, y1 - r, Math.PI / 2);
  for (let i = 0; i < side; i++) push(x0, y1 - r - ((y1 - y0 - 2 * r) * i) / side);
  arcAt(x0 + r, y0 + r, Math.PI);
  return pts;
}
function hull2(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
// A convex solid lofted through rings (bottom to top), shaded face by face like the kit's prisms.
function loftPaths(rings) {
  const m = rings.length;
  const n = rings[0].length;
  const all = rings.flat();
  const centre = G.mul3(all.reduce((a, p) => G.add3(a, p), [0, 0, 0]), 1 / all.length);
  const faces = [];
  const newell = (pts) => {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0, z0] = pts[i];
      const [x1, y1, z1] = pts[(i + 1) % pts.length];
      nx += (y0 - y1) * (z0 + z1);
      ny += (z0 - z1) * (x0 + x1);
      nz += (x0 - x1) * (y0 + y1);
    }
    return G.unit3([nx, ny, nz]);
  };
  const addFace = (pts, key) => {
    let nrm = newell(pts);
    const c = G.mul3(pts.reduce((a, p) => G.add3(a, p), [0, 0, 0]), 1 / pts.length);
    if (G.dot3(nrm, G.sub3(c, centre)) < 0) nrm = G.mul3(nrm, -1);
    faces.push({ pts, nrm, key, seen: G.dot3(nrm, V) > 1e-6 });
  };
  for (let i = 0; i < m - 1; i++)
    for (let j = 0; j < n; j++)
      addFace([rings[i][j], rings[i][(j + 1) % n], rings[i + 1][(j + 1) % n], rings[i + 1][j]], `q${i}.${j}`);
  addFace(rings[0], 'bottom');
  addFace(rings[m - 1], 'top');
  const buckets = [[], [], [], [], []];
  for (const f of faces) if (f.seen) buckets[G.toneOf(f.nrm, P)].push(k.pathOf(screenOriented(f.pts.map(at)), true));
  const hull = hull2(all.map(at));
  // creases: ring edges between two seen faces that turn by more than ~22 degrees
  const crease = [];
  const quad = (i, j) => faces[i * n + ((j + n) % n)];
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) {
      const below = i > 0 ? quad(i - 1, j) : faces[faces.length - 2];
      const above = i < m - 1 ? quad(i, j) : faces[faces.length - 1];
      if (below.seen && above.seen && G.dot3(below.nrm, above.nrm) < 0.93) crease.push(k.pathOf([at(rings[i][j]), at(rings[i][(j + 1) % n])]));
    }
  return {
    fill: k.pathOf(hull, true),
    outline: k.pathOf(hull, true),
    crease: crease.join(''),
    top: buckets[4].join(''),
    shades: buckets.slice(0, 4).map((b) => b.join('')),
  };
}
function loft(name, rings, style = {}, { extra = '', inner = '', bias = 0, sys, outside } = {}) {
  const all = rings.flat();
  const xs = all.map((p) => p[0]);
  const side = hull2(all.map(([, y, z]) => [y, z]));
  const shape = record(A.prism(XF, side, Math.min(...xs), Math.max(...xs), { name }));
  const c = G.mul3(all.reduce((a, p) => G.add3(a, p), [0, 0, 0]), 1 / all.length);
  put(name, c, S(loftPaths(rings), { tone: 'mid', ...style, inner }) + extra, [shape], { bias, sys, outside });
  return shape;
}

// ================================================================ body: one phantom shell (see shell.mjs)

const archPoints = (cy, r) => squareArc(cy, WZ, r, Math.PI - footAngle(r), footAngle(r));
const SHELL = SH.buildShell({ P, V, at, k, G, AX_R, AX_F, WZ, FLARE, archPoints });
box('body.floor', [-80, 136, 38], [80, 330, 42], { tone: 'lo' }, { r: 1 });
box('body.firewall', [-66, 334, 42], [66, 338, 106], { tone: 'lo' }, { r: 0.4 });

// ================================================================ wheels

function wheel(name, y, side) {
  const x = side * 80;
  const F = G.frameOf([x, y, WZ], [side, 0, 0], [0, 1, 0], [0, 0, 1]);
  const outerFacing = G.dot3(F.a, V) > 0;
  const tyre = [
    [-12, 25],
    [-12, 29.5, 1],
    [-11.2, 33, 1],
    [-9, 35.3, 1],
    [-5.5, 36],
    [5.5, 36],
    [9, 35.3, 1],
    [11.2, 33, 1],
    [12, 29.5, 1],
    [12, 25],
  ];
  const tread = k.fadedSvg(G.ribsOf(F, -5.5, 5.5, 36, 72, P, { fade: [0.12, 0.6] }), { tone: 'lo' });
  const grooves = [-2, 2].map((s) => G.arcOf(F, s, 36, P)).join('');
  const face = outerFacing ? 12 : -12;
  const parts = [
    S(G.solidOf(tyre, F, P), { tone: 'mid', className: 'sv-tyre', inner: tread + Ln(grooves, { tone: 'faint' }) + Ln(G.circleOf(F, face, 27.6, P), { tone: 'faint' }) }),
  ];
  if (outerFacing) {
    const spokes = [];
    for (let i = 0; i < 5; i++) {
      const t = (i / 5) * TAU + 0.3;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const pt = (r, w) => [r * c - w * s, r * s + w * c];
      spokes.push(S(G.prismOf(F, [pt(6.4, -1.8), pt(22.6, -3), pt(22.6, 3), pt(6.4, 1.8)], 9.4, 12.2, P), { tone: 'mid' }));
    }
    parts.push(
      `<clipPath id="sv-rim-${name}"><path d="${G.circleOf(F, 12.2, 24.4, P)}"/></clipPath><g clip-path="url(#sv-rim-${name})">`,
      `<path class="sv-void" d="${G.circleOf(F, 11, 23.6, P)}"/>`,
      '<g>',
      S(G.disc(0.5, 3.2, 17.5, F, P), { tone: 'lo', inner: Ln(G.circleOf(F, 3.2, 12, P), { tone: 'faint' }) }),
      S(G.prismOf(F, [[-12.5, 7.5], [-19, 7.5], [-19, 15], [-12.5, 15]].map(([u, v]) => [u * 0.5 - v * 0.866 + 0, u * 0.866 + v * 0.5]), -0.6, 5.2, P), {
        tone: 'mid',
      }),
      S(G.disc(3.2, 7.5, 9, F, P), { tone: 'lo' }),
      '</g>',
      ...spokes,
      S(G.disc(8, 12.8, 7, F, P), { tone: 'mid' }),
      '</g>',
      Dots(G.dotsOf(F, 12.8, 4.6, 5, P, { all: true, phase: 0.3 }), { size: 0.7, tone: 'hi' }),
      S(G.disc(12.8, 13.6, 2.8, F, P), { tone: 'mid' }),
      `<path class="sv-lip" fill-rule="evenodd" d="${G.circleOf(F, 12.2, 24.4, P)}${G.circleOf(F, 12.2, 21.8, P)}"/>`,
      Ln(G.circleOf(F, 12.2, 24.4, P), { tone: 'mid' }) + Ln(G.circleOf(F, 12.2, 21.8, P), { tone: 'lo' }),
    );
  } else {
    parts.push(S(G.disc(-15, -12, 9, F, P), { tone: 'lo' }));
  }
  const shape = record(A.solid(F, tyre, { name, ground: true }));
  put(name, [x, y, WZ], parts.join(''), [shape]);
}
for (const [y, side] of [
  [AX_R, 1],
  [AX_F, 1],
  [AX_R, -1],
  [AX_F, -1],
])
  wheel(`wheel.${y === AX_F ? 'front' : 'rear'}.${side < 0 ? 'near' : 'far'}`, y, side);

// Coil-over struts and springs above each wheel's knuckle.
for (const side of [-1, 1])
  for (const y of [AX_F, AX_R]) {
    const x = side * 60.6;
    // One item, painted back coil half, damper, spring seat, front coil half.
    const yy = y === AX_F ? y - 6 : y - 4;
    const F = zFrame([x, yy, 44]);
    const c = coilZ(x, yy, 6, 48, 85, 6);
    put(
      'susp.strut',
      [x, yy, 64],
      Ln(c.back, { tone: 'lo' }) + S(G.disc(0, 41, 2.4, F, P), { tone: 'mid' }) + S(G.disc(2, 4, 7.6, F, P), { tone: 'mid' }) + Ln(c.front, { tone: 'mid' }),
      [record(A.cylinder(x, yy, 7.6, 44, 41, { name: 'susp.strut' }))],
      { sys: 'suspension' },
    );
  }

// ================================================================ cabin

function seat(name, x0, x1, y, { back = true, base = true } = {}) {
  loft(`${name}.cushion`, [rring(x0, x1, y - 46, y, 5, 54.4), rring(x0, x1, y - 46, y + 1, 6, 62), rring(x0 + 2.5, x1 - 2.5, y - 44, y - 2, 8, 67.6)], { tone: 'mid' });
  if (base) board(`${name}.base`, [[y - 40, 42], [y - 6, 42], [y - 6, 55.4], [y - 40, 54.4]], x0 + 4, x1 - 4, { tone: 'lo' });
  if (back) {
    loft(`${name}.back`, [rring(x0 + 1, x1 - 1, y - 56, y - 46.4, 4, 58), rring(x0, x1, y - 62, y - 49, 5, 96), rring(x0 + 1, x1 - 1, y - 66, y - 56, 5, 124), rring(x0 + 4, x1 - 4, y - 65, y - 58, 3.4, 128)], { tone: 'mid' });
    loft(`${name}.head`, [rring(x0 + 9, x1 - 9, y - 67, y - 58.4, 3.4, 130), rring(x0 + 8, x1 - 8, y - 69, y - 59, 4, 140), rring(x0 + 10, x1 - 10, y - 68, y - 61, 3, 145)], { tone: 'mid' });
  }
}
seat('seat.driver', -64, -20, 246);
seat('seat.passenger', 20, 64, 262);
seat('seat.rear', -12, 60, 192, { base: false });

// Dashboard, centre stack and console.
// Dashboard: one sculpted profile across the cabin, its top running up to the windshield and
// its face rolling under toward the driver; the instrument visor is a curved hood on top of it.
loft('dash', [rring(-72, 76, 296, 334, 9, 90), rring(-75, 79, 288, 334, 13, 101), rring(-74, 78, 291, 334, 12, 108), rring(-70, 74, 300, 334, 10, 112.6)], { tone: 'mid' });
board('dash.visor', [[312, 113.04], [306, 116.8], [299, 118.6], [293.6, 118.1], [290.4, 115.6], [291.6, 110], [293, 109.4], [300, 111.6]], -58, -28, { tone: 'mid' });
loft('console', [rring(-12, 12, 200, 296, 5, 42), rring(-12, 12, 200, 296, 5, 63), rring(-10, 10, 203, 293, 6, 66)], { tone: 'mid' });
box('console.stack', [-13, 294, 42], [13, 304, 90], { tone: 'mid' }, { r: 1.5, extra: Ln([70, 75, 80].map((z) => slotY(294, -9, z, 18, 2)).join(''), { tone: 'lo' }) });
turned('console.shifter', zFrame([0, 262, 66]), [[0, 3], [6, 1.2], [10, 1.2], [11, 2.6, 1], [14, 2.8, 1], [16.5, 0]], { tone: 'mid' });

// Steering wheel on its column (the column is the power-steering system).
const SW = { o: [-42, 252, 100], a: G.unit3([0, -0.9, 0.44]) };
const SWF = G.frameAlong(SW.o, SW.a);

// ================================================================ engine bay (engine runs across the car)

const ENG = { x0: -46, x1: 22, y0: 378, y1: 410 };
box('engine.pan', [-42, 381, 34], [18, 407, 46], { tone: 'mid' }, { sys: 'engine', r: 3 });
box('engine.block', [ENG.x0, ENG.y0, 46], [ENG.x1, ENG.y1, 86], { tone: 'mid' }, {
  sys: 'engine',
  r: 2,
  inner: Ln(k.sideSeam({ x: ENG.x0, y: ENG.y0, w: ENG.x1 - ENG.x0, d: ENG.y1 - ENG.y0, r: 2 }, 62, P, 3), { tone: 'faint' }),
});
box('engine.head', [ENG.x0 - 1, ENG.y0 + 1, 86], [ENG.x1 + 1, ENG.y1 - 1, 96], { tone: 'mid' }, { sys: 'engine', r: 2, bevel: 0.4 });
const COILS = [-34, -20, -6, 8];
box('engine.cover', [ENG.x0 + 1, ENG.y0 + 4, 96], [ENG.x1 - 1, ENG.y1 - 4, 103], { tone: 'mid' }, {
  sys: 'engine',
  r: 6,
  steps: 6,
  bevel: 0.6,
  extra: Ln(k.planOutline({ x: ENG.x0 + 6, y: ENG.y0 + 8, w: ENG.x1 - ENG.x0 - 12, d: ENG.y1 - ENG.y0 - 16, r: 3 }, 103, P, 4), { tone: 'faint' }),
});
for (const x of COILS) disc('engine.coil', zFrame([x, 394, 103]), 0, 8, 2.8, { tone: 'mid' }, { sys: 'engine', extra: Dots([at([x, 394, 111])], { size: 0.5, tone: 'hi' }) });
// Intake plenum and runners on the cabin side of the head.
const PLENUM = xFrame([-40, 366, 98]);
turned('engine.plenum', PLENUM, [[0, 6.5], [1, 7.2, 1], [52, 7.2, 1], [54, 6.4]], { tone: 'mid' }, { sys: 'engine' });
for (const x of COILS) box('engine.runner', [x - 3, 373.4, 86], [x + 3, 379, 95], { tone: 'mid' }, { sys: 'engine', r: 1 });
disc('engine.throttle', xFrame([14, 366, 98]), 0, 6, 5, { tone: 'mid' }, { sys: 'engine' });
// Exhaust heat shield on the radiator side.
box('engine.shield', [-22, 410, 66], [12, 414, 84], { tone: 'lo' }, {
  sys: 'engine',
  extra: Ln([70, 74, 78].map((z) => slotY(414.05, -18, z, 26, 1.6)).join(''), { tone: 'faint' }),
});
// Timing cover on the near end, where the accessory belt runs.
box('engine.timing', [ENG.x0 - 4, ENG.y0 + 2, 44], [ENG.x0, ENG.y1 - 2, 98], { tone: 'mid' }, {
  sys: 'engine',
  r: 1.6,
  extra: Dots([at([ENG.x0 - 4, 384, 92]), at([ENG.x0 - 4, 404, 92]), at([ENG.x0 - 4, 384, 50]), at([ENG.x0 - 4, 404, 50])], { size: 0.55, tone: 'mid' }),
});

// Transaxle on the far end of the engine: a cast bell housing that tapers into the
// ribbed gear case, the final-drive lobe down on the axle line, and the shift lever on top.
{
  const sys = 'transmission';
  const TF = xFrame([ENG.x1, 392, 76]);
  turned('trans.bell', TF, [[0, 24], [2.2, 24], [2.2, 22.6], [6, 22, 1], [10, 20.6, 1], [14, 19.4]], { tone: 'mid' }, {
    sys,
    inner: Ln(G.arcOf(TF, 2.2, 22.6, P), { tone: 'faint' }),
  });
  turned('trans.case', TF, [[14, 19.4], [34, 16.4], [34, 14.6], [38, 14.6], [38.6, 13.4]], { tone: 'mid' }, {
    sys,
    inner: k.fadedSvg(G.ribsOf(TF, 15, 33, 19.25, 16, P, { r1: 16.55, fade: [0.12, 0.6], seams: true }), { tone: 'lo' }),
    extra: Dots(G.dotsOf(TF, 34, 15.6, 10, P, { all: true, fade: [0.04, 0.42] }), { size: 0.5, tone: 'mid' }),
  });
  const LF = xFrame([ENG.x1 + 12, AX_F, WZ]);
  turned('trans.final', LF, [[0, 9], [1.6, 11, 1], [14, 11, 1], [16, 9], [16, 5.6], [20, 5.6]], { tone: 'mid' }, { sys });
  box('trans.web', [ENG.x1 + 15, AX_F + 8, WZ + 8], [ENG.x1 + 28, AX_F + 18, 62], { tone: 'mid' }, { sys, r: 1.2 });
  const LEVER = zFrame([ENG.x1 + 26, 388, 93]);
  disc('trans.boss', LEVER, 0, 3, 3.4, { tone: 'mid' }, { sys });
  box('trans.lever', [ENG.x1 + 24.6, 378, 96], [ENG.x1 + 27.4, 390, 98], { tone: 'mid' }, { sys, r: 0.8, extra: Dots([at([ENG.x1 + 26, 379.6, 98])], { size: 0.6, tone: 'hi' }) });
}

// Front half shafts from the transmission to the hubs.
for (const side of [-1, 1]) {
  const x1 = side * 66;
  const x0 = side < 0 ? ENG.x0 + 6 : ENG.x1 + 32;
  const F = xFrame([0, AX_F, WZ], side);
  const s0 = Math.abs(x0);
  const s1 = Math.abs(x1);
  turned('axle.front.shaft', F, [[s0, 1.8], [s1 - 12, 1.8]], { tone: 'lo' });
  turned('axle.front.boot', F, [[s1 - 12, 2.6], [s1 - 10, 4.6, 1], [s1 - 8, 3, 1], [s1 - 6, 4.6, 1], [s1 - 4, 3, 1], [s1 - 2, 5, 1], [s1, 5.4]], { tone: 'lo' });
}

// Radiator, fan and the two hoses.
box('rad.core', [-66, 428, 52], [66, 433, 94], { tone: 'mid' }, {
  r: 0.6,
  extra: Ln(Array.from({ length: 21 }, (_, i) => onY(428, [[-62 + i * 6.2, 52.4], [-62 + i * 6.2, 93.6]])).join(''), { tone: 'faint' }),
});
box('rad.tank', [-70, 426, 52], [-66, 434, 94], { tone: 'mid' }, { r: 0.6 });
box('rad.tank', [66, 426, 52], [70, 434, 94], { tone: 'mid' }, { r: 0.6 });
const FAN = yFrame([-6, 428, 72], -1);
disc('rad.shroud', FAN, 0, 4, 20, { tone: 'mid', inner: '' }, { extra: Ln(G.spokesOf(FAN, 4, 4, 17, 7, P, { sweep: 0.5 }), { tone: 'lo' }) + Ln(G.circleOf(FAN, 4, 17, P), { tone: 'faint' }) });
disc('rad.motor', FAN, 4, 8, 5, { tone: 'mid' });
disc('engine.thermostat', yFrame([12, 409, 91], 1), 0, 3, 3.6, { tone: 'mid' }, { sys: 'engine' });
tube('hose.upper', [[8, 430.5, 94], [8, 430.5, 101], [12, 424, 101], [12, 416, 91], [12, 412, 91]], 2.6, { tone: 'mid' });
// Battery on the far side.
box('battery', [48, 410, 56], [64, 428, 76], { tone: 'mid' }, {
  r: 1.2,
  extra: [52, 60].map((x) => S(k.cylinder(x, 419, 1.4, 76, 1.6, P, 12), { tone: 'mid' })).join(''),
});
// Air box and intake duct.
box('airbox', [42, 339, 80], [66, 353, 98], { tone: 'mid' }, { r: 3, bevel: 0.5, inner: Ln(k.sideSeam({ x: 42, y: 339, w: 24, d: 14, r: 3 }, 89, P, 3), { tone: 'faint' }) });
tube('intake.duct', [[42, 346, 90], [32, 346, 90], [30, 366, 98], [20, 366, 98]], 4, { tone: 'mid', bend: 6 });

// ================================================================ accessory drive (near end of the engine)

const BELT_X = ENG.x0 - 8;
const PULLEYS = {
  crank: { y: 394, z: 52, r: 9 },
  ac: { y: 418, z: 39, r: 8.5 },
  alt: { y: 420, z: 95, r: 5 },
  pump: { y: 393, z: 84, r: 8 },
  idler: { y: 380, z: 68, r: 4 },
};
function pulley(key, { sys, tone = 'mid' } = {}) {
  const p = PULLEYS[key];
  const F = xFrame([ENG.x0 - 4, p.y, p.z], -1);
  disc(`pulley.${key}.back`, F, 0, 2.2, p.r + 0.6, { tone }, { sys });
  disc(`pulley.${key}.groove`, F, 2.2, 5.8, p.r - 0.6, { tone }, { sys });
  disc(`pulley.${key}.front`, F, 5.8, 6.8, p.r + 0.6, { tone }, {
    sys,
    extra: Ln(G.circleOf(F, 6.8, Math.max(1.2, p.r * 0.36), P), { tone: 'lo' }),
  });
}
// Alternator and A/C compressor sit on the front face of the block, pulleys in the belt plane.
const ALT = xFrame([ENG.x0 - 4, PULLEYS.alt.y, PULLEYS.alt.z], 1);
turned('alt.body', ALT, [[0, 7.4], [1.2, 8.6, 1], [16, 8.6, 1], [18, 7.6]], { tone: 'mid' }, {
  sys: 'alternator',
  inner: k.fadedSvg(G.ribsOf(ALT, 3, 15, 8.6, 22, P, { fade: [0.1, 0.55], seams: true }), { tone: 'lo' }),
});
box('alt.bracket', [ENG.x0 + 4, 410, 90], [ENG.x0 + 10, 412, 100], { tone: 'lo' }, { sys: 'alternator' });
const ACF = xFrame([ENG.x0 - 4, PULLEYS.ac.y, PULLEYS.ac.z], 1);
turned('ac.body', ACF, [[0, 9], [2, 10.5, 1], [22, 10.5, 1], [24, 8.8]], { tone: 'mid' }, {
  sys: 'ac-compressor',
  inner: k.fadedSvg(G.ribsOf(ACF, 4, 13, 10.5, 26, P, { fade: [0.1, 0.55], seams: true }), { tone: 'lo' }) + Ln(G.arcOf(ACF, 18, 10.5, P), { tone: 'faint' }),
});
for (const dx of [8, 16]) disc('ac.port', zFrame([ENG.x0 - 4 + dx, PULLEYS.ac.y, PULLEYS.ac.z + 10.3]), 0, 3.2, 2.2, { tone: 'mid' }, { sys: 'ac-compressor', extra: Dots([at([ENG.x0 - 4 + dx, PULLEYS.ac.y, PULLEYS.ac.z + 13.5])], { size: 0.6, tone: 'hi' }) });
const PUMP = xFrame([ENG.x0 - 4, PULLEYS.pump.y, PULLEYS.pump.z], -1);
turned('pump.housing', PUMP, [[-0.2, 11], [1.4, 11], [3, 8.8, 1], [4.2, 5]], { tone: 'mid' }, {
  sys: 'water-pump',
  extra: Dots(G.dotsOf(PUMP, 1.4, 9.8, 6, P, { all: true, phase: 0.4 }), { size: 0.6, tone: 'hi' }),
});
pulley('crank', { tone: 'mid' });
pulley('ac', { sys: 'ac-compressor' });
pulley('alt', { sys: 'alternator' });
pulley('pump', { sys: 'water-pump' });
pulley('idler');

// The serpentine belt: outer tangents round every pulley, in the belt plane.
{
  const order = ['crank', 'ac', 'alt', 'pump', 'idler'];
  const circles = order.map((key) => PULLEYS[key]);
  const n = circles.length;
  const tangent = (a, b) => {
    // outer tangent for a loop that runs counter-clockwise in (y, z)
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const d = Math.hypot(dy, dz);
    const th = Math.atan2(dz, dy) - Math.acos((a.r - b.r) / d);
    return [
      [a.y + a.r * Math.cos(th), a.z + a.r * Math.sin(th)],
      [b.y + b.r * Math.cos(th), b.z + b.r * Math.sin(th)],
      th,
    ];
  };
  const segs = circles.map((c, i) => tangent(c, circles[(i + 1) % n]));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const [p0, p1, th] = segs[i];
    pts.push(p0, p1);
    const c = circles[(i + 1) % n];
    let t0 = th;
    let t1 = segs[(i + 1) % n][2];
    while (t1 < t0) t1 += TAU;
    for (let j = 1; j < 8; j++) {
      const t = t0 + ((t1 - t0) * j) / 8;
      pts.push([c.y + c.r * Math.cos(t), c.z + c.r * Math.sin(t)]);
    }
  }
  const route = pts.map(([y, z]) => [BELT_X, y, z]);
  route.push(route[0]);
  tubePieces(route, 1.1, P, { maxLength: 14, closed: true, spacing: 0.8 }).forEach((piece, index) =>
    put(`belt:${index}`, piece.mid, tubeSvg(piece, { tone: 'lo' }), [A.tube(piece.points, piece.radii)], { bias: 0.05 }),
  );
}

// ================================================================ power steering: the steering wheel and its column

{
  const sys = 'power-steering';
  const col0 = G.add3(SW.o, G.mul3(SW.a, -6));
  const col1 = [-42, 330, 70];
  const dir = G.unit3(G.sub3(col1, col0));
  const len = G.len3(G.sub3(col1, col0));
  const CF = G.frameAlong(col0, dir);
  turned('steer.column', CF, [[12, 2.4], [len, 2.4]], { tone: 'mid' }, { sys });
  turned('steer.shroud', CF, [[0.4, 4.6], [1.2, 5.4, 1], [11, 5.4, 1], [12, 4.6]], { tone: 'mid' }, { sys });
  // The wheel: a round rim (a closed tube), three spokes and the hub. The rim's far half is
  // painted before the spokes and hub, its near half after.
  const ring = Array.from({ length: 48 }, (_, i) => G.pointOf(SWF, 0, 17.2, (i / 48) * TAU));
  ring.push(ring[0]);
  const behind = [];
  const ahead = [];
  for (const piece of tubePieces(ring, 1.8, P, { maxLength: 9, closed: true, spacing: 0.8 }))
    (G.dot3(G.sub3(piece.mid, SW.o), V) < 0 ? behind : ahead).push(tubeSvg(piece, { tone: 'mid' }));
  const spokes = [0, Math.PI, Math.PI * 1.5]
    .map((t) => {
      const c = Math.cos(t);
      const sn = Math.sin(t);
      const pt = (r, w) => [r * c - w * sn, r * sn + w * c];
      return S(G.prismOf(SWF, [pt(5, -2.4), pt(16, -1.6), pt(16, 1.6), pt(5, 2.4)], -0.9, 0.9, P), { tone: 'mid' });
    })
    .join('');
  put(
    'steer.wheel',
    SW.o,
    behind.join('') + spokes + S(G.disc(-2.4, 2.6, 5.6, SWF, P), { tone: 'mid', inner: Ln(G.circleOf(SWF, 2.6, 3.6, P), { tone: 'lo' }) }) + ahead.join(''),
    [record(A.disc(SWF, -1.8, 1.8, 19, { name: 'steer.wheel' }))],
    { sys },
  );
}

// ================================================================ navigation: dash screen and roof antenna

{
  const sys = 'navigation';
  const n = G.unit3([0, -0.5, 0.86]);
  const NF = G.frameOf([0, 304, 117], n, [1, 0, 0], G.cross3(n, [1, 0, 0]));
  prism('nav.screen', NF, rect(-15, 15, -9, 9), -1.4, 0, { tone: 'mid' }, { sys });
  prism('nav.mount', yFrame([0, 304, 112]), rect(-4, 4, 0, 4), -2, 2, { tone: 'mid' }, { sys });
  box('nav.unit', [-12, 304, 82], [12, 318, 94], { tone: 'mid' }, { sys, r: 1, extra: Ln(slotY(304, -9, 86, 18, 2.4), { tone: 'lo' }) });
  // Shark-fin antenna on the roof, toward the hatch.
  board('nav.fin', [[62, SH.topZ(62, 0) - 0.4], [84, SH.topZ(84, 0) - 0.4], [76, SH.topZ(84, 0) + 6.6], [69, SH.topZ(84, 0) + 7.2]], -3, 3, { tone: 'mid' }, { sys, outside: true });
}

// ================================================================ fuel tank and pump under the rear seat

box('fuel.tank', [-58, 142, 42], [56, 188, 54], { tone: 'mid' }, {
  sys: 'fuel-pump',
  r: 8,
  steps: 6,
  bevel: 0.6,
  inner: Ln(k.sideSeam({ x: -58, y: 142, w: 114, d: 46, r: 8 }, 48, P, 6), { tone: 'faint' }),
});
{
  const sys = 'fuel-pump';
  const FF = zFrame([-38, 162, 54]);
  disc('fuel.flange', FF, 0, 1.4, 11, { tone: 'mid' }, { sys, extra: Dots(G.dotsOf(FF, 1.4, 9.6, 10, P, { all: true }), { size: 0.45, tone: 'hi' }) });
  turned('fuel.module', FF, [[1.4, 8], [4, 8, 1], [6, 6.6, 1], [7.6, 4.2]], { tone: 'mid' }, { sys });
  box('fuel.plug', [-30, 158, 55.4], [-25, 166, 60], { tone: 'mid' }, { sys, r: 0.6 });
  disc('fuel.nipple', zFrame([-40, 166, 61.2]), 0, 2, 1.3, { tone: 'mid' }, { sys });
  disc('fuel.grommet', zFrame([-52, 194, 42]), 0, 1.4, 2.6, { tone: 'mid' });
  tube('fuel.neck', [[-84, 61.5, SH.shoulder(60) - 7.5], [-76, 61.5, SH.shoulder(60) - 7.5], [-76, 126, 92], [-58, 134, 60], [-50, 134, 49], [-50, 142, 49]], 2.2, { tone: 'mid', sys, bend: 6 });
  tube('fuel.line', [[-40, 166, 63.2], [-40, 166, 66], [-52, 178, 62], [-52, 194, 52], [-52, 194, 43.4]], 0.9, { tone: 'mid', sys, bend: 4 });
}

// ================================================================ drive axle: rear differential and half shafts

{
  const sys = 'drive-axle';
  const DF = yFrame([0, AX_R, WZ], 1);
  turned('axle.diff', DF, [[-12, 5], [-10, 11, 1], [2, 12, 1], [8, 10, 1], [12, 6], [20, 4]], { tone: 'mid' }, { sys });
  disc('axle.diff.cover', DF, -14, -12, 9, { tone: 'mid' }, { sys });
  for (const side of [-1, 1]) {
    const F = xFrame([0, AX_R, WZ], side);
    turned('axle.rear.shaft', F, [[20.5, 1.8], [52, 1.8]], { tone: 'mid' }, { sys });
    turned('axle.rear.boot', F, [[12.5, 5], [14.5, 3.4, 1], [16.5, 4.6, 1], [18.5, 3, 1], [20.5, 2]], { tone: 'mid' }, { sys });
    turned('axle.rear.boot', F, [[52, 2], [54, 4.6, 1], [56, 3, 1], [58, 4.6, 1], [60, 3.4, 1], [62, 5.2], [64, 5.2]], { tone: 'mid' }, { sys });
  }
  turned('axle.prop', DF, [[20, 2.6], [262, 2.6]], { tone: 'mid' }, { sys });
}

// ================================================================ outside the shell: mirrors and roof rails

for (const side of [-1, 1]) {
  const y0 = 316;
  const zb = SH.belt(y0) + 1;
  const xb = side * SH.halfWidth(y0 + 6, zb);
  // housing: rounded rings swelling and closing like an ellipsoid
  const housing = [0, 0.2, 0.45, 0.7, 0.88, 1].map((t) => {
    const k2 = Math.sqrt(Math.max(0.12, 1 - (2 * t - 1) ** 2));
    const half = 6.5 * k2;
    const x0 = xb + side * (4 + 3 * (1 - k2));
    const x1 = xb + side * (4 + 15 * k2);
    return rring(Math.min(x0, x1), Math.max(x0, x1), y0 + 6.5 - half, y0 + 6.5 + half, Math.max(1, half - 0.6), zb + 2 + 11 * t, { side: 2, end: 2, corner: 8 });
  });
  loft(`mirror.${side < 0 ? 'near' : 'far'}`, housing, { tone: 'mid' }, { outside: true });
  const sail = (z) => rring(Math.min(xb - side * 1, xb + side * 4.5), Math.max(xb - side * 1, xb + side * 4.5), y0 + 1, y0 + 12, 2, z, { side: 2, end: 2, corner: 4 });
  loft(`mirror.sail.${side < 0 ? 'near' : 'far'}`, [sail(zb - 1), sail(zb + 3)], { tone: 'mid' }, { outside: true });
  const xr = side * 66;
  const rt = (y) => SH.topZ(y, xr);
  board('roof.rail', [[96, rt(96) - 0.3], [104, rt(104) + 3.2], [230, rt(230) + 3.2], [238, rt(238) - 0.3], [228, rt(228) + 1.4], [106, rt(106) + 1.4]], xr - 2, xr + 2, { tone: 'mid' }, { outside: true });
}

// ================================================================ the parts a real bay and body carry

// Inner fender aprons with strut towers over the front coil-overs.
for (const side of [-1, 1]) {
  const [x0, x1] = side < 0 ? [-86, -70] : [70, 86];
  // The far apron carries the coolant tank; the near one is left out so the accessory drive shows.
  if (side > 0) box('bay.apron', [x0, 338, 82], [x1, 428, 85], { tone: 'lo' }, { r: 1 });
  const T = zFrame([side * 60.6, AX_F - 6, 85]);
  disc('bay.tower', T, 0, 7, 9.5, { tone: 'mid' }, { sys: 'suspension', inner: Ln(G.arcOf(T, 3.5, 9.5, P), { tone: 'faint' }) });
  disc('bay.tower.cap', T, 7, 8.4, 6, { tone: 'mid' }, { sys: 'suspension', extra: Dots(G.dotsOf(T, 8.4, 4.4, 3, P, { all: true, phase: 0.5 }), { size: 0.55, tone: 'hi' }) });
}
// Brake booster and master cylinder on the firewall, driver's side.
{
  const B = yFrame([-56, 338, 84], 1);
  turned('brake.booster', B, [[0, 9.6], [1, 11.4, 1], [6, 11.4, 1], [7, 9.6]], { tone: 'mid' }, { inner: Ln(G.arcOf(B, 3.5, 11.4, P), { tone: 'faint' }) });
  turned('brake.master', B, [[7, 4.2], [9, 4.2], [9, 3.2], [15.4, 3.2], [16, 2.4]], { tone: 'mid' });
  box('brake.reservoir', [-60, 346, 87.2], [-52, 353, 93.4], { tone: 'mid' }, { r: 1.4, extra: S(k.cylinder(-56, 349.5, 1.8, 93.4, 1.6, P, 14), { tone: 'mid' }) });
}
// Coolant reservoir on the near apron.
box('bay.coolant', [72, 394, 85], [83, 414, 97], { tone: 'mid' }, {
  r: 2.4,
  steps: 4,
  bevel: 0.4,
  extra: S(k.cylinder(77.5, 400, 2.6, 97, 2, P, 16), { tone: 'mid' }),
});
// ================================================================ assemble

const HALO = `<path class="iso-halo" d="${k.haloOf({ x: -96, y: 2, w: 192, d: 456, r: 40 }, 0, 1, P)}"/>`;
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);

const asGroup = (item) =>
  `<g class="it"${PREVIEW ? ` data-name="${item.name}"` : ''}${item.sys ? ` data-sys="${item.sys}"` : ''}>${item.svg}</g>`;
const inside = R.items.filter((item) => !item.outside).map(asGroup);
// The driver's mirror stands proud of the door, so it is drawn over the body's lines.
const proud = (item) => item.name.startsWith('mirror.') && item.name.endsWith('near');
const outsideGroups = R.items.filter((item) => item.outside && !proud(item)).map(asGroup);
const proudGroups = R.items.filter(proud).map(asGroup);
const groups = R.items.map(
  (item) =>
    `<g class="it"${PREVIEW ? ` data-name="${item.name}"` : ''}${item.sys ? ` data-sys="${item.sys}"` : ''}${item.name.startsWith('glass.') ? ' data-glass' : ''}>${item.svg}</g>`,
);
const LABEL =
  'A crossover SUV with its near-side doors and fenders cut away, showing where ten common repairs sit: the engine, transmission, rear drive axle, A/C compressor, water pump, fuel pump, power-steering motor, navigation unit, suspension struts and alternator.';
const svg = k.figureSvg({ width: W, height: H, label: LABEL, body: [
    `<g transform="matrix(-1 0 0 1 ${W} 0)">`,
    HALO,
    SHELL.hidden,
    `<g class="sv-car">${inside.join('')}</g>`,
    SHELL.haze,
    `<g class="sv-car">${outsideGroups.join('')}</g>`,
    SHELL.lines,
    `<g class="sv-car">${proudGroups.join('')}</g>`,
    `<g class="sv-flap" data-sys="fuel-pump"><path d="${SHELL.flap}"/></g>`,
    '</g>',
  ], className: 'sv-svg' });

const CSS = `
.sv-glass>.iso-fill{fill:var(--anatomy-shade-3);fill-opacity:.28}
.sv-glass>.iso-shade,.sv-glass>.iso-top{fill-opacity:.22}
.sv-void{fill:#c8c8c4;stroke:none}
.sv-lip{fill:var(--anatomy-top);stroke:none}
.it[data-glass]{pointer-events:none}
.sv-shell{opacity:.34;pointer-events:none}
.sv-shell-tone{stroke-width:.35;stroke-linejoin:round}
.sv-shell-tone[data-tone="0"]{fill:var(--anatomy-shade-1);stroke:var(--anatomy-shade-1)}
.sv-shell-tone[data-tone="1"]{fill:var(--anatomy-shade-2);stroke:var(--anatomy-shade-2)}
.sv-shell-tone[data-tone="2"]{fill:var(--anatomy-shade-3);stroke:var(--anatomy-shade-3)}
.sv-shell-tone[data-tone="3"]{fill:var(--anatomy-face);stroke:var(--anatomy-face)}
.sv-shell-tone[data-tone="4"]{fill:var(--anatomy-face);stroke:var(--anatomy-face)}
.sv-shell-glass path{fill:#8f9ba3;fill-opacity:.12;stroke:none}
.sv-shell-glass,.sv-shell-sil,.sv-shell-line,.sv-shell-hidden{pointer-events:none}
.sv-shell-sil{stroke:var(--anatomy-mid);stroke-width:.95px}
.sv-shell-hidden{opacity:.8}
.sv-flap path{fill:var(--anatomy-face);fill-opacity:.7;stroke:var(--anatomy-mid);stroke-width:.6px;cursor:pointer}
.sv-flap[data-on] path{stroke:var(--anatomy-lit);stroke-width:1.15px}
.sv-edge-fill{fill:var(--anatomy-shade-1);stroke:none}
.sv-skin [data-seamless-skin]>.iso-shade,.sv-skin [data-seamless-skin]>.iso-top{stroke-width:.5;stroke-linejoin:round}
.sv-skin [data-seamless-skin]>.iso-shade[data-shade="0"]{stroke:var(--anatomy-shade-0)}
.sv-skin [data-seamless-skin]>.iso-shade[data-shade="1"]{stroke:var(--anatomy-shade-1)}
.sv-skin [data-seamless-skin]>.iso-shade[data-shade="2"]{stroke:var(--anatomy-shade-2)}
.sv-skin [data-seamless-skin]>.iso-shade[data-shade="3"]{stroke:var(--anatomy-shade-3)}
.sv-skin [data-seamless-skin]>.iso-top{stroke:var(--anatomy-top)}
.sv-trim{--anatomy-paper:#e7e6e2;--anatomy-top:#ecebe7;--anatomy-shade-0:#d3d2ce;--anatomy-shade-1:#dad9d5;--anatomy-shade-2:#e0dfdb;--anatomy-shade-3:#e6e5e1}
.sv-moon>.iso-fill{fill:#8f9294;fill-opacity:.3}
.sv-moon>.iso-shade,.sv-moon>.iso-top{fill:#8f9294;fill-opacity:.18}
.sv-tyre{--anatomy-paper:#dededa;--anatomy-top:#e6e6e2;--anatomy-shade-0:#c9c9c5;--anatomy-shade-1:#d0d0cc;--anatomy-shade-2:#d7d7d3;--anatomy-shade-3:#deded9}
.it[data-sys]{transition:opacity .4s var(--anatomy-ease)}
[data-on] .iso-edge,[data-on] .tb-edge{stroke:var(--anatomy-lit);stroke-width:1.15px}
[data-on] .tb-body{fill:var(--anatomy-face)}
[data-on] .iso-line[data-tone="lo"],[data-on] .iso-line[data-tone="faint"]{stroke:var(--anatomy-mid)}
[data-on] .iso-fill{fill:var(--anatomy-face)}
[data-on] .iso-top{fill:var(--anatomy-lit-top)}
[data-on] .tb-body{fill:var(--anatomy-lit-shade)}
`;

mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist', 'repair-suv.svg'), svg);
const isoCss = readFileSync(join(HERE, '..', 'kit', 'iso.css'), 'utf8');
writeFileSync(
  join(ROOT, 'src', 'components', 'repairDiagram', 'figureCss.generated.ts'),
  `// Generated by figures/suv/build.mjs. Do not edit.\n// prettier-ignore\nexport const FIGURE_CSS = ${JSON.stringify((isoCss + CSS).replace(/\n\s*/g, ''))};\n`,
);
console.log('wrote dist/repair-suv.svg', `${(svg.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `scale ${KS.toFixed(3)}`);

if (PREVIEW) {
  const page = `<!doctype html><meta charset="utf-8"><title>SUV preview</title><style>${isoCss}${CSS}body{margin:0;background:var(--anatomy-page)}.wrap{max-width:1100px;margin:40px auto}</style><body class="iso" data-theme="light"><div class="wrap"><div class="iso-plate">${svg}</div></div><script>const on=new URLSearchParams(location.search).get('on');if(on)document.querySelectorAll('[data-sys="'+on+'"]').forEach(e=>e.setAttribute('data-on',''));</script></body>`;
  const out = join(ROOT, 'figures', 'suv', 'preview.html');
  writeFileSync(out, page);
  console.log('wrote', out);
}

A.auditOrExit(R, P, {});
