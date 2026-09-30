/* Articulated whale maid: planted-foot walking, heel/toe roll and secondary motion. */
(() => {
'use strict';
const T = THREE, G = window.G, E = G.env;
const damp = G.damp, clamp = G.clamp, TAU = Math.PI * 2;
const smooth = t => t * t * (3 - 2 * t);
function solveLeg(leg, phase, blend, stride, bob) {
  const stance = .62;
  let z, lift = 0, pitch = 0;
  if (phase < stance) {
    const t = phase / stance;
    z = -stride + 2 * stride * t;
    // Heel settles first; the heel rises again just before the next swing.
    pitch = .10 * (1 - smooth(clamp(t / .2, 0, 1))) -
      .20 * smooth(clamp((t - .8) / .2, 0, 1));
  } else {
    const t = (phase - stance) / (1 - stance);
    z = stride * (1 - 2 * smooth(t));
    lift = .085 * Math.pow(Math.sin(Math.PI * t), 1.35);
    pitch = -.16 * (1 - t) + .18 * Math.sin(Math.PI * t);
  }
  const hipY = .607 - .051 * blend + bob;
  leg.hip.position.y = hipY;
  const ankleY = .109 + blend * (lift + Math.abs(pitch) * .07);
  const dy = ankleY - hipY, dz = z * blend;
  const thigh = .25, shin = .25;
  const distance = clamp(Math.hypot(dy, dz), .06, thigh + shin - .001);
  const direction = Math.atan2(-dz, -dy);
  const bend = Math.acos(clamp((thigh * thigh + distance * distance - shin * shin) / (2 * thigh * distance), -1, 1));
  const knee = Math.acos(clamp((distance * distance - thigh * thigh - shin * shin) / (2 * thigh * shin), -1, 1));
  leg.hip.rotation.x = direction + bend;
  leg.knee.rotation.x = -knee;
  leg.ankle.rotation.x = pitch * blend - leg.hip.rotation.x - leg.knee.rotation.x;
  leg.hip.rotation.z = leg.side * .012 * blend;
}
G.actors = {
  player: null,
  init() { this.player = G.createWhaleMaid(); },
  update(dt) {
    const P = this.player;
    const moving = G.game.state === 'play' && P.speed > .04;
    P.walkBlend = damp(P.walkBlend || 0, moving ? 1 : 0, 5, dt);
    const blend = P.walkBlend;
    const stride = .16 + .035 * clamp(P.speed / 1.6, 0, 1);
    // During stance the local foot travels backwards at the player's world speed.
    // This keeps contact in place instead of sliding a sinusoidal leg through the floor.
    if (moving) P.ph += P.speed * .62 / (2 * stride) * TAU * dt;
    const cycle = ((P.ph / TAU) % 1 + 1) % 1;
    const phase = P.ph, ambient = E.simT;
    const weight = Math.sin(phase);
    const bob = .007 * Math.cos(phase * 2) * blend;
    solveLeg(P.legs[0], cycle, blend, stride, bob);
    solveLeg(P.legs[1], (cycle + .5) % 1, blend, stride, bob);
    P.hipsG.position.x = weight * .007 * blend;
    P.spine.position.y = .005 * Math.cos(phase * 2) * blend + Math.sin(ambient * 1.9) * .003 * (1 - blend);
    P.spine.rotation.z = -weight * .015 * blend;
    P.spine.rotation.y = Math.cos(phase) * .022 * blend;
    P.spine.rotation.x = .025 * blend;
    P.spine.scale.y = 1 + Math.sin(ambient * 1.9) * .002 * (1 - blend);
    P.castT = Math.max(0, (P.castT || 0) - dt);
    const casting = Math.sin(Math.PI * (1 - P.castT / .7)) * Number(P.castT > 0);
    const guarding = G.quest?.active && G.quest.run.fighting && G.quest.run.stance === 'guard';
    for (let i = 0; i < 2; i++) {
      const arm = P.arms[i], swing = Math.cos(phase + (i ? Math.PI : 0));
      arm.shoulder.rotation.x = -swing * .23 * blend + Math.sin(ambient * 1.4 + i) * .012 * (1 - blend);
      arm.shoulder.rotation.z = arm.baseZ + Math.cos(phase * 2 + i) * .012 * blend;
      arm.elbow.rotation.x = .13 + Math.max(0, -swing) * .09 * blend;
      arm.elbow.rotation.y = arm.baseZ * .15;
      if (guarding) { arm.shoulder.rotation.x += .22 * (1 - blend); arm.elbow.rotation.x -= .35 * (1 - blend); }
      if (P.castKind === 'guard') { arm.shoulder.rotation.x += casting * 1.1; arm.elbow.rotation.x -= casting * 1.15; }
      else { arm.shoulder.rotation.x += casting * (P.castKind === 'surge' || i === 1 ? 1.35 : .18); }
    }
    P.spine.rotation.x += casting * .07;
    P.headG.rotation.x = -.014 * blend + Math.sin(phase * 2 - .5) * .012 * blend;
    P.headG.rotation.z = weight * .01 * blend;
    P.headG.rotation.y = -Math.cos(phase) * .02 * blend + Math.sin(ambient * .55) * .018 * (1 - blend);
    P.skirt.rotation.z = Math.sin(phase - .55) * .015 * blend;
    P.skirt.rotation.y = -Math.cos(phase - .35) * .012 * blend;
    P.skirt.scale.x = 1 + Math.cos(phase * 2 - .7) * .004 * blend;
    for (const lock of P.hairLocks) {
      const lag = .55 + lock.phase * .05;
      lock.root.rotation.x = Math.sin(phase * 2 - lag) * .018 * blend +
        Math.sin(ambient * 1.25 + lock.phase) * .006;
      lock.root.rotation.z = Math.sin(phase - lag) * .022 * blend +
        Math.sin(ambient * .8 + lock.phase) * .005;
    }
    P.tail.rotation.y = Math.sin(phase - 1.0) * .12 * blend + Math.sin(ambient * 1.1) * .025;
    P.tail.rotation.z = Math.sin(phase * 2 - .8) * .025 * blend;
    P.backBow.rotation.z = Math.sin(phase - .75) * .024 * blend;
    P.ahoge.rotation.z = Math.sin(phase * 2 - .7) * .026 * blend + Math.sin(ambient * 1.5) * .015;
    P.root.position.set(P.x, 0, P.z);
    P.root.rotation.set(0, 0, 0);
    P.spot.intensity = E.p.night * 1.1;
  },
};
})();
