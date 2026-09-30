/* env.js — 环境控制器：把面板/快捷键映射到《逃离遗忘》世界系统（G.W） */
(() => {
'use strict';
const T = THREE, G = window.G;
const clamp = G.clamp;
const WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const WMAP = { sun: 'clear', cloud: 'cloud', rain: 'light', storm: 'heavy', snow: 'snow', fog: 'fog' };
const WNAMES = { sun: '晴天', cloud: '多云', rain: '小雨', storm: '暴雨', snow: '雪', fog: '大雾' };
const WEMOJI = { sun: '☀', cloud: '⛅', rain: '🌧', storm: '⛈', snow: '❄', fog: '🌫' };
const SMAP = { spring: 0, summer: 1, autumn: 2, winter: 3 };
const SNAMES = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

const E = G.env = {
  tTarget: 22.5, time: 22.5, timeAuto: false, timeSpeed: 0.1, weekday: 5,
  weather: 'rain', intensity: 0.7, season: 'autumn',
  simT: 0,
  /* 供 actors/typing 等读取的环境视图（每帧从世界同步） */
  p: { rain: .5, snow: 0, cloud: .85, fog: 0, wet: .8, snowCover: 0, wind: .6, daylight: 0, night: 1, dusk: 0, flash: 0 },
};

E.setTime = h => { E.tTarget = ((h % 24) + 24) % 24; G.W.setHour(E.tTarget); };
E.setWeather = (w, silent) => {
  if (!WMAP[w]) return;
  E.weather = w; G.W.setWeather(WMAP[w]);
  if (!silent) G.ui.toast(WEMOJI[w] + ' 天气 → ' + WNAMES[w]);
};
E.setIntensity = v => { E.intensity = clamp(v, .05, 1); G.W.setImul(E.intensity); };
E.setSeason = s => {
  if (!(s in SMAP)) return;
  E.season = s; G.W.applySeason(SMAP[s]);
  G.ui.toast('季节 → ' + SNAMES[s]);
};
E.inHours = (h, open, close) => {
  h = ((h % 24) + 24) % 24; open = ((open % 24) + 24) % 24; close = ((close % 24) + 24) % 24;
  return open < close ? (h >= open && h < close) : (h >= open || h < close);
};
E.label = () => {
  const h = Math.floor(E.time), m = Math.floor((E.time % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + WD[E.weekday];
};

E.init = () => {
  G.W.init(E.tTarget, WMAP[E.weather], SMAP[E.season]);
  G.W.setImul(E.intensity);
};

E.update = function (dt) {
  E.simT += dt;
  const W = G.W; if (!W) return;
  if (E.timeAuto) {
    E.tTarget += E.timeSpeed * dt;
    if (E.tTarget >= 24) { E.tTarget -= 24; E.weekday = (E.weekday + 1) % 7; }
    W.setHour(E.tTarget);
  }
  const EN = W.ENV, ec = W.envCur;
  E.time = ec.h;                       // 世界平滑后的时间是显示真相
  const p = E.p;
  p.rain = ec.rain; p.snow = ec.snow; p.cloud = ec.cloud;
  p.wet = EN.wet; p.snowCover = EN.snowAcc;
  p.night = EN.night; p.daylight = 1 - EN.night;
  p.wind = .35 + ec.rain * .6 + ec.snow * .2;
  p.flash = W.G ? W.G.uFlash.value : 0;
  p.dusk = Math.exp(-Math.pow(E.time - 18.2, 2) / 1.2) + Math.exp(-Math.pow(E.time - 5.9, 2) / .6);
  G.renderer.toneMappingExposure = 1.02 + p.night * .17 - (EN.w === 'fog' ? .06 : 0) + p.flash * .3;
};
})();
