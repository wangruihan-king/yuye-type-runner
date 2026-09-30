/* refworld.js — 《逃离遗忘》世界系统（用户提供的参考包移植；three r149 适配 + 坐标桥接） */
(() => {
'use strict';
const THREE = window.THREE, GG = window.G;
const PI = Math.PI;
const DPR = Math.min(window.devicePixelRatio || 1, 2);
/* 他们的世界建在旋转 +90° 的根节点下：其 +X(前进) = 我们 -Z，其 +Z(车道) = 我们 +X */
const worldRoot = new THREE.Group(); worldRoot.rotation.y = Math.PI / 2; GG.scene.add(worldRoot);
const scene = worldRoot;
const RSS = GG.scene;
const camera = GG.camera, renderer = GG.renderer;
const camTX = () => -camera.position.z;
let _awR = -1;
const RWA = { stageOn: false, setWeather(r, s) { if (Math.abs(r - _awR) > .04) { _awR = r; GG.audio.amb(r, .4 + s * .5); } } };
/* 他们的世界代码会回调的音效桩 → 接到我们的合成器 */
const audio = {
  setWeather: (r, s) => RWA.setWeather(r, s),
  carPass(v, open) { GG.audio.burst({ dur: .45, f0: open ? 1400 : 900, f1: 180, vol: .1 }); },
  drop() { GG.audio.tone(1500, { dur: .04, type: 'sine', vol: .025, slide: -600 }); },
  chirp() { GG.audio.tone(2100, { dur: .07, type: 'triangle', vol: .05 }); },
  train() { GG.audio.rumble(); },
  shutter() { GG.audio.burst({ dur: .06, f0: 3000, f1: 800, vol: .08, hp: true }); },
};
const F_BOLD = '"Dela Gothic One","Hiragino Kaku Gothic ProN","Noto Sans JP","Noto Sans SC",sans-serif';
const F_ROUND = '"Zen Maru Gothic","Hiragino Maru Gothic ProN","Noto Sans JP","Noto Sans SC",sans-serif';
const F_MIN = '"Shippori Mincho","Hiragino Mincho ProN","Yu Mincho","Noto Serif JP","Songti SC",serif';
const F_HAND = '"Yusei Magic","Zen Maru Gothic","Noto Sans JP","Noto Sans SC",sans-serif';
const JP = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Noto Sans JP","Noto Sans CJK JP","Noto Sans SC","Microsoft YaHei",sans-serif';
const JPS = F_MIN;
let _s = 7741;
const rnd = () => (_s = (_s * 16807) % 2147483647) / 2147483647;
const rr = (a, b) => a + (b - a) * rnd();
const pick = (a) => a[Math.floor(rnd() * a.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
let clock = 0;

function ctex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t; }
function label(w, h, bg, fn) { return ctex(w, h, (x) => { if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); } x.textAlign = 'center'; x.textBaseline = 'middle'; fn(x, w, h); }); }
function fitText(x, txt, maxW, size, font) { let s = size; x.font = font.replace('%s', s); while (x.measureText(txt).width > maxW && s > 10) { s -= 2; x.font = font.replace('%s', s); } return s; }

/* ================================================================== shared uniforms & light map following the rider */
const G = { uWet: { value: 0 }, uSnow: { value: 0 }, uTime: { value: 0 }, uRain: { value: 0 }, uSky: { value: new THREE.Color(0x18203e) }, uFlash: { value: 0 }, uLit: { value: 0.5 } };
const LMR = 70;
const lmRT = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: false });
const lmScene = new THREE.Scene(); lmScene.background = new THREE.Color(0);
const lmCam = new THREE.OrthographicCamera(-LMR, LMR, LMR, -LMR, -10, 10);
const LMU = { uLM: { value: lmRT.texture }, uCam: { value: new THREE.Vector3() }, uLMR: { value: LMR }, uLMC: { value: new THREE.Vector2() } };
const grad = new THREE.DataTexture(new Uint8Array([120, 200, 255]), 3, 1, THREE.RedFormat); grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const grad2 = new THREE.DataTexture(new Uint8Array([190, 255]), 2, 1, THREE.RedFormat); grad2.minFilter = grad2.magFilter = THREE.NearestFilter; grad2.needsUpdate = true;

// wetMask darkens + snowMask whitens up-facing surfaces; ground adds light-map diffuse + wet reflections; lit adds interior glow
function patchToon(m, o = {}) {
  const wetMask = o.wet ?? 1, snowMask = o.snow ?? 1, ground = !!o.ground, lit = !!o.lit, key = 'k' + (ground ? 'g' : '') + (lit ? 'l' : '') + (m.vertexColors ? 'v' : '');
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uWet: G.uWet, uSnow: G.uSnow, uWM: { value: wetMask }, uSM: { value: snowMask }, uFlash: G.uFlash, uLit: G.uLit });
    let vs = 'varying float vWNy;\n' + (ground ? 'varying vec3 vWP;\n' : '') + s.vertexShader;
    vs = vs.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
vWNy = normalize(mat3(modelMatrix) * objectNormal).y;`);
    if (ground) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    s.vertexShader = vs;
    let fs = 'uniform float uWet;\nuniform float uSnow;\nuniform float uWM;\nuniform float uSM;\nuniform float uFlash;\nuniform float uLit;\nvarying float vWNy;\n' + (ground ? 'uniform sampler2D uLM;\nuniform vec3 uCam;\nuniform float uLMR;\nuniform vec2 uLMC;\nuniform float uTime;\nuniform float uRain;\nuniform vec3 uSky;\nvarying vec3 vWP;\n' : '') + s.fragmentShader;
    fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
float upF = smoothstep(0.55, 0.9, vWNy);
diffuseColor.rgb *= mix(1.0, 0.58, uWet * uWM * (1.0 - uSnow) * (0.35 + 0.65 * upF));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 1.0), upF * uSnow * uSM);`);
    fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * uFlash * 0.5 * uWM;` + (lit ? `
totalEmissiveRadiance += diffuseColor.rgb * uLit;` : '') + (ground ? `
{
  vec2 lco = vec2(-vWP.z, vWP.x);
  vec2 luv = (lco - uLMC + uLMR) / (2.0 * uLMR);
  vec3 lmC = texture2D(uLM, luv).rgb * 2.0;
  totalEmissiveRadiance += diffuseColor.rgb * lmC * 1.35;
  vec2 dv = lco - uCam.xz; vec2 away = dv / max(length(dv), 0.001) / (2.0 * uLMR);
  float rip = sin(lco.x * 1.3 + uTime * 2.1) * sin(lco.y * 1.1 - uTime * 1.7) * (0.0004 + 0.001 * uRain);
  vec3 rf = vec3(0.0);
  for (int i = 1; i <= 8; i++) { float fi = float(i); rf += texture2D(uLM, luv + away * fi * 0.7 + vec2(rip, -rip)).rgb * (1.0 - fi / 9.0); }
  float wetK = uWet * uWM * (1.0 - uSnow) * (0.3 + 0.7 * upF);
  totalEmissiveRadiance += rf * 0.55 * wetK + uSky * 0.14 * wetK;
}` : ''));
    if (ground) Object.assign(s.uniforms, { uLM: LMU.uLM, uCam: LMU.uCam, uLMR: LMU.uLMR, uLMC: LMU.uLMC, uTime: G.uTime, uRain: G.uRain, uSky: G.uSky });
    s.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => key + wetMask + snowMask;
  return m;
}
const mc = new Map();
function T(hex, o = {}) { const k = hex + '|' + (o.g ? 1 : 0) + '|' + (o.wet ?? 1) + '|' + (o.snow ?? 1); if (!mc.has(k)) mc.set(k, patchToon(new THREE.MeshToonMaterial({ color: hex, gradientMap: grad }), { wet: o.wet, snow: o.snow, ground: !!o.g })); return mc.get(k); }
const TG = (hex) => T(hex, { g: true });
// seasonal / foliage material (no outline, keeps its own colour so the season can repaint it)
function FM(hex) { return patchToon(new THREE.MeshToonMaterial({ color: hex, gradientMap: grad }), { wet: 0.4 }); }
const OLM = new THREE.MeshBasicMaterial({ color: 0x1e2546, side: THREE.BackSide });
const VCS = patchToon(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad }), {});
const VCL = patchToon(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad }), { lit: true, wet: 0, snow: 0 });
const VCO = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
const glassM = new THREE.MeshBasicMaterial({ color: 0xbfe0f0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });

// darker, more saturated outline colour for a given fill colour
const olCol = new Map();
function darkOf(hex) { if (!olCol.has(hex)) { const c = new THREE.Color(hex); const h = {}; c.getHSL(h); c.setHSL(h.h, Math.min(1, h.s * 1.1 + 0.12), Math.max(0.06, h.l * 0.4)); olCol.set(hex, c); } return olCol.get(hex); }
const LITC = (hex) => ({ lit: hex });

/* ================================================================== builder: merges static geometry; plain numbers become vertex colours */
function norm(g) { const n = g.index ? g.toNonIndexed() : g; n.clearGroups(); for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') n.deleteAttribute(k); if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); n.morphAttributes = {}; return n; }
function paint(g, col) { const n = norm(g), cnt = n.attributes.position.count, a = new Float32Array(cnt * 3); for (let i = 0; i < cnt; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } n.setAttribute('color', new THREE.BufferAttribute(a, 3)); return n; }
function mergeG(list) {
  let total = 0; const hasC = list.every((g) => g.attributes.color); for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = hasC ? new Float32Array(total * 3) : null; let o = 0;
  for (const g of list) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); if (col) col.set(g.attributes.color.array, o * 3); o += c; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); if (col) m.setAttribute('color', new THREE.BufferAttribute(col, 3)); return m;
}
const _col = new Map();
const colOf = (hex) => { if (!_col.has(hex)) _col.set(hex, new THREE.Color(hex)); return _col.get(hex); };
function makeBuilder() {
  const map = new Map(); let M = null; const stack = [];
  const put = (key, mat, g, cast) => { let b = map.get(key); if (!b) { b = { mat, geos: [], cast }; map.set(key, b); } b.geos.push(g); if (cast) b.cast = true; };
  const tf = (g, o) => { if (o.rx) g.rotateX(o.rx); if (o.rz) g.rotateZ(o.rz); if (o.ry) g.rotateY(o.ry); };
  const fin = (g) => { if (M) g.applyMatrix4(M); return g; };
  function add(mat, g, cast, olg) {
    if (typeof mat === 'number') { put('vcS', VCS, paint(fin(g), colOf(mat)), cast); if (olg) put('vcO', VCO, paint(fin(olg), darkOf(mat)), false); }
    else if (mat && mat.lit !== undefined) { put('vcL', VCL, paint(fin(g), colOf(mat.lit)), cast); if (olg) put('vcO', VCO, paint(fin(olg), darkOf(mat.lit)), false); }
    else { put(mat.uuid, mat, norm(fin(g)), cast); if (olg) put('ol', OLM, norm(fin(olg)), false); }
  }
  return {
    setT(t) { M = t ? new THREE.Matrix4().makeRotationY(t.ry || 0).setPosition(t.x, t.y || 0, t.z) : null; },
    pushT(t) { stack.push(M); const m = new THREE.Matrix4().makeRotationY(t.ry || 0).setPosition(t.x, t.y || 0, t.z); M = M ? M.clone().multiply(m) : m; },
    popT() { M = stack.pop() || null; },
    box(mat, w, h, d, x, y, z, o = {}) {
      const ol = o.ol === undefined ? 0.045 : o.ol;
      const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); tf(g, o); g.translate(x, y, z);
      let q = null; if (ol > 0) { q = new THREE.BoxGeometry(w + 2 * ol, h + 2 * ol, d + 2 * ol); q.translate(0, h / 2, 0); tf(q, o); q.translate(x, y, z); }
      add(mat, g, o.cast !== false, q);
    },
    cyl(mat, r, h, x, y, z, o = {}) {
      const ol = o.ol === undefined ? 0.035 : o.ol, seg = o.seg || 10, rt = o.rt === undefined ? r : o.rt;
      const g = new THREE.CylinderGeometry(rt, r, h, seg); g.translate(0, h / 2, 0); tf(g, o); g.translate(x, y, z);
      let q = null; if (ol > 0) { q = new THREE.CylinderGeometry(rt + ol, r + ol, h + 2 * ol, seg); q.translate(0, h / 2, 0); tf(q, o); q.translate(x, y, z); }
      add(mat, g, o.cast !== false, q);
    },
    ico(mat, r, x, y, z, o = {}) { const g = new THREE.IcosahedronGeometry(r, o.det ?? 1); g.scale(o.sx || 1, o.sy || 1, o.sz || 1); tf(g, o); g.translate(x, y, z); add(mat, g, o.cast !== false, null); },
    geo(mat, g, o = {}) { add(mat, g, o.cast !== false, null); },
    finish(parent) {
      for (const b of map.values()) { const mg = mergeG(b.geos); mg.computeBoundingSphere(); const mesh = new THREE.Mesh(mg, b.mat); mesh.castShadow = b.cast; mesh.receiveShadow = true; if (b.mat.transparent) mesh.renderOrder = 1; parent.add(mesh); }
      map.clear();
    },
  };
}

/* ================================================================== character parts: one mesh + one coloured outline per rigid part */
const CHM = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad2 });
const uChar = { value: 0.2 };
CHM.onBeforeCompile = (s) => { s.uniforms.uChar = uChar; s.fragmentShader = 'uniform float uChar;\n' + s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uChar;'); };
const CHO = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
// boxes: [w, h, d, x, y, z, hex, {rx, ry, rz, ol}]
function vcPart(boxes, olDef = 0.025) {
  const gs = [], os = [];
  for (const bx of boxes) {
    const [w, h, d, x, y, z, hex, o = {}] = bx;
    const g = new THREE.BoxGeometry(w, h, d); if (o.rx) g.rotateX(o.rx); if (o.rz) g.rotateZ(o.rz); if (o.ry) g.rotateY(o.ry); g.translate(x, y, z); gs.push(paint(g, colOf(hex)));
    const ol = o.ol ?? olDef;
    if (ol > 0) { const q = new THREE.BoxGeometry(w + ol * 2, h + ol * 2, d + ol * 2); if (o.rx) q.rotateX(o.rx); if (o.rz) q.rotateZ(o.rz); if (o.ry) q.rotateY(o.ry); q.translate(x, y, z); os.push(paint(q, darkOf(hex))); }
  }
  const grp = new THREE.Group();
  const m = new THREE.Mesh(mergeG(gs), CHM); m.castShadow = true; grp.add(m);
  if (os.length) grp.add(new THREE.Mesh(mergeG(os), CHO));
  return grp;
}
function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

/* ================================================================== halos & light-map spots */
const haloTex = ctex(128, 128, (x) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.16, 'rgba(255,255,255,.55)'); g.addColorStop(0.5, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
const spotTex = ctex(128, 128, (x) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.6)'); g.addColorStop(0.7, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
const lmGeo = new THREE.PlaneGeometry(1, 1);
const lmSpots = new Set();
function lmSpot(x, z, rx, color, get, rz = rx) {
  const m = new THREE.MeshBasicMaterial({ map: spotTex, color, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, opacity: 0 });
  const q = new THREE.Mesh(lmGeo, m); q.position.set(x, z, 0); q.scale.set(rx * 2, rz * 2, 1); lmScene.add(q);
  const o = { mesh: q, get }; lmSpots.add(o); return o;
}
function dropSpot(o) { lmScene.remove(o.mesh); o.mesh.material.dispose(); lmSpots.delete(o); }
const haloMats = {};
function haloMat(key, color) { if (!haloMats[key]) haloMats[key] = new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.5 }); return haloMats[key]; }
function halo(parent, key, color, x, y, z, s) { const sp = new THREE.Sprite(haloMat(key, color)); sp.position.set(x, y, z); sp.scale.setScalar(s); parent.add(sp); return sp; }


/* ================================================================== palette */
const P = {
  asphalt: TG(0x3a3e52), paint: TG(0xf2eee4), yellow: TG(0xf2c43a), bikeLane: TG(0x2d6fd6), side1: TG(0xd9c3b3), side2: TG(0xcbb2a4), plaza: TG(0xb8c0d0), plaza2: TG(0xc9b8a6),
  grass: TG(0x86c25e), dirt: TG(0x9a7e62), path: TG(0xc4a47a),
};
const WALLS = [0xffd6a0, 0xa6e3d4, 0xf6b3b8, 0xb3d0ff, 0xffe78a, 0xd6c2ff, 0xf4f4ee, 0x9fd8ef, 0xffc4a6, 0xc8e6a0];
const C = { concrete: 0xcbc6bb, concD: 0x98948b, metal: 0x9aa2ac, metalD: 0x3a3f4a, dark: 0x262a33, white: 0xf0efe9, pole: 0x8b8f97, rail: 0xe4e6e8, trunk: 0x6a4a36, wood: 0xa0714a, woodD: 0x5b3e2b, tire: 0x1d1f24, red: 0xd43b30, chrome: 0xc9ced4 };
const carGlass = T(0x28303c, { wet: 0, snow: 0 });
const WIN_OFF = new THREE.Color(0x2e3a48), WIN_DAY = new THREE.Color(0x8fb4d0);
const winMats = [];
for (let i = 0; i < 10; i++) { const on = i < 6 || rnd() < 0.3; const m = new THREE.MeshBasicMaterial({ color: 0x000000 }); m.userData = { on: on ? new THREE.Color(i % 3 === 0 ? 0xe9f2ff : 0xffcf8a).lerp(WIN_OFF, 0.05 + rnd() * 0.2) : WIN_OFF.clone(), day: WIN_DAY.clone().lerp(new THREE.Color(0xc8dcea), rnd() * 0.5) }; winMats.push(m); }
const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff0d2 });
const SIG = { g: new THREE.MeshBasicMaterial({ color: 0x19f0c0 }), y: new THREE.MeshBasicMaterial({ color: 0x3a3014 }), r: new THREE.MeshBasicMaterial({ color: 0x3a1414 }), g2: new THREE.MeshBasicMaterial({ color: 0x10302b }), r2: new THREE.MeshBasicMaterial({ color: 0xff3232 }) };
const carHead = new THREE.MeshBasicMaterial({ color: 0xfff4d8 }), carTail = new THREE.MeshBasicMaterial({ color: 0xff3a3a });
const signMats = [];
function emissiveMat(tex, o = {}) { const m = new THREE.MeshToonMaterial({ map: tex, gradientMap: grad, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6, side: o.double ? THREE.DoubleSide : THREE.FrontSide, transparent: !!o.transparent }); signMats.push(m); return m; }
const drinkTex = ctex(256, 352, (x) => { x.fillStyle = '#e9f3ff'; x.fillRect(0, 0, 256, 352); const cols = ['#e2463c', '#2c7be5', '#f2b632', '#39a86b', '#f4f4f4', '#7a4bd1', '#ff7a2f', '#1f9fb5']; for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { const cx = 22 + c * 42, cy = 20 + r * 80; x.fillStyle = cols[(r * 5 + c * 3) % cols.length]; x.fillRect(cx - 12, cy, 24, 50); x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(cx - 9, cy + 8, 5, 34); x.fillStyle = '#20252e'; x.fillRect(cx - 14, cy + 56, 28, 10); } });
const vendMat = emissiveMat(drinkTex);

/* ================================================================== seasons: shared foliage materials that get repainted */
const S = { leaf: FM(0x7cc45a), leaf2: FM(0x9ad46a), leafHi: FM(0xb8e07a), sakura: FM(0xf7b6cc), sakuraHi: FM(0xfdd6e2), bush: FM(0x5aa050), azalea: FM(0xf06ea0), pine: FM(0x3f7a4a), tuft: FM(0x8fcf5a), fl: [FM(0xff5a7a), FM(0xffd84a), FM(0xffffff), FM(0xb07aff), FM(0xff8fc0)] };
const SEASONS = [
  { key: 'spring', zh: '春', en: 'SPRING', leaf: 0x7cc45a, leaf2: 0x9ad46a, leafHi: 0xb8e07a, sakura: 0xf7b6cc, sakuraHi: 0xfdd6e2, bush: 0x5aa050, azalea: 0xf06ea0, pine: 0x3f7a4a, tuft: 0x8fcf5a, grass: 0x86c25e, fl: [0xff5a7a, 0xffd84a, 0xffffff, 0xb07aff, 0xff8fc0], bare: false, flShow: 5, petal: [0xffc4d8, 0xffe2ec], petalN: 1 },
  { key: 'summer', zh: '夏', en: 'SUMMER', leaf: 0x3f9a44, leaf2: 0x5ab04a, leafHi: 0x78c050, sakura: 0x4a9a48, sakuraHi: 0x68b456, bush: 0x3a8a40, azalea: 0x3f9046, pine: 0x356a40, tuft: 0x5aa84a, grass: 0x5ea850, fl: [0xff4a6a, 0xffc83a, 0x6ac8ff, 0x9a6aff, 0xffffff], bare: false, flShow: 5, petal: [0x7ac860, 0xa8e070], petalN: 0.18 },
  { key: 'autumn', zh: '秋', en: 'AUTUMN', leaf: 0xe8742a, leaf2: 0xf2b030, leafHi: 0xd8402a, sakura: 0xd0603a, sakuraHi: 0xe88a4a, bush: 0x8a7a3a, azalea: 0xb04a2a, pine: 0x3f6a44, tuft: 0xb8a04a, grass: 0xb0a060, fl: [0xf2b030, 0xe8742a, 0xffffff, 0xa04030, 0xf2d060], bare: false, flShow: 5, petal: [0xf08a2a, 0xe8c030], petalN: 0.8 },
  { key: 'winter', zh: '冬', en: 'WINTER', leaf: 0x7a6a50, leaf2: 0x7a6a50, leafHi: 0x7a6a50, sakura: 0x7a6a50, sakuraHi: 0x7a6a50, bush: 0x4a6a4a, azalea: 0x4a6a4a, pine: 0x2f5a3c, tuft: 0xa8a080, grass: 0xa8a890, fl: [0xd8203a, 0xffffff, 0xffffff, 0xffffff, 0xffffff], bare: true, flShow: 1, petal: [0xffffff, 0xffffff], petalN: 0 },
];
let seasonIdx = 0;
function applySeason(i) {
  seasonIdx = ((i % 4) + 4) % 4; const s = SEASONS[seasonIdx];
  for (const k of ['leaf', 'leaf2', 'leafHi', 'sakura', 'sakuraHi', 'bush', 'azalea', 'pine', 'tuft']) S[k].color.setHex(s[k]);
  for (const k of ['leaf', 'leaf2', 'leafHi', 'sakura', 'sakuraHi']) S[k].visible = !s.bare;
  S.fl.forEach((m, j) => { m.color.setHex(s.fl[j]); m.visible = j < s.flShow; });
  P.grass.color.setHex(s.grass);
  petals.m.uniforms.uA.value.setHex(s.petal[0]); petals.m.uniforms.uB.value.setHex(s.petal[1]); petals.target = s.petalN;
}

/* ================================================================== brand signs (each category gets its own colours and typeface) */
const BR = {
  book: { name: '青空書房', sub: '古本 ・ 新刊 ・ 買取', font: F_MIN, w8: '800', bg: '#1f5a44', fg: '#f6ecd2', sc: '#e8c46a', aw: ['#1f5a44', '#f6ecd2'], wall: 0x8a5a3a, nob: '古本市', nobC: ['#1f5a44', '#f6ecd2'], style: 'frame' },
  breakfast: { name: 'あさごはん 日向', sub: 'モーニング 7:00 – 10:00', font: F_ROUND, w8: '900', bg: '#ff8a1f', fg: '#ffffff', sc: '#fff2c8', aw: ['#ff8a1f', '#fff4d6'], wall: 0xfff0c8, nob: '朝定食', nobC: ['#ff8a1f', '#ffffff'], style: 'sun' },
  repair: { name: '自転車修理 カワセ', sub: 'パンク修理 500円 ・ 即日', font: F_BOLD, w8: '400', bg: '#ffd400', fg: '#141414', sc: '#141414', aw: null, wall: 0x2d6fd6, nob: '修理', nobC: ['#ffd400', '#141414'], style: 'hazard' },
  catcafe: { name: 'ねこカフェ みけ', sub: 'CAT CAFE ・ 猫と過ごす午後', font: F_ROUND, w8: '900', bg: '#ffc2d6', fg: '#7a2a4a', sc: '#b04a74', aw: ['#ffffff', '#ff8fb3'], wall: 0xfff4f8, nob: 'ねこ', nobC: ['#ff8fb3', '#ffffff'], style: 'paw' },
  tea: { name: 'タピオカ 茶々', sub: 'BUBBLE TEA ・ ミルクティー', font: F_ROUND, w8: '900', bg: '#b8a4ff', fg: '#ffffff', sc: '#e6fff6', aw: ['#b8a4ff', '#d8fff0'], wall: 0xd8fff0, nob: 'タピオカ', nobC: ['#b8a4ff', '#ffffff'], style: 'neon' },
  ramen: { name: '麺処 ひだまり', sub: '醤油 ・ 味噌 ・ 塩', font: F_MIN, w8: '800', bg: '#2a1a12', fg: '#f5e6c8', sc: '#e8a04a', aw: null, wall: 0x6b4a30, nob: 'ラーメン', nobC: ['#c8202d', '#ffffff'], style: 'frame' },
  flower: { name: '花のアトリエ', sub: 'FLOWER ・ 季節の花', font: F_HAND, w8: '400', bg: '#fdf0f3', fg: '#c23a64', sc: '#5a9a50', aw: ['#ffffff', '#e86a8a'], wall: 0xf6e6ee, nob: '花', nobC: ['#e86a8a', '#ffffff'], style: 'plain' },
  izakaya: { name: '居酒屋 灯', sub: '焼鳥 ・ 地酒', font: F_BOLD, w8: '400', bg: '#3a0f14', fg: '#ffcf7a', sc: '#ff9a6a', aw: null, wall: 0x4a2a22, nob: '生ビール', nobC: ['#1f58b8', '#ffffff'], style: 'frame' },
  bakery: { name: 'パン工房 こむぎ', sub: '焼きたて毎朝', font: F_ROUND, w8: '900', bg: '#fff4dc', fg: '#8a4a1f', sc: '#c07a3a', aw: ['#f6e7c4', '#c07a3a'], wall: 0xffe4c0, nob: 'パン', nobC: ['#c07a3a', '#ffffff'], style: 'plain' },
  drug: { name: 'ドラッグ ミドリ', sub: '薬 ・ 化粧品 ・ 日用品', font: F_BOLD, w8: '400', bg: '#1fbf6f', fg: '#ffffff', sc: '#eaffef', aw: ['#ffffff', '#1fbf6f'], wall: 0xf4f7f4, nob: '特売', nobC: ['#ffd400', '#d8202d'], style: 'plain' },
  cafe: { name: '喫茶 こもれび', sub: 'COFFEE ・ 自家焙煎', font: F_MIN, w8: '800', bg: '#3a2518', fg: '#f6e7c4', sc: '#d8a860', aw: ['#3a2518', '#e8d4a8'], wall: 0x9a6a48, nob: 'コーヒー', nobC: ['#3a2518', '#f6e7c4'], style: 'frame' },
};
const FEATURED = ['book', 'breakfast', 'repair', 'catcafe', 'tea'];
const OTHERS = ['ramen', 'flower', 'izakaya', 'bakery', 'drug', 'cafe'];
function paw(x, cx, cy, s, col) { x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy + s * 0.35, s * 0.55, s * 0.45, 0, 0, PI * 2); x.fill(); for (const [dx, dy] of [[-0.55, -0.25], [-0.2, -0.6], [0.2, -0.6], [0.55, -0.25]]) { x.beginPath(); x.arc(cx + dx * s, cy + dy * s, s * 0.2, 0, PI * 2); x.fill(); } }
const brandTex = {};
function brandSign(key) {
  if (brandTex[key]) return brandTex[key];
  const b = BR[key], W = 1024, H = 200;
  const t = label(W, H, b.bg, (x) => {
    if (b.style === 'hazard') { for (let i = -2; i < 40; i++) { x.fillStyle = '#141414'; x.beginPath(); x.moveTo(i * 36, 0); x.lineTo(i * 36 + 18, 0); x.lineTo(i * 36 - 2, 22); x.lineTo(i * 36 - 20, 22); x.fill(); x.beginPath(); x.moveTo(i * 36, H - 22); x.lineTo(i * 36 + 18, H - 22); x.lineTo(i * 36 - 2, H); x.lineTo(i * 36 - 20, H); x.fill(); } }
    if (b.style === 'frame') { x.strokeStyle = b.sc; x.lineWidth = 6; x.strokeRect(12, 12, W - 24, H - 24); x.lineWidth = 2; x.strokeRect(22, 22, W - 44, H - 44); }
    if (b.style === 'sun') { x.fillStyle = '#ffd24a'; x.beginPath(); x.arc(90, H / 2, 54, 0, PI * 2); x.fill(); x.strokeStyle = '#ffd24a'; x.lineWidth = 8; for (let k = 0; k < 10; k++) { const a = k / 10 * PI * 2; x.beginPath(); x.moveTo(90 + Math.cos(a) * 66, H / 2 + Math.sin(a) * 66); x.lineTo(90 + Math.cos(a) * 84, H / 2 + Math.sin(a) * 84); x.stroke(); } }
    if (b.style === 'paw') { for (const [cx, cy, s] of [[70, 70, 34], [130, 140, 24], [W - 80, 60, 30], [W - 140, 140, 22]]) paw(x, cx, cy, s, '#ff8fb3'); }
    if (b.style === 'neon') { const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#b8a4ff'); g.addColorStop(1, '#7ee6c8'); x.fillStyle = g; x.fillRect(0, 0, W, H); x.fillStyle = 'rgba(255,255,255,.25)'; for (let k = 0; k < 14; k++) { x.beginPath(); x.arc(60 + k * 70, H - 30 + Math.sin(k) * 8, 10, 0, PI * 2); x.fill(); } }
    const fnt = `${b.w8} %spx ${b.font}`;
    fitText(x, b.name, W - (b.style === 'sun' ? 240 : 120), 104, fnt);
    if (b.style === 'neon') { x.lineWidth = 10; x.strokeStyle = '#6a3ab8'; x.strokeText(b.name, W / 2 + (b.style === 'sun' ? 50 : 0), 86); x.shadowColor = '#fff'; x.shadowBlur = 18; }
    x.fillStyle = b.fg; x.fillText(b.name, W / 2 + (b.style === 'sun' ? 50 : 0), 86); x.shadowBlur = 0;
    x.font = `700 32px ${b.font === F_BOLD ? JP : b.font}`; x.fillStyle = b.sc; x.fillText(b.sub, W / 2 + (b.style === 'sun' ? 50 : 0), 158);
  });
  brandTex[key] = emissiveMat(t); return brandTex[key];
}
const noboriMats = {};
function noboriMat(key) {
  if (noboriMats[key]) return noboriMats[key];
  const b = BR[key], txt = b.nob, [bg, fg] = b.nobC;
  const t = label(128, 448, bg, (x, w, h) => { x.fillStyle = fg; x.fillRect(0, 0, w, 26); x.fillStyle = fg; const n = txt.length, size = n > 3 ? 70 : 88; x.font = `${b.w8} ${size}px ${b.font}`; const step = (h - 60) / n; txt.split('').forEach((c, k) => x.fillText(c, w / 2, 44 + step * (k + 0.5))); });
  noboriMats[key] = new THREE.MeshToonMaterial({ map: t, gradientMap: grad, side: THREE.DoubleSide }); return noboriMats[key];
}
const awnMatC = {};
function awningMat(a, b) { const k = a + b; if (!awnMatC[k]) awnMatC[k] = new THREE.MeshToonMaterial({ map: ctex(128, 64, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect(i * 16, 0, 16, 64); } x.fillStyle = 'rgba(0,0,0,.14)'; x.fillRect(0, 52, 128, 12); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? b : a; x.beginPath(); x.arc(i * 16 + 8, 58, 8, 0, PI); x.fill(); } }), gradientMap: grad, side: THREE.DoubleSide }); return awnMatC[k]; }
const menuBoardTex = {
  breakfast: label(512, 256, '#fff8ea', (x, w, h) => { x.fillStyle = '#ff8a1f'; x.fillRect(0, 0, w, 44); x.fillStyle = '#fff'; x.font = `900 30px ${F_ROUND}`; x.fillText('本日の朝ごはん', w / 2, 24); const it = [['焼き鮭定食', '#e87a5a'], ['納豆ごはん', '#c8a060'], ['卵焼き', '#ffd24a'], ['味噌汁', '#b07a4a'], ['おにぎり', '#f6f6f2'], ['トースト', '#e8b070']]; it.forEach(([n, c], i) => { const cx = 20 + (i % 3) * 164, cy = 60 + Math.floor(i / 3) * 96; x.fillStyle = c; x.fillRect(cx, cy, 64, 56); x.fillStyle = '#3a2518'; x.textAlign = 'left'; x.font = `700 20px ${F_ROUND}`; x.fillText(n, cx + 70, cy + 20); x.fillStyle = '#ff5a1f'; x.fillText((380 + i * 60) + '円', cx + 70, cy + 46); x.textAlign = 'center'; }); }),
  tea: label(512, 256, '#2a1f4a', (x, w, h) => { x.fillStyle = '#e6fff6'; x.font = `900 30px ${F_ROUND}`; x.fillText('MENU', w / 2, 26); const it = [['黒糖ミルク', '#8a5a3a'], ['抹茶ラテ', '#8ad070'], ['いちごミルク', '#f6a8c0'], ['タロイモ', '#b8a4ff'], ['マンゴー', '#ffc83a'], ['烏龍茶', '#c89a5a']]; it.forEach(([n, c], i) => { const cx = 18 + (i % 3) * 166, cy = 56 + Math.floor(i / 3) * 98; x.fillStyle = c; x.beginPath(); x.roundRect ? x.roundRect(cx, cy, 44, 70, 8) : x.rect(cx, cy, 44, 70); x.fill(); x.fillStyle = '#1a1a1a'; x.fillRect(cx + 4, cy + 50, 36, 14); x.fillStyle = '#fff'; x.textAlign = 'left'; x.font = `700 19px ${F_ROUND}`; x.fillText(n, cx + 52, cy + 24); x.fillStyle = '#7ee6c8'; x.fillText((480 + i * 30) + '円', cx + 52, cy + 52); x.textAlign = 'center'; }); }),
  cat: label(256, 320, '#26352c', (x, w, h) => { x.strokeStyle = '#a0714a'; x.lineWidth = 14; x.strokeRect(7, 7, w - 14, h - 14); x.fillStyle = '#fff'; x.font = `400 34px ${F_HAND}`; x.fillText('本日の', w / 2, 52); x.fillText('ねこ', w / 2, 92); x.fillStyle = '#ffc2d6'; x.font = `400 24px ${F_HAND}`; ['みけ', 'くろ', 'しろ', 'ちゃちゃ'].forEach((n, i) => x.fillText('・' + n, w / 2, 140 + i * 34)); paw(x, w - 56, h - 44, 20, '#ffc2d6'); }),
  book: label(256, 128, '#f6ecd2', (x, w, h) => { x.fillStyle = '#1f5a44'; x.font = `800 48px ${F_MIN}`; x.fillText('100円', w / 2, 50); x.font = `700 24px ${F_MIN}`; x.fillText('均一 文庫', w / 2, 100); }),
  repair: label(256, 320, '#141414', (x, w, h) => { x.fillStyle = '#ffd400'; x.font = `400 44px ${F_BOLD}`; x.fillText('パンク', w / 2, 60); x.fillText('修理', w / 2, 114); x.fillStyle = '#fff'; x.font = `400 64px ${F_BOLD}`; x.fillText('500', w / 2, 196); x.font = `400 30px ${F_BOLD}`; x.fillText('円〜', w / 2, 250); }),
  breakfastA: label(256, 320, '#26352c', (x, w, h) => { x.strokeStyle = '#a0714a'; x.lineWidth = 14; x.strokeRect(7, 7, w - 14, h - 14); x.fillStyle = '#ffd24a'; x.font = `900 40px ${F_ROUND}`; x.fillText('朝ごはん', w / 2, 60); x.fillStyle = '#fff'; x.font = `400 26px ${F_HAND}`; x.fillText('ごはん おかわり', w / 2, 120); x.fillText('自由', w / 2, 156); x.fillStyle = '#ff8a1f'; x.font = `900 46px ${F_ROUND}`; x.fillText('480円', w / 2, 236); }),
};
const menuMats = {};
for (const k in menuBoardTex) menuMats[k] = emissiveMat(menuBoardTex[k]);

/* ================================================================== small helpers */
const CH = 40, LANE = -2.6;
const NOL0 = { ol: 0, cast: false };
const ENV = { h: 21, w: 'light', night: 1, rain: 0.45, snowFall: 0, cloud: 0.9, wet: 0.8, snowAcc: 0, lamps: 1 };
const chunks = new Map();
const wireMat = new THREE.LineBasicMaterial({ color: 0x1b1d24 });
function plane(b, mat, w, h, x, y, z, ry = 0, rx = 0) { const g = new THREE.PlaneGeometry(w, h); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); b.geo(mat, g, { cast: false }); }
function treeAt(b, x, z, kind = 'round', s = 1, y = 0.18) {
  b.cyl(C.trunk, 0.2 * s, 2.6 * s, x, y, z, { rt: 0.14 * s, seg: 7, ol: 0 });
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + rnd(); b.box(C.trunk, 0.1 * s, 1.3 * s, 0.1 * s, x + Math.cos(a) * 0.35 * s, y + 2.2 * s, z + Math.sin(a) * 0.35 * s, { rx: Math.sin(a) * 0.6, rz: -Math.cos(a) * 0.6, ol: 0 }); }
  if (kind === 'pine') { for (let k = 0; k < 3; k++) b.cyl(S.pine, (1.5 - k * 0.4) * s, 1.3 * s, x, y + (2.2 + k * 0.9) * s, z, { rt: 0.2 * s, seg: 7, ol: 0 }); return; }
  if (kind === 'tall') { for (let i = 0; i < 5; i++) b.ico(pick([S.leaf, S.leaf2]), (0.9 + rnd() * 0.4) * s, x + rr(-0.6, 0.6) * s, y + (3.4 + i * 0.55) * s, z + rr(-0.6, 0.6) * s, { det: 1, sy: 1.1 }); b.ico(S.leafHi, 0.5 * s, x + 0.3, y + 5.8 * s, z - 0.2, { det: 1 }); return; }
  const m = kind === 'sakura' ? S.sakura : pick([S.leaf, S.leaf2]), hi = kind === 'sakura' ? S.sakuraHi : S.leafHi;
  for (let i = 0; i < 6; i++) { const a = rnd() * PI * 2, r = rnd() * 1.1 * s; b.ico(m, (0.95 + rnd() * 0.55) * s, x + Math.cos(a) * r, y + (2.9 + rnd() * 1.3) * s, z + Math.sin(a) * r, { det: 1, sy: 0.85 }); }
  for (let i = 0; i < 3; i++) { const a = rnd() * PI * 2; b.ico(hi, (0.4 + rnd() * 0.25) * s, x + Math.cos(a) * 0.9 * s, y + (3.6 + rnd() * 0.8) * s, z + Math.sin(a) * 0.9 * s, { det: 1 }); }
}
function bushAt(b, x, z, r = 0.8, y = 0.18, mat = S.bush) { b.ico(mat, r, x, y + r * 0.5, z, { det: 1, sy: 0.7 }); b.ico(mat === S.azalea ? S.bush : S.azalea, r * 0.5, x + r * 0.35, y + r * 0.85, z - r * 0.2, { det: 1, sy: 0.7 }); }
function hedgeBox(b, x, z, len, y = 0.18) {
  b.box(0x9aa2a8, len, 0.5, 0.8, x, y, z, { ol: 0.03 });
  for (let i = 0; i < Math.floor(len / 0.55); i++) b.ico(i % 3 === 1 ? S.bush : S.azalea, rr(0.34, 0.46), x - len / 2 + 0.3 + i * 0.55, y + 0.7, z + rr(-0.12, 0.12), { det: 1, sy: 0.75 });
}
function flowerBox(b, x, z, w, d, y = 0.18) {
  b.box(0x8a6a4a, w, 0.42, d, x, y, z, { ol: 0.03 }); b.box(0x5a4234, w - 0.12, 0.05, d - 0.12, x, y + 0.42, z, NOL0);
  const n = Math.floor(w * d * 7);
  for (let i = 0; i < n; i++) { const fx = x + rr(-w / 2 + 0.12, w / 2 - 0.12), fz = z + rr(-d / 2 + 0.12, d / 2 - 0.12); if (rnd() < 0.35) b.box(S.tuft, 0.06, rr(0.2, 0.35), 0.06, fx, y + 0.45, fz, NOL0); else b.ico(pick(S.fl), rr(0.09, 0.14), fx, y + 0.62, fz, { det: 0 }); }
}
function potAt(b, x, z, y = 0.18, big = false) {
  const s = big ? 1.4 : 1; b.cyl(pick([0xc0603a, 0xe8e2d6, 0x3a6a8a, 0xd8a040]), 0.22 * s, 0.4 * s, x, y, z, { rt: 0.28 * s, seg: 8, ol: 0.02 });
  if (rnd() < 0.5) b.ico(S.bush, 0.32 * s, x, y + 0.62 * s, z, { det: 1 }); else { b.box(S.tuft, 0.06, 0.5 * s, 0.06, x, y + 0.4 * s, z, NOL0); b.ico(pick(S.fl), 0.14 * s, x + 0.08, y + 0.8 * s, z, { det: 0 }); b.ico(pick(S.fl), 0.13 * s, x - 0.1, y + 0.7 * s, z + 0.05, { det: 0 }); }
}
function tufts(b, x0, x1, z0, z1, n, y = 0.14) { for (let i = 0; i < n; i++) { const x = rr(x0, x1), z = rr(z0, z1); for (let k = 0; k < 3; k++) b.box(S.tuft, 0.05, rr(0.18, 0.34), 0.05, x + rr(-0.1, 0.1), y, z + rr(-0.1, 0.1), { rz: rr(-0.3, 0.3), ol: 0, cast: false }); } }
function nobori(b, x, z, key) {
  b.cyl(C.metal, 0.03, 3.0, x, 0.18, z, { seg: 5, ol: 0 }); b.cyl(0x3a3f4a, 0.12, 0.2, x, 0.18, z, { seg: 8, ol: 0 });
  const g = new THREE.PlaneGeometry(0.55, 2.2); g.translate(x + 0.3, 2.0, z); b.geo(noboriMat(key), g, { cast: false });
  b.box(C.metal, 0.6, 0.03, 0.03, x + 0.3, 3.1, z, NOL0);
}
function carAt(b, x, z, ry, hex, type = 'sedan', y = 0.04) {
  b.pushT({ x, y, z, ry });
  const wheel = (wx, wz, r = 0.3) => { const g = new THREE.CylinderGeometry(r, r, 0.24, 10); g.rotateZ(PI / 2); g.translate(wx, r, wz); b.geo(C.tire, g); };
  if (type === 'kei') {
    b.box(hex, 1.45, 1.3, 3.3, 0, 0.3, 0); b.box(carGlass, 1.47, 0.5, 0.9, 0, 0.85, 1.15, { ol: 0 }); b.box(carGlass, 1.47, 0.45, 1.5, 0, 0.88, -0.2, { ol: 0 });
    for (const [wx, wz] of [[-0.62, 1.0], [0.62, 1.0], [-0.62, -1.0], [0.62, -1.0]]) wheel(wx, wz);
    b.box(carHead, 0.3, 0.14, 0.04, -0.45, 0.7, 1.66, { ol: 0 }); b.box(carHead, 0.3, 0.14, 0.04, 0.45, 0.7, 1.66, { ol: 0 });
    b.box(carTail, 0.2, 0.3, 0.04, -0.55, 0.8, -1.66, { ol: 0 }); b.box(carTail, 0.2, 0.3, 0.04, 0.55, 0.8, -1.66, { ol: 0 });
  } else if (type === 'convertible') {
    b.box(hex, 1.8, 0.55, 4.3, 0, 0.26, 0); b.box(hex, 1.7, 0.18, 1.6, 0, 0.81, 1.25); b.box(hex, 1.7, 0.2, 1.1, 0, 0.81, -1.55);
    b.box(carGlass, 1.6, 0.42, 0.06, 0, 0.99, 0.4, { rx: -0.45, ol: 0.015 });
    b.box(0x2a2a30, 0.62, 0.5, 0.55, -0.42, 0.62, -0.35); b.box(0x2a2a30, 0.62, 0.5, 0.55, 0.42, 0.62, -0.35); b.box(0x2a2a30, 0.62, 0.7, 0.14, -0.42, 0.8, -0.62); b.box(0x2a2a30, 0.62, 0.7, 0.14, 0.42, 0.8, -0.62);
    // driver: blond hair, sunglasses, loud shirt, gold chain
    b.box(0xff5aa8, 0.55, 0.62, 0.4, -0.42, 1.08, -0.28); b.box(0xf2c14e, 0.4, 0.06, 0.05, -0.42, 1.52, -0.07, { ol: 0 });
    b.box(0xf6cfa6, 0.46, 0.46, 0.46, -0.42, 1.7, -0.3); b.box(0xf6e05a, 0.5, 0.18, 0.5, -0.42, 2.12, -0.32); for (let k = 0; k < 3; k++) b.box(0xf6e05a, 0.14, 0.2, 0.14, -0.58 + k * 0.16, 2.26, -0.32, { rz: 0.3, ol: 0.01 });
    b.box(0x111111, 0.48, 0.1, 0.05, -0.42, 1.88, -0.06, { ol: 0 });
    b.box(0xf6cfa6, 0.12, 0.12, 0.5, -0.24, 1.18, 0.1, { ol: 0.01 }); b.box(0x2a2a30, 0.34, 0.05, 0.05, -0.42, 1.22, 0.35, { rx: -0.6, ol: 0 });
    for (const [wx, wz] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) wheel(wx, wz, 0.32);
    b.box(carHead, 0.4, 0.12, 0.04, -0.6, 0.6, 2.16, { ol: 0 }); b.box(carHead, 0.4, 0.12, 0.04, 0.6, 0.6, 2.16, { ol: 0 });
    b.box(carTail, 0.4, 0.12, 0.04, -0.6, 0.62, -2.16, { ol: 0 }); b.box(carTail, 0.4, 0.12, 0.04, 0.6, 0.62, -2.16, { ol: 0 });
  } else {
    b.box(hex, 1.72, 0.62, 4.1, 0, 0.28, 0); b.box(hex, 1.55, 0.52, 2.1, 0, 0.9, -0.25); b.box(carGlass, 1.58, 0.4, 2.0, 0, 0.93, -0.25, { ol: 0 });
    b.box(C.chrome, 1.74, 0.12, 0.08, 0, 0.3, 2.06, { ol: 0 });
    for (const [wx, wz] of [[-0.8, 1.3], [0.8, 1.3], [-0.8, -1.3], [0.8, -1.3]]) wheel(wx, wz);
    b.box(carHead, 0.36, 0.14, 0.04, -0.58, 0.64, 2.06, { ol: 0 }); b.box(carHead, 0.36, 0.14, 0.04, 0.58, 0.64, 2.06, { ol: 0 });
    b.box(carTail, 0.36, 0.14, 0.04, -0.58, 0.66, -2.06, { ol: 0 }); b.box(carTail, 0.36, 0.14, 0.04, 0.58, 0.66, -2.06, { ol: 0 });
    if (type === 'taxi') { b.box(0xf2c14e, 0.5, 0.25, 0.3, 0, 1.42, -0.1, { ol: 0.02 }); b.box(0x2a3552, 1.74, 0.1, 4.12, 0, 0.62, 0, { ol: 0 }); }
  }
  b.popT();
}
const CARC = [0xf0f0f0, 0x2b2f38, 0xb8bec6, 0xd8202d, 0x2d5fa8, 0xf2b52a, 0x3aa06a, 0x9a6aff];
function bikeAt(b, x, z, o = {}) {
  const up = !!o.up, y0 = o.y ?? 0.18, col = o.col ?? pick([0xd94c4c, 0x3a78c9, 0xf0f0f0, 0x2f8a5a, 0xe6b43c, 0xff8fb3]), rot = o.ry ?? 0;
  const put = (g) => { if (up) { g.translate(0, -0.55, 0); g.rotateX(PI); g.translate(0, 1.35, 0); } g.rotateY(rot); g.translate(x, y0, z); return g; };
  for (const wz of [-0.52, 0.52]) { const w = new THREE.TorusGeometry(0.33, 0.04, 6, 16); w.rotateY(PI / 2); w.translate(0, 0.34, wz); b.geo(C.tire, put(w)); }
  const bx = (w, h, d, px, py, pz, c) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(px, py, pz); b.geo(c, put(g)); };
  bx(0.05, 0.05, 0.8, 0, 0.66, 0, col); bx(0.05, 0.45, 0.05, 0, 0.44, -0.28, col); bx(0.12, 0.06, 0.26, 0, 0.78, -0.3, C.dark); bx(0.3, 0.2, 0.3, 0, 0.68, 0.62, C.metal); bx(0.5, 0.04, 0.04, 0, 0.9, 0.46, C.metal);
  if (o.tag) bx(0.02, 0.18, 0.28, 0.06, 0.72, 0.1, 0xffd400);
}
function vendingAt(b, ch, X, x, z, ry, hex) {
  b.box(hex, 1.1, 1.95, 0.8, x, 0.18, z, { ry, ol: 0.035 });
  const g = new THREE.PlaneGeometry(0.9, 1.25); g.rotateY(ry); g.translate(x + Math.sin(ry) * 0.41, 1.48, z + Math.cos(ry) * 0.41); b.geo(vendMat, g, { cast: false });
  ch.spots.push(lmSpot(X + x + Math.sin(ry) * 1.2, z + Math.cos(ry) * 1.2, 1.8, 0xdfeeff, () => 0.2 + 0.7 * ENV.night));
}
function lampAt(b, ch, X, x, z, dir) {
  b.cyl(C.pole, 0.1, 6.3, x, 0.18, z, { seg: 8 });
  b.box(C.pole, 0.1, 0.1, 1.6, x, 6.35, z + dir * 0.8, { ol: 0.02 });
  b.box(C.dark, 0.42, 0.18, 1.0, x, 6.3, z + dir * 1.5, { ol: 0.03 });
  b.box(bulbMat, 0.3, 0.04, 0.8, x, 6.26, z + dir * 1.5, { ol: 0 });
  ch.halos.push(halo(ch.group, 'lamp', 0xfff0d0, X + x, 6.05, z + dir * 1.5, 5));
  ch.spots.push(lmSpot(X + x, z + dir * 1.5, 4.4, 0xffe2b0, () => ENV.lamps));
}
// shopping-street lamp: two globes + seasonal banner
const bannerMats = ['#ff5a7a', '#2d6fd6', '#ffb52e', '#3aa06a'].map((c, i) => new THREE.MeshToonMaterial({ map: label(96, 256, c, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, 16); x.font = `900 44px ${F_ROUND}`; const t = ['さくら', 'なつ', 'あき', 'ふゆ'][i]; t.split('').forEach((ch2, k) => x.fillText(ch2, w / 2, 58 + k * 56)); }), gradientMap: grad, side: THREE.DoubleSide }));
function suzuranLamp(b, ch, X, x, z) {
  b.cyl(0x2d6fd6, 0.09, 5.2, x, 0.18, z, { seg: 8 }); b.box(0x2d6fd6, 1.4, 0.08, 0.08, x, 5.2, z, { ol: 0.02 });
  for (const s of [-1, 1]) { b.ico(bulbMat, 0.28, x + s * 0.6, 4.95, z, { det: 1 }); ch.halos.push(halo(ch.group, 'lamp', 0xfff0d0, X + x + s * 0.6, 4.95, z, 3.6)); }
  const g = new THREE.PlaneGeometry(0.4, 1.1); g.translate(x + 0.26, 3.6, z + 0.06); b.geo(bannerMats[seasonIdx], g, { cast: false });
  ch.spots.push(lmSpot(X + x, z, 3.6, 0xffe6c0, () => ENV.lamps));
}
function poleWires(b, ch, X) {
  for (const x of [5, 25]) { b.cyl(C.concrete, 0.17, 9.2, x, 0.18, -9.3, { rt: 0.12, seg: 9 }); b.box(C.metalD, 0.12, 0.12, 2.0, x, 8.4, -9.3, { ol: 0.02 }); b.box(0xf2c14e, 0.04, 1.2, 0.35, x + 0.18, 2.0, -9.3, { ol: 0 }); if (rnd() < 0.5) b.cyl(C.metal, 0.35, 1.0, x + 0.1, 6.2, -8.85, { seg: 10 }); }
  const pts = [];
  for (const [a, c] of [[5, 25], [25, 45]]) for (const [dz, hy] of [[-0.85, 8.52], [0, 8.52], [0.85, 8.52], [0.3, 7.3]]) {
    const N = 12; for (let i = 0; i < N; i++) { const s0 = i / N, s1 = (i + 1) / N, sag = 0.6; pts.push(X + a + (c - a) * s0, hy - sag * Math.sin(PI * s0), -9.3 + dz, X + a + (c - a) * s1, hy - sag * Math.sin(PI * s1), -9.3 + dz); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  ch.group.add(new THREE.LineSegments(g, wireMat));
}
function roadBase(b, ch, X, o = {}) {
  const gapA = o.gap ? o.gap[0] : 99, gapB = o.gap ? o.gap[1] : 99;
  b.box(P.asphalt, 40, 0.04, 10, 20, 0, 0, NOL0);
  for (let x = 1; x < 40; x += 5) if (x + 2.6 < gapA - 2.5 || x > gapB + 2.5) b.box(P.paint, 2.6, 0.02, 0.16, x + 1.3, 0.04, 0, NOL0);
  // blue bicycle-lane chevrons where the rider goes
  for (let x = 3; x < 40; x += 10) if (x < gapA - 3 || x > gapB + 1) { b.box(P.bikeLane, 1.3, 0.02, 0.9, x, 0.045, -3.9, NOL0); b.box(P.bikeLane, 0.5, 0.02, 0.5, x + 0.9, 0.045, -3.9, { ry: PI / 4, ol: 0, cast: false }); }
  for (const s of [-1, 1]) {
    const segs = o.gap ? [[0, gapA], [gapB, 40]] : [[0, 40]];
    for (const [a, c] of segs) {
      if (c - a < 0.1) continue;
      b.box(P.paint, c - a, 0.02, 0.12, (a + c) / 2, 0.04, s * 4.75, NOL0);
      b.box(0xb8b0a6, c - a, 0.2, 0.25, (a + c) / 2, 0, s * 5.12, { ol: 0.02, cast: false });
      for (let x = a; x < c - 0.01; x += 3) { const w = Math.min(3, c - x); b.box(Math.floor(x / 3) % 2 ? P.side1 : P.side2, w, 0.18, 3.75, x + w / 2, 0, s * 7.12, NOL0); }
      b.box(P.yellow, c - a, 0.01, 0.3, (a + c) / 2, 0.18, s * 5.7, NOL0);
    }
  }
  b.box(o.farLot || P.plaza2, 40, 0.12, 40, 20, 0, -29, NOL0);
  b.box(P.grass, 40, 0.14, 16, 20, 0, 17, NOL0);
  for (let x = 4; x < 40; x += 9) { b.box(C.metalD, 1.2, 0.02, 0.35, x, 0.045, -4.4, NOL0); b.box(C.metalD, 1.2, 0.02, 0.35, x, 0.045, 4.4, NOL0); }
  if (!o.gap) { for (let x = 1; x < 40; x += 1.3) b.box(C.rail, 0.07, 0.8, 0.07, x, 0.18, 5.4, { ol: 0.015 }); b.box(C.rail, 40, 0.09, 0.09, 20, 0.95, 5.4, { ol: 0.015 }); }
  // near sidewalk planters (seen along the bottom of the screen)
  for (let x = 3; x < 40; x += 12) if (x < gapA - 3 || x > gapB + 1) (rnd() < 0.5 ? hedgeBox(b, x, 6.3, 3.2) : flowerBox(b, x, 6.3, 2.4, 0.8));
  if (o.lamps !== false) for (const x of [10, 30]) if (x < gapA - 1 || x > gapB + 1) lampAt(b, ch, X, x, -8.7, 1);
  poleWires(b, ch, X);
}
// sidewalk trees on the far side, alternating kinds, with tree pits
function streetTrees(b, xs, kinds) { xs.forEach((x, i) => { b.box(0x6a5a4a, 1.2, 0.2, 1.2, x, 0.02, -5.95, { ol: 0.02, cast: false }); treeAt(b, x, -5.95, kinds[i % kinds.length], rr(0.85, 1.05), 0.2); tufts(b, x - 0.5, x + 0.5, -6.4, -5.5, 3, 0.2); }); }

/* ================================================================== shops with interiors */
function upperFloors(b, ch, X, x, w, d, y0, fl, o = {}) {
  const zc = -9.9 - d / 2, zf = -9.9, fh = 3.0, wall = o.wall ?? pick(WALLS), trim = o.trim ?? 0x7d8590;
  const H = fl * fh;
  if (fl > 0) {
    b.box(wall, w, H, d, x, y0, zc);
    const cols = Math.max(1, Math.floor(w / 2.4));
    for (let f = 0; f < fl; f++) for (let c = 0; c < cols; c++) {
      const lx = x - w / 2 + (c + 0.5) * w / cols, wy = y0 + f * fh + 0.85;
      plane(b, pick(winMats), 1.3, 1.5, lx, wy + 0.75, zf + 0.03);
      b.box(trim, 1.5, 0.1, 0.16, lx, wy - 0.08, zf + 0.06, { ol: 0 });
      if (o.balc && c % 2 === 0) { b.box(trim, 2.2, 0.15, 1.1, lx + 0.6, y0 + f * fh + 0.05, zf + 0.55); b.box(0xcad3d9, 2.2, 0.9, 0.06, lx + 0.6, y0 + f * fh + 0.2, zf + 1.08, { ol: 0.02 }); if (rnd() < 0.6) for (let k = 0; k < 3; k++) plane(b, T(pick([0xf0f0f0, 0x7aa6d8, 0xf2c14e, 0xe86a7a, 0x9a6aff])), 0.4, 0.6, lx + k * 0.45, y0 + f * fh + 1.6, zf + 0.7); if (rnd() < 0.6) potAt(b, lx - 0.3, zf + 0.8, y0 + f * fh + 0.2); }
      else if (rnd() < 0.35) b.box(0xdad8d2, 0.8, 0.55, 0.32, lx + 0.9, wy - 0.7, zf + 0.2);
    }
    for (let f = 0; f < fl; f++) plane(b, pick(winMats), 1.1, 1.2, x + w / 2 + 0.03, y0 + f * fh + 1.5, zc + d / 4, PI / 2);
    if (fl > 1) for (let f = 1; f < fl; f++) b.box(trim, w + 0.1, 0.12, d + 0.1, x, y0 + f * fh - 0.06, zc, { ol: 0 });
    b.cyl(0x8a8f98, 0.07, H, x + w / 2 - 0.2, y0, zf + 0.12, { seg: 6, ol: 0.015 });
  }
  const top = y0 + H;
  b.box(trim, w + 0.3, 0.45, d + 0.3, x, top, zc);
  if (w > 5) { b.cyl(0xd6dde2, 0.8, 1.3, x - w / 4, top + 0.45, zc - d / 4, { seg: 12 }); b.box(0xdad8d2, 0.8, 0.6, 0.6, x + w / 4, top + 0.45, zc); }
  return top;
}
const PROD = [0xe8455a, 0x3a78c9, 0xf2c14e, 0x6fbf73, 0xf6f2f6, 0xf08a24, 0xb17ad8, 0x35cfff];
function catAt(b, x, y, z, col, o = {}) {
  const L = (c) => LITC(c), ry = o.ry ?? 0, lie = !!o.lie;
  const put = (w, h, d, px, py, pz, c, rr2 = {}) => { const g = new THREE.BoxGeometry(w, h, d); if (rr2.rz) g.rotateZ(rr2.rz); if (rr2.rx) g.rotateX(rr2.rx); g.translate(px, py, pz); g.rotateY(ry); g.translate(x, y, z); b.geo(L(c), g, { cast: false }); };
  const patch = o.patch;
  if (lie) { put(0.5, 0.2, 0.26, 0, 0.1, 0, col); put(0.24, 0.22, 0.24, 0.3, 0.14, 0, col); put(0.34, 0.06, 0.06, -0.38, 0.06, 0.08, col); }
  else { put(0.28, 0.3, 0.38, 0, 0.15, 0, col); put(0.26, 0.24, 0.24, 0, 0.4, 0.14, col); put(0.06, 0.34, 0.06, 0, 0.3, -0.22, col, { rx: -0.5 }); if (patch) put(0.29, 0.14, 0.2, 0, 0.26, -0.05, patch); }
  const hx = lie ? 0.3 : 0, hy = lie ? 0.25 : 0.52, hz = lie ? 0 : 0.14;
  for (const s of [-1, 1]) put(0.07, 0.09, 0.05, hx + (lie ? 0 : s * 0.08), hy + 0.04, hz + (lie ? s * 0.08 : 0), col);
  if (!lie) { put(0.04, 0.04, 0.02, -0.06, 0.42, 0.265, 0x2a2a20); put(0.04, 0.04, 0.02, 0.06, 0.42, 0.265, 0x2a2a20); put(0.04, 0.03, 0.02, 0, 0.37, 0.265, 0xf08aa0); }
}
function cupAt(b, x, y, z, s, col, lit = true) {
  const c = (h) => lit ? LITC(h) : h;
  b.cyl(c(col), 0.11 * s, 0.34 * s, x, y, z, { rt: 0.13 * s, seg: 10, ol: 0 });
  b.cyl(c(0x2a1a14), 0.115 * s, 0.07 * s, x, y + 0.01, z, { rt: 0.118 * s, seg: 10, ol: 0 });
  b.cyl(c(0xffffff), 0.135 * s, 0.05 * s, x, y + 0.34 * s, z, { seg: 10, ol: 0 });
  b.cyl(c(pick([0xff5a7a, 0x35cfff, 0xffd84a])), 0.02 * s, 0.3 * s, x + 0.03 * s, y + 0.38 * s, z, { seg: 5, ol: 0, rz: 0.2 });
}
function shopAt(b, ch, X, x, w, kind, fl) {
  const br = BR[kind], d = 10, zf = -9.9, zc = zf - d / 2, H1 = 3.8, y0 = 0.18, L = LITC;
  const wall = br.wall, dark = 0x2b2f38, open = kind === 'repair';
  const inWall = { book: 0xe8d8b8, breakfast: 0xfff4dc, repair: 0xd8d4c8, catcafe: 0xfff0f6, tea: 0xf0e8ff, ramen: 0xe8d4b0, flower: 0xf4fff0, izakaya: 0xe8c8a0, bakery: 0xfff0d8, drug: 0xf6fffa, cafe: 0xe8d0b0 }[kind];
  const floor = { book: 0xa8845a, breakfast: 0xe8c89a, repair: 0xa8a8a0, catcafe: 0xf6d8e4, tea: 0xe8e0f8, ramen: 0x8e6a48, flower: 0xd8e8d0, izakaya: 0x8a5a3a, bakery: 0xd8b890, drug: 0xe8f0ec, cafe: 0x8a5a3a }[kind];
  b.box(wall, 0.3, H1, d, x - w / 2 + 0.15, y0, zc); b.box(wall, 0.3, H1, d, x + w / 2 - 0.15, y0, zc);
  b.box(L(inWall), w - 0.6, H1, 0.2, x, y0, zf - 4.6, NOL0);
  b.box(L(floor), w - 0.6, 0.04, 4.6, x, y0, zf - 2.3, NOL0);
  b.box(L(0xf8f8f4), w - 0.6, 0.06, 4.6, x, y0 + H1 - 0.9, zf - 2.3, NOL0);
  for (let i = 0; i < 2; i++) b.box(L(0xffffff), w * 0.5, 0.05, 0.22, x, y0 + H1 - 0.95, zf - 1.2 - i * 2, NOL0);
  b.box(br.bg ? parseInt(br.bg.slice(1), 16) : dark, w + 0.1, 1.0, 0.4, x, y0 + H1 - 1.0, zf - 0.1);
  b.box(dark, 0.32, H1 - 1.0, 0.34, x - w / 2 + 0.16, y0, zf - 0.1); b.box(dark, 0.32, H1 - 1.0, 0.34, x + w / 2 - 0.16, y0, zf - 0.1);
  plane(b, brandSign(kind), w - 0.3, 0.9, x, y0 + H1 - 0.5, zf + 0.11);
  if (!open) {
    plane(b, glassM, w - 0.64, H1 - 1.0, x, y0 + (H1 - 1.0) / 2, zf - 0.05);
    const dx = x + w / 2 - 1.6; b.box(dark, 0.06, 2.35, 0.08, dx - 0.6, y0, zf - 0.03, { ol: 0 }); b.box(dark, 0.06, 2.35, 0.08, dx + 0.6, y0, zf - 0.03, { ol: 0 }); b.box(dark, 1.26, 0.06, 0.08, dx, y0 + 2.35, zf - 0.03, { ol: 0 });
    b.box(dark, w - 0.6, 0.08, 0.1, x, y0 + 0.5, zf - 0.03, { ol: 0 });
  } else { b.box(0x9aa0a8, w - 0.6, 0.5, 0.5, x, y0 + H1 - 1.45, zf - 0.3, { ol: 0.02 }); }
  if (br.aw) { const g = new THREE.PlaneGeometry(w - 0.4, 1.4); g.rotateX(PI / 2 + 0.45); g.translate(x, y0 + H1 - 1.2 - 0.7 * Math.sin(0.45), zf + 0.7 * Math.cos(0.45)); b.geo(awningMat(br.aw[0], br.aw[1]), g); }
  nobori(b, x - w / 2 + 0.7, -8.75, kind);
  const X0 = x - w / 2 + 0.5, X1 = x + w / 2 - 0.5, Zb = zf - 4.3, Zm = zf - 2.2;
  switch (kind) {
    case 'book': {
      b.box(L(0x7a4a2a), w - 1.0, 3.0, 0.5, x, y0, Zb, { ol: 0 });
      for (let r = 0; r < 5; r++) { let bx = X0 + 0.15; while (bx < X1 - 0.2) { const bw = rr(0.08, 0.16), bh = rr(0.34, 0.5); b.box(L(pick([0xb8483f, 0x2f5d8a, 0xe2c15a, 0x3f7a52, 0x8a5a9e, 0xd9d2c2, 0x23324a, 0xc77a3a, 0xf2f2e8])), bw - 0.02, bh, 0.36, bx + bw / 2, y0 + 0.1 + r * 0.58, Zb + 0.1, NOL0); bx += bw; } b.box(L(0x6a3a1a), w - 1.0, 0.05, 0.5, x, y0 + 0.08 + r * 0.58, Zb, NOL0); }
      b.box(L(0x7a4a2a), 0.5, 2.6, 3.4, X0 + 0.25, y0, zf - 2.6, { ol: 0 });
      for (let r = 0; r < 4; r++) for (let k = 0; k < 18; k++) b.box(L(pick([0xb8483f, 0x2f5d8a, 0xe2c15a, 0x3f7a52, 0xd9d2c2])), 0.3, rr(0.3, 0.45), 0.16, X0 + 0.55, y0 + 0.1 + r * 0.62, zf - 1.05 - k * 0.18, NOL0);
      b.box(L(0x9a6a40), 2.2, 0.8, 1.1, x + 0.4, y0, Zm, NOL0);
      for (let k = 0; k < 7; k++) { const h = rr(0.1, 0.4); b.box(L(pick([0xb8483f, 0x2f5d8a, 0xe2c15a, 0xf2f2e8])), 0.34, h, 0.26, x - 0.4 + k * 0.28, y0 + 0.8, Zm + rr(-0.25, 0.25), { ry: rr(-0.3, 0.3), ol: 0, cast: false }); }
      b.box(L(0x5a3a22), 1.4, 1.0, 0.7, X1 - 0.8, y0, zf - 1.3, NOL0); b.box(L(0x3a3a40), 0.4, 0.28, 0.3, X1 - 0.8, y0 + 1.0, zf - 1.3, NOL0);
      b.cyl(L(0xffe6a0), 0.3, 0.3, x + 0.4, y0 + H1 - 1.5, Zm, { rt: 0.08, seg: 10, ol: 0 });
      for (const cx of [x - w / 2 + 2.0, x + 1.0]) { b.box(C.wood, 1.7, 0.6, 0.75, cx, y0 + 0.2, zf + 1.0); for (const lx of [-0.75, 0.75]) b.box(C.woodD, 0.08, 0.2, 0.7, cx + lx, y0, zf + 1.0, { ol: 0 }); for (let k = 0; k < 14; k++) b.box(pick([0xb8483f, 0x2f5d8a, 0xe2c15a, 0x3f7a52, 0xd9d2c2, 0x8a5a9e]), 0.1, 0.42, 0.3, cx - 0.72 + k * 0.11, y0 + 0.8, zf + 1.0, { ol: 0 }); plane(b, menuMats.book, 0.6, 0.3, cx, y0 + 1.1, zf + 1.39); }
      break;
    }
    case 'breakfast': {
      b.box(L(0xf2d8a8), w - 1.2, 1.0, 0.8, x, y0, Zb + 0.6, NOL0);
      for (let k = 0; k < 3; k++) for (let s = 0; s < 3; s++) b.cyl(L(0xd8b070), 0.28, 0.2, X0 + 0.6 + k * 0.7, y0 + 1.0 + s * 0.21, Zb + 0.6, { seg: 12, ol: 0 });
      b.cyl(L(0xf6f6f2), 0.3, 0.45, X0 + 2.8, y0 + 1.0, Zb + 0.6, { seg: 12, ol: 0 }); b.cyl(L(0xc0c4c9), 0.18, 0.35, X0 + 3.5, y0 + 1.0, Zb + 0.6, { seg: 10, ol: 0 });
      plane(b, menuMats.breakfast, 3.0, 1.5, x + 0.6, y0 + 2.1, Zb + 0.12);
      for (let t = 0; t < 2; t++) { const tx = x - w / 4 + t * w / 2; b.box(L(0xc88a50), 1.1, 0.06, 0.8, tx, y0 + 0.74, zf - 1.5, NOL0); b.box(L(0x6a4a30), 0.08, 0.74, 0.08, tx, y0, zf - 1.5, NOL0); for (const s of [-0.7, 0.7]) b.cyl(L(0xff8a1f), 0.18, 0.44, tx + s, y0, zf - 1.5, { seg: 8, ol: 0 }); b.box(L(0xf6f6f2), 0.3, 0.1, 0.3, tx, y0 + 0.8, zf - 1.5, NOL0); b.box(L(0xe87a5a), 0.2, 0.06, 0.1, tx, y0 + 0.9, zf - 1.5, NOL0); }
      for (let k = 0; k < 3; k++) b.cyl(L(0xffe6a0), 0.26, 0.28, X0 + 1 + k * 2, y0 + H1 - 1.45, Zm, { rt: 0.06, seg: 10, ol: 0 });
      const ox = x - w / 2 + 2.2; b.box(C.wood, 1.8, 0.85, 0.8, ox, y0, zf + 0.9); for (let k = 0; k < 2; k++) for (let s = 0; s < 3; s++) b.cyl(0xd8b070, 0.28, 0.2, ox - 0.4 + k * 0.8, y0 + 0.85 + s * 0.21, zf + 0.9, { seg: 12, ol: 0.02 });
      ch.steam.push([X + ox - 0.4, y0 + 1.7, zf + 0.9], [X + ox + 0.4, y0 + 1.7, zf + 0.9]);
      b.box(C.dark, 0.6, 0.95, 0.06, x + w / 2 - 1.0, y0, zf + 1.3, { rx: 0.15, ol: 0.02 }); plane(b, menuMats.breakfastA, 0.52, 0.66, x + w / 2 - 1.0, y0 + 0.62, zf + 1.405, 0, -0.15);
      for (let k = 0; k < 2; k++) b.cyl(0xff8a1f, 0.2, 0.44, x + 0.4 + k * 0.7, y0, zf + 1.2, { seg: 8, ol: 0.02 });
      break;
    }
    case 'repair': {
      b.box(L(0xd8c8a8), w - 1.0, 2.2, 0.08, x, y0 + 0.6, Zb + 0.1, NOL0);
      for (let k = 0; k < 16; k++) b.box(L(pick([0x3a3f4a, 0xd8202d, 0x2d6fd6, 0xc9ced4])), rr(0.08, 0.14), rr(0.3, 0.5), 0.05, X0 + 0.4 + k * (w - 1.8) / 16, y0 + rr(1.2, 2.2), Zb + 0.16, NOL0);
      for (let k = 0; k < 4; k++) { const g = new THREE.TorusGeometry(0.34, 0.07, 6, 14); g.translate(X0 + 0.8 + k * 0.85, y0 + 2.9, Zb + 0.3); b.geo(L(0x1d1f24), g, { cast: false }); }
      bikeAt(b, x - 0.8, Zm, { up: true, ry: PI / 2, col: 0x2d6fd6, y: y0 + 0.02 }); b.box(L(0x3a3f4a), 0.1, 0.9, 0.1, x - 0.8, y0, Zm, NOL0);
      bikeAt(b, x + 1.6, Zm - 0.6, { ry: PI / 2 + 0.3, col: 0xff8fb3, y: y0 });
      b.box(L(0xd8202d), 0.7, 0.8, 0.5, X1 - 0.5, y0, zf - 1.2, NOL0); b.cyl(L(0x3a3f4a), 0.06, 0.8, X1 - 0.3, y0 + 0.8, zf - 1.2, { seg: 6, ol: 0 });
      b.box(L(0x8a6a4a), 2.0, 0.9, 0.7, X0 + 1.2, y0, Zb + 0.6, NOL0); for (let k = 0; k < 4; k++) b.cyl(L(pick([0xd8202d, 0xf2c14e, 0x2d6fd6])), 0.1, 0.24, X0 + 0.5 + k * 0.4, y0 + 0.9, Zb + 0.6, { seg: 8, ol: 0 });
      for (let k = 0; k < 3; k++) bikeAt(b, x - w / 2 + 1.5 + k * 1.3, -8.2, { ry: PI / 2 + 0.25, tag: true });
      b.cyl(C.dark, 0.08, 0.9, x + w / 2 - 0.7, 0.18, -8.4, { seg: 6 }); b.cyl(0xd8202d, 0.14, 0.2, x + w / 2 - 0.7, 1.05, -8.4, { seg: 8 });
      for (let k = 0; k < 3; k++) { const g = new THREE.TorusGeometry(0.36, 0.12, 6, 14); g.rotateX(PI / 2); g.translate(x + w / 2 - 1.6, 0.3 + k * 0.24, -8.4); b.geo(C.tire, g); }
      b.box(C.dark, 0.6, 0.95, 0.06, x + 1.2, 0.18, -7.9, { rx: 0.15, ol: 0.02 }); plane(b, menuMats.repair, 0.52, 0.66, x + 1.2, 0.8, -7.795, 0, -0.15);
      break;
    }
    case 'catcafe': {
      b.box(L(0xf6c8d8), w - 1.0, 0.06, 4.4, x, y0 + 0.02, zf - 2.3, NOL0);
      const tx = X0 + 0.8; for (const [py, pz] of [[0.9, -3.0], [1.8, -3.6], [2.6, -2.8]]) { b.box(L(0xd8b890), 0.9, 0.1, 0.9, tx + (pz + 3) * 0.5, y0 + py, zf + pz, NOL0); } b.box(L(0xc8a878), 0.16, 2.7, 0.16, tx, y0, zf - 3.0, NOL0); b.box(L(0xc8a878), 0.16, 1.8, 0.16, tx + 0.3, y0, zf - 3.6, NOL0);
      catAt(b, tx, y0 + 1.0, zf - 3.0, 0xf0a040, { ry: 0.4 }); catAt(b, tx + 0.3, y0 + 2.7, zf - 2.8, 0x2a2a30, { lie: true, ry: 0.3 });
      for (let k = 0; k < 3; k++) { b.box(L(0xf6f0e6), 1.2, 0.08, 0.4, x + 0.5 + (k % 2) * 1.4, y0 + 1.5 + k * 0.6, Zb + 0.3, NOL0); }
      catAt(b, x + 0.3, y0 + 1.58, Zb + 0.3, 0xf6f6f2, { ry: 0.2 }); catAt(b, x + 1.9, y0 + 2.18, Zb + 0.3, 0x9aa0a8, { lie: true, ry: PI });
      for (let k = 0; k < 3; k++) { const cx = x - 1.2 + k * 1.3; b.cyl(L(pick([0xffc2d6, 0xc8e6ff, 0xfff0a0])), 0.4, 0.14, cx, y0 + 0.04, zf - 1.8, { seg: 12, ol: 0 }); }
      catAt(b, x - 1.2, y0 + 0.18, zf - 1.8, 0xf6f6f2, { lie: true, ry: 0.6 });
      catAt(b, x + 0.1, y0 + 0.18, zf - 1.8, 0xf6f6f2, { patch: 0xf0a040 });
      b.box(L(0xffffff), w - 0.8, 0.12, 0.45, x, y0 + 0.5, zf - 0.3, NOL0);
      catAt(b, x - 0.6, y0 + 0.62, zf - 0.3, 0xf0a040, { lie: true, ry: 0 }); catAt(b, x + 1.4, y0 + 0.62, zf - 0.3, 0x2a2a30, {});
      b.box(L(0xfff4c8), 1.0, 0.4, 0.7, X1 - 0.6, y0, zf - 1.4, NOL0);
      for (let k = 0; k < 6; k++) b.box(0xff8fb3, 0.14, 0.14, 0.01, x - w / 2 + 1 + k * 0.9, y0 + 0.4 + (k % 2) * 0.35, zf + 0.0, { ol: 0, cast: false });
      b.box(C.dark, 0.6, 0.95, 0.06, x + w / 2 - 1.0, y0, zf + 1.3, { rx: 0.15, ol: 0.02 }); plane(b, menuMats.cat, 0.52, 0.66, x + w / 2 - 1.0, y0 + 0.62, zf + 1.405, 0, -0.15);
      potAt(b, x - w / 2 + 1.4, zf + 0.5, y0); potAt(b, x - w / 2 + 2.0, zf + 0.5, y0);
      break;
    }
    case 'tea': {
      b.box(L(0xffffff), w - 1.0, 1.05, 0.7, x, y0, zf - 0.7, NOL0); b.box(L(0xb8a4ff), w - 1.0, 0.15, 0.72, x, y0 + 0.85, zf - 0.7, NOL0);
      const cols = [0x8a5a3a, 0x8ad070, 0xf6a8c0, 0xb8a4ff, 0xffc83a, 0xf2e6d0];
      for (let k = 0; k < 8; k++) cupAt(b, X0 + 0.4 + k * (w - 1.6) / 8, y0 + 1.05, zf - 0.6, 1.1, cols[k % cols.length]);
      plane(b, menuMats.tea, 3.2, 1.6, x, y0 + 2.1, Zb + 0.12);
      for (let k = 0; k < 4; k++) b.cyl(L(0xc9ced4), 0.22, 0.6, X0 + 0.6 + k * 0.7, y0 + 1.0, Zb + 0.5, { seg: 10, ol: 0 });
      b.box(L(0xe8e0f8), w - 1.0, 1.0, 0.7, x, y0, Zb + 0.5, NOL0);
      // giant cup on the fascia
      const cx = x + w / 2 - 1.3, cy = y0 + H1 + 0.05;
      b.cyl(0xb8a4ff, 0.62, 1.5, cx, cy, zf - 0.5, { rt: 0.78, seg: 14 }); b.cyl(0x2a1a14, 0.64, 0.3, cx, cy + 0.02, zf - 0.5, { rt: 0.66, seg: 14, ol: 0 }); b.cyl(0xffffff, 0.84, 0.16, cx, cy + 1.5, zf - 0.5, { seg: 14 }); b.ico(0xffffff, 0.74, cx, cy + 1.62, zf - 0.5, { det: 1, sy: 0.35 });
      b.cyl(0xff5a9a, 0.1, 1.5, cx + 0.15, cy + 1.65, zf - 0.5, { rz: -0.25, seg: 8 });
      ch.halos.push(halo(ch.group, 'neonT', 0xc8b4ff, X + cx, cy + 0.8, zf + 0.4, 4));
      b.box(0xffffff, 1.4, 0.45, 0.4, x - 1.0, y0, zf + 1.2); b.box(0xb8a4ff, 1.4, 0.08, 0.42, x - 1.0, y0 + 0.45, zf + 1.2, { ol: 0.015 });
      break;
    }
    default: {
      if (kind === 'ramen' || kind === 'izakaya' || kind === 'cafe') {
        b.box(L(kind === 'cafe' ? 0x6a4a30 : 0xc9a06a), w - 1.4, 1.05, 0.7, x, y0, Zb + 1.4, NOL0);
        for (let k = 0; k < Math.floor(w / 1.1); k++) { const sx = X0 + 0.6 + k * 1.1; b.cyl(L(0xb3243a), 0.2, 0.08, sx, y0 + 0.72, Zb + 2.2, { seg: 8, ol: 0 }); b.cyl(L(0x3a3a3a), 0.05, 0.72, sx, y0, Zb + 2.2, { seg: 5, ol: 0 }); }
        for (let k = 0; k < Math.floor(w * 1.6); k++) b.cyl(L(pick([0x3a7a3a, 0x8a4a1a, 0xd8b85a, 0x6a2a3a, 0xe8e8e8])), 0.06, 0.34, X0 + 0.3 + k * 0.5, y0 + 1.7, Zb + 0.25, { seg: 6, ol: 0 });
        if (kind !== 'cafe') { for (let k = 0; k < 3; k++) b.box(T(0x1f2d4a, { snow: 0 }), 0.42, 0.75, 0.02, x + w / 2 - 2.1 + k * 0.44, y0 + 1.55, zf + 0.08, NOL0); const lm = new THREE.MeshBasicMaterial({ color: 0xff7a4a }); for (const s of [-1, 1]) { b.ico(lm, 0.26, x + s * (w / 2 - 0.6), y0 + 2.4, zf + 0.35, { det: 1, sy: 1.3 }); ch.halos.push(halo(ch.group, 'lantern', 0xff6a3a, X + x + s * (w / 2 - 0.6), y0 + 2.4, zf + 0.5, 2.2)); } }
        if (kind === 'izakaya') for (let k = 0; k < 2; k++) b.cyl(0x8a5a3a, 0.35, 0.8, x - 1.5 + k * 0.8, 0.18, zf + 0.6, { seg: 12 });
      } else if (kind === 'flower') {
        for (let t = 0; t < 3; t++) { b.box(C.wood, w - 1.4, 0.08, 0.5, x, y0 + 0.3 + t * 0.35, zf + 0.5 + t * -0.35); for (let k = 0; k < 10; k++) { const fx = x - w / 2 + 1 + k * (w - 2) / 9; b.cyl(0x9aa2ac, 0.14, 0.25, fx, y0 + 0.38 + t * 0.35, zf + 0.5 - t * 0.35, { seg: 8, ol: 0 }); for (let q = 0; q < 3; q++) b.ico(pick(S.fl), 0.1, fx + rr(-0.08, 0.08), y0 + 0.72 + t * 0.35, zf + 0.5 - t * 0.35 + rr(-0.06, 0.06), { det: 0 }); } }
        for (let k = 0; k < 8; k++) { b.cyl(L(0x9aa2ac), 0.2, 0.4, X0 + 0.5 + k * (w - 2) / 7, y0, Zb + 0.6, { seg: 8, ol: 0 }); b.ico(pick(S.fl), 0.22, X0 + 0.5 + k * (w - 2) / 7, y0 + 0.62, Zb + 0.6, { det: 1 }); }
      } else {
        const n = Math.max(1, Math.floor((w - 2.6) / 1.9));
        for (let i = 0; i < n; i++) { const sx = X0 + 1.4 + i * 1.9; b.box(L(0xf2f4f6), 0.6, 1.5, 2.6, sx, y0, zf - 2.4, NOL0); for (let l = 0; l < 3; l++) for (let q = 0; q < 5; q++) b.box(L(pick(PROD)), 0.66, 0.26, 0.4, sx, y0 + 0.3 + l * 0.42, zf - 3.4 + q * 0.5, NOL0); }
        if (kind === 'bakery') { b.box(L(0xe8e2d6), w - 1.6, 0.9, 0.9, x, y0, zf - 0.8, NOL0); for (let i = 0; i < 16; i++) b.ico(L(pick([0xc98a4a, 0xa8642e, 0xe0b070])), 0.14, x + rr(-w / 2 + 1, w / 2 - 1), y0 + 1.0, zf - 0.8 + rr(-0.3, 0.3), { det: 0, sx: 1.4 }); }
        if (kind === 'drug') for (let k = 0; k < 2; k++) { b.box(0xf2f4f6, 1.2, 0.8, 0.7, x - 1.4 + k * 1.6, 0.18, zf + 0.8); for (let q = 0; q < 6; q++) b.box(pick(PROD), 0.3, 0.25, 0.25, x - 1.8 + k * 1.6 + (q % 3) * 0.35, 0.98, zf + 0.65 + Math.floor(q / 3) * 0.3, { ol: 0 }); }
      }
    }
  }
  ch.spots.push(lmSpot(X + x, zf + 2.2, w * 0.55, colOf(inWall).getHex(), () => 0.3 + 0.6 * ENV.night, 2.6));
  return upperFloors(b, ch, X, x, w, d, y0 + H1, fl, { balc: rnd() < 0.5 });
}

/* ================================================================== chunks */
const CHUNK_TYPES = ['shops', 'shops', 'shops', 'res', 'konbini', 'park', 'school', 'rail', 'shops'];
function chunkType(k) { if (k <= 1) return 'shops'; if (k % 5 === 3) return 'cross'; _s = 99991 + k * 7919; rnd(); return CHUNK_TYPES[Math.floor(rnd() * CHUNK_TYPES.length)]; }
let featuredI = 0;
function shopRow(b, ch, X, x0, x1) {
  let x = x0;
  while (x < x1 - 4) {
    const w = Math.min(x1 - x, pick([8, 8.5, 9]));
    if (w < 6.5) break;
    const kind = rnd() < 0.62 ? FEATURED[(featuredI++) % FEATURED.length] : pick(OTHERS);
    shopAt(b, ch, X, x + w / 2, w, kind, Math.floor(rr(1, 4)));
    x += w;
  }
}
function buildChunk(k) {
  const X = k * CH, type = chunkType(k);
  _s = 12345 + k * 1013 + 7; rnd();
  const group = new THREE.Group(); scene.add(group);
  const ch = { k, type, group, spots: [], halos: [], dyn: [], steam: [] };
  const b = makeBuilder(); b.setT({ x: X, z: 0 });
  if (type === 'cross') {
    roadBase(b, ch, X, { gap: [14, 30] });
    b.box(P.asphalt, 12, 0.04, 18, 22, 0, 0, NOL0); b.box(P.asphalt, 12, 0.05, 82, 22, 0.1, -50, NOL0); b.box(P.asphalt, 12, 0.05, 26, 22, 0.1, 22, NOL0);
    for (const cx of [13.4, 30.6]) for (let i = 0; i < 9; i++) b.box(P.paint, 1.8, 0.02, 0.55, cx, 0.05, -4.4 + i * 1.1, NOL0);
    for (const cz of [-7.2, 7.2]) for (let i = 0; i < 10; i++) b.box(P.paint, 0.55, 0.02, 2.4, 16.9 + i * 1.1, 0.15, cz, NOL0);
    for (let z = -12; z > -90; z -= 5) b.box(P.paint, 0.16, 0.02, 2.6, 22, 0.15, z, NOL0);
    for (const [px, pz, dz] of [[14.6, -5.6, 1], [29.4, 5.6, -1], [29.4, -5.6, 1], [14.6, 5.6, -1]]) {
      b.cyl(C.pole, 0.14, 6.2, px, 0.18, pz); b.box(C.pole, 0.14, 0.14, 3.2, px, 5.85, pz + dz * 1.6, { ol: 0.02 });
      b.box(C.dark, 0.42, 0.64, 2.1, px, 5.2, pz + dz * 3);
      [-0.66, 0, 0.66].forEach((lz, i) => { const g = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16); g.rotateZ(PI / 2); g.translate(px + (px < 20 ? -0.24 : 0.24), 5.52, pz + dz * 3 + lz); b.geo([SIG.g, SIG.y, SIG.r][i], g, { cast: false }); });
      b.box(C.dark, 0.32, 0.95, 0.52, px, 2.3, pz, { ol: 0.03 }); b.box(SIG.r2, 0.03, 0.36, 0.38, px + (px < 20 ? 0.18 : -0.18), 2.55, pz, { ol: 0 }); b.box(SIG.g2, 0.03, 0.36, 0.38, px + (px < 20 ? 0.18 : -0.18), 2.12, pz, { ol: 0 });
    }
    ch.spots.push(lmSpot(X + 11, -2.5, 1.8, 0x19f0c0, () => 0.55, 3.5)); ch.spots.push(lmSpot(X + 33, 2.5, 1.8, 0x19f0c0, () => 0.55, 3.5));
    b.box(P.side1, 3, 0.2, 80, 14.5, 0.1, -49, { ol: 0.03, cast: false }); b.box(P.side1, 3, 0.2, 80, 29.5, 0.1, -49, { ol: 0.03, cast: false });
    shopAt(b, ch, X, 4.6, 9, FEATURED[(featuredI++) % 5], 2);
    shopAt(b, ch, X, 35.4, 9, FEATURED[(featuredI++) % 5], 1);
    for (let z = -22; z > -80; z -= 12) { b.box(pick(WALLS), 7, rr(6, 18), 9, 9, 0.12, z); b.box(pick(WALLS), 7, rr(6, 20), 9, 35, 0.12, z); for (let f = 1; f < 5; f++) { plane(b, pick(winMats), 1.2, 1.2, 12.53, f * 2.6, z + 1.5, PI / 2); plane(b, pick(winMats), 1.2, 1.2, 31.47, f * 2.6, z - 1.5, -PI / 2); } }
    for (let z = -16; z > -80; z -= 14) treeAt(b, 15.2, z, rnd() < 0.5 ? 'sakura' : 'round', 0.9, 0.2);
    carAt(b, 24.5, -22, PI, pick(CARC)); carAt(b, 19.5, -40, 0, pick(CARC), 'taxi');
    ch.cross = X + 22;
  } else {
    roadBase(b, ch, X, { farLot: type === 'park' ? P.grass : type === 'school' ? P.dirt : P.plaza2, lamps: type !== 'shops' });
    const trees = type === 'school' ? [] : [2.5, 20, 37.5];
    if (type === 'shops') {
      shopRow(b, ch, X, 0, 40);
      for (const x of [11, 29]) suzuranLamp(b, ch, X, x, -5.6);
      for (let k2 = 0; k2 < 4; k2++) bikeAt(b, 6 + k2 * 0.8, -6.6, { ry: 0.2 });
      streetTrees(b, [2.5, 20, 37.5], k % 2 ? ['sakura', 'round'] : ['round', 'sakura']);
      hedgeBox(b, 15, -5.5, 3); hedgeBox(b, 25, -5.5, 3);
    } else if (type === 'res') {
      shopAt(b, ch, X, 5, 9, FEATURED[(featuredI++) % 5], 3);
      upperFloors(b, ch, X, 20, 18, 11, 0.12, Math.floor(rr(3, 6)), { balc: true }); upperFloors(b, ch, X, 34.5, 10, 11, 0.12, Math.floor(rr(2, 5)), { balc: true });
      for (let x2 = 12; x2 < 38; x2 += 3) potAt(b, x2, -9.4, 0.18, rnd() < 0.3);
      for (let k2 = 0; k2 < 5; k2++) bikeAt(b, 13 + k2 * 0.8, -8.6, { ry: 0.1 });
      streetTrees(b, [20, 37.5], ['tall', 'round']);
      flowerBox(b, 28, -5.5, 3, 0.8);
    } else if (type === 'konbini') {
      b.box(0xf2f4f5, 16, 4.2, 10, 12, 0.12, -24); b.box(0x1f9f5f, 16.2, 0.4, 10.2, 12, 4.32, -24, { ol: 0.02 });
      plane(b, konbiniMat, 15.6, 1.4, 12, 3.6, -18.93);
      b.box(LITC(0xf4fbff), 15, 2.8, 0.2, 12, 0.12, -22, NOL0); for (let i = 0; i < 6; i++) for (let l = 0; l < 3; l++) b.box(LITC(pick(PROD)), 1.8, 0.3, 0.4, 5 + i * 2.3, 0.3 + l * 0.5, -21.6, NOL0);
      for (let i = 0; i < 3; i++) { b.box(LITC(0xf2f4f6), 0.6, 1.4, 1.6, 7 + i * 3.2, 0.12, -20.3, NOL0); for (let l = 0; l < 3; l++) b.box(LITC(pick(PROD)), 0.66, 0.24, 1.5, 7 + i * 3.2, 0.3 + l * 0.4, -20.3, NOL0); }
      plane(b, glassM, 15.4, 2.8, 12, 1.52, -18.98);
      for (let i = 0; i < 4; i++) b.box(P.paint, 0.12, 0.02, 5, 5 + i * 3.4, 0.12, -13.5, NOL0);
      carAt(b, 6.7, -13.5, PI, pick(CARC), 'sedan', 0.12); carAt(b, 13.5, -13.5, PI, pick(CARC), 'kei', 0.12);
      vendingAt(b, ch, X, 21.3, -18.6, 0, 0xd73a49); vendingAt(b, ch, X, 22.5, -18.6, 0, 0x2d6fd6);
      ch.spots.push(lmSpot(X + 12, -14, 9, 0xeef8ff, () => 0.25 + 0.7 * ENV.night, 4));
      shopAt(b, ch, X, 32, 10, FEATURED[(featuredI++) % 5], 2);
      streetTrees(b, [2.5, 20], ['round', 'tall']);
    } else if (type === 'school') {
      for (let x = 0; x < 40; x += 0.5) if (x < 16 || x > 22) b.box(C.metalD, 0.05, 1.1, 0.05, x, 0.6, -10.2, { ol: 0.012 });
      b.box(C.concrete, 16, 0.5, 0.3, 8, 0.1, -10.2); b.box(C.concrete, 18, 0.5, 0.3, 31, 0.1, -10.2);
      b.box(C.concrete, 0.75, 1.9, 0.75, 16, 0.1, -10.2); b.box(C.concrete, 0.75, 1.9, 0.75, 22, 0.1, -10.2);
      b.box(0xf2ece0, 36, 10.8, 8, 20, 0.12, -30); for (let f = 0; f < 3; f++) { for (let c = 0; c < 12; c++) plane(b, winMats[(c + f) % 10], 2.2, 2.0, 3.5 + c * 2.95, 1.5 + f * 3.6 + 1.0, -25.97); b.box(0x6f9ad8, 36.3, 0.3, 8.3, 20, 0.12 + (f + 1) * 3.6 - 0.15, -30, { ol: 0 }); }
      plane(b, schoolMat, 7, 1.0, 20, 11.4, -25.8);
      b.box(0xf2ece0, 4, 3, 3, 20, 10.92, -27.5); b.cyl(0xf7f4ec, 1.0, 0.1, 20, 12.4, -25.95, { rx: PI / 2, seg: 24, ol: 0.03 });
      for (const x of [3, 9, 27, 33, 38]) treeAt(b, x, -12.5, 'sakura', 1.1, 0.1);
      for (const x of [6, 30]) flowerBox(b, x, -11.4, 3, 0.8, 0.1);
      tufts(b, 1, 39, -24, -13, 30, 0.12);
    } else if (type === 'park') {
      for (let x = 0; x < 40; x += 2) b.box(0x6f8a5a, 0.08, 0.7, 0.08, x, 0.14, -10, { ol: 0.015 });
      b.box(0x6f8a5a, 40, 0.06, 0.06, 20, 0.84, -10, { ol: 0.01 });
      b.box(P.path, 40, 0.02, 2.2, 20, 0.14, -15, NOL0);
      for (let i = 0; i < 9; i++) treeAt(b, rr(2, 38), rr(-32, -18), pick(['sakura', 'sakura', 'round', 'tall', 'pine']), rr(0.9, 1.3), 0.14);
      for (let i = 0; i < 3; i++) { const bx = 5 + i * 14; b.box(C.wood, 1.9, 0.08, 0.55, bx, 0.59, -16.6); b.box(C.wood, 1.9, 0.4, 0.07, bx, 0.74, -16.9, { rx: -0.18 }); b.box(C.metalD, 0.07, 0.45, 0.5, bx - 0.8, 0.14, -16.6); b.box(C.metalD, 0.07, 0.45, 0.5, bx + 0.8, 0.14, -16.6); }
      for (const x of [12, 30]) { b.cyl(C.metalD, 0.08, 3.6, x, 0.14, -13.8, { seg: 8 }); b.ico(bulbMat, 0.34, x, 3.95, -13.8, { det: 1 }); ch.halos.push(halo(ch.group, 'lamp', 0xfff0d0, X + x, 3.95, -13.8, 3.4)); ch.spots.push(lmSpot(X + x, -13.8, 3, 0xffe2b0, () => ENV.lamps)); }
      for (let i = 0; i < 10; i++) bushAt(b, rr(1, 39), rr(-12.6, -10.8), rr(0.5, 0.9), 0.14, rnd() < 0.5 ? S.azalea : S.bush);
      flowerBox(b, 8, -13.2, 3.5, 1.2, 0.14); flowerBox(b, 26, -13.2, 3.5, 1.2, 0.14);
      tufts(b, 1, 39, -30, -11, 40, 0.14);
      streetTrees(b, [20], ['sakura']);
    } else if (type === 'rail') {
      shopAt(b, ch, X, 7, 13, FEATURED[(featuredI++) % 5], 2); shopAt(b, ch, X, 33, 13, pick(OTHERS), 2);
      b.box(0xb8b4ad, 6.5, 1.3, 120, 21, 7, -40); b.box(0xb8b4ad, 0.3, 1.3, 120, 18, 8.3, -40, { ol: 0.02 }); b.box(0xb8b4ad, 0.3, 1.3, 120, 24, 8.3, -40, { ol: 0.02 });
      for (const z of [-11.5, -28, -46, -64, 11.5]) b.box(0xa8a49c, 1.6, 7, 1.6, 21, 0.12, z);
      for (let z = -95; z < 18; z += 2.5) b.box(C.metalD, 0.06, 1.3, 0.06, 18.2, 8.3, z, { ol: 0 });
      for (const z of [-3, 3]) { b.box(bulbMat, 0.8, 0.05, 0.3, 21, 6.95, z, { ol: 0 }); ch.spots.push(lmSpot(X + 21, z, 3, 0xe8f2ff, () => ENV.lamps * 0.8)); }
      const train = new THREE.Group(); ch.group.add(train); const tb = makeBuilder();
      for (let c = 0; c < 3; c++) { tb.box(0xe8ecf0, 2.8, 2.9, 17, 0, 0, c * 17.6); tb.box(0x2d6fd6, 2.82, 0.35, 17.02, 0, 0.6, c * 17.6, { ol: 0 }); tb.box(0xffd400, 2.82, 0.12, 17.02, 0, 1.0, c * 17.6, { ol: 0 }); for (const s of [-1, 1]) { const g = new THREE.PlaneGeometry(15, 0.9); g.rotateY(s * PI / 2); g.translate(s * 1.415, 1.85, c * 17.6); tb.geo(winMats[1], g, { cast: false }); } }
      tb.finish(train); train.position.set(X + 21, 8.3, -200); ch.dyn.push(() => { const L2 = 460, v = 26, t = (clock * v + k * 97) % L2; train.position.z = -300 + t; ch.trainZ = train.position.z + 17; });
      ch.rail = X + 21;
      streetTrees(b, [2.5], ['round']);
    }
  }
  if (type !== 'cross') {
    if (rnd() < 0.6) vendingAt(b, ch, X, rr(4, 34), 7.4, PI, pick([0xd73a49, 0x2d6fd6, 0xeef0f2, 0xffb52e]));
    if (rnd() < 0.5) { const hx = rr(3, 37); b.cyl(C.red, 0.16, 0.6, hx, 0.18, 5.95, { seg: 8 }); b.cyl(C.red, 0.2, 0.12, hx, 0.78, 5.95, { rt: 0.08, seg: 8 }); }
    if (rnd() < 0.35) carAt(b, rr(5, 35), -4.0, PI / 2, pick(CARC), pick(['sedan', 'kei', 'taxi']));
  }
  b.finish(group);
  chunks.set(k, ch);
  ch.steamS = ch.steam.map(([x, y, z]) => { const s = new THREE.Sprite(steamMat); s.position.set(x, y, z); s.scale.setScalar(1.2); group.add(s); return s; });
  return ch;
}
const steamMat = new THREE.SpriteMaterial({ map: haloTex, color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
const konbiniTex = label(1024, 128, '#f5f7f8', (x, w, h) => { x.fillStyle = '#1f9f5f'; x.fillRect(0, 0, w, 34); x.fillStyle = '#f08a24'; x.fillRect(0, 34, w, 16); x.fillStyle = '#1f6fbf'; x.fillRect(0, h - 22, w, 22); x.font = `400 58px ${F_BOLD}`; x.fillText('ハッピーマート 24h', w / 2, 82); });
const konbiniMat = emissiveMat(konbiniTex);
const schoolMat = new THREE.MeshToonMaterial({ map: label(768, 112, '#f4efe2', (x, w, h) => { x.fillStyle = '#233a52'; x.font = `800 64px ${F_MIN}`; x.fillText('青葉台高等学校', w / 2, h / 2 + 4); }), gradientMap: grad });
function disposeChunk(ch) {
  for (const s of ch.spots) dropSpot(s);
  ch.group.traverse((o) => { if (o.geometry && o.geometry !== lmGeo) o.geometry.dispose(); });
  scene.remove(ch.group); chunks.delete(ch.k);
}
function streamChunks(px) {
  const kc = Math.floor(px / CH);
  for (let k = kc - 1; k <= kc + 3; k++) if (!chunks.has(k)) buildChunk(k);
  for (const [k, ch] of chunks) if (k < kc - 1 || k > kc + 4) disposeChunk(ch);
}

/* ================================================================== traffic */
const traffic = [];
function makeTrafficCar(type) {
  const g = new THREE.Group(), b = makeBuilder();
  carAt(b, 0, 0, 0, type === 'convertible' ? 0xe8202d : pick(CARC), type, 0); b.finish(g);
  g.rotation.y = -PI / 2; g.visible = false; scene.add(g);
  halo(g, 'head', 0xfff4d8, -0.58, 0.64, 2.2, 1.6); halo(g, 'head', 0xfff4d8, 0.58, 0.64, 2.2, 1.6);
  const car = { g, v: 12, active: false, passed: false, spot: null, type };
  traffic.push(car); return car;
}
for (const t of ['sedan', 'taxi', 'kei', 'sedan', 'convertible', 'sedan']) makeTrafficCar(t);
let trafficTimer = 2;
function updateTraffic(dt, px) {
  trafficTimer -= dt;
  if (trafficTimer <= 0) {
    trafficTimer = rr(2.5, 6.5);
    const free = traffic.filter((t) => !t.active); const c = free.length ? pick(free) : null;
    if (c) { c.active = true; c.passed = false; c.v = c.type === 'convertible' ? 16 : rr(10, 15); c.g.position.set(px + rr(110, 140), 0.04, 2.4); c.g.visible = true; c.spot = lmSpot(c.g.position.x - 6, 2.4, 6, 0xfff0d0, () => 0.3 + 0.7 * ENV.night, 2.4); }
  }
  for (const c of traffic) if (c.active) {
    c.g.position.x -= c.v * dt;
    c.spot.mesh.position.x = c.g.position.x - 6;
    if (!c.passed && c.g.position.x < camTX() + 6) { c.passed = true; audio.carPass(c.v, c.type === 'convertible'); }
    if (c.g.position.x < px - 45) { c.active = false; c.g.visible = false; dropSpot(c.spot); c.spot = null; }
  }
}

/* ================================================================== sky, time of day, weather */
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
  uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color(0x05070d) }, uSun: { value: new THREE.Vector3(0.5, 0.1, -1).normalize() }, uSunC: { value: new THREE.Color(0xffb070) }, uSunV: { value: 0 }, uMoon: { value: new THREE.Vector3() }, uMoonV: { value: 0 }, uCloud: { value: 0 }, uFlash: G.uFlash },
  vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uBot; uniform vec3 uSun; uniform vec3 uSunC; uniform float uSunV; uniform vec3 uMoon; uniform float uMoonV; uniform float uCloud; uniform float uFlash; varying vec3 vD;
void main(){ vec3 d = normalize(vD); float y = d.y; vec3 c = y > 0.0 ? mix(uHor, uTop, pow(clamp(y,0.0,1.0), 0.5)) : mix(uHor, uBot, clamp(-y*3.0,0.0,1.0));
float s = max(dot(d, uSun), 0.0); c += uSunC * (pow(s, 600.0) * 2.0 + pow(s, 8.0) * 0.35) * uSunV * (1.0 - uCloud * 0.85);
float m = max(dot(d, uMoon), 0.0); c += vec3(0.92,0.95,1.0) * smoothstep(0.9994, 0.9996, m) * uMoonV * (1.0 - uCloud * 0.9);
c += vec3(0.75,0.8,1.0) * uFlash * 0.8;
gl_FragColor = vec4(c, 1.0);
#include <encodings_fragment>
}`, side: THREE.BackSide, depthWrite: false }));
sky.renderOrder = -2; scene.add(sky);
const skylineTex = ctex(2048, 256, (x) => { x.clearRect(0, 0, 2048, 256); let px = 0; while (px < 2048) { const w = 30 + Math.random() * 90, h = 50 + Math.random() * 180; x.fillStyle = 'rgb(0,0,0)'; x.fillRect(px, 256 - h, w, h); for (let wy = 256 - h + 8; wy < 250; wy += 9) for (let wx = px + 4; wx < px + w - 4; wx += 7) if (Math.random() < 0.18) { x.fillStyle = 'rgb(255,0,0)'; x.fillRect(wx, wy, 3, 4); x.fillStyle = 'rgb(0,0,0)'; } px += w + Math.random() * 10; } });
skylineTex.encoding = THREE.LinearEncoding; skylineTex.wrapS = THREE.RepeatWrapping;
const skyline = new THREE.Mesh(new THREE.CylinderGeometry(420, 420, 160, 72, 1, true), new THREE.ShaderMaterial({
  uniforms: { uMap: { value: skylineTex }, uSil: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uWin: { value: new THREE.Color(0xffc978) }, uNight: { value: 1 } },
  vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D uMap; uniform vec3 uSil; uniform vec3 uHor; uniform vec3 uWin; uniform float uNight; varying vec2 vU;
void main(){ vec4 t = texture2D(uMap, vec2(vU.x * 4.0, vU.y)); if (t.a < 0.5) discard; vec3 c = uSil + uWin * t.r * uNight * 0.9; c = mix(uHor, c, smoothstep(0.05, 0.4, vU.y) * 0.75); gl_FragColor = vec4(c, 1.0);
#include <encodings_fragment>
}`, side: THREE.BackSide, depthWrite: true }));
skyline.position.y = 30; skyline.renderOrder = -1; scene.add(skyline);
const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.7); scene.add(hemi);
const dirL = new THREE.DirectionalLight(0xffffff, 0.5); dirL.castShadow = true; dirL.shadow.mapSize.set(2048, 2048);
Object.assign(dirL.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 }); dirL.shadow.bias = -0.0008; dirL.shadow.normalBias = 0.05;
scene.add(dirL, dirL.target);
const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(600, 300).rotateX(-PI / 2), TG(0x3a3e4a)); groundPlane.position.y = -0.03; groundPlane.receiveShadow = true; scene.add(groundPlane);
const KF = [
  [0, 0x060a1a, 0x1c2448, 0x8ea6e0, 0.3, 0x3a4a80, 0x0c0e18, 0.85],
  [4.5, 0x080c20, 0x1e2650, 0x8ea6e0, 0.28, 0x3a4a80, 0x0c0e18, 0.8],
  [5.5, 0x2a3160, 0xd98f86, 0xffa98a, 0.4, 0x7a7aa8, 0x2a2430, 0.75],
  [6.5, 0x7d9fd6, 0xffc3a0, 0xffc49a, 1.1, 0xc6b6c8, 0x5a4c48, 0.8],
  [8.5, 0x4d95e0, 0xbfe0fb, 0xfff1dc, 1.7, 0xd8ecff, 0x8a8a78, 1.0],
  [15.5, 0x4a8fdc, 0xc9e2f6, 0xfff0d6, 1.65, 0xd8e8ff, 0x8a8674, 0.98],
  [17.2, 0x5a78c4, 0xffb27a, 0xffb06e, 1.3, 0xe0c0b8, 0x6a5448, 0.85],
  [18.3, 0x39386f, 0xff7650, 0xff7448, 0.85, 0xb080b0, 0x3e2e38, 0.8],
  [19.3, 0x171c48, 0x8e4a78, 0xb86a8a, 0.35, 0x5a5a90, 0x1a1624, 0.8],
  [20.5, 0x0a1030, 0x283460, 0x9fb4ff, 0.32, 0x3e4c86, 0x0e1018, 0.85],
  [24, 0x060a1a, 0x1c2448, 0x8ea6e0, 0.3, 0x3a4a80, 0x0c0e18, 0.85],
].map((k) => ({ h: k[0], top: new THREE.Color(k[1]), hor: new THREE.Color(k[2]), sun: new THREE.Color(k[3]), si: k[4], hs: new THREE.Color(k[5]), hg: new THREE.Color(k[6]), hi: k[7] }));
const kf = { top: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), si: 0, hs: new THREE.Color(), hg: new THREE.Color(), hi: 0 };
function sampleKF(h) { let i = 0; while (i < KF.length - 2 && KF[i + 1].h <= h) i++; const a = KF[i], b = KF[i + 1], t = sstep(0, 1, (h - a.h) / (b.h - a.h)); kf.top.copy(a.top).lerp(b.top, t); kf.hor.copy(a.hor).lerp(b.hor, t); kf.sun.copy(a.sun).lerp(b.sun, t); kf.hs.copy(a.hs).lerp(b.hs, t); kf.hg.copy(a.hg).lerp(b.hg, t); kf.si = a.si + (b.si - a.si) * t; kf.hi = a.hi + (b.hi - a.hi) * t; }
const _c = new THREE.Color();
function greyify(c, amt, k = 1) { const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11; _c.setRGB(l * 0.95 * k, l * k, l * 1.08 * k); c.lerp(_c, amt); }
const WX = { clear: { rain: 0, snow: 0, cloud: 0.1 }, light: { rain: 0.45, snow: 0, cloud: 0.85 }, heavy: { rain: 1, snow: 0, cloud: 1 }, snow: { rain: 0, snow: 1, cloud: 0.8 }, cloud: { rain: 0, snow: 0, cloud: 0.85 }, fog: { rain: 0.06, snow: 0, cloud: 0.55 } };
const envCur = { h: 21, rain: 0.45, snow: 0, cloud: 0.85 };
const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
function updateEnv(dt, snap = false) {
  const tg = WX[ENV.w], k = snap ? 1 : 1 - Math.exp(-dt * 1.3);
  let dh = ENV.h - envCur.h; if (dh > 12) dh -= 24; if (dh < -12) dh += 24;
  envCur.h = (envCur.h + dh * (snap ? 1 : 1 - Math.exp(-dt * 2.2)) + 24) % 24;
  for (const key of ['rain', 'snow', 'cloud']) { const tv = key === 'cloud' ? tg[key] : tg[key] * (ENV.imul ?? 1); envCur[key] += (tv - envCur[key]) * k; }
  ENV.rain = envCur.rain; ENV.snowFall = envCur.snow;
  if (envCur.rain > 0.05) ENV.wet = Math.min(1, ENV.wet + dt * envCur.rain * 0.25); else ENV.wet = Math.max(0.1, ENV.wet - dt * 0.03);
  if (envCur.snow > 0.3) ENV.snowAcc = Math.min(1, ENV.snowAcc + dt * 0.06); else ENV.snowAcc = Math.max(0, ENV.snowAcc - dt * 0.03);
  if (snap) { ENV.wet = envCur.rain > 0.05 ? 0.9 : 0.1; ENV.snowAcc = envCur.snow > 0.5 ? 0.85 : 0; }
  const h = envCur.h, a = (h - 6) / 12 * PI;
  sunDir.set(Math.cos(a) * 0.8, Math.sin(a), -0.55).normalize(); moonDir.set(-Math.cos(a) * 0.7, -Math.sin(a), -0.6).normalize();
  const dark = sstep(0.14, -0.1, sunDir.y), ov = clamp(envCur.cloud * 0.5 + envCur.rain * 0.45 + envCur.snow * 0.2, 0, 1);
  ENV.night = clamp(dark + ov * 0.35 * (1 - dark), 0, 1);
  sampleKF(h);
  const su = sky.material.uniforms;
  su.uTop.value.copy(kf.top); su.uHor.value.copy(kf.hor); greyify(su.uTop.value, ov * 0.75, 0.9); greyify(su.uHor.value, ov * 0.65, 0.95);
  su.uSun.value.copy(sunDir); su.uSunC.value.copy(kf.sun); su.uSunV.value = sstep(-0.08, 0.05, sunDir.y); su.uMoon.value.copy(moonDir); su.uMoonV.value = dark; su.uCloud.value = envCur.cloud;
  RSS.fog.color.copy(su.uHor.value).lerp(su.uTop.value, 0.3);
  RSS.fog.density = 0.008 + envCur.rain * 0.005 + envCur.snow * 0.006 + (1 - dark) * -0.002 + (ENV.w === 'fog' ? 0.03 : 0);
  G.uSky.value.copy(RSS.fog.color);
  hemi.color.copy(kf.hs); greyify(hemi.color, ov * 0.5); hemi.groundColor.copy(kf.hg); hemi.intensity = kf.hi + envCur.snow * 0.2;
  const up = sunDir.y > 0, L = up ? sunDir : moonDir;
  dirL.userData.dir = L.clone(); if (dirL.userData.dir.y < 0.15) { dirL.userData.dir.y = 0.15; dirL.userData.dir.normalize(); }
  dirL.color.copy(up ? kf.sun : new THREE.Color(0x9fb4ff)); dirL.intensity = (up ? kf.si * sstep(0, 0.08, sunDir.y) : 0.3) * (1 - ov * 0.6);
  const sl = skyline.material.uniforms; sl.uSil.value.copy(su.uHor.value).multiplyScalar(0.55); sl.uHor.value.copy(su.uHor.value); sl.uNight.value = ENV.night;
  ENV.lamps = sstep(0.35, 0.6, ENV.night);
  for (const m of signMats) m.emissiveIntensity = 0.3 + 0.75 * ENV.night;
  for (const m of winMats) m.color.copy(m.userData.day).lerp(m.userData.on, sstep(0.3, 0.7, ENV.night));
  bulbMat.color.setHex(0x55575e).lerp(_c.setHex(0xfff0d2), ENV.lamps);
  G.uLit.value = 0.3 + 0.35 * ENV.night; uChar.value = RWA.stageOn ? 0.05 : 0.12 + 0.3 * ENV.night;
  G.uWet.value = ENV.wet; G.uSnow.value = ENV.snowAcc; G.uRain.value = envCur.rain;
  RWA.setWeather(envCur.rain, envCur.snow);
}

/* ================================================================== particles: rain, snow, petals / leaves */
const RN = 12000;
const rain = (() => {
  const p = new Float32Array(RN * 6), e = new Float32Array(RN * 2);
  for (let i = 0; i < RN; i++) { const x = rr(-55, 55), y = rr(0, 40), z = rr(-35, 25); p.set([x, y, z, x, y, z], i * 6); e[i * 2 + 1] = 1; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(e, 1));
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: G.uTime, uC: { value: new THREE.Vector3() }, uO: { value: 0.45 }, uSp: { value: 34 } },
    vertexShader: `attribute float aEnd; uniform float uTime; uniform vec3 uC; uniform float uSp; varying float vE;
void main(){ vec3 p = position; float H = 40.0; float y = mod(p.y - uTime * uSp, H); vec2 xz = uC.xz + mod(p.xz - uC.xz + vec2(55.0, 35.0) + vec2(0.12, 0.05) * (H - y), vec2(110.0, 60.0)) - vec2(55.0, 35.0);
vec3 q = vec3(xz.x, y, xz.y); if (aEnd > 0.5) q += vec3(-0.12, 1.1, -0.05); vE = aEnd; gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0); }`,
    fragmentShader: `uniform float uO; varying float vE; void main(){ gl_FragColor = vec4(0.78, 0.84, 0.94, uO * (1.0 - 0.75 * vE)); }` });
  const l = new THREE.LineSegments(g, m); l.frustumCulled = false; l.renderOrder = 4; RSS.add(l); return { l, m, g };
})();
function wrapPoints(N, spread, vs, fs, uniforms) {
  const p = new Float32Array(N * 3), s = new Float32Array(N);
  for (let i = 0; i < N; i++) { p.set([rr(-spread[0], spread[0]), rr(0, spread[1]), rr(-spread[2], spread[2])], i * 3); s[i] = rnd(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 4; RSS.add(pts); return { pts, g, m };
}
const snowP = wrapPoints(9000, [55, 34, 30], `attribute float aS; uniform float uTime; uniform vec3 uC; uniform float uPx;
void main(){ vec3 p = position; float H = 34.0; float y = mod(p.y - uTime * 2.6 * (0.6 + aS * 0.8), H);
vec2 sw = vec2(sin(uTime * 0.8 + aS * 20.0), cos(uTime * 0.6 + aS * 15.0)) * 0.8;
vec2 xz = uC.xz + mod(p.xz + sw - uC.xz + vec2(55.0, 30.0), vec2(110.0, 60.0)) - vec2(55.0, 30.0);
vec4 mv = viewMatrix * vec4(xz.x, y, xz.y, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(uPx * (0.7 + aS * 0.9) * (320.0 / -mv.z), uPx * 5.0); }`,
`uniform float uO; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(0.5, 0.15, d) * uO); }`,
{ uTime: G.uTime, uC: { value: new THREE.Vector3() }, uPx: { value: 1.3 * DPR }, uO: { value: 0.9 } });
const petals = wrapPoints(900, [40, 14, 12], `attribute float aS; uniform float uTime; uniform vec3 uC; uniform float uPx; uniform float uWind; varying float vS; varying float vR;
void main(){ vS = aS; vec3 p = position; float H = 14.0; float y = 0.2 + mod(p.y - uTime * (0.45 + aS * 0.45), H);
float sway = sin(uTime * (0.9 + aS) + aS * 30.0) * 1.1;
vec2 xz = uC.xz + mod(p.xz + vec2(sway - uTime * uWind * (0.6 + aS), cos(uTime * 0.7 + aS * 20.0) * 0.5) - uC.xz + vec2(40.0, 12.0), vec2(80.0, 24.0)) - vec2(40.0, 12.0);
vR = uTime * (1.0 + aS * 3.0) + aS * 10.0;
vec4 mv = viewMatrix * vec4(xz.x, y, xz.y, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(uPx * (3.2 + aS * 2.0) * (60.0 / -mv.z), uPx * 9.0); }`,
`uniform float uO; uniform vec3 uA; uniform vec3 uB; varying float vS; varying float vR;
void main(){ vec2 c = gl_PointCoord - 0.5; float cs = cos(vR), sn = sin(vR); c = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs); c.x *= 1.0 + 0.8 * abs(sin(vR * 0.7));
float d = length(c * vec2(1.0, 1.9)); if (d > 0.5) discard; vec3 col = mix(uA, uB, vS);
gl_FragColor = vec4(col, uO);
#include <encodings_fragment>
}`, { uTime: G.uTime, uC: { value: new THREE.Vector3() }, uPx: { value: DPR }, uO: { value: 0.9 }, uA: { value: new THREE.Color(0xffc4d8) }, uB: { value: new THREE.Color(0xffe2ec) }, uWind: { value: 0.6 } });
petals.target = 1;
function updateParticles(px) {
  rain.m.uniforms.uC.value.set(-6, 0, -(px + 18)); rain.l.visible = envCur.rain > 0.02; rain.g.setDrawRange(0, Math.floor(RN * clamp(envCur.rain, 0, 1)) * 2);
  rain.m.uniforms.uSp.value = 26 + envCur.rain * 14; rain.m.uniforms.uO.value = 0.3 + 0.2 * ENV.night;
  snowP.m.uniforms.uC.value.set(-6, 0, -(px + 18)); snowP.pts.visible = envCur.snow > 0.02; snowP.g.setDrawRange(0, Math.floor(9000 * clamp(envCur.snow, 0, 1)));
  const pn = petals.target * (1 - clamp(envCur.rain * 1.6 + envCur.snow * 2, 0, 1));
  petals.m.uniforms.uC.value.set(-4, 0, -(px + 16)); petals.pts.visible = pn > 0.02; petals.g.setDrawRange(0, Math.floor(900 * pn));
}


/* ================================================================== pedestrians */
const SK = 0xf6cfa6;
function person(o) {
  const root = new THREE.Group(), g = pivot(root, 0, 0, 0);
  const legs = [], arms = [];
  for (const s of [-1, 1]) { const l = pivot(g, s * 0.13, 0.74, 0); l.add(vcPart([[0.21, 0.56, 0.23, 0, -0.28, 0, o.pants], [0.22, 0.16, 0.24, 0, -0.64, 0, o.sock ?? o.pants], [0.24, 0.1, 0.32, 0, -0.73, 0.05, o.shoe ?? 0x3a2a2a]], 0.02)); legs.push(l); }
  const top = [[0.52, 0.62, 0.32, 0, 1.05, 0, o.top]];
  if (o.skirt) top.push([0.6, 0.3, 0.4, 0, 0.72, 0, o.skirt]);
  if (o.extraTop) top.push(...o.extraTop);
  top.push([0.5, 0.5, 0.48, 0, 1.62, 0, SK]);
  top.push([0.06, 0.08, 0.02, -0.11, 1.62, 0.245, 0x2a2020, { ol: 0 }], [0.06, 0.08, 0.02, 0.11, 1.62, 0.245, 0x2a2020, { ol: 0 }]);
  if (o.hair) top.push(...o.hair);
  const bodyP = vcPart(top, 0.022); const torsoPivot = pivot(g, 0, 0.74, 0); bodyP.position.y = -0.74; torsoPivot.add(bodyP);
  for (const s of [-1, 1]) { const a = pivot(torsoPivot, s * 0.34, 0.6, 0); const parts = [[0.16, 0.56, 0.18, 0, -0.26, 0, o.sleeve ?? o.top], [0.14, 0.12, 0.16, 0, -0.58, 0, SK]]; if (s > 0 && o.hand) parts.push(...o.hand); if (s < 0 && o.handL) parts.push(...o.handL); a.add(vcPart(parts, 0.02)); arms.push(a); }
  if (o.back) torsoPivot.add(vcPart(o.back.map((b2) => { const c = b2.slice(); c[4] -= 0.74; return c; }), 0.02));
  root.scale.setScalar(o.scale ?? 1.25);
  return { root, g, torso: torsoPivot, legs, arms, speed: o.speed ?? 1.3, bounce: o.bounce ?? 0, hunch: o.hunch ?? 0, cane: !!o.cane };
}
const PED_TYPES = {
  auntie: () => person({ top: 0xf28ab0, pants: 0x4a4a70, shoe: 0x3a2a2a, extraTop: [[0.08, 0.08, 0.02, -0.12, 1.12, 0.165, 0xffffff, { ol: 0 }], [0.08, 0.08, 0.02, 0.1, 0.95, 0.165, 0xffffff, { ol: 0 }], [0.08, 0.08, 0.02, 0.14, 1.22, 0.165, 0xffffff, { ol: 0 }]], hair: [[0.58, 0.22, 0.56, 0, 1.92, 0, 0x5a2a4a], [0.2, 0.2, 0.2, -0.2, 2.0, 0.1, 0x5a2a4a], [0.2, 0.2, 0.2, 0.18, 2.02, -0.1, 0x5a2a4a], [0.2, 0.2, 0.2, 0.0, 2.06, 0.14, 0x5a2a4a], [0.52, 0.3, 0.12, 0, 1.72, -0.24, 0x5a2a4a]], hand: [[0.34, 0.4, 0.14, 0.06, -0.86, 0.02, 0x3aa06a], [0.05, 0.5, 0.05, 0.1, -0.52, 0.02, 0xf2f2e8, { ol: 0.01 }], [0.1, 0.18, 0.1, 0.1, -0.2, 0.02, 0x5aa050, { ol: 0.01 }]], speed: 1.05 }),
  uncle: () => person({ top: 0x4a5060, pants: 0x3e4452, shoe: 0x1f1f24, extraTop: [[0.14, 0.4, 0.02, 0, 1.12, 0.165, 0xf6f6f2, { ol: 0 }], [0.06, 0.34, 0.02, 0, 1.1, 0.172, 0x2d6fd6, { ol: 0 }], [0.46, 0.22, 0.12, 0, 0.9, 0.18, 0x4a5060]], hair: [[0.08, 0.24, 0.46, -0.26, 1.7, -0.02, 0x3a3030], [0.08, 0.24, 0.46, 0.26, 1.7, -0.02, 0x3a3030], [0.5, 0.2, 0.08, 0, 1.68, -0.25, 0x3a3030], [0.3, 0.05, 0.02, 0, 1.52, 0.245, 0x3a3030, { ol: 0 }]], hand: [[0.12, 0.34, 0.44, 0, -0.84, 0.02, 0x3a2a1a]], speed: 1.35 }),
  grandpa: () => person({ top: 0xc8a878, pants: 0x6a5a4a, shoe: 0x3a2a2a, extraTop: [[0.06, 0.5, 0.02, 0, 1.08, 0.165, 0x8a6a4a, { ol: 0 }]], hair: [[0.08, 0.26, 0.46, -0.26, 1.72, -0.02, 0xf2f2f2], [0.08, 0.26, 0.46, 0.26, 1.72, -0.02, 0xf2f2f2], [0.5, 0.22, 0.08, 0, 1.7, -0.25, 0xf2f2f2], [0.34, 0.06, 0.04, 0, 1.47, 0.25, 0xf2f2f2, { ol: 0 }]], hand: [[0.06, 1.0, 0.06, 0, -1.08, 0.12, 0x5b3e2b, { ol: 0.012 }], [0.2, 0.06, 0.06, 0, -0.6, 0.12, 0x5b3e2b, { ol: 0.012 }]], speed: 0.55, hunch: 0.32, cane: true }),
  schoolgirl: () => person({ top: 0xf6f6f2, sleeve: 0xf6f6f2, pants: SK, sock: 0x27397a, shoe: 0x4a2a1a, skirt: 0x27397a, extraTop: [[0.54, 0.16, 0.34, 0, 1.3, 0, 0x27397a], [0.16, 0.2, 0.02, 0, 1.2, 0.17, 0xd8202d, { ol: 0 }]], hair: [[0.56, 0.2, 0.54, 0, 1.9, 0, 0x1e1a1e], [0.54, 0.7, 0.12, 0, 1.52, -0.27, 0x1e1a1e], [0.1, 0.46, 0.5, -0.27, 1.66, -0.02, 0x1e1a1e], [0.1, 0.46, 0.5, 0.27, 1.66, -0.02, 0x1e1a1e], [0.5, 0.12, 0.08, 0, 1.8, 0.25, 0x1e1a1e]], hand: [[0.1, 0.4, 0.46, 0, -0.82, 0.02, 0x27397a]], speed: 1.4 }),
  schoolboy: () => person({ top: 0x1f2230, pants: 0x1f2230, shoe: 0x1f1f24, extraTop: [[0.06, 0.06, 0.02, 0, 1.25, 0.165, 0xe8c04a, { ol: 0 }], [0.06, 0.06, 0.02, 0, 1.08, 0.165, 0xe8c04a, { ol: 0 }], [0.06, 0.06, 0.02, 0, 0.91, 0.165, 0xe8c04a, { ol: 0 }]], hair: [[0.56, 0.22, 0.54, 0, 1.9, 0, 0x1e1a1e], [0.5, 0.14, 0.08, 0, 1.8, 0.25, 0x1e1a1e], [0.54, 0.34, 0.1, 0, 1.68, -0.25, 0x1e1a1e]], back: [[0.12, 0.8, 0.06, 0.2, 1.1, 0.17, 0x6a5a4a, { rz: 0.7, ol: 0 }], [0.14, 0.42, 0.5, 0.32, 0.82, -0.1, 0x6a5a4a]], speed: 1.45 }),
  kid: () => person({ top: 0xf6f6f2, pants: 0x27397a, sock: 0xf6f6f2, shoe: 0xd8202d, hair: [[0.6, 0.16, 0.6, 0, 1.92, 0, 0xffd400], [0.66, 0.05, 0.7, 0, 1.87, 0.06, 0xffd400], [0.5, 0.1, 0.1, 0, 1.78, -0.25, 0x2a2020]], back: [[0.52, 0.56, 0.34, 0, 1.1, -0.34, 0xd8202d], [0.5, 0.12, 0.36, 0, 1.36, -0.35, 0xb81a26]], scale: 0.95, speed: 1.6, bounce: 0.06 }),
};
const COUPLE = () => {
  const guy = person({ top: 0xf6f6f2, pants: 0x3a5a9a, shoe: 0xf2f2f2, hair: [[0.56, 0.24, 0.54, 0, 1.9, 0, 0x6a4a3a], [0.5, 0.14, 0.08, 0, 1.8, 0.25, 0x6a4a3a], [0.54, 0.34, 0.1, 0, 1.68, -0.25, 0x6a4a3a]], hand: [[0.2, 0.3, 0.04, 0, -0.66, 0.1, 0x222228]] });
  const girl = person({ top: 0xffd24a, sleeve: 0xffd24a, pants: SK, shoe: 0xf28ab0, skirt: 0xffd24a, hair: [[0.56, 0.2, 0.54, 0, 1.9, 0, 0x7a4a2a], [0.54, 0.5, 0.12, 0, 1.6, -0.27, 0x7a4a2a], [0.1, 0.4, 0.5, -0.27, 1.68, -0.02, 0x7a4a2a], [0.1, 0.4, 0.5, 0.27, 1.68, -0.02, 0x7a4a2a], [0.2, 0.2, 0.2, 0.24, 1.98, -0.1, 0xff8fb3]], hand: [[0.05, 0.16, 0.05, -0.03, -0.72, 0, SK, { ol: 0.01 }], [0.05, 0.16, 0.05, 0.04, -0.72, 0, SK, { ol: 0.01 }]] });
  return { guy, girl };
};
const peds = [], pedPool = {};
function getPed(type) { const pool = pedPool[type] || (pedPool[type] = []); const p = pool.pop() || Object.assign(PED_TYPES[type](), { type }); scene.add(p.root); p.root.visible = true; return p; }
function freePed(p) { scene.remove(p.root); (pedPool[p.type] || (pedPool[p.type] = [])).push(p); }
const couples = [];
const flashMat = new THREE.SpriteMaterial({ map: haloTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
function spawnCouple(x) {
  const c = COUPLE(), g = new THREE.Group(); g.position.set(x, 0.2, -8.2); scene.add(g);
  c.guy.root.position.set(-1.4, 0, 0.2); c.guy.root.rotation.y = PI / 2 + 0.3; g.add(c.guy.root);
  c.girl.root.position.set(1.0, 0, -0.1); c.girl.root.rotation.y = -PI / 2 + 0.5; g.add(c.girl.root);
  c.guy.arms[1].rotation.x = -1.5; c.guy.arms[0].rotation.x = -1.3; c.guy.arms[0].rotation.z = -0.35;
  c.girl.arms[1].rotation.x = -2.5; c.girl.arms[1].rotation.z = 0.3;
  const fl = new THREE.Sprite(flashMat.clone()); fl.position.set(-0.6, 2.2, 0.4); fl.scale.setScalar(2.4); g.add(fl);
  const spot = lmSpot(x, -7.6, 3, 0xffffff, () => c.flashV || 0);
  couples.push({ g, c, fl, spot, x, t: rr(0, 3) });
}
let nextCouple = 140;
function addPed(x) { const p = getPed(pick(Object.keys(PED_TYPES))); const dir = rnd() < 0.55 ? -1 : 1; p.dir = dir; p.root.position.set(x, 0.2, pick([-6.9, -7.5, -8.1])); p.root.rotation.y = dir > 0 ? PI / 2 : -PI / 2; p.ph = rr(0, 6); peds.push(p); }
function updatePeds(dt, px, active) {
  let near = 0; for (const p of peds) if (p.root.position.x > px - 10 && p.root.position.x < px + 90) near++;
  if (peds.length === 0) for (let i = 0; i < 8; i++) addPed(px + rr(-4, 80));
  else if (near < 9 && peds.length < 16) addPed(px + rr(50, 95));
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i];
    p.root.position.x += p.dir * p.speed * dt; p.ph += p.speed * dt * 5.2;
    const s = Math.sin(p.ph);
    p.legs[0].rotation.x = s * 0.55; p.legs[1].rotation.x = -s * 0.55;
    p.arms[0].rotation.x = -s * 0.45; p.arms[1].rotation.x = p.cane ? -0.25 + s * 0.15 : s * 0.45;
    p.torso.rotation.x = p.hunch; p.g.position.y = Math.abs(Math.cos(p.ph)) * (0.03 + p.bounce);
    if (p.root.position.x < px - 30 || p.root.position.x > px + 130) { freePed(p); peds.splice(i, 1); }
  }
  if (active && px + 80 > nextCouple) { spawnCouple(nextCouple); nextCouple += rr(160, 260); }
  for (let i = couples.length - 1; i >= 0; i--) {
    const c = couples[i]; c.t += dt;
    const ph = c.t % 3.2; c.c.flashV = ph < 0.12 ? 1 : 0; c.fl.material.opacity = c.c.flashV * 0.9;
    c.c.girl.root.position.y = Math.abs(Math.sin(c.t * 2)) * 0.03;
    if (c.x < px - 30) { scene.remove(c.g); dropSpot(c.spot); couples.splice(i, 1); }
  }
}
function resetPeds(px) { for (const p of peds) freePed(p); peds.length = 0; for (const c of couples) { scene.remove(c.g); dropSpot(c.spot); } couples.length = 0; nextCouple = px + 70; }
/* ================= 桥接：每帧世界更新（抄自其 frame() 的世界部分） ================= */
let flashT = 3 + Math.random() * 5;
function bridgeUpdate(dt, px) {
  clock += dt; G.uTime.value = clock;
  if (ENV.w === 'heavy' && envCur.rain > .75) {
    flashT -= dt;
    if (flashT <= 0) { G.uFlash.value = 1; flashT = 3.5 + Math.random() * 7; GG.audio.thunder(.3 + Math.random()); }
  }
  G.uFlash.value = Math.max(0, G.uFlash.value - dt * 4.2);
  GG.ui.flash(G.uFlash.value * .5);
  updateEnv(dt);
  streamChunks(px);
  for (const ch of chunks.values()) {
    for (const f of ch.dyn) f(dt);
    for (const s of ch.steamS) { const ph = (clock * 0.6 + s.position.x) % 1; s.material.opacity = 0.35 * (1 - ph); s.scale.setScalar(0.8 + ph * 1.6); }
  }
  updateTraffic(dt, px);
  updatePeds(dt, px, true);
  const cwx = camera.position.x, cwz = camera.position.z;
  sky.position.set(-cwz, 0, cwx); skyline.position.x = px; groundPlane.position.x = px;
  const L = dirL.userData.dir || new THREE.Vector3(0.3, 1, 0.4);
  dirL.position.set(px + 10 + L.x * 80, L.y * 80, -4 + L.z * 80);
  dirL.target.position.set(px + 10, 0, -4);
  updateParticles(px);
  const sphase = clock % 20;
  SIG.g.color.setHex(sphase < 10 ? 0x19f0c0 : 0x10302b);
  SIG.y.color.setHex(sphase >= 10 && sphase < 12 ? 0xffc21a : 0x3a3014);
  SIG.r.color.setHex(sphase >= 12 ? 0xff3232 : 0x3a1414);
  SIG.g2.color.setHex(sphase >= 12 && sphase < 18 ? 0x19f0c0 : 0x10302b);
  SIG.r2.color.setHex(sphase >= 12 && sphase < 18 ? 0x3a1414 : 0xff3232);
  const hOp = (0.12 + 0.4 * ENV.night) * (1 + envCur.rain * 0.5);
  for (const k in haloMats) haloMats[k].opacity = k.startsWith('item') ? 0.7 : k === 'lamp' ? hOp * ENV.lamps : hOp;
  for (const s of lmSpots) { const v = s.get(); s.mesh.material.opacity = clamp(v * 0.5, 0, 1); }
  lmCam.position.set(px + 18, -4, 5); lmCam.updateMatrixWorld();
  LMU.uLMC.value.set(px + 18, -4);
  renderer.setRenderTarget(lmRT); renderer.clear(); renderer.render(lmScene, lmCam); renderer.setRenderTarget(null);
  LMU.uCam.value.set(-cwz, 0, cwx);
}
GG.W = {
  root: worldRoot, ENV, envCur, SEASONS, applySeason, update: bridgeUpdate, G,
  setWeather(w) { ENV.w = w; }, setHour(h) { ENV.h = h; }, setImul(v) { ENV.imul = v; },
  init(h, w, season) { ENV.h = h; ENV.w = w; envCur.h = h; updateEnv(0, true); applySeason(season); streamChunks(0); },
};
})();
