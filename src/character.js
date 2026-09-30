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
const PALETTE = { navy: '#191d4a', blue: '#354985', tip: '#81b7dc', white: '#fffaf4',
  lace: '#ddd8eb', skin: '#ffe0d0', gold: '#dcaf58', ribbon: '#56a8d2' };

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
  const m = mesh(parent, new T.SphereGeometry(1, ...segments), mat, ...pos, name);
  m.scale.set(...scale); return m;
}
function capsule(parent, mat, r, length, x, y, z) {
  return mesh(parent, new T.CapsuleGeometry(r, length, 6, 16), mat, x, y, z);
}
function strand(points, radius, colorA, colorB, flatten = 1, taper = true) {
  const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
  const N = 40, R = 10, frames = curve.computeFrenetFrames(N, false);
  const pos = [], colors = [], uv = [], indices = [];
  const a = new T.Color(colorA).convertSRGBToLinear(), b = new T.Color(colorB).convertSRGBToLinear();
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = curve.getPointAt(t);
    const r = radius * (taper ? Math.pow(Math.sin(Math.PI * (.08 + t * .92)), .58) : 1 - .66 * t);
    const c = a.clone().lerp(b, Math.pow(t, 1.6));
    for (let j = 0; j <= R; j++) {
      const angle = j / R * Math.PI * 2;
      const v = p.clone().addScaledVector(frames.normals[i], Math.cos(angle) * r)
        .addScaledVector(frames.binormals[i], Math.sin(angle) * r * flatten);
      pos.push(v.x, v.y, v.z); colors.push(c.r, c.g, c.b); uv.push(j / R, t);
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
  for (const side of [-1, 1]) {
    const loop = cloth(group, mat, s => {
      s.moveTo(0, 0); s.bezierCurveTo(width * .2, height * .1, width * .85, height * .9, width, height * .65);
      s.bezierCurveTo(width * 1.12, height * .2, width * 1.05, -height * .65, width * .8, -height * .55);
      s.bezierCurveTo(width * .4, -height * .5, width * .15, -height * .02, 0, 0);
    }, .018, 'bow-loop');
    loop.scale.x = side; loop.rotation.y = side * -.18;
    if (tails) {
      const tail = cloth(group, mat, s => {
        s.moveTo(.01, -.015); s.lineTo(.07, -.04); s.lineTo(.11, -height * 2.5);
        s.lineTo(.045, -height * 2.2); s.lineTo(-.015, -height * 2.5); s.closePath();
      });
      tail.scale.x = side; tail.rotation.z = side * .3; tail.position.z = .012;
    }
  }
  ellipsoid(group, mat, [0, 0, -.02], [width * .21, height * .37, .027], 'bow-knot');
  return group;
}
function faceTexture() {
  return texture(512, 512, ctx => {
    // Large blue irises, a white highlight and a dark upper eyelash.
    for (const side of [-1, 1]) {
      const x = 256 + side * 107, y = 262;
      ctx.save(); ctx.translate(x, y); ctx.rotate(side * -.06);
      ctx.beginPath(); ctx.ellipse(0, 0, 57, 76, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fffdf7'; ctx.fill();
      ctx.lineWidth = 8; ctx.strokeStyle = '#273047'; ctx.stroke();
      ctx.save(); ctx.clip();
      const grad = ctx.createLinearGradient(0, -65, 0, 72);
      grad.addColorStop(0, '#142858'); grad.addColorStop(.55, '#327ab6'); grad.addColorStop(1, '#8eddec');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.ellipse(4, 3, 40, 68, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#142855'; ctx.beginPath(); ctx.ellipse(5, -4, 18, 45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f9ffff'; ctx.beginPath(); ctx.ellipse(-12, -35, 15, 22, -.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(24, 32, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#182340'; ctx.lineWidth = 12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-54, -22); ctx.quadraticCurveTo(-28, -91, 41, -53); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(side * 47, -33); ctx.lineTo(side * 66, -55); ctx.stroke();
      ctx.strokeStyle = '#354572'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-37, -104); ctx.quadraticCurveTo(0, -116, 38, -101); ctx.stroke();
      ctx.restore();
      const blush = ctx.createRadialGradient(x + side * 20, 363, 3, x + side * 20, 363, 48);
      blush.addColorStop(0, 'rgba(244,142,148,.48)'); blush.addColorStop(1, 'rgba(244,142,148,0)');
      ctx.fillStyle = blush; ctx.fillRect(x - 45, 325, 110, 80);
    }
    ctx.fillStyle = '#963e52'; ctx.beginPath(); ctx.moveTo(231, 401);
    ctx.quadraticCurveTo(257, 389, 281, 401); ctx.quadraticCurveTo(261, 445, 239, 423); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f2a1a8'; ctx.beginPath(); ctx.ellipse(254, 424, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d8988a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(257, 350); ctx.lineTo(252, 360); ctx.stroke();
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
    ctx.save(); ctx.translate(325, 380); ctx.rotate(-.12); ctx.fillStyle = '#455993';
    ctx.beginPath(); ctx.moveTo(-57, 10); ctx.bezierCurveTo(-70, -50, 9, -60, 33, -5);
    ctx.quadraticCurveTo(67, 10, 77, -15); ctx.lineTo(62, -26); ctx.quadraticCurveTo(89, -41, 94, -8);
    ctx.quadraticCurveTo(81, 43, 30, 47); ctx.quadraticCurveTo(-11, 53, -57, 10); ctx.fill();
    ctx.fillStyle = PALETTE.white; ctx.beginPath(); ctx.ellipse(-9, 22, 37, 14, .18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-34, -2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#455993';
    for (const [x, y, a] of [[-15, -66, -.5], [-2, -77, 0], [12, -66, .6]]) {
      ctx.beginPath(); ctx.ellipse(x, y, 5, 11, a, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });
}
function surface(rows, columns, point) {
  const pos = [], uv = [], index = [];
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
    pos.push(...point(x / columns, y / rows)); uv.push(x / columns, 1 - y / rows);
    if (y < rows && x < columns) {
      const a = y * (columns + 1) + x;
      index.push(a, a + 1, a + columns + 1, a + 1, a + columns + 2, a + columns + 1);
    }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(index); g.computeVertexNormals(); return g;
}

G.createWhaleMaid = () => {
  const navy = material(PALETTE.navy), white = material(PALETTE.white), lace = material(PALETTE.lace);
  const skin = material(PALETTE.skin), gold = material(PALETTE.gold), blueRibbon = material(PALETTE.ribbon);
  const hairMat = material('#ffffff', { vertexColors: true, emissive: '#1b2844', emissiveIntensity: .22 });
  const hairDark = material(PALETTE.blue, { emissive: '#152442', emissiveIntensity: .2 });
  const root = new T.Group(); root.name = 'whale-maid';
  const rider = new T.Group(), hipsG = new T.Group(), spine = new T.Group(), headG = new T.Group();
  root.add(rider); rider.add(hipsG, spine); spine.add(headG); headG.position.y = 1.64;
  const legs = [], arms = [], hairLocks = [];
  for (const side of [-1, 1]) {
    const hip = new T.Group(); hip.position.set(side * .115, .62, 0); hipsG.add(hip);
    capsule(hip, skin, .06, .16, 0, -.11, 0);
    const knee = new T.Group(); knee.position.y = -.25; hip.add(knee);
    capsule(knee, skin, .048, .14, 0, -.1, 0);
    const ankle = new T.Group(); ankle.position.y = -.25; knee.add(ankle);
    mesh(ankle, new T.CylinderGeometry(.045, .054, .13, 16), white, 0, .015, 0, 'white-sock');
    for (let j = 0; j < 9; j++) {
      const a = j / 9 * Math.PI * 2;
      ellipsoid(ankle, white, [Math.sin(a) * .05, .08, Math.cos(a) * .05], [.023, .026, .018]);
    }
    ellipsoid(ankle, navy, [0, -.053, -.033], [.071, .055, .128], 'mary-jane-shoe');
    mesh(ankle, new T.BoxGeometry(.118, .03, .1), navy, 0, -.087, .025, 'shoe-heel');
    ellipsoid(ankle, white, [0, -.018, -.05], [.047, .019, .062], 'shoe-opening');
    const strap = mesh(ankle, new T.BoxGeometry(.124, .024, .028), navy, 0, -.003, -.031, 'shoe-strap');
    strap.rotation.z = side * -.05;
    const buckle = mesh(ankle, new T.TorusGeometry(.018, .004, 6, 4), gold, side * .061, .004, -.05);
    buckle.rotation.y = side * .7; buckle.rotation.z = Math.PI / 4;
    legs.push({ hip, knee, ankle, side, baseY: .62 });
  }
  ellipsoid(spine, navy, [0, 1.23, 0], [.211, .225, .16], 'fitted-bodice');
  mesh(spine, new T.CylinderGeometry(.057, .07, .12, 20), skin, 0, 1.43, 0);
  ellipsoid(spine, white, [0, 1.26, -.147], [.115, .173, .035], 'pleated-white-bib');
  for (let i = -2; i <= 2; i++) {
    capsule(spine, lace, .0025, .25, i * .025, 1.26, -.18);
  }
  for (const y of [1.18, 1.25, 1.32]) ellipsoid(spine, navy, [0, y, -.186], [.012, .013, .008]);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const y = 1.41 - i * .029;
      ellipsoid(spine, white, [side * (.13 + .013 * Math.sin(i)), y, -.136], [.035, .025, .032], 'bodice-ruffle');
    }
    const shoulder = new T.Group(); shoulder.position.set(side * .225, 1.37, 0); spine.add(shoulder);
    ellipsoid(shoulder, navy, [side * .015, -.062, 0], [.10, .12, .10], 'puff-sleeve');
    capsule(shoulder, navy, .061, .09, 0, -.14, 0);
    const elbow = new T.Group(); elbow.position.y = -.22; shoulder.add(elbow);
    capsule(elbow, navy, .057, .125, 0, -.092, 0);
    mesh(elbow, new T.CylinderGeometry(.062, .07, .065, 20), navy, 0, -.19, 0, 'gold-trimmed-cuff');
    const trim = mesh(elbow, new T.TorusGeometry(.066, .004, 6, 24), gold, 0, -.175, 0); trim.rotation.x = Math.PI / 2;
    for (let j = 0; j < 10; j++) {
      const a = j / 10 * Math.PI * 2;
      ellipsoid(elbow, white, [Math.sin(a) * .058, -.231, Math.cos(a) * .058], [.026, .026, .021]);
    }
    ellipsoid(elbow, skin, [0, -.279, 0], [.045, .057, .026], 'hand');
    for (let f = 0; f < 4; f++) capsule(elbow, skin, .009, .021, (f - 1.5) * .014, -.325, -.002);
    const thumb = capsule(elbow, skin, .014, .024, side * -.035, -.283, -.008); thumb.rotation.z = side * -.6;
    arms.push({ shoulder, elbow, baseZ: side * .09 });
  }
  const skirt = new T.Group(); spine.add(skirt);
  const skirtMat = material('#ffffff', { map: skirtTexture(), side: T.DoubleSide });
  const skirtGeo = surface(20, 96, (u, v) => {
    const a = u * Math.PI * 2;
    const r = .215 + Math.pow(v, .8) * .26 + Math.cos(a * 14) * .012 * v;
    return [Math.sin(a) * r, 1.09 - v * .51, Math.cos(a) * r * .88];
  });
  mesh(skirt, skirtGeo, skirtMat, 0, 0, 0, 'embroidered-pleated-skirt');
  mesh(skirt, new T.CylinderGeometry(.44, .48, .064, 64, 1, true), white, 0, .562, 0, 'petticoat');
  for (let i = 0; i < 42; i++) {
    const a = i / 42 * Math.PI * 2;
    const ruffle = ellipsoid(skirt, white, [Math.sin(a) * .48, .555, Math.cos(a) * .422], [.037, .047, .03], 'skirt-lace');
    ruffle.rotation.y = a; ruffle.rotation.z = Math.sin(a * 14) * .12;
  }
  const apronPoint = (u, v) => {
    const side = u * 2 - 1;
    const bottom = .633 + .09 * Math.pow(Math.abs(side), 3);
    const y = 1.065 + (bottom - 1.065) * v;
    const r = .215 + Math.pow((1.09 - y) / .51, .8) * .26;
    const a = side * (.72 + .09 * v);
    return [Math.sin(a) * r, y, -Math.cos(a) * r * .88 - .016];
  };
  mesh(skirt, surface(22, 28, apronPoint), material('#ffffff', { map: apronTexture(), side: T.DoubleSide }), 0, 0, 0, 'whale-apron');
  for (let i = 0; i <= 20; i++) {
    const p = apronPoint(i / 20, 1); p[1] -= .015; p[2] -= .004;
    ellipsoid(skirt, white, p, [.03, .028, .018], 'apron-scallop');
  }
  for (const u of [0, 1]) for (let i = 0; i < 12; i++) {
    const p = apronPoint(u, i / 12); p[0] += (u ? 1 : -1) * .013;
    ellipsoid(skirt, white, p, [.023, .026, .018], 'apron-edge-lace');
  }
  mesh(spine, new T.CylinderGeometry(.223, .223, .09, 40), navy, 0, 1.075, 0, 'waistband');
  for (const side of [-1, 1]) for (const y of [1.05, 1.096]) {
    ellipsoid(spine, gold, [side * .11, y, -.197], [.012, .012, .009], 'waist-button');
  }
  const collarBow = bow(spine, navy, .092, .05, [0, 1.416, -.185], true);
  const gemRim = mesh(collarBow, new T.TorusGeometry(.02, .004, 8, 20), gold, 0, 0, -.047);
  ellipsoid(collarBow, blueRibbon, [0, 0, -.049], [.014, .019, .007], 'blue-brooch');
  const backBow = bow(spine, white, .174, .085, [0, 1.02, .25], true); backBow.rotation.y = Math.PI;
  for (const side of [-1, 1]) bow(skirt, gold, .039, .023, [side * .33, .66, -.295], true);

  ellipsoid(headG, skin, [0, 0, 0], [.254, .278, .226], 'face-volume');
  const eyeMat = new T.MeshBasicMaterial({ map: faceTexture(), transparent: true, side: T.DoubleSide, depthWrite: false });
  const face = mesh(headG, surface(28, 32, (u, v) => {
    const x = (u * 2 - 1) * .208, y = .14 - v * .357;
    const z = -.226 * Math.sqrt(Math.max(.02, 1 - x * x / (.254 * .254) - y * y / (.278 * .278))) - .002;
    return [x, y, z];
  }), eyeMat, 0, 0, 0, 'painted-anime-face');
  face.userData.noOutline = true; face.castShadow = false;
  const crown = mesh(headG, new T.SphereGeometry(1, 36, 24, 0, Math.PI * 2, 0, Math.PI * .53), hairDark, 0, .025, .026, 'hair-crown');
  crown.scale.set(.278, .29, .252);
  const backHair = ellipsoid(headG, hairDark, [0, -.025, .095], [.267, .257, .198], 'back-hair-volume');
  // Back locks descend separately from the scalp, with a darker crown and blue tips.
  for (let i = 0; i < 11; i++) {
    const a = (i / 10 - .5) * Math.PI * 1.22;
    const x = Math.sin(a) * .23, z = .11 + Math.cos(a) * .15;
    const lock = new T.Group(); headG.add(lock);
    const spread = x * 1.52;
    mesh(lock, strand([[x, .13, z], [x * 1.15, -.12, z + .025], [spread, -.35, z + .03],
      [spread + Math.sin(i * 1.7) * .055, -.55, z + .055], [spread * .87, -.65 + Math.sin(i * 2) * .047, z + .095]],
      .078, '#304780', '#85badb', .47), hairMat, 0, 0, 0, 'gradient-hair-lock');
    hairLocks.push({ root: lock, phase: i * .7 });
  }
  for (const side of [-1, 1]) {
    mesh(headG, strand([[side * .18, .19, -.15], [side * .235, .04, -.18],
      [side * .235, -.19, -.155], [side * .19, -.31, -.11]], .047, '#30447b', '#73afd5', .5), hairMat, 0, 0, 0, 'face-framing-lock');
  }
  for (const [x, end, y] of [[-.15, -.18, -.017], [-.065, -.11, -.002], [.025, .055, -.036], [.11, .175, .01]]) {
    mesh(headG, strand([[x * .5, .257, -.07], [x, .16, -.217], [x * 1.06, .045, -.252], [end, y, -.23]],
      .054, '#30447e', '#43649d', .52), hairMat, 0, 0, 0, 'curved-bang');
  }
  const ahoge = mesh(headG, strand([[0, .266, .025], [-.025, .35, .024], [-.16, .386, .012], [-.21, .318, -.02]],
    .018, '#26396c', '#5487b3', .45), hairMat, 0, 0, 0, 'ahoge');
  const band = mesh(headG, new T.TorusGeometry(.285, .024, 8, 40, Math.PI), white, 0, .025, .035, 'maid-headband');
  for (let i = 0; i <= 14; i++) {
    const a = i / 14 * Math.PI;
    const puff = ellipsoid(headG, white, [Math.cos(a) * .302, Math.sin(a) * .307 + .025, .035], [.034, .039, .025], 'headband-ruffle');
    puff.rotation.z = a - Math.PI / 2;
  }
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
  mesh(tail, strand([[0, -.02, 0], [.09, -.25, .18], [.32, -.36, .29], [.56, -.32, .33], [.72, -.17, .33]],
    .082, '#293775', '#4f72ad', .72, false), hairMat, 0, 0, 0, 'curved-whale-tail');
  const flukes = new T.Group(); flukes.position.set(.72, -.17, .33); tail.add(flukes);
  for (const side of [-1, 1]) {
    const fin = cloth(flukes, hairDark, s => {
      s.moveTo(0, 0); s.bezierCurveTo(-.035, .11, .01, .23, .185, .30);
      s.bezierCurveTo(.22, .16, .185, .04, .08, -.015); s.quadraticCurveTo(.024, -.027, 0, 0);
    }, .03, 'tail-fluke');
    fin.rotation.z = side === 1 ? -.2 : Math.PI / 2 + .1;
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
  G.scene.add(root);
  return { root, rider, hipsG, spine, headG, legs, arms, hairLocks, skirt, tail, backBow, ahoge, spot,
    x: -2.6, z: 0, speed: 0, boost: 0, errT: 0, ph: 0 };
};
})();
