/* Whale maid: articulated 3D geometry built from the supplied turnaround.
   Front faces -Z. All artwork is drawn locally; no remote assets or model loader. */
(() => {
'use strict';
const T = THREE, G = window.G;
const material = (hex, options = {}) => {
  const m = G.cityToon(hex, options);
  m.color.convertSRGBToLinear();
  if (options.emissive) m.emissive.convertSRGBToLinear();
  return m;
};
const PALETTE = { navy: '#191d4a', blue: '#2f407c', tip: '#78afd1', white: '#fffaf4',
  lace: '#ddd8eb', skin: '#ffe0d0', gold: '#dcaf58', ribbon: '#56a8d2' };
const primitiveCache = new Map();
const smooth = t => { t = G.clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function texture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.anisotropy = 4;
  return tex;
}
function mesh(parent, geometry, mat, x = 0, y = 0, z = 0, name = '') {
  const m = new T.Mesh(geometry, mat); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true; m.name = name; parent.add(m); return m;
}
function ellipsoid(parent, mat, pos, scale, name = '') {
  const size = Math.max(...scale);
  const segments = size < .06 ? [10, 8] : size < .2 ? [18, 12] : [32, 20];
  const key = 'sphere-' + segments.join('-');
  if (!primitiveCache.has(key)) primitiveCache.set(key, new T.SphereGeometry(1, ...segments));
  const m = mesh(parent, primitiveCache.get(key), mat, ...pos, name);
  m.scale.set(...scale); return m;
}
function capsule(parent, mat, r, length, x, y, z) {
  return mesh(parent, new T.CapsuleGeometry(r, length, 6, 16), mat, x, y, z);
}
function strand(points, radius, colorA, colorB, flatten = 1, taper = true) {
  const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
  const N = Math.max(14, Math.min(48, Math.ceil(curve.getLength() * 56))), R = radius < .025 ? 6 : 12;
  const frames = curve.computeFrenetFrames(N, false);
  const pos = [], colors = [], uv = [], indices = [];
  const a = new T.Color(colorA).convertSRGBToLinear(), b = new T.Color(colorB).convertSRGBToLinear();
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = curve.getPointAt(t);
    const r = radius * (taper ? Math.pow(Math.sin(Math.PI * (.08 + t * .92)), .58) : 1 - .66 * t);
    const c = a.clone().lerp(b, smooth((t - .38) / .62));
    for (let j = 0; j <= R; j++) {
      const angle = j / R * Math.PI * 2;
      const v = p.clone().addScaledVector(frames.normals[i], Math.cos(angle) * r)
        .addScaledVector(frames.binormals[i], Math.sin(angle) * r * flatten);
      const shine = .92 + .12 * Math.pow(Math.max(0, Math.cos(angle - .4)), 8);
      pos.push(v.x, v.y, v.z); colors.push(c.r * shine, c.g * shine, c.b * shine); uv.push(j / R, t);
      if (i < N && j < R) {
        const k = i * (R + 1) + j;
        indices.push(k, k + 1, k + R + 1, k + 1, k + R + 2, k + R + 1);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}
function cloth(parent, mat, draw, depth = .012, name = '') {
  const shape = new T.Shape(); draw(shape);
  const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 3,
    steps: 1, bevelSize: .006, bevelThickness: .006, curveSegments: 14 });
  return mesh(parent, g, mat, 0, 0, -depth / 2, name);
}
function bow(parent, mat, width, height, position, tails = false) {
  const group = new T.Group(); group.position.set(...position); parent.add(group);
  const ribbonMat = mat.clone(); ribbonMat.side = T.DoubleSide;
  for (const side of [-1, 1]) {
    const loop = mesh(group, surface(12, 24, (u, v) => {
      const spread = .13 + .87 * Math.sin(u * Math.PI * .65);
      return [side * width * u, (v * 2 - 1) * height * spread + Math.sin(u * Math.PI) * height * .15,
        -.025 - Math.sin(u * Math.PI) * height * .65 + Math.sin(v * Math.PI * 3) * .007 * u];
    }), ribbonMat, 0, 0, 0, 'folded-bow-loop');
    if (tails) {
      mesh(group, surface(18, 10, (u, v) => {
        const notch = (1 - Math.abs(u * 2 - 1)) * .18 * smooth((v - .82) / .18);
        return [side * (.014 + v * .055 + u * width * .30), -.025 - (v - notch) * height * 2.5,
          -.029 - Math.sin(v * Math.PI) * .012 + Math.cos(u * Math.PI * 2) * .004];
      }), ribbonMat, 0, 0, 0, 'ribbon-tail');
    }
  }
  ellipsoid(group, mat, [0, 0, -.02], [width * .21, height * .37, .027], 'bow-knot');
  return group;
}
function faceTexture() {
  return texture(1024, 1024, ctx => {
    ctx.scale(2, 2);
    // Large blue irises, a white highlight and a dark upper eyelash.
    for (const side of [-1, 1]) {
      const x = 256 + side * 107, y = 262;
      ctx.save(); ctx.translate(x, y); ctx.rotate(side * -.06);
      ctx.beginPath(); ctx.moveTo(-52, -20); ctx.bezierCurveTo(-38, -76, 34, -86, 54, -22);
      ctx.bezierCurveTo(63, 21, 37, 69, 2, 70); ctx.bezierCurveTo(-38, 69, -57, 24, -52, -20); ctx.closePath();
      ctx.fillStyle = '#fffdf7'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#565475'; ctx.stroke();
      ctx.save(); ctx.clip();
      const grad = ctx.createLinearGradient(0, -65, 0, 72);
      grad.addColorStop(0, '#142858'); grad.addColorStop(.55, '#327ab6'); grad.addColorStop(1, '#8eddec');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.ellipse(4, 3, 39, 66, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#204377'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = 'rgba(147,219,244,.65)'; ctx.lineWidth = 2;
      for (let i = 0; i < 13; i++) { const a = Math.PI * .14 + i / 12 * Math.PI * .76;
        ctx.beginPath(); ctx.moveTo(4 + Math.cos(a) * 22, 3 + Math.sin(a) * 37);
        ctx.lineTo(4 + Math.cos(a) * 34, 3 + Math.sin(a) * 57); ctx.stroke(); }
      ctx.fillStyle = '#142855'; ctx.beginPath(); ctx.ellipse(5, -4, 18, 45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f9ffff'; ctx.beginPath(); ctx.ellipse(-12, -35, 15, 22, -.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(24, 32, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#182340'; ctx.lineWidth = 11; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-52, -21); ctx.bezierCurveTo(-33, -81, 35, -87, 54, -22); ctx.stroke();
      for (const [dy, reach] of [[-22, 67], [-37, 65], [-49, 58]]) {
        ctx.beginPath(); ctx.moveTo(side * 45, dy); ctx.lineTo(side * reach, dy - 16); ctx.stroke();
      }
      ctx.strokeStyle = '#354572'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-37, -104); ctx.quadraticCurveTo(0, -116, 38, -101); ctx.stroke();
      ctx.restore();
      const blush = ctx.createRadialGradient(x + side * 20, 357, 3, x + side * 20, 357, 48);
      blush.addColorStop(0, 'rgba(244,142,148,.38)'); blush.addColorStop(1, 'rgba(244,142,148,0)');
      ctx.fillStyle = blush; ctx.fillRect(x - 45, 325, 110, 80);
      ctx.strokeStyle = 'rgba(213,110,129,.38)'; ctx.lineWidth = 2;
      for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.moveTo(x + side * 17 + j * 8, 353); ctx.lineTo(x + side * 13 + j * 8, 366); ctx.stroke(); }
    }
    ctx.fillStyle = '#8b3b51'; ctx.beginPath(); ctx.moveTo(221, 397);
    ctx.quadraticCurveTo(257, 410, 291, 395); ctx.bezierCurveTo(286, 441, 263, 454, 237, 438);
    ctx.quadraticCurveTo(222, 426, 221, 397); ctx.fill();
    ctx.fillStyle = '#fff8ef'; ctx.beginPath(); ctx.moveTo(225, 400); ctx.quadraticCurveTo(259, 412, 287, 399);
    ctx.lineTo(284, 407); ctx.quadraticCurveTo(256, 420, 229, 409); ctx.fill();
    ctx.fillStyle = '#f2a1a8'; ctx.beginPath(); ctx.ellipse(258, 434, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d8988a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(259, 350); ctx.quadraticCurveTo(263, 357, 253, 359); ctx.stroke();
  });
}
function hairTexture() {
  return texture(256, 1024, ctx => {
    ctx.fillStyle = '#eeeeee'; ctx.fillRect(0, 0, 256, 1024);
    const sheen = ctx.createLinearGradient(0, 0, 256, 0);
    sheen.addColorStop(0, '#bfc3cf'); sheen.addColorStop(.28, '#f5f7ff'); sheen.addColorStop(.40, '#ffffff');
    sheen.addColorStop(.62, '#e5e8f2'); sheen.addColorStop(1, '#afb6c8');
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, 256, 1024);
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 12; i++) {
      ctx.strokeStyle = i % 3 ? 'rgba(84,101,143,.13)' : 'rgba(255,255,255,.55)';
      const x = 17 + i * 19; ctx.beginPath(); ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 9, 260, x - 12, 650, x + 6, 1024); ctx.stroke();
    }
    const glint = ctx.createLinearGradient(0, 140, 0, 390);
    glint.addColorStop(0, 'rgba(255,255,255,0)'); glint.addColorStop(.45, 'rgba(255,255,255,.32)'); glint.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glint; ctx.fillRect(0, 140, 256, 250);
  });
}
function laceTexture() {
  return texture(1024, 128, ctx => {
    ctx.fillStyle = '#fffaf5'; ctx.fillRect(0, 0, 1024, 128);
    ctx.strokeStyle = '#d7ccdc'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 24; i++) {
      const x = (i + .5) * 1024 / 24;
      ctx.beginPath(); ctx.ellipse(x, 79, 12, 19, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.ellipse(x, 79, 6, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.moveTo(x - 17, 38); ctx.quadraticCurveTo(x, 58, x + 17, 38); ctx.stroke();
      ctx.fillStyle = '#d7ccdc'; ctx.beginPath(); ctx.arc(x, 24, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.setLineDash([3, 4]);
    for (const y of [8, 115]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke(); }
  });
}
function skirtTexture() {
  return texture(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.navy; ctx.fillRect(0, 0, w, h);
    const sheen = ctx.createLinearGradient(0, 0, 0, h);
    sheen.addColorStop(0, 'rgba(77,86,151,.35)'); sheen.addColorStop(1, 'rgba(56,59,115,.08)');
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d5b46d'; ctx.lineWidth = 2;
    for (const y of [420, 473]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.strokeStyle = '#bc9558';
    for (let x = 0; x < w; x += 85) {
      ctx.beginPath(); ctx.moveTo(x, 457); ctx.bezierCurveTo(x + 24, 409, x + 61, 496, x + 85, 444); ctx.stroke();
      for (let j = 0; j < 4; j++) {
        const px = x + 15 + j * 17, py = 439 + Math.sin(j * 1.4) * 8;
        ctx.save(); ctx.translate(px, py); ctx.rotate(j % 2 ? -.7 : .7);
        ctx.beginPath(); ctx.ellipse(0, -7, 3.5, 8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      ctx.beginPath(); ctx.arc(x + 42, 428, 3, 0, Math.PI * 2); ctx.fillStyle = '#e5c87e'; ctx.fill();
    }
  });
}
function apronTexture() {
  return texture(512, 512, ctx => {
    ctx.fillStyle = PALETTE.white; ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#ddd8e1'; ctx.lineWidth = 2;
    for (const x of [140, 255, 368]) {
      ctx.beginPath(); ctx.moveTo(x, 5); ctx.bezierCurveTo(x - 20, 180, x + 25, 300, x - 6, 444); ctx.stroke();
    }
    ctx.strokeStyle = '#d9b56a'; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(16, 10); ctx.lineTo(16, 447); ctx.quadraticCurveTo(256, 535, 496, 447); ctx.lineTo(496, 10); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.translate(325, 369); ctx.rotate(-.12); ctx.scale(.82, 1.20); ctx.fillStyle = '#455993';
    ctx.beginPath(); ctx.moveTo(-57, 10); ctx.bezierCurveTo(-70, -50, 9, -60, 33, -5);
    ctx.quadraticCurveTo(67, 10, 77, -15); ctx.lineTo(62, -26); ctx.quadraticCurveTo(89, -41, 94, -8);
    ctx.quadraticCurveTo(81, 43, 30, 47); ctx.quadraticCurveTo(-11, 53, -57, 10); ctx.fill();
    ctx.fillStyle = PALETTE.white; ctx.beginPath(); ctx.ellipse(-9, 29, 31, 11, .18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-34, -2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#455993';
    for (const [x, y, a] of [[-15, -66, -.5], [-2, -77, 0], [12, -66, .6]]) {
      ctx.beginPath(); ctx.ellipse(x, y, 5, 11, a, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });
}
function surface(rows, columns, point, reverse = false) {
  const pos = [], uv = [], index = [];
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
    pos.push(...point(x / columns, y / rows)); uv.push(x / columns, 1 - y / rows);
    if (y < rows && x < columns) {
      const a = y * (columns + 1) + x;
      index.push(a, a + 1, a + columns + 1, a + 1, a + columns + 2, a + columns + 1);
    }
  }
  if (reverse) for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(index); g.computeVertexNormals(); return g;
}
const cheekWidth = y => 1 - .23 * smooth((-y / .278 - .15) / .85);
function faceDepth(x, y) {
  return -.226 * Math.sqrt(Math.max(.015, 1 - Math.pow(x / (.254 * cheekWidth(y)), 2) - Math.pow(y / .278, 2)));
}
function sculptedHead() {
  const geometry = new T.SphereGeometry(1, 56, 40), p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) * .278;
    p.setXYZ(i, p.getX(i) * .254 * cheekWidth(y), y, p.getZ(i) * .226);
  }
  geometry.computeVertexNormals(); return geometry;
}
// Accessories share a material and move with one joint, so they need one draw each.
function batchStaticDetails(root) {
  const parents = []; root.traverse(o => { if (o.isGroup) parents.push(o); });
  for (const parent of parents) {
    const buckets = new Map();
    for (const child of parent.children) {
      if (!child.isMesh || child.material.transparent || child.material.map || child.name === 'ahoge') continue;
      if (!buckets.has(child.material)) buckets.set(child.material, []);
      buckets.get(child.material).push(child);
    }
    for (const [mat, items] of buckets) {
      if (items.length < 2) continue;
      const positions = [], normals = [], uvs = [], colors = [], names = [];
      for (const item of items) {
        item.updateMatrix();
        const geometry = item.geometry.index ? item.geometry.toNonIndexed() : item.geometry.clone();
        geometry.applyMatrix4(item.matrix);
        positions.push(...geometry.attributes.position.array); normals.push(...geometry.attributes.normal.array);
        const uv = geometry.attributes.uv;
        if (uv) uvs.push(...uv.array); else for (let i = 0; i < geometry.attributes.position.count; i++) uvs.push(0, 0);
        if (mat.vertexColors) {
          const c = geometry.attributes.color;
          if (c) colors.push(...c.array); else for (let i = 0; i < geometry.attributes.position.count; i++) colors.push(1, 1, 1);
        }
        if (item.name) names.push(item.name);
        geometry.dispose(); parent.remove(item);
      }
      const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
      if (mat.vertexColors) geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      const combined = mesh(parent, geometry, mat, 0, 0, 0, 'tailored-details'); combined.userData.parts = names;
    }
  }
}

G.createWhaleMaid = () => {
  const navy = material(PALETTE.navy), white = new T.MeshStandardMaterial({ color: PALETTE.white, roughness: .82 }), lace = material(PALETTE.lace);
  const skin = new T.MeshStandardMaterial({ color: PALETTE.skin, roughness: .88 }), gold = new T.MeshStandardMaterial({ color: PALETTE.gold, roughness: .38, metalness: .25 }), blueRibbon = material(PALETTE.ribbon);
  for (const m of [white, skin, gold]) m.color.convertSRGBToLinear();
  const laceFabric = material('#ffffff', { map: laceTexture(), side: T.DoubleSide, alphaTest: .45 });
  const hairMat = material('#ffffff', { vertexColors: true, map: hairTexture(), emissive: '#1b2844', emissiveIntensity: .12 });
  const hairDark = material(PALETTE.blue, { emissive: '#152442', emissiveIntensity: .2 });
  const root = new T.Group(); root.name = 'whale-maid';
  const rider = new T.Group(), hipsG = new T.Group(), spine = new T.Group(), headG = new T.Group();
  root.add(rider); rider.add(hipsG, spine); spine.add(headG); headG.position.y = 1.64;
  const legs = [], arms = [], hairLocks = [];
  for (const side of [-1, 1]) {
    const hip = new T.Group(); hip.position.set(side * .115, .62, 0); hipsG.add(hip);
    mesh(hip, new T.LatheGeometry([new T.Vector2(.052, -.25), new T.Vector2(.057, -.18), new T.Vector2(.063, -.06), new T.Vector2(.06, .018)], 24), skin);
    const knee = new T.Group(); knee.position.y = -.25; hip.add(knee);
    ellipsoid(knee, skin, [0, -.008, 0], [.052, .052, .051], 'soft-knee');
    mesh(knee, new T.LatheGeometry([new T.Vector2(.038, -.23), new T.Vector2(.043, -.18), new T.Vector2(.052, -.10), new T.Vector2(.052, .009)], 24), skin);
    const ankle = new T.Group(); ankle.position.y = -.25; knee.add(ankle);
    mesh(ankle, new T.CylinderGeometry(.045, .054, .13, 16), white, 0, .015, 0, 'white-sock');
    mesh(ankle, surface(5, 64, (u, v) => { const a = u * Math.PI * 2, r = .047 + v * .018 + Math.sin(a * 12) * .005 * v;
      return [Math.sin(a) * r, .070 + v * .032 + Math.cos(a * 12) * .007 * v, Math.cos(a) * r];
    }), laceFabric, 0, 0, 0, 'sock-lace-cuff');
    ellipsoid(ankle, navy, [0, -.053, -.033], [.071, .055, .128], 'mary-jane-shoe');
    mesh(ankle, new T.BoxGeometry(.103, .047, .083), navy, 0, -.076, .036, 'shoe-heel');
    const welt = new T.TubeGeometry(new T.CatmullRomCurve3(Array.from({ length: 24 }, (_, i) => {
      const a = i / 24 * Math.PI * 2; return new T.Vector3(Math.sin(a) * .069, -.080, -.034 + Math.cos(a) * .115);
    }), true), 48, .004, 5, true);
    mesh(ankle, welt, material('#30345d'), 0, 0, 0, 'shoe-stitched-welt');
    ellipsoid(ankle, white, [0, -.018, -.05], [.047, .019, .062], 'shoe-opening');
    const strap = mesh(ankle, new T.BoxGeometry(.124, .024, .028), navy, 0, -.003, -.031, 'shoe-strap');
    strap.rotation.z = side * -.05;
    const buckle = mesh(ankle, new T.TorusGeometry(.018, .004, 6, 4), gold, side * .061, .004, -.05);
    buckle.rotation.y = side * .7; buckle.rotation.z = Math.PI / 4;
    legs.push({ hip, knee, ankle, side, baseY: .62 });
  }
  ellipsoid(spine, navy, [0, 1.23, 0], [.211, .225, .16], 'fitted-bodice');
  mesh(spine, new T.CylinderGeometry(.057, .07, .12, 20), skin, 0, 1.43, 0);
  mesh(spine, surface(24, 36, (u, v) => {
    const x = (u * 2 - 1) * (.113 - .012 * v), y = 1.43 - v * .323;
    return [x, y, -.179 + Math.pow(x / .12, 2) * .025 + Math.cos(u * Math.PI * 14) * .0025];
  }), material(PALETTE.white, { side: T.DoubleSide }), 0, 0, 0, 'pleated-white-bib');
  for (const y of [1.18, 1.25, 1.32]) ellipsoid(spine, navy, [0, y, -.186], [.012, .013, .008]);
  for (const side of [-1, 1]) {
    mesh(spine, surface(5, 64, (u, v) => { const y = 1.43 - u * .30;
      return [side * (.117 + v * .052 + Math.sin(u * Math.PI * 18) * .005 * v), y,
        -.15 - Math.sin(u * Math.PI) * .018 - Math.cos(u * Math.PI * 18) * .017 * v];
    }), laceFabric, 0, 0, 0, 'folded-bodice-lace');
    const shoulder = new T.Group(); shoulder.position.set(side * .225, 1.37, 0); spine.add(shoulder);
    ellipsoid(shoulder, navy, [side * .015, -.062, 0], [.088, .105, .088], 'puff-sleeve');
    capsule(shoulder, navy, .061, .09, 0, -.14, 0);
    const elbow = new T.Group(); elbow.position.y = -.22; shoulder.add(elbow);
    capsule(elbow, navy, .057, .125, 0, -.092, 0);
    mesh(elbow, new T.CylinderGeometry(.062, .07, .065, 20), navy, 0, -.19, 0, 'gold-trimmed-cuff');
    const trim = mesh(elbow, new T.TorusGeometry(.066, .004, 6, 24), gold, 0, -.175, 0); trim.rotation.x = Math.PI / 2;
    mesh(elbow, surface(6, 64, (u, v) => { const a = u * Math.PI * 2, r = .061 + v * .018 + Math.sin(a * 12) * .008 * v;
      return [Math.sin(a) * r, -.212 - v * (.043 + Math.cos(a * 12) * .005), Math.cos(a) * r];
    }), laceFabric, 0, 0, 0, 'sleeve-lace-cuff');
    ellipsoid(elbow, skin, [0, -.279, -.003], [.039, .047, .024], 'hand');
    for (let f = 0; f < 4; f++) {
      const length = [.032, .046, .042, .032][f];
      const finger = capsule(elbow, skin, .0085, length, (f - 1.5) * .015, -.309 - length * .3, -.009);
      finger.rotation.x = -.18; finger.rotation.z = (f - 1.5) * -.07;
    }
    const thumb = capsule(elbow, skin, .014, .024, side * -.035, -.283, -.008); thumb.rotation.z = side * -.6;
    const hand = new T.Object3D(); hand.name = 'hand-anchor'; hand.position.set(0, -.29, -.003); elbow.add(hand);
    arms.push({ shoulder, elbow, hand, baseZ: side * .34 });
  }
  const skirt = new T.Group(); spine.add(skirt);
  const skirtMat = material('#ffffff', { map: skirtTexture(), side: T.DoubleSide });
  const skirtGeo = surface(32, 128, (u, v) => {
    const a = u * Math.PI * 2;
    const r = .215 + Math.pow(v, .8) * .26 + Math.cos(a * 14) * (.003 + .013 * Math.pow(v, 1.4));
    return [Math.sin(a) * r, 1.09 - v * .51 + Math.sin(a * 14) * .004 * Math.pow(v, 3), Math.cos(a) * r * .88];
  });
  mesh(skirt, skirtGeo, skirtMat, 0, 0, 0, 'embroidered-pleated-skirt');
  mesh(skirt, new T.CylinderGeometry(.44, .48, .064, 64, 1, true), white, 0, .562, 0, 'petticoat');
  mesh(skirt, surface(10, 204, (u, v) => {
    const a = u * Math.PI * 2, fold = Math.sin(a * 34), r = .471 + .022 * v + fold * .015 * v;
    return [Math.sin(a) * r, .593 - .074 * v + Math.cos(a * 34) * .006 * v, Math.cos(a) * r * .88];
  }), laceFabric, 0, 0, 0, 'scalloped-pleated-petticoat');
  const apronPoint = (u, v) => {
    const side = u * 2 - 1;
    const bottom = .633 + .09 * Math.pow(Math.abs(side), 3);
    const y = 1.065 + (bottom - 1.065) * v;
    const r = .215 + Math.pow((1.09 - y) / .51, .8) * .26;
    const a = side * (.72 + .09 * v);
    return [Math.sin(a) * r, y, -Math.cos(a) * r * .88 - .021 - Math.sin(v * Math.PI) * Math.cos(side * Math.PI * 2) * .008];
  };
  const apronGeometry = surface(22, 28, apronPoint), apronUV = apronGeometry.attributes.uv;
  // Front is -Z, so reverse the decal's horizontal UV to preserve the reference emblem.
  for (let i = 0; i < apronUV.count; i++) apronUV.setX(i, 1 - apronUV.getX(i));
  mesh(skirt, apronGeometry, material('#ffffff', { map: apronTexture(), side: T.DoubleSide }), 0, 0, 0, 'whale-apron');
  mesh(skirt, surface(7, 108, (u, v) => { const p = apronPoint(u, 1);
    const a = (u * 2 - 1) * .81, y = p[1] - .042 * v + Math.cos(u * Math.PI * 36) * .004 * v;
    const r = .215 + Math.pow((1.09 - y) / .51, .8) * .26;
    return [Math.sin(a) * r + (u * 2 - 1) * .010 * v, y,
      -Math.cos(a) * r * .88 - .030 - Math.sin(u * Math.PI * 36) * .007 * v];
  }), laceFabric, 0, 0, 0, 'apron-scalloped-hem');
  for (const side of [-1, 1]) mesh(skirt, surface(6, 84, (u, v) => { const p = apronPoint(side > 0 ? 1 : 0, u);
    return [p[0] + side * .035 * v, p[1] - .004 * v, p[2] - .005 - Math.sin(u * Math.PI * 26) * .014 * v];
  }), laceFabric, 0, 0, 0, 'apron-folded-edge');
  mesh(spine, new T.CylinderGeometry(.223, .223, .09, 40), navy, 0, 1.075, 0, 'waistband');
  for (const side of [-1, 1]) for (const y of [1.05, 1.096]) {
    ellipsoid(spine, gold, [side * .11, y, -.197], [.012, .012, .009], 'waist-button');
  }
  const collarBow = bow(spine, navy, .092, .05, [0, 1.416, -.185], true);
  const gemRim = mesh(collarBow, new T.TorusGeometry(.02, .004, 8, 20), gold, 0, 0, -.047);
  const gem = new T.MeshStandardMaterial({ color: '#326daa', roughness: .17, metalness: .28 }); gem.color.convertSRGBToLinear();
  ellipsoid(collarBow, gem, [0, 0, -.049], [.014, .019, .007], 'blue-brooch');
  const backBow = bow(spine, white, .223, .092, [0, 1.02, .255]); backBow.rotation.y = Math.PI;
  const backRibbonMat = material(PALETTE.white, { side: T.DoubleSide });
  for (const side of [-1, 1]) mesh(backBow, surface(32, 16, (u, v) => {
    const notch = (1 - Math.abs(u * 2 - 1)) * .08 * smooth((v - .82) / .18);
    const x = side * (.028 + .095 * v + (u - .5) * (.11 + .04 * v)), y = -.015 - v * .32 + notch;
    const r = .215 + Math.pow((1.09 - (1.02 + y)) / .51, .8) * .26;
    return [x, y, .255 - (Math.sqrt(Math.max(.01, r * r - x * x)) * .88 + .023) - Math.cos(u * Math.PI * 3) * .007];
  }), backRibbonMat, 0, 0, 0, 'draped-back-bow-tail');
  for (const side of [-1, 1]) bow(skirt, gold, .039, .023, [side * .33, .66, -.295], true);

  mesh(headG, sculptedHead(), skin, 0, 0, 0, 'sculpted-face');
  ellipsoid(headG, skin, [0, -.085, -.222], [.009, .013, .012], 'soft-nose');
  for (const side of [-1, 1]) ellipsoid(headG, skin, [side * .245, -.050, .013], [.026, .050, .028], 'ear');
  const eyeMat = new T.MeshBasicMaterial({ map: faceTexture(), transparent: true, side: T.DoubleSide, depthWrite: false });
  const face = mesh(headG, surface(40, 48, (u, v) => {
    const y = .14 - v * .357, maxX = .254 * cheekWidth(y) * Math.sqrt(Math.max(.015, 1 - Math.pow(y / .278, 2)));
    const x = (u * 2 - 1) * Math.min(.218, maxX * .975);
    const z = faceDepth(x, y) - .0025;
    return [x, y, z];
  }), eyeMat, 0, 0, 0, 'painted-anime-face');
  face.userData.noOutline = true; face.castShadow = false;
  mesh(headG, surface(32, 72, (u, v) => {
    const a = u * Math.PI * 2, theta = v * Math.PI * (.48 + .30 * smooth((Math.cos(a) + 1) / 2));
    const ridge = 1 + Math.cos(a * 12) * .004 * Math.sin(theta);
    return [Math.sin(a) * Math.sin(theta) * .278 * ridge, Math.cos(theta) * .285 + .022,
      Math.cos(a) * Math.sin(theta) * .252 * ridge + .024];
  }, true), hairDark, 0, 0, 0, 'seamless-hair-crown');
  function lock(points, radius, phase, name = 'gradient-hair-lock', tip = PALETTE.tip, flatten = .43) {
    const pivot = new T.Vector3(...points[0]), group = new T.Group(); group.position.copy(pivot); headG.add(group);
    const local = points.map(p => new T.Vector3(...p).sub(pivot).toArray());
    mesh(group, strand(local, radius, PALETTE.blue, tip, flatten), hairMat, 0, 0, 0, name);
    hairLocks.push({ root: group, phase }); return group;
  }
  // Staggered overlapping S curves retain a dark upper mass and curl at the waist.
  for (let i = 0; i < 13; i++) {
    const a = (i / 12 - .5) * Math.PI * 1.16, x = Math.sin(a) * .224, z = .096 + Math.cos(a) * .151;
    const side = x < 0 ? -1 : 1, bend = Math.sin(i * 1.7) * .037;
    lock([[x * .58, .237 - Math.abs(x) * .15, z * .69], [x, .105, z], [x * 1.17, -.13, z + .020],
      [x * 1.50 + bend, -.33, z + .035], [x * 1.72 + side * .014, -.47, z + .073],
      [x * 1.48 - bend, -.59 + Math.cos(i) * .025, z + .11],
      [x * 1.04 - side * .025, -.58 + Math.sin(i * 1.5) * .04, z + .063]], .065 + (i % 3) * .007, i * .7);
  }
  for (const side of [-1, 1]) for (let j = 0; j < 2; j++) {
    lock([[side * (.052 + j * .056), .245 - j * .045, .141 + j * .054],
      [side * (.064 + j * .061), .052, .260], [side * (.095 + j * .059), -.21, .298],
      [side * (.154 + j * .052), -.40, .326], [side * (.090 + j * .043), -.57 - j * .028, .343],
      [side * (.031 + j * .021), -.57 - j * .025, .306]], .072, 10 + j + side);
  }
  for (const side of [-1, 1]) {
    lock([[side * .178, .209, -.095], [side * .240, .064, -.155], [side * .254, -.175, -.148],
      [side * .291, -.329, -.045], [side * .324, -.390, .033], [side * .248, -.438, .040]], .046, 15 + side, 'long-cheek-lock');
    lock([[side * .15, .20, -.125], [side * .219, .060, -.211], [side * .223, -.114, -.190],
      [side * .195, -.234, -.133], [side * .150, -.276, -.101]], .039, 18 + side, 'face-framing-lock', '#527ca8');
  }
  const bangs = [
    [[-.080,.245,-.075],[-.158,.145,-.209],[-.191,.042,-.228],[-.196,-.056,-.183]],
    [[-.028,.263,-.075],[-.087,.167,-.240],[-.097,.062,-.261],[-.105,-.015,-.229]],
    [[.038,.269,-.069],[.061,.168,-.238],[.040,.072,-.266],[-.016,.005,-.248]],
    [[.104,.250,-.052],[.131,.161,-.214],[.143,.075,-.239],[.181,.018,-.202]],
  ];
  bangs.forEach((points, i) => lock(points, i === 2 ? .057 : .047, 23 + i, 'swept-pointed-bang', '#466497', .37));
  const ahoge = mesh(headG, strand([[0, .266, .025], [-.025, .35, .024], [-.16, .386, .012], [-.21, .318, -.02]],
    .018, '#26396c', '#5487b3', .45), hairMat, 0, 0, 0, 'ahoge');
  mesh(headG, new T.TorusGeometry(.283, .012, 8, 48, Math.PI), white, 0, .032, .046, 'maid-headband');
  mesh(headG, surface(8, 108, (u, v) => {
    const a = u * Math.PI, r = .282 + .042 * v + Math.cos(a * 18) * .005 * v;
    return [Math.cos(a) * r, Math.sin(a) * r + .032, .046 + Math.sin(a * 18) * .014 * v];
  }), laceFabric, 0, 0, 0, 'pleated-lace-headband');
  for (const side of [-1, 1]) {
    const fin = new T.Group(); fin.position.set(side * .246, -.01, .016); headG.add(fin);
    const shape = cloth(fin, hairDark, s => {
      s.moveTo(0, .05); s.bezierCurveTo(.12, -.017, .10, -.07, .21, -.09);
      s.bezierCurveTo(.11, -.13, .025, -.12, -.015, -.045); s.closePath();
    }, .024, 'whale-ear-fin'); shape.scale.x = side;
    const inner = cloth(fin, lace, s => {
      s.moveTo(.035, -.046); s.quadraticCurveTo(.095, -.102, .178, -.087);
      s.quadraticCurveTo(.075, -.134, .035, -.07); s.closePath();
    }, .008); inner.scale.x = side; inner.position.z = -.021;
    const clip = bow(headG, blueRibbon, .045, .035, [side * .262, .059, -.035]); clip.rotation.z = side * -.3;
  }
  const tail = new T.Group(); tail.position.set(0, 1.01, .18); spine.add(tail);
  mesh(tail, strand([[0, -.02, 0], [.09, -.23, .18], [.30, -.35, .26], [.50, -.32, .30], [.67, -.19, .32]],
    .079, '#293775', '#40598d', .76, false), material('#ffffff', { vertexColors: true }), 0, 0, 0, 'curved-whale-tail');
  const flukes = new T.Group(); flukes.position.set(.67, -.19, .32); flukes.rotation.y = .55; tail.add(flukes);
  ellipsoid(flukes, hairDark, [0, 0, 0], [.037, .039, .025], 'tail-fluke-junction');
  for (const side of [-1, 1]) {
    const fin = cloth(flukes, hairDark, s => {
      s.moveTo(0, 0); s.bezierCurveTo(-.010, .10, .057, .218, .190, .255);
      s.bezierCurveTo(.205, .135, .158, .028, .070, -.012); s.quadraticCurveTo(.024, -.027, 0, 0);
    }, .03, 'tail-fluke');
    const p = fin.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + Math.sin(p.getY(i) * 8) * p.getX(i) * .10);
    fin.geometry.computeVertexNormals();
    fin.scale.y = side; fin.rotation.z = side * -.42;
  }
  const spot = new T.SpotLight('#ffe8d0', 0, 22, .55, .5, 1.2);
  spot.position.set(0, 1.3, -.1); const target = new T.Object3D(); target.position.set(0, .5, -12);
  root.add(spot, target); spot.target = target;
  const shadowTex = texture(64, 64, ctx => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  });
  const shadow = mesh(root, new T.PlaneGeometry(1.5, 1.1), new T.MeshBasicMaterial({ map: shadowTex,
    transparent: true, depthWrite: false }), 0, .012, .06, 'contact-shadow');
  shadow.rotation.x = -Math.PI / 2; shadow.userData.noOutline = true; shadow.castShadow = false;
  root.userData.character = { name: '蓝鲸女仆', reference: 'assets/whale-maid-reference.jpg',
    features: ['gradient-hair', 'maid-headband', 'blue-eyes', 'whale-apron', 'gold-embroidery', 'mary-jane-shoes', 'back-bow', 'whale-tail'] };
  batchStaticDetails(root);
  G.scene.add(root);
  return { root, rider, hipsG, spine, headG, legs, arms, hairLocks, skirt, tail, backBow, ahoge, spot,
    x: -2.6, z: 0, speed: 0, boost: 0, errT: 0, ph: 0 };
};
})();
