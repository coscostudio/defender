// The phantom body: one continuous shell for a Touareg-shaped SUV, lofted through
// cross-sections along the car. It is drawn the way a technical cutaway draws a body:
// a translucent skin over the mechanicals, a crisp silhouette, and the real feature lines
// (shoulder, windows, doors, hood, lamps, arches), with the far side's lines faint behind.
//
// World units are centimetres; x across (near side negative), y rear (0) to front, z up.
// The side profile was measured from a Touareg blueprint and scaled so its wheels match
// this chassis (72 cm tyres, 272 cm wheelbase).

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ curves

// Catmull-Rom through knots, densely sampled, then read back as z(y) (y must be monotone).
function profile(knots, samples = 12) {
  const pts = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const p0 = knots[Math.max(0, i - 1)];
    const p1 = knots[i];
    const p2 = knots[i + 1];
    const p3 = knots[Math.min(knots.length - 1, i + 2)];
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      pts.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(knots[knots.length - 1]);
  pts.sort((a, b) => a[0] - b[0]);
  return (y) => {
    if (y <= pts[0][0]) return pts[0][1];
    if (y >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid][0] <= y) lo = mid;
      else hi = mid;
    }
    const [y0, z0] = pts[lo];
    const [y1, z1] = pts[hi];
    return y1 === y0 ? z0 : z0 + ((z1 - z0) * (y - y0)) / (y1 - y0);
  };
}

export const Y0 = 3;
export const Y1 = 458;
// Upper silhouette: bumper face, hood, windshield, roof, spoiler, tailgate.
export const NOSE_Z = 58;
export const TAIL_Z = 54;
export const top = profile([
  [3, TAIL_Z],
  [4, 70],
  [7, 88],
  [13, 104],
  [21, 120],
  [31, 136],
  [43, 151],
  [53, 158.5],
  [64, 160.4],
  [100, 162.8],
  [150, 164.4],
  [200, 164.2],
  [240, 161],
  [262, 155],
  [296, 138],
  [332, 118.2],
  [380, 113],
  [420, 106],
  [440, 99],
  [450, 92],
  [455, 83],
  [457.5, 72],
  [458, NOSE_Z],
]);
// Lower silhouette: front lip, sill, rear diffuser.
export const low = profile([
  [3, TAIL_Z],
  [4, 44],
  [9, 35],
  [20, 30],
  [40, 27],
  [150, 25],
  [300, 25],
  [420, 26.5],
  [440, 29],
  [450, 33],
  [455.5, 40],
  [457.5, 48],
  [458, NOSE_Z],
]);
// Window line: the bottom of the side glass, rising toward the tail.
export const belt = (y) => 118 + (332 - y) * 0.032;
// Shoulder crease, a hand below the window line.
export const shoulder = (y) => belt(y) - 13;

// Plan: half-width, rounded well back from the nose and tail (the corners are soft, not boxed).
export const halfPlan = (y) => {
  let w = 92;
  if (y > 360) w -= 22 * ((y - 360) / (Y1 - 360)) ** 2.4;
  if (y < 70) w -= 14 * ((70 - y) / (70 - Y0)) ** 2.2;
  if (y > 440) w -= 14 * ((y - 440) / (Y1 - 440)) ** 3;
  if (y < 20) w -= 10 * ((20 - y) / (20 - Y0)) ** 3;
  return w;
};
// How much of the greenhouse (side glass, tumblehome) a station has: 0 over the hood, 1 behind
// the cowl, blended across it so the surface has no step where the windshield starts.
const gh = (y) => {
  const t = Math.min(1, Math.max(0, (346 - y) / 22));
  return t * t * (3 - 2 * t);
};

// Half-width of the body at height z over station y. Bottom to top: the rocker tucks under on
// a generous radius, the side swells out over the wheels to a crisp shoulder crease, and above
// the crease the body falls inward, hard to the roof (tumblehome) and softly over the hood.
export function halfWidth(y, z) {
  const zl = low(y);
  const zt = top(y);
  const W = halfPlan(y);
  const h = Math.max(0.01, zt - zl);
  const rt = Math.min(14, h * 0.4);
  const zs = Math.min(shoulder(y), zt - Math.min(6, h * 0.3));
  if (z < zl + rt) {
    const d = Math.min(1, (zl + rt - z) / rt);
    return W - 7 * (1 - Math.sqrt(Math.max(0, 1 - d * d)));
  }
  if (z <= zs) {
    const t = (z - zl - rt) / Math.max(1, zs - zl - rt);
    return W + 1.6 * Math.sin(Math.PI * Math.min(1, Math.max(0, t)) * 0.9);
  }
  const w0 = W + 1.6 * Math.sin(Math.PI * 0.9);
  const g = gh(y);
  const wt = W - 13 - 8 * g;
  const t = Math.min(1, (z - zs) / Math.max(0.5, zt - zs));
  return w0 - (w0 - wt) * t ** (1.7 - 0.45 * g);
}
// Crown across the roof and hood.
const crown = (y, xFrac) => (4 - gh(y)) * (1 - xFrac * xFrac);
export function topZ(y, x) {
  const wt = halfWidth(y, top(y));
  return top(y) + crown(y, Math.min(1, Math.abs(x) / Math.max(1, wt)));
}

// A point on the side surface, near side (x < 0) or far side.
export const side = (y, z, sign = -1) => [sign * halfWidth(y, Math.max(low(y), Math.min(top(y), z))), y, z];
// A point on the top surface.
export const onTop = (x, y) => [x, y, topZ(y, x)];
// A point on the nose face at height z (the station where the profile reaches z).
function invert(fn, z, a, b) {
  let lo = a;
  let hi = b;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const v = fn(mid);
    if (Math.sign(v - z) === Math.sign(fn(lo) - z)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
export function onFront(x, z) {
  const y = z >= NOSE_Z ? invert(top, z, 440, Y1) : invert(low, z, 440, Y1);
  return [Math.max(-halfWidth(y, z) + 1, Math.min(halfWidth(y, z) - 1, x)), y + 0.2, z];
}
export function onRear(x, z) {
  const y = z >= TAIL_Z ? invert(top, z, Y0, 40) : invert(low, z, Y0, 40);
  return [Math.max(-halfWidth(y, z) + 1, Math.min(halfWidth(y, z) - 1, x)), y - 0.2, z];
}

// ------------------------------------------------------------------ the shell mesh

function ringAt(y) {
  const zl = low(y);
  const zt = top(y);
  const h = Math.max(0.01, zt - zl);
  const right = [];
  const W = halfWidth(y, zl);
  right.push([0, zl], [W * 0.5, zl], [W - 0.01, zl]);
  // bottom round, side, upper tuck: sampled by height
  const N = 22;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const z = zl + h * (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
    right.push([halfWidth(y, z), z]);
  }
  const wt = halfWidth(y, zt);
  for (const f of [0.75, 0.5, 0.25, 0]) right.push([wt * f, zt + crown(y, f)]);
  const left = right
    .slice(1, -1)
    .reverse()
    .map(([x, z]) => [-x, z]);
  return [...right, ...left].map(([x, z]) => [x, y, z]);
}

function stations() {
  const ys = [];
  for (let y = Y0; y < 16; y += 0.8) ys.push(y);
  for (let y = 16; y < 444; y += 4) ys.push(y);
  for (let y = 444; y < Y1; y += 0.8) ys.push(y);
  ys.push(Y1 - 0.01);
  return ys;
}

// ------------------------------------------------------------------ drawing

export function buildShell({ P, V, at, k, G, AX_R, AX_F, WZ, FLARE, archPoints }) {
  const path3 = (pts, closed = false) => k.pathOf(pts.map(at), closed);
  const Ln = (d, style) => k.lineSvg(d, style);
  const rings = stations().map(ringAt);
  const n = rings[0].length;
  const facing = [];
  const buckets = [[], [], [], [], []];
  const quad = (i, j) => [rings[i][j], rings[i][(j + 1) % n], rings[i + 1][(j + 1) % n], rings[i + 1][j]];
  for (let i = 0; i < rings.length - 1; i++) {
    const row = [];
    const cy = (rings[i][0][1] + rings[i + 1][0][1]) / 2;
    const cz = (low(cy) + top(cy)) / 2;
    for (let j = 0; j < n; j++) {
      const q = quad(i, j);
      const a = G.sub3(q[2], q[0]);
      const b = G.sub3(q[3], q[1]);
      let nrm = G.cross3(a, b);
      const len = G.len3(nrm);
      if (len < 1e-9) {
        row.push(null);
        continue;
      }
      nrm = G.mul3(nrm, 1 / len);
      const c = G.mul3(G.add3(G.add3(q[0], q[1]), G.add3(q[2], q[3])), 0.25);
      if (G.dot3(nrm, G.sub3(c, [0, cy, cz])) < 0) nrm = G.mul3(nrm, -1);
      const seen = G.dot3(nrm, V) > 0;
      row.push(seen);
      if (seen) buckets[G.toneOf(nrm, P)].push(k.pathOf(q.map(at), true));
    }
    facing.push(row);
  }
  // Silhouette: every mesh edge between a face the viewer sees and one it doesn't. The end rings
  // are knife edges (top and bottom profiles meet), so they add no line of their own.
  const sil = [];
  for (let i = 0; i < facing.length; i++)
    for (let j = 0; j < n; j++) {
      const f = facing[i][j];
      if (f === null) continue;
      const right = facing[i][(j + 1) % n];
      if (right !== null && right !== f) sil.push([rings[i][(j + 1) % n], rings[i + 1][(j + 1) % n]]);
      if (i + 1 < facing.length) {
        const up = facing[i + 1][j];
        if (up !== null && up !== f) sil.push([rings[i + 1][j], rings[i + 1][(j + 1) % n]]);
      }
    }
  // Keep only the true outline: a fold inside the body (the chin curling under) is skin over
  // skin on screen, so an edge whose both sides are covered by seen faces is dropped.
  const seenQuads = [];
  for (let i = 0; i < facing.length; i++)
    for (let j = 0; j < n; j++) {
      if (!facing[i][j]) continue;
      const poly = quad(i, j).map(at);
      const xs = poly.map((p) => p[0]);
      const ys = poly.map((p) => p[1]);
      seenQuads.push({ poly, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
    }
  const inPoly = (poly, [x, y]) => {
    let inside = false;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xa, ya] = poly[a];
      const [xb, yb] = poly[b];
      if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
    }
    return inside;
  };
  const covered = (pt) => seenQuads.some((q) => pt[0] >= q.x0 && pt[0] <= q.x1 && pt[1] >= q.y0 && pt[1] <= q.y1 && inPoly(q.poly, pt));
  const outline = sil.filter(([a, b]) => {
    const [pa, pb] = [at(a), at(b)];
    const dx = pb[0] - pa[0];
    const dy = pb[1] - pa[1];
    const len = Math.hypot(dx, dy) || 1;
    const m = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
    const off = 1.5;
    const nx = (-dy / len) * off;
    const ny = (dx / len) * off;
    return !(covered([m[0] + nx, m[1] + ny]) && covered([m[0] - nx, m[1] - ny]));
  });
  const silhouette = outline.map(([a, b]) => k.pathOf([at(a), at(b)])).join('');

  // ---- feature lines, as lists of 3D points
  const nearSide = (pts) => pts.map(([y, z]) => side(y, z, -1));
  const farSide = (pts) => pts.map(([y, z]) => side(y, z, 1));
  const lerpLine = (a, b, steps = 24) => Array.from({ length: steps + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps]);
  const along = (fn, y0, y1, steps = 60) => Array.from({ length: steps + 1 }, (_, i) => {
    const y = y0 + ((y1 - y0) * i) / steps;
    return [y, fn(y)];
  });
  const dense = (pts) => pts.flatMap((p, i) => (i ? lerpLine(pts[i - 1], p, 10).slice(1) : [p]));

  // Windows (the daylight opening) and the pillars between them.
  const A_BASE = 326;
  const aLine = (t) => [A_BASE + (258 - A_BASE) * t, belt(A_BASE) + (top(258) - 4.5 - belt(A_BASE)) * t];
  const roofLine = (y) => top(y) - 4.5;
  const DLO = dense([aLine(0), aLine(1), ...along(roofLine, 250, 78, 12).map(([y, z]) => [y, z]), [64, 150], [56, belt(56) + 2], ...along(belt, 60, A_BASE - 2, 10)]);
  const B = [236, 244];
  const C = [124, 131];
  const pillar = (y0, y1) => [
    dense([[y0, belt(y0)], [y0, roofLine(y0)]]),
    dense([[y1, belt(y1)], [y1, roofLine(y1)]]),
  ];
  // The sill line runs between the two arch bands; arches, door cuts and the lamps end on it,
  // on the window line or on each other, never in the air.
  const SILL_UP = 9;
  const sillZ = (y) => low(y) + SILL_UP;
  const trimArch = (cy, r) => archPoints(cy, r).filter(([y, z]) => z >= sillZ(y));
  const archBand = (cy) => {
    const inner = trimArch(cy, FLARE);
    const outer = trimArch(cy, FLARE + 4.5);
    // one closed band: outer arc, down to the sill line, inner arc back, and across
    return [...outer, inner[inner.length - 1], ...[...inner].reverse(), outer[0]];
  };
  const nearestOn = (pts, y) => pts.reduce((best, p) => (Math.abs(p[0] - y) < Math.abs(best[0] - y) && p[1] > WZ ? p : best), pts.find((p) => p[1] > WZ));
  const rearOuter = trimArch(AX_R, FLARE + 4.5);
  const frontOuter = trimArch(AX_F, FLARE + 4.5);
  const doorRear = nearestOn(rearOuter, 127);
  const doors = [
    dense([[318, sillZ(318)], [318, belt(318)]]), // front door's leading edge, behind the arch
    dense([[240, sillZ(240)], [240, belt(240)]]), // between the doors
    dense([[127, belt(127)], doorRear]), // rear door's trailing edge, down onto the arch
  ];
  const handles = [k.roundedPlan({ x: 286, y: shoulder(286) - 4.5, w: 16, d: 3.2, r: 1.6 }, 3), k.roundedPlan({ x: 176, y: shoulder(176) - 4.5, w: 16, d: 3.2, r: 1.6 }, 3)];
  const sill = dense([rearOuter[rearOuter.length - 1], frontOuter[0]]);
  const archs = [archBand(AX_R), archBand(AX_F)];
  const shoulderLine = along(shoulder, 44, 422, 80);
  const flap = k.roundedPlan({ x: 56, y: shoulder(60) - 13, w: 11, d: 11, r: 2.4 }, 3);
  const tailLamp = dense([[44, shoulder(44)], [27, shoulder(27)], [26, shoulder(27) + 7], [33, shoulder(33) + 10], [54, shoulder(54) + 5.5]]);
  const headLamp = dense([[446, 97], [424, 104.5], [420, shoulder(422)], [440, 93]]);
  const sideFeatures = [DLO, ...pillar(...B), ...pillar(...C), ...doors, ...handles, sill, ...archs, shoulderLine, tailLamp, headLamp];
  const visible = [];
  const hidden = [];
  for (const f of sideFeatures) {
    const closed = f === DLO || handles.includes(f) || f === headLamp || f === tailLamp || archs.includes(f);
    visible.push(path3(nearSide(f), closed));
  }
  for (const cy of [AX_R, AX_F]) hidden.push(path3(farSide(trimArch(cy, FLARE))));

  // Top: hood shut lines, windshield, roof and the panoramic moonroof.
  const topCurve = (pts, closed = true) => path3(dense(pts).map(([x, y]) => onTop(x, y)), closed);
  const wsWidth = (y) => halfWidth(y, top(y)) - 6;
  visible.push(topCurve([[-wsWidth(330), 333], [wsWidth(330), 333], [wsWidth(264), 264], [-wsWidth(264), 264]]));
  const hoodW = (y) => halfWidth(y, top(y)) - 1.5;
  visible.push(topCurve([[-wsWidth(333), 333], [-hoodW(400), 400], [-hoodW(438), 439], [0, 444], [hoodW(438), 439], [hoodW(400), 400], [wsWidth(333), 333]], false));

  // Nose: the grille between slim headlamps, the lower intake, fog lamps; the plate.
  // fx is a fraction of the body's width; the point is pushed back onto the rounded nose
  // so the features wrap the corners instead of floating ahead of them.
  const frontAt = (fx, z) => {
    const [, yc] = onFront(0, z);
    const x = fx * (halfWidth(400, z) - 3);
    let lo = yc - 80;
    let hi = yc - 0.2;
    for (let i = 0; i < 30; i += 1) {
      const mid = (lo + hi) / 2;
      if (halfWidth(mid, z) >= Math.abs(x) + 0.3) lo = mid;
      else hi = mid;
    }
    return [x, lo, z];
  };
  const front = (pts, closed = true) => path3(dense(pts).map(([fx, z]) => frontAt(fx, z)), closed);
  const noseFeatures = [
    front([[-0.42, 88], [0.42, 88], [0.4, 76], [-0.4, 76]]),
    front([[-0.41, 84], [0.41, 84]], false),
    front([[-0.405, 80], [0.405, 80]], false),
    ...[-1, 1].map((s) => front([[s * 0.46, 89], [s * 0.86, 92], [s * 0.88, 84], [s * 0.48, 78]])),
    front([[-0.52, 62], [0.52, 62], [0.46, 46], [-0.46, 46]]),
    front([[-0.505, 57], [0.505, 57]], false),
    front([[-0.485, 51.5], [0.485, 51.5]], false),
    ...[-1, 1].map((s) => front([[s * 0.66, 52], [s * 0.82, 52], [s * 0.82, 44], [s * 0.66, 44]])),
    front([[-0.19, 74.6], [0.19, 74.6], [0.19, 65.6], [-0.19, 65.6]]),
  ];
  visible.push(...noseFeatures);

  // Glass: the side windows, windshield and moonroof get a light tint.
  const glassSide = (pts) => path3(nearSide(dense(pts)), true);
  const glass = [
    glassSide([aLine(0), aLine(1), [B[1], roofLine(B[1])], [B[1], belt(B[1])]]),
    glassSide([[B[0], belt(B[0])], [B[0], roofLine(B[0])], [C[1], roofLine(C[1])], [C[1], belt(C[1])]]),
    glassSide([[C[0], belt(C[0])], [C[0], roofLine(C[0])], [78, roofLine(78)], [64, 150], [56, belt(56) + 2]]),
    topCurve([[-wsWidth(330), 333], [wsWidth(330), 333], [wsWidth(264), 264], [-wsWidth(264), 264]]),
  ];

  // The haze is cut away over the near-side wheel openings so the wheels read clearly.
  const wheelCut = (sign) => [AX_R, AX_F].map((cy) => {
    const pts = archPoints(cy, FLARE - 1.2);
    return path3([[pts[0][0], 0], ...pts, [pts[pts.length - 1][0], 0]].map(([y, z]) => side(y, z, sign)), true);
  });
  const lineMask =
    '<mask id="sv-line-mask" maskUnits="userSpaceOnUse"><rect x="-2000" y="-2000" width="5000" height="5000" fill="#fff"/>' +
    wheelCut(-1).map((d) => `<path d="${d}" fill="#000"/>`).join('') +
    '</mask>';
  const archOpenings = [AX_R, AX_F].map((cy) => {
    const pts = archPoints(cy, FLARE);
    return path3(nearSide([[pts[0][0], 0], ...pts, [pts[pts.length - 1][0], 0]]), true);
  });

  const tones = buckets.map((list, i) => (list.length ? `<path class="sv-shell-tone" data-tone="${i}" d="${list.join('')}"/>` : '')).join('');
  return {
    hidden: Ln(hidden.join(''), { tone: 'faint', className: 'sv-shell-hidden' }),
    haze:
      `<mask id="sv-shell-mask" maskUnits="userSpaceOnUse"><rect x="-2000" y="-2000" width="5000" height="5000" fill="#fff"/>` +
      archOpenings.map((d) => `<path d="${d}" fill="#000"/>`).join('') +
      `</mask><g class="sv-shell" mask="url(#sv-shell-mask)">${tones}</g>` +
      `<g class="sv-shell-glass">${glass.map((d) => `<path d="${d}"/>`).join('')}</g>`,
    lines: lineMask + `<g mask="url(#sv-line-mask)">${Ln(silhouette, { tone: 'mid', className: 'sv-shell-sil' })}${Ln(visible.join(''), { tone: 'lo', className: 'sv-shell-line' })}</g>`,
    flap: path3(nearSide(flap), true),
    flapOutward: (p) => p,
    points: { side, onTop, onFront, topZ },
  };
}
