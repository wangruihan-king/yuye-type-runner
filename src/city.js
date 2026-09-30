/* city.js — 材质 / 描边工具包（城区场景已整体采用《逃离遗忘》世界系统：lib/refworld.js） */
(() => {
'use strict';
const T = THREE, G = window.G;
const clamp = G.clamp;

/* 卡通渐变（角色用） */
const gradMap = new T.DataTexture(new Uint8Array([82, 124, 166, 202, 230, 255]), 6, 1, T.RedFormat);
gradMap.minFilter = gradMap.magFilter = T.NearestFilter; gradMap.needsUpdate = true;
const toon = (hex, o = {}) => new T.MeshToonMaterial(Object.assign({ color: hex, gradientMap: gradMap }, o));
const basic = (hex, o = {}) => new T.MeshBasicMaterial(Object.assign({ color: hex }, o));

/* 描边：反壳外推；颜色 = 填充色同族加深加饱和；雾用指数公式与世界一致 */
const OF = { uFogColor: { value: new T.Color() }, uFogD: { value: 0.008 } };
const _hsl = {};
function darkOf(c) {
  c.getHSL(_hsl);
  return new T.Color().setHSL(_hsl.h, Math.min(1, _hsl.s * 1.1 + .12), Math.max(.06, _hsl.l * .4));
}
const outlineMats = new Map();
function outlineMatC(color, thick) {
  const k = color.getHexString() + '|' + thick.toFixed(3);
  if (outlineMats.has(k)) return outlineMats.get(k);
  const m = new T.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uThick: { value: thick }, uFogColor: OF.uFogColor, uFogD: OF.uFogD },
    vertexShader: `uniform float uThick; varying float vF;
      void main(){ vec3 p=position+normal*uThick; vec4 mv=modelViewMatrix*vec4(p,1.0); vF=-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor,uFogColor; uniform float uFogD; varying float vF;
      void main(){ float ff = 1.0 - exp(-uFogD*uFogD*vF*vF); gl_FragColor=vec4(mix(uColor,uFogColor,ff),1.0); }`,
    side: T.BackSide,
  });
  outlineMats.set(k, m); return m;
}
function addOutlines(root) {
  root.traverse(o => {
    if (!o.isMesh || o.userData.noOutline || o.userData.isOutline) return;
    const mat = o.material;
    if (mat.transparent || !mat.color) return;
    o.geometry.computeBoundingSphere();
    const r = o.geometry.boundingSphere.radius;
    if (r < .12) return;
    const w = clamp(r * .011, .01, .045);
    const ocCol = (mat.userData && mat.userData.oc) ? new T.Color(mat.userData.oc) : darkOf(mat.color);
    const m = new T.Mesh(o.geometry, outlineMatC(ocCol, w));
    m.userData.isOutline = true; m.castShadow = m.receiveShadow = false; m.renderOrder = 1;
    o.add(m);
  });
}

G.cityToon = toon; G.cityBasic = basic; G.addOutlines = addOutlines;
G.city = {
  tick() {
    OF.uFogColor.value.copy(G.scene.fog.color);
    OF.uFogD.value = G.scene.fog.density;
  },
};
})();
