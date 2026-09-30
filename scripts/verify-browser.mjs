import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const artifacts = resolve(root, '.test-artifacts');
await mkdir(artifacts, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mp3': 'audio/mpeg', '.png': 'image/png' };
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (_) { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--remote-debugging-port=0',
  '--user-data-dir=' + resolve(artifacts, 'chrome-profile-' + Date.now()), 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket, debuggerUrl;
const pending = new Map(); let id = 0;
function call(method, params = {}) {
  return new Promise((resolveCall, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(new Error('CDP timeout: ' + method)); }, 45000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolveCall(v); }, reject });
    socket.send(JSON.stringify({ id: n, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
  return result.result.value;
}
async function screenshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(artifacts, name + '.png'), Buffer.from(result.data, 'base64'));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Package browser-rendered animation frames as APNG, without an image dependency.
function animatedPNG(frames) {
  function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
    for (const b of body) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const header = Buffer.alloc(4), tail = Buffer.alloc(4); header.writeUInt32BE(data.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, body, tail]);
  }
  const parsed = frames.map(png => {
    const result = []; for(let at=8;at<png.length;) {
      const size=png.readUInt32BE(at); result.push({type:png.toString('ascii',at+4,at+8),data:png.subarray(at+8,at+8+size)}); at+=size+12;
    } return result;
  });
  const ihdr=parsed[0].find(c=>c.type==='IHDR').data;
  const control=Buffer.alloc(8); control.writeUInt32BE(frames.length);
  const out=[frames[0].subarray(0,8),chunk('IHDR',ihdr),chunk('acTL',control)];
  let seq=0;
  parsed.forEach((parts,i)=> {
    const fc=Buffer.alloc(26); fc.writeUInt32BE(seq++); ihdr.copy(fc,4,0,8);
    fc.writeUInt16BE(22,20); fc.writeUInt16BE(1000,22); out.push(chunk('fcTL',fc));
    const data=Buffer.concat(parts.filter(c=>c.type==='IDAT').map(c=>c.data));
    if(i===0) out.push(chunk('IDAT',data));
    else { const n=Buffer.alloc(4); n.writeUInt32BE(seq++); out.push(chunk('fdAT',Buffer.concat([n,data]))); }
  });
  out.push(chunk('IEND',Buffer.alloc(0))); return Buffer.concat(out);
}
try {
  const browserPort = await new Promise((resolvePort, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not start')), 25000);
    chrome.on('error', reject);
    chrome.stderr.on('data', data => {
      log += data;
      const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); debuggerUrl = match[1]; resolvePort(new URL(debuggerUrl).port); }
    });
  });
  const pages = await (await fetch('http://127.0.0.1:' + browserPort + '/json/list')).json();
  const page = pages.find(p => p.type === 'page' && p.url === 'about:blank') || pages.find(p => p.type === 'page');
  assert.ok(page, 'Chrome page target exists');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, reject) => { socket.onopen = r; socket.onerror = reject; });
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    }
  };
  await call('Page.enable');
  console.log('Chrome connected');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: 'http://127.0.0.1:' + port + '/index.html' });
  for (let n = 0; n < 30; n++) { if (await evaluate('!!window.__G')) break; await sleep(500); }
  if (!await evaluate('!!window.__G')) {
    console.log('Startup diagnostic:', await evaluate(`({ url: location.href, ready: document.readyState, error: document.querySelector('#err')?.textContent, G: Object.keys(window.G || {}), body: document.body?.innerText.slice(0, 300) })`));
    await screenshot('startup-error');
  }
  assert.equal(await evaluate('!!window.__G'), true, 'Game initializes');
  await sleep(1200);
  assert.equal(await evaluate('document.querySelector("#err").textContent'), '', 'No initialization/render errors');
  await screenshot('menu-desktop');
  if (process.argv.includes('--quest')) {
    await evaluate(`(() => {
      G.cfg.mode='quest'; G.cfg.diff='mid'; __G.start(); G.game.countdown=-1;
      for(let n=0;n<12;n++) {
        if(!G.typing.locked) G.typing.update(3);
        const t=G.typing.locked;
        if(t?.stage!=='discover') break;
        for(const ch of t.w) G.typing.key(ch);
      }
    })()`);
    assert.equal(await evaluate('G.quest.run.phase'), 'fight', 'Prepared words become an actual encounter');
    assert.equal(await evaluate('G.learning.session.selected.length'), 6);
    assert.equal(await evaluate('!!G.scene.getObjectByName("shadow-enemy")'), true, 'Enemy is present in the 3D street');
    await sleep(300); await screenshot('quest-battle-desktop');
    await call('Input.dispatchKeyEvent', { type:'keyDown', key:'F2' });
    assert.equal(await evaluate('G.quest.run.stance'), 'guard', 'Keyboard selects guard stance');
    await evaluate(`for(const ch of G.typing.locked.w) G.typing.key(ch);`);
    assert.equal(await evaluate('G.quest.run.shield'), 16, 'Spelling creates a real shield');
    await evaluate(`G.typing.update(2); G.quest.run.clock=.15; G.quest.update(.16);`);
    await screenshot('quest-projectile');
    await evaluate('G.quest.update(.7)');
    assert.equal(await evaluate('G.quest.run.hp'), 98, 'Visible shadow projectile deals damage after shield absorption');
    await call('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape' });
    const battlePause = await evaluate('G.quest.run.remaining'); await sleep(400);
    assert.equal(await evaluate('G.quest.run.remaining'), battlePause, 'Pause also freezes battle pressure');
    await evaluate(`document.querySelector('#btnResume').click(); for(const ch of G.typing.locked.w) G.typing.key(ch);`);
    const energyBefore = await evaluate('G.quest.run.energy');
    await call('Input.dispatchKeyEvent', { type:'keyDown', key:'F3' });
    assert.equal(await evaluate('G.quest.run.energy'), energyBefore-60, 'Whale wave consumes earned energy');
    assert.equal(await evaluate('G.quest.run.enemyHp'), 2, 'Whale wave damages the world enemy');
    const savedEnergy = await evaluate('G.quest.run.energy');
    await call('Input.dispatchKeyEvent', { type:'keyDown', key:'F3' });
    assert.equal(await evaluate('G.quest.run.energy'), savedEnergy, 'Skill cannot be spammed');
    await evaluate(`G.quest.stance('strike');`);
    const boss = await evaluate(`(() => {
      let n=0, testedMeaning=false;
      while(G.quest.run.wave<2 && n++<60) {
        if(G.quest.run.phase==='transit') G.quest.update(3);
        if(!G.typing.locked) G.typing.update(3);
        const t=G.typing.locked; if(!t) continue;
        if(G.quest.run.wave===2) break;
        if(t.kind==='meaning') {
          const index=t.options.findIndex(o=>testedMeaning ? o.w===t.w : o.w!==t.w);
          G.typing.choose(index); testedMeaning=true;
        } else for(const ch of t.w) G.typing.key(ch);
      }
      return {wave:G.quest.run.wave, armour:G.quest.run.armour, wrong:G.quest.run.wrong.size, testedMeaning};
    })()`);
    assert.equal(boss.wave, 2, 'Final boss reached');
    assert.equal(boss.testedMeaning, true, 'Battle includes meaning recognition');
    assert.ok(boss.armour>0, 'Player mistake becomes boss armour');
    await sleep(150); await screenshot('quest-boss-desktop');
    await call('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:1,mobile:true });
    await sleep(1200); await screenshot('quest-boss-mobile');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'Battle layout fits mobile');
    const arena = await evaluate(`(() => {
      const p=G.actors.player, enemy=G.scene.getObjectByName('shadow-enemy');
      const project=v=> { v.project(G.camera); return {x:(v.x*.5+.5)*innerWidth, y:(.5-v.y*.5)*innerHeight}; };
      return {player:project(new THREE.Vector3(p.x,1,p.z)), enemy:project(enemy.position.clone()),
        top:document.querySelector('#battleHud').getBoundingClientRect().bottom,
        bottom:document.querySelector('#station').getBoundingClientRect().top};
    })()`);
    for(const actor of [arena.player, arena.enemy]) {
      assert.ok(actor.x>45 && actor.x<345, 'Both combatants remain inside the mobile view');
      assert.ok(actor.y>arena.top && actor.y<arena.bottom, 'Combat stays between the mobile controls');
    }
    await call('Emulation.setDeviceMetricsOverride', { width:1440,height:900,deviceScaleFactor:1,mobile:false });
    const victory = await evaluate(`(() => {
      let n=0;
      while(G.game.state==='play' && n++<70) {
        if(G.quest.run.phase==='transit') G.quest.update(3);
        if(!G.typing.locked) G.typing.update(3);
        const t=G.typing.locked; if(!t) continue;
        if(t.kind==='meaning') G.typing.choose(t.options.findIndex(o=>o.w===t.w));
        else for(const ch of t.w) G.typing.key(ch);
      }
      return {phase:G.quest.run.phase,cleared:G.quest.run.cleared,remembered:G.quest.run.remembered.size,unique:G.learning.session.completed,
        saved:JSON.parse(localStorage.getItem('tr-quest-v1')).wins,state:G.game.state,stars:G.quest.run.stars};
    })()`);
    assert.equal(victory.phase,'won'); assert.equal(victory.cleared,3); assert.equal(victory.remembered,6);
    assert.equal(victory.unique,6,'Repeated combat never inflates unique vocabulary progress');
    assert.equal(victory.state,'over'); assert.ok(victory.saved>0);
    await screenshot('quest-victory');
    await evaluate(`(() => {
      __G.start(); G.game.countdown=-1;
      for(let n=0;n<12;n++) {if(!G.typing.locked) G.typing.update(3); const t=G.typing.locked;if(t?.stage!=='discover')break;for(const ch of t.w)G.typing.key(ch);}
      G.quest.run.hp=1; G.quest.run.shield=0; G.quest.run.hit(18); G.quest.update(.01);
    })()`);
    assert.equal(await evaluate('G.game.state'),'over','Lamp depletion actually ends the run');
    assert.equal(await evaluate('G.quest.run.phase'),'lost');
    assert.equal(await evaluate('G.learning.session.finished'),false,'Defeat is not presented as completed learning');
    await screenshot('quest-defeat');
    console.log('Campaign browser checks passed:',victory);
    await evaluate('__G.menu()');
  }
  if (process.argv.includes('--character')) {
    const characterInfo = await evaluate(`(() => {
      const player = G.actors.player;
      const model = player.root;
      let triangles = 0, meshes = 0;
      model.traverse(o => { if(o.isMesh) { meshes++; triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3; } });
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#e7eae9');
      scene.add(new THREE.HemisphereLight('#ffffff', '#91a0b4', .95));
      const light = new THREE.DirectionalLight('#fff4e4', 1.15); light.position.set(-3, 5, -4); scene.add(light);
      light.castShadow = true; light.shadow.mapSize.set(2048,2048);
      Object.assign(light.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 }); light.shadow.bias = -.0002;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(20,20), new THREE.MeshStandardMaterial({color:'#e7eae9',roughness:1}));
      floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
      const clones=[];
      for(const [x,yaw] of [[1.45,0],[0,Math.PI/2],[-1.45,Math.PI]]) {
        const clone = model.clone(true); clone.position.set(x,0,0); clone.rotation.set(0,yaw,0); scene.add(clone);
        clones.push(clone);
      }
      const renderer = new THREE.WebGLRenderer({antialias:true}); renderer.setSize(1440,900);
      renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const camera = new THREE.PerspectiveCamera(26,1440/900,.01,100);
      camera.position.set(0,1.18,-7.2); camera.lookAt(0,1.04,0);
      const canvas = renderer.domElement; canvas.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:9999'; document.body.appendChild(canvas);
      renderer.render(scene,camera); window.characterStudio = {canvas,renderer,scene,camera,clones};
      return {name:model.userData.character.name,meshes,triangles,features:model.userData.character.features};
    })()`);
    await screenshot('character-turnaround');
    console.log('Character:', characterInfo);
    assert.ok(characterInfo.features.includes('whale-tail'));
    await call('Emulation.setDeviceMetricsOverride', { width: 540, height: 640, deviceScaleFactor: 1, mobile: false });
    await evaluate(`(() => {
      const s=characterStudio; s.clones.forEach(c=>s.scene.remove(c));
      s.walk=G.actors.player.root.clone(true); s.scene.add(s.walk);
      s.originalNodes=[]; s.walkNodes=[]; G.actors.player.root.traverse(n=>s.originalNodes.push(n)); s.walk.traverse(n=>s.walkNodes.push(n));
      s.renderer.setSize(540,640); s.camera.aspect=540/640; s.camera.fov=32;
      s.camera.position.set(2.8,1.24,-3.5); s.camera.lookAt(.10,1.03,0); s.camera.updateProjectionMatrix();
    })()`);
    const frames=[];
    for(let frame=0;frame<32;frame++) {
      await evaluate(`(() => {
        const p=G.actors.player, s=characterStudio; G.game.state='play'; p.speed=1.1; p.walkBlend=1; p.ph=${frame}/32*Math.PI*2;
        G.actors.update(0);
        s.walkNodes.forEach((n,i)=>{const original=s.originalNodes[i]; n.position.copy(original.position); n.quaternion.copy(original.quaternion); n.scale.copy(original.scale);});
        s.walk.position.set(0,0,0); s.walk.rotation.set(0,0,0); s.renderer.render(s.scene,s.camera);
      })()`);
      const shot=await call('Page.captureScreenshot',{format:'png'}); frames.push(Buffer.from(shot.data,'base64'));
    }
    await writeFile(resolve(artifacts,'character-walk.png'),animatedPNG(frames));
    await writeFile(resolve(artifacts,'character-walk-frame.png'),frames[6]);
    await evaluate(`characterStudio.canvas.remove(); characterStudio.renderer.dispose(); delete window.characterStudio;`);
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const gait = await evaluate(`(() => {
      const p=G.actors.player; G.game.state='play'; p.speed=1.1; p.walkBlend=1;
      const result=[]; const v=new THREE.Vector3();
      for(let i=0;i<8;i++) { p.ph=i/8*Math.PI*2; G.actors.update(0); p.root.updateMatrixWorld(true);
        result.push(p.legs.map(l=> { l.ankle.getWorldPosition(v); return {y:+v.y.toFixed(3),z:+v.z.toFixed(3)}; }));
      }
      __G.menu(); return result;
    })()`);
    assert.ok(gait.flat().every(p=>p.y>.095),'Feet remain above the ground');
    assert.ok(gait.flat().some(p=>p.y>.17),'Swing foot lifts');
    console.log('Gait ankle positions:', gait);
  }
  const definitions = await evaluate(`({ count: G.words.LIST.length, unique: new Set(G.words.LIST.map(e=>e.w)).size, letters: [...new Set(G.words.LIST.map(e=>e.w[0]))].sort().join('') })`);
  assert.equal(definitions.count, definitions.unique, 'Unique dictionary entries');
  console.log('Dictionary:', definitions);
  await evaluate(`G.cfg.mode = 'hear'; __G.start(); G.game.countdown = -1; G.typing.update(1);`);
  const first = await evaluate('G.typing.locked.w');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: first[0] === 'z' ? 'x' : 'z' });
  assert.equal(await evaluate('G.typing.locked.typed'), 0, 'Wrong first letter stays untyped');
  assert.equal(await evaluate('G.typing.stats.errs'), 1, 'Wrong first letter counts as error');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: first[0] });
  assert.equal(await evaluate('G.typing.locked.typed'), 1, 'Correct first letter updates immediately');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace' });
  assert.equal(await evaluate('G.typing.locked.typed'), 0, 'Backspace restores blank tile');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
  assert.equal(await evaluate('G.game.state'), 'pause', 'Escape pauses');
  const beforePause = await evaluate('G.typing.locked.remaining');
  await sleep(500);
  assert.equal(await evaluate('G.typing.locked.remaining'), beforePause, 'Pause freezes countdown');
  await screenshot('pause-desktop');
  await evaluate('document.querySelector("#btnResume").click()');
  await evaluate(`G.cfg.mode = 'learn'; __G.start(); G.game.countdown = -1; G.typing.update(1);`);
  assert.equal(await evaluate('G.typing.locked.stage'), 'discover', 'New words start with exposure');
  await sleep(1200);
  assert.equal(await evaluate('G.actors.player.z < G.game.zStart'), true, 'Player moves through the city');
  await screenshot('play-desktop');
  await evaluate(`window.testTarget = G.typing.locked.w; G.typing.hint(); for (const ch of G.typing.locked.w) G.typing.key(ch);`);
  assert.equal(await evaluate('G.learning.session.completed'), 0, 'Exposure is not retrieval');
  const fullRun = await evaluate(`(() => {
    let count = 0, challenged = false;
    while (!G.learning.session.finished && count++ < 100) {
      if (!G.typing.locked) G.typing.update(4);
      const t = G.typing.locked;
      if (!t) continue;
      if (t.stage === 'recall' && !challenged) { G.typing.hint(); challenged = true; }
      for (const ch of t.w) G.typing.key(ch);
    }
    return { count, completed: G.learning.session.completed, finished: G.learning.session.finished,
      remembered: [...G.learning.session.results.values()].filter(r=>r.status==='remembered').length,
      recovered: G.learning.session.recovered.size, state: G.game.state, saved: !!localStorage.getItem('tr-memory-v1') };
  })()`);
  assert.equal(fullRun.finished, true, 'Walk terminates');
  assert.equal(fullRun.completed, 10, 'All ten unique words resolved');
  assert.equal(fullRun.remembered, 10, 'All words retrieved');
  assert.equal(fullRun.recovered >= 1, true, 'Hinted word returns and can be recovered');
  assert.equal(fullRun.saved, true, 'Memory saved');
  assert.equal(fullRun.state, 'over', 'Automatic summary');
  await screenshot('summary-desktop');
  console.log('Full journey:', fullRun);
  await evaluate(`G.cfg.mode = 'spell'; __G.start(); G.game.countdown = -1; G.typing.update(1); window.copyWord = G.typing.locked.w; for(const ch of G.typing.locked.w) G.typing.key(ch);`);
  assert.equal(await evaluate(`G.learning.session.results.get(window.copyWord).status`), 'practiced', 'Copy typing is not counted as retrieval');
  const beforeReload = await evaluate('G.learning.overview().seen');
  await call('Page.reload');
  for (let n=0;n<50;n++) {
    await sleep(300);
    if (await evaluate('!!window.__G && document.readyState === "complete"')) break;
  }
  assert.equal(await evaluate('!!window.__G'), true, 'Reload completes before persistence checks');
  assert.equal(await evaluate('G.learning.overview().seen'), beforeReload, 'Memory persists after reload');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(500); await screenshot('menu-mobile');
  const fits = await evaluate(`({ width: innerWidth, scroll: document.documentElement.scrollWidth, start: document.querySelector('#rowStart').getBoundingClientRect().right })`);
  assert.equal(fits.scroll <= fits.width, true, 'Mobile menu fits viewport');
  await evaluate(`G.cfg.mode = 'recall'; __G.start(); G.game.countdown = -1; G.typing.update(1);`);
  await screenshot('play-mobile');
  await evaluate('document.querySelector("#mobileEntry").focus()');
  const mobileFirst = await evaluate('G.typing.locked.w[0]');
  await call('Input.insertText', { text: mobileFirst });
  assert.equal(await evaluate('G.typing.locked.typed'), 1, 'Mobile text input types the answer');
  assert.equal(await evaluate('document.querySelector("#mobileEntry").value'), '', 'Mobile text entry clears after each input');
  assert.equal(await evaluate('document.querySelector("#err").textContent'), '', 'No runtime errors after play and resizing');
  const boundedFailures = await evaluate(`(() => {
    __G.start(); G.game.countdown = -1;
    const failed = G.learning.session.selected[0].w;
    let n = 0;
    while (!G.learning.session.finished && n++ < 80) {
      if (!G.typing.locked) G.typing.update(4);
      const t = G.typing.locked; if (!t) continue;
      if(t.w === failed) G.typing.skip(); else for(const ch of t.w) G.typing.key(ch);
    }
    const pending = [...G.learning.session.results.values()].filter(r=>r.status==='review').length;
    document.querySelector('#btnRetry').click();
    return { pending, targets: G.learning.session.selected.length, target: G.learning.session.selected[0].w === failed, mode: G.game.mode };
  })()`);
  assert.equal(boundedFailures.pending, 1, 'Repeated failure ends as pending review');
  assert.equal(boundedFailures.targets, 1, 'Summary retry selects only unresolved words');
  assert.equal(boundedFailures.target, true);
  assert.equal(boundedFailures.mode, 'recall');
  await evaluate(`__G.menu(); document.querySelector('#btnReview').click();`);
  assert.equal(await evaluate('G.game.mode'), 'recall', 'Memory passport opens focused vocabulary review');
  await call('Page.navigate', { url: 'file:///' + root.replaceAll('\\', '/') + '/index.html' });
  for (let n = 0; n < 50; n++) { if (await evaluate('!!window.__G && location.protocol === "file:" && document.readyState === "complete"')) break; await sleep(300); }
  assert.equal(await evaluate('!!window.__G'), true, 'Offline double-click entry initializes');
  assert.equal(await evaluate('document.querySelector("#err").textContent'), '', 'Offline game has no startup errors');
  console.log('Browser checks passed. Screenshots: .test-artifacts/');
} finally {
  try { if (socket?.readyState === 1) await call('Browser.close'); } catch (_) {}
  socket?.close(); chrome.kill(); server.close();
}
