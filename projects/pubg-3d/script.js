// ═══════════════════════════════════════════════════════════════════════════
//  PUBG 3D — BATTLE ROYALE ARENA  ·  v3.0
//  A single-file survival FPS built on Three.js (r160).
//  Drop in · loot the compound · survive escalating waves · upgrade · repeat.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

// ───────────────────────────────────────────────────────────────────────────
// 0. CONFIG / SMALL HELPERS
// ───────────────────────────────────────────────────────────────────────────
const CFG = {
  MAP: 58,
  PLAYER_H: 1.68,
  CROUCH_H: 1.12,
  PLAYER_R: 0.46,
  GRAVITY: 24,
  JUMP: 7.6,
  SPRINT_MULT: 1.55,
  WALK: 5.4,
  ADS_WALK: 2.8,
  MAX_ENEMIES: 34,
  MAX_DECALS: 48,
  SAVE_KEY: 'pubg3d_save_v3',
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const nowMs = () => performance.now();
const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const headingOf = (yaw) => ((-yaw / DEG) % 360 + 360) % 360;
const bearingTo = (fromX, fromZ, toX, toZ) => {
  // 0° = north (-Z), 90° = east (+X)
  const a = Math.atan2(toX - fromX, -(toZ - fromZ)) / DEG;
  return (a + 360) % 360;
};
const shortAngle = (a) => ((a + 540) % 360) - 180;

// Touch detection. The Android WebView app appends #touch=1 as a safety net.
const FORCE_TOUCH = /[?&#]touch=1/.test(location.search + location.hash) ||
  !!(window.AndroidApp && window.AndroidApp.isAndroidApp && window.AndroidApp.isAndroidApp());
const IS_TOUCH = FORCE_TOUCH ||
  ((navigator.maxTouchPoints || 0) > 0 && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
try { console.log('PUBG3D touch=' + IS_TOUCH + ' force=' + FORCE_TOUCH + ' hash=' + location.hash + ' search=' + location.search + ' maxTouch=' + navigator.maxTouchPoints); } catch (e) { /* ignore */ }

// ───────────────────────────────────────────────────────────────────────────
// 1. PERSISTENCE
// ───────────────────────────────────────────────────────────────────────────
function loadSave() {
  const base = { bestWave: 0, bestScore: 0, bestKills: 0, sens: 1.0, muted: false };
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY);
    if (!raw) return base;
    const s = JSON.parse(raw);
    return {
      bestWave: Number(s.bestWave) || 0,
      bestScore: Number(s.bestScore) || 0,
      bestKills: Number(s.bestKills) || 0,
      sens: clamp(Number(s.sens) || 1.0, 0.4, 2.2),
      muted: !!s.muted,
    };
  } catch (e) { return base; }
}
const SAVE = loadSave();
function persist() {
  try { localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* ignore */ }
}

// ───────────────────────────────────────────────────────────────────────────
// 2. GAME STATE
// ───────────────────────────────────────────────────────────────────────────
const G = {
  mode: 'menu',              // menu | playing | paused | shop | over
  running: false,
  started: false,
  paused: false,
  over: false,
  pausedByLock: false,

  wave: 0,
  kills: 0,
  score: 0,
  cash: 0,
  headshots: 0,
  shotsFired: 0,
  shotsHit: 0,
  damageDealt: 0,
  elapsed: 0,
  lastDamage: -99,
  combo: 0,
  comboAt: 0,

  hp: 100,
  maxHp: 100,
  armor: 0,
  maxArmor: 100,
  stamina: 100,
  maxStamina: 100,
  grenades: 3,
  medkits: 2,
  plates: 1,

  weaponIndex: 0,
  owned: [0],
  ammo: [12, 0, 0, 0, 0, 0, 0, 0],
  reserve: [Infinity, 0, 0, 0, 0, 0, 0, 0],
  upgrades: [0, 0, 0, 0, 0, 0, 0, 0],
  perks: { hp: 0, speed: 0, reload: 0 },

  yaw: 0,
  pitch: 0,
  keys: {},
  mobile: false,
  touchMove: { x: 0, y: 0 },
  touchLook: null,
  freeLook: false,
  suppressLock: false,
  recoil: 0,
  recoilKick: 0,
  ads: false,
  adsAmt: 0,
  trigger: false,
  firing: false,
  canShoot: true,
  nextShot: 0,
  reloading: false,
  reloadEnd: 0,
  reloadWeapon: -1,
  switchT: 0,

  onGround: true,
  vy: 0,
  crouch: false,
  crouchAmt: 0,
  sprinting: false,
  bobPhase: 0,
  bobAmt: 0,
  moveAmount: 0,
  stepTimer: 0,
  jumpHeld: false,

  enemies: [],
  spawnQueue: [],
  spawnTimer: 0,
  waveClearedAt: 0,
  loot: [],
  nearLoot: null,
  airdrops: [],
  nearAirdrop: null,
  grenadesActive: [],
  effects: [],
  decals: [],
  hitmarkerT: 0,

  crossSpread: 10,
  crossTarget: 10,
  camShake: 0,
  vignette: 0,
  dmgDirT: 0,
  night: false,
  nightTarget: 0,
  nightAmt: 0,
  flashlight: false,
  fps: 0,
  sens: SAVE.sens,
  muted: SAVE.muted,
  newRecord: false,
};

// ───────────────────────────────────────────────────────────────────────────
// 3. AUDIO  (all procedural — no external assets)
// ───────────────────────────────────────────────────────────────────────────
const Audio = (() => {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let ambience = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = G.muted ? 0 : 0.55;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 1.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.03 * w) / 1.03;
        data[i] = w * 0.8 + last * 2.2;
      }
    } catch (e) { ctx = null; }
    return ctx;
  }

  function resume() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!ctx || G.muted) return;
    try {
      const t0 = ctx.currentTime + (delay || 0);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(Math.max(20, freq), t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  function noise(dur, vol, freq, type, q, delay) {
    if (!ctx || G.muted || !noiseBuf) return;
    try {
      const t0 = ctx.currentTime + (delay || 0);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.playbackRate.value = rand(0.85, 1.15);
      const f = ctx.createBiquadFilter();
      f.type = type || 'lowpass';
      f.frequency.setValueAtTime(freq || 1200, t0);
      f.Q.value = q == null ? 0.8 : q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t0); src.stop(t0 + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  function startAmbience() {
    if (!ctx || ambience) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 0.4;
      const g = ctx.createGain(); g.gain.value = 0.028;
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
      ambience = { src, g };
    } catch (e) { /* ignore */ }
  }

  const api = {
    resume,
    startAmbience,
    setMuted(m) {
      G.muted = !!m;
      if (master && ctx) master.gain.setTargetAtTime(G.muted ? 0 : 0.55, ctx.currentTime, 0.03);
    },
    shoot(w) {
      if (w.type === 'pistol') {
        tone(260, 0.07, 'square', 0.16, 90);
        noise(0.075, 0.28, 2600, 'bandpass', 0.9);
      } else if (w.type === 'smg') {
        tone(190, 0.055, 'square', 0.13, 80);
        noise(0.06, 0.26, 2200, 'bandpass', 0.8);
      } else if (w.type === 'ar') {
        tone(150, 0.095, 'sawtooth', 0.2, 55);
        noise(0.09, 0.34, 1700, 'lowpass', 0.7);
        tone(700, 0.04, 'square', 0.06, 300);
      } else if (w.type === 'shotgun') {
        tone(95, 0.18, 'sawtooth', 0.3, 35);
        noise(0.22, 0.5, 1100, 'lowpass', 0.55);
      } else if (w.type === 'dmr') {
        tone(130, 0.16, 'sawtooth', 0.26, 42);
        noise(0.18, 0.45, 1500, 'lowpass', 0.6);
      } else if (w.type === 'sniper') {
        tone(85, 0.24, 'sawtooth', 0.34, 28);
        noise(0.3, 0.55, 900, 'lowpass', 0.45);
        tone(1500, 0.06, 'square', 0.08, 300, 0.01);
      } else if (w.type === 'minigun') {
        tone(120, 0.05, 'square', 0.16, 70);
        noise(0.055, 0.3, 1800, 'bandpass', 0.7);
      }
    },
    enemyShot(kind) {
      if (kind === 'sniper') {
        tone(100, 0.2, 'sawtooth', 0.14, 38);
        noise(0.2, 0.22, 1200, 'lowpass', 0.6);
      } else {
        tone(170, 0.07, 'sawtooth', 0.07, 60);
        noise(0.07, 0.09, 1400, 'bandpass', 0.8);
      }
    },
    empty() { tone(160, 0.04, 'square', 0.08, 100); },
    reloadStart() { tone(420, 0.05, 'square', 0.06, 300); noise(0.04, 0.08, 3000, 'highpass', 1); },
    reloadEnd() {
      tone(520, 0.05, 'square', 0.07, 700);
      setTimeout(() => tone(700, 0.04, 'square', 0.06, 900), 55);
    },
    hit() { tone(1100, 0.035, 'sine', 0.1, 1500); },
    headshot() { tone(1600, 0.05, 'sine', 0.14, 2200); tone(2400, 0.05, 'sine', 0.08, 3000, 0.03); },
    kill() {
      tone(520, 0.06, 'sine', 0.11, 700);
      setTimeout(() => tone(780, 0.08, 'sine', 0.1, 1000), 55);
    },
    hurt() { tone(120, 0.16, 'sawtooth', 0.16, 55); noise(0.12, 0.12, 500, 'lowpass', 0.7); },
    armorHit() { tone(300, 0.05, 'triangle', 0.1, 180); noise(0.05, 0.1, 1800, 'bandpass', 1); },
    explosion() {
      tone(60, 0.5, 'sawtooth', 0.4, 24);
      noise(0.55, 0.6, 700, 'lowpass', 0.5);
      noise(0.25, 0.3, 2500, 'highpass', 0.7, 0.03);
    },
    pickup() {
      tone(700, 0.05, 'sine', 0.08, 900);
      setTimeout(() => tone(1100, 0.06, 'sine', 0.07, 1300), 45);
    },
    buy() {
      tone(620, 0.05, 'triangle', 0.09, 800);
      setTimeout(() => tone(940, 0.07, 'triangle', 0.08, 1200), 55);
    },
    upgrade() {
      [440, 660, 880].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'sine', 0.09, f * 1.2), i * 70));
    },
    wave() {
      tone(300, 0.12, 'sine', 0.1, 360);
      setTimeout(() => tone(420, 0.14, 'sine', 0.1, 500), 120);
      setTimeout(() => tone(560, 0.22, 'sine', 0.11, 680), 250);
    },
    boss() {
      tone(70, 0.6, 'sawtooth', 0.3, 40);
      setTimeout(() => tone(55, 0.8, 'sawtooth', 0.28, 32), 300);
    },
    airdrop() {
      tone(500, 0.14, 'sine', 0.1, 600);
      setTimeout(() => tone(700, 0.14, 'sine', 0.1, 800), 150);
      setTimeout(() => tone(900, 0.2, 'sine', 0.1, 1000), 300);
    },
    footstep(sprint) {
      noise(sprint ? 0.055 : 0.04, sprint ? 0.055 : 0.035, sprint ? 700 : 500, 'lowpass', 0.8);
    },
    nadeBounce() { tone(700, 0.03, 'square', 0.04, 500); },
    ui() { tone(440, 0.03, 'square', 0.035, 520); },
    deny() { tone(160, 0.08, 'sawtooth', 0.07, 110); },
  };
  return api;
})();

// ───────────────────────────────────────────────────────────────────────────
// 4. PROCEDURAL TEXTURES
// ───────────────────────────────────────────────────────────────────────────
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function canvasTexture(w, h, draw, repX, repY) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX || 1, repY || 1);
  t.anisotropy = 4;
  return t;
}
function speckle(ctx, w, h, count, colors, min, max) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[randi(0, colors.length - 1)];
    const s = rand(min, max);
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

const Tex = {};
function buildTextures() {
  Tex.grass = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#52603b'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 240; i++) {
      const g = ctx.createRadialGradient(Math.random() * w, Math.random() * h, 0, Math.random() * w, Math.random() * h, rand(12, 60));
      g.addColorStop(0, Math.random() < 0.5 ? 'rgba(112,128,70,0.22)' : 'rgba(48,58,33,0.24)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    for (let i = 0; i < 5200; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const c = Math.random();
      ctx.strokeStyle = c < 0.35 ? 'rgba(92,110,58,0.7)' : c < 0.75 ? 'rgba(68,82,44,0.65)' : 'rgba(124,132,76,0.4)';
      ctx.lineWidth = rand(0.5, 1.4);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rand(-2, 2), y - rand(2, 6)); ctx.stroke();
    }
    speckle(ctx, w, h, 900, ['rgba(40,46,28,0.25)', 'rgba(140,130,90,0.18)'], 1, 3);
  }, 26, 26);

  Tex.asphalt = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4f545b'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4200; i++) {
      const g = randi(75, 135);
      ctx.fillStyle = 'rgba(' + g + ',' + (g + 2) + ',' + (g + 5) + ',' + rand(0.2, 0.55) + ')';
      const s = rand(0.6, 2.2);
      ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
    }
    ctx.strokeStyle = 'rgba(24,26,30,0.5)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      let x = Math.random() * w, y = Math.random() * h;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 8; j++) { x += rand(-14, 14); y += rand(4, 20); ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, 8, 8);

  Tex.concrete = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8b8b80'; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 2600, ['rgba(120,120,110,0.35)', 'rgba(160,160,148,0.25)', 'rgba(70,70,64,0.2)'], 1, 3);
    ctx.strokeStyle = 'rgba(60,60,56,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      let x = Math.random() * w, y = Math.random() * h;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += rand(-20, 20); y += rand(3, 16); ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, 3, 3);

  Tex.metal = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#59636a'; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0, y, w, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(0, y + 4, w, 1);
    }
    speckle(ctx, w, h, 900, ['rgba(90,70,50,0.18)', 'rgba(180,185,190,0.12)', 'rgba(30,32,36,0.2)'], 1, 5);
  }, 4, 4);

  Tex.wood = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8a6a3f'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = 'rgba(70,48,24,' + rand(0.08, 0.28) + ')';
      ctx.lineWidth = rand(0.6, 2.2);
      const y = Math.random() * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(w * 0.3, y + rand(-6, 6), w * 0.7, y + rand(-6, 6), w, y + rand(-4, 4)); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(60,42,22,0.35)';
    for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 2, h);
  }, 2, 2);

  Tex.sandbag = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#8a7c55'; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 1300, ['rgba(110,98,66,0.35)', 'rgba(160,148,106,0.25)', 'rgba(70,62,42,0.25)'], 1, 2);
    ctx.strokeStyle = 'rgba(60,54,36,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(rand(0, w), 0); ctx.lineTo(rand(0, w), h); ctx.stroke(); }
  }, 2, 1);

  Tex.cloud = (() => {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 120);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.45, 'rgba(240,246,255,0.38)');
    g.addColorStop(1, 'rgba(220,235,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  Tex.smoke = (() => {
    const c = makeCanvas(128, 128);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(165,165,165,0.55)');
    g.addColorStop(0.5, 'rgba(120,120,120,0.22)');
    g.addColorStop(1, 'rgba(90,90,90,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  Tex.spark = (() => {
    const c = makeCanvas(64, 64);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,235,1)');
    g.addColorStop(0.25, 'rgba(255,210,110,0.9)');
    g.addColorStop(0.6, 'rgba(255,130,40,0.35)');
    g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  Tex.bulletHole = (() => {
    const c = makeCanvas(64, 64);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(20,18,16,0.9)';
    ctx.beginPath(); ctx.arc(32, 32, 8, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(10,9,8,0.75)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(32, 32, 14, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(150,145,135,0.3)'; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + rand(-0.2, 0.2);
      ctx.beginPath(); ctx.moveTo(32 + Math.cos(a) * 15, 32 + Math.sin(a) * 15); ctx.lineTo(32 + Math.cos(a) * rand(20, 30), 32 + Math.sin(a) * rand(20, 30)); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  Tex.grassBlade = (() => {
    const c = makeCanvas(64, 64);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    for (let i = 0; i < 14; i++) {
      const x = rand(8, 56);
      ctx.strokeStyle = 'rgba(' + randi(70, 120) + ',' + randi(100, 145) + ',' + randi(48, 72) + ',0.95)';
      ctx.lineWidth = rand(1.2, 3);
      ctx.beginPath(); ctx.moveTo(x, 64); ctx.quadraticCurveTo(x + rand(-6, 6), 34, x + rand(-12, 12), rand(4, 22)); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  Tex.sign = (text) => {
    const c = makeCanvas(512, 128);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#20252b'; ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 5; ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = '#e7c568';
    ctx.font = 'bold 54px Bahnschrift, Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 5. ENGINE / SHARED WORLD OBJECTS
// ───────────────────────────────────────────────────────────────────────────
let scene, camera, renderer, clock;
let worldGroup, enemyGroup, lootGroup, fxGroup, decalGroup;
let sunLight, hemiLight, ambientLight, fillLightA, fillLightB, nightDome;
let torchLight = null;
const raycaster = new THREE.Raycaster();
const losRaycaster = new THREE.Raycaster();
const projVec = new THREE.Vector3();

const World = {
  solids: [],
  obstacles: [],
  buildings: [],
  lights: {},
  dust: null,
  grass: null,
  sky: null,
  sunSprite: null,
  cloudGroup: null,
  originalFog: null,
};

function initEngine() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xa7bdd0, 70, 210);
  World.originalFog = { color: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far };

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 520);
  camera.position.set(0, CFG.PLAYER_H, 4);
  scene.add(camera);

  renderer = new THREE.WebGLRenderer({ antialias: !G.mobile, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, G.mobile ? 1.0 : 1.75));
  renderer.shadowMap.enabled = !G.mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.24;
  renderer.domElement.id = 'webgl';
  document.body.appendChild(renderer.domElement);

  // Dedicated soft light for the first-person weapon.
  const viewLight = new THREE.PointLight(0xffefdb, 2.4, 5, 2);
  viewLight.position.set(0.4, 0.5, 0.5);
  camera.add(viewLight);

  clock = new THREE.Clock();
  worldGroup = new THREE.Group();
  enemyGroup = new THREE.Group();
  lootGroup = new THREE.Group();
  fxGroup = new THREE.Group();
  decalGroup = new THREE.Group();
  scene.add(worldGroup, enemyGroup, lootGroup, fxGroup, decalGroup);

  window.addEventListener('resize', onResize);
}

function onResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, G.mobile ? 1.0 : 1.75));
}

// ───────────────────────────────────────────────────────────────────────────
// 6. MATERIALS
// ───────────────────────────────────────────────────────────────────────────
const MAT = {};
function buildMaterials() {
  MAT.grass = new THREE.MeshStandardMaterial({ map: Tex.grass, color: 0xffffff, roughness: 1, metalness: 0 });
  MAT.asphalt = new THREE.MeshStandardMaterial({ map: Tex.asphalt, color: 0x9a9a9a, roughness: 0.98, metalness: 0 });
  MAT.concrete = new THREE.MeshStandardMaterial({ map: Tex.concrete, color: 0xbfb9a8, roughness: 0.88, metalness: 0.02 });
  MAT.concreteDark = new THREE.MeshStandardMaterial({ map: Tex.concrete, color: 0x77766c, roughness: 0.95, metalness: 0 });
  MAT.metal = new THREE.MeshStandardMaterial({ map: Tex.metal, color: 0x7a858c, roughness: 0.55, metalness: 0.45 });
  MAT.rust = new THREE.MeshStandardMaterial({ map: Tex.metal, color: 0x9c5d3a, roughness: 0.75, metalness: 0.3 });
  MAT.blueMetal = new THREE.MeshStandardMaterial({ map: Tex.metal, color: 0x3f6e8c, roughness: 0.55, metalness: 0.42 });
  MAT.greenMetal = new THREE.MeshStandardMaterial({ map: Tex.metal, color: 0x4f6b4a, roughness: 0.6, metalness: 0.35 });
  MAT.wood = new THREE.MeshStandardMaterial({ map: Tex.wood, color: 0xffffff, roughness: 0.85, metalness: 0 });
  MAT.woodDark = new THREE.MeshStandardMaterial({ map: Tex.wood, color: 0x8b6a45, roughness: 0.9, metalness: 0 });
  MAT.sandbag = new THREE.MeshStandardMaterial({ map: Tex.sandbag, color: 0xffffff, roughness: 0.95, metalness: 0 });
  MAT.glass = new THREE.MeshStandardMaterial({ color: 0x13212c, roughness: 0.15, metalness: 0.65, emissive: 0x08131b, emissiveIntensity: 0.4 });
  MAT.black = new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.7, metalness: 0.3 });
  MAT.roof = new THREE.MeshStandardMaterial({ color: 0x4e565a, roughness: 0.7, metalness: 0.35 });
  MAT.roofRed = new THREE.MeshStandardMaterial({ color: 0x6e4034, roughness: 0.8, metalness: 0.1 });
  MAT.trunk = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 1, metalness: 0 });
  MAT.leaf1 = new THREE.MeshStandardMaterial({ color: 0x3d5c32, roughness: 1, metalness: 0, flatShading: true });
  MAT.leaf2 = new THREE.MeshStandardMaterial({ color: 0x4f7039, roughness: 1, metalness: 0, flatShading: true });
  MAT.rock = new THREE.MeshStandardMaterial({ color: 0x777a74, roughness: 1, metalness: 0, flatShading: true });
  MAT.orange = new THREE.MeshStandardMaterial({ color: 0xc4652a, roughness: 0.7, metalness: 0.25 });
  MAT.greenCrate = new THREE.MeshStandardMaterial({ color: 0x3e5b40, roughness: 0.65, metalness: 0.25 });
  MAT.wire = new THREE.MeshBasicMaterial({ color: 0x3b4148 });
  MAT.white = new THREE.MeshBasicMaterial({ color: 0xf0f4f8 });
}

// ───────────────────────────────────────────────────────────────────────────
// 7. WORLD HELPERS
// ───────────────────────────────────────────────────────────────────────────
function addSolid(mesh) { World.solids.push(mesh); return mesh; }

function registerBox(x, z, w, d) {
  World.obstacles.push({
    type: 'box',
    minX: x - w / 2, maxX: x + w / 2,
    minZ: z - d / 2, maxZ: z + d / 2,
  });
}
function registerCircle(x, z, r) {
  World.obstacles.push({ type: 'cyl', x, z, r });
}

function addBox(w, h, d, mat, x, y, z, ry, opts) {
  opts = opts || {};
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  if (ry) mesh.rotation.y = ry;
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  (opts.parent || worldGroup).add(mesh);
  if (opts.ray !== false) World.solids.push(mesh);
  return mesh;
}

function addCylinder(rTop, rBot, h, seg, mat, x, y, z, opts) {
  opts = opts || {};
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  (opts.parent || worldGroup).add(mesh);
  if (opts.ray !== false) World.solids.push(mesh);
  return mesh;
}

function isFreeForProp(x, z, r) {
  if (Math.abs(x) > CFG.MAP - 2 || Math.abs(z) > CFG.MAP - 2) return false;
  if (Math.abs(x) < 6 || Math.abs(z) < 5) return false; // keep the crossroads clear
  for (let i = 0; i < World.obstacles.length; i++) {
    const o = World.obstacles[i];
    if (o.type === 'box') {
      if (x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r) return false;
    } else if (Math.hypot(x - o.x, z - o.z) < o.r + r) return false;
  }
  return true;
}

function pointInBuilding(x, z, margin) {
  margin = margin || 0;
  for (const b of World.buildings) {
    if (x > b.x - b.w / 2 - margin && x < b.x + b.w / 2 + margin &&
      z > b.z - b.d / 2 - margin && z < b.z + b.d / 2 + margin) return true;
  }
  return false;
}

// ───────────────────────────────────────────────────────────────────────────
// 8. SKY / LIGHTING / ATMOSPHERE
// ───────────────────────────────────────────────────────────────────────────
function buildSky() {
  const geo = new THREE.SphereGeometry(420, 32, 20);
  const colors = [];
  const pos = geo.attributes.position;
  const top = new THREE.Color(0x4d8dcc);
  const horizon = new THREE.Color(0xc9d6d8);
  const bottom = new THREE.Color(0x879e9d);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 420;
    let c;
    if (y > 0) c = horizon.clone().lerp(top, Math.pow(clamp(y, 0, 1), 0.62));
    else c = horizon.clone().lerp(bottom, clamp(-y * 2.2, 0, 1));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -100;
  scene.add(sky);
  World.sky = sky;

  // Sun disc with glow.
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
  g.addColorStop(0, 'rgba(255,252,235,1)');
  g.addColorStop(0.16, 'rgba(255,244,205,0.95)');
  g.addColorStop(0.38, 'rgba(255,220,150,0.32)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  const st = new THREE.CanvasTexture(c);
  st.colorSpace = THREE.SRGBColorSpace;
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, transparent: true }));
  sunSprite.position.set(145, 185, -230);
  sunSprite.scale.set(70, 70, 1);
  sunSprite.renderOrder = -99;
  scene.add(sunSprite);
  World.sunSprite = sunSprite;

  // Soft cumulus layer.
  const cloudGroup = new THREE.Group();
  const cloudCount = G.mobile ? 8 : 14;
  for (let i = 0; i < cloudCount; i++) {
    const mat = new THREE.SpriteMaterial({ map: Tex.cloud, transparent: true, opacity: rand(0.18, 0.38), depthWrite: false, fog: false, color: 0xffffff });
    const sp = new THREE.Sprite(mat);
    const a = rand(0, TAU);
    const rad = rand(80, 300);
    sp.position.set(Math.cos(a) * rad, rand(70, 140), Math.sin(a) * rad);
    const s = rand(45, 110);
    sp.scale.set(s, s * 0.48, 1);
    cloudGroup.add(sp);
  }
  scene.add(cloudGroup);
  World.cloudGroup = cloudGroup;

  // Distant hills to close the horizon.
  const hillMatA = new THREE.MeshBasicMaterial({ color: 0x6a7f7a, fog: true });
  const hillMatB = new THREE.MeshBasicMaterial({ color: 0x7e9189, fog: true });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + rand(-0.12, 0.12);
    const rad = rand(230, 330);
    const h = rand(26, 72);
    const hill = new THREE.Mesh(new THREE.ConeGeometry(rand(55, 110), h, 9), i % 2 ? hillMatA : hillMatB);
    hill.position.set(Math.cos(a) * rad, h / 2 - 8, Math.sin(a) * rad);
    hill.rotation.y = rand(0, TAU);
    scene.add(hill);
  }

  // Subtle dark shell for night mode.
  nightDome = new THREE.Mesh(
    new THREE.SphereGeometry(300, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x03060d, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false })
  );
  nightDome.renderOrder = 998;
  scene.add(nightDome);
}

function buildLights() {
  ambientLight = new THREE.AmbientLight(0xdfe8f2, 0.64);
  scene.add(ambientLight);

  hemiLight = new THREE.HemisphereLight(0xa9c7ea, 0x4e4a38, 0.82);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xfff0d4, 1.7);
  sunLight.position.set(48, 78, 34);
  sunLight.castShadow = !G.mobile;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -62;
  sunLight.shadow.camera.right = 62;
  sunLight.shadow.camera.top = 62;
  sunLight.shadow.camera.bottom = -62;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 180;
  sunLight.shadow.bias = -0.00045;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);
  scene.add(sunLight.target);

  fillLightA = new THREE.PointLight(0x4a86ff, 18, 65, 2);
  fillLightA.position.set(-42, 14, -38);
  fillLightA.visible = !G.mobile;
  scene.add(fillLightA);

  fillLightB = new THREE.PointLight(0xff7038, 13, 55, 2);
  fillLightB.position.set(38, 12, 40);
  fillLightB.visible = !G.mobile;
  scene.add(fillLightB);

  World.lights = { ambient: ambientLight, hemi: hemiLight, sun: sunLight, fillA: fillLightA, fillB: fillLightB };
}

function buildNightLight() {
  torchLight = new THREE.SpotLight(0xffe9bd, 0, 46, Math.PI / 6.5, 0.42, 1.1);
  torchLight.position.set(0, -0.05, 0);
  torchLight.target.position.set(0, 0, -1);
  camera.add(torchLight);
  camera.add(torchLight.target);
}

// ───────────────────────────────────────────────────────────────────────────
// 9. TERRAIN / ROADS / BOUNDARY
// ───────────────────────────────────────────────────────────────────────────
function buildTerrain() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), MAT.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  worldGroup.add(ground);
  addSolid(ground);

  // Road materials use their own repeat so the asphalt doesn't look stretched.
  const roadTex = Tex.asphalt.clone();
  roadTex.needsUpdate = true;
  roadTex.repeat.set(2.2, 30);
  const crossTex = Tex.asphalt.clone();
  crossTex.needsUpdate = true;
  crossTex.repeat.set(30, 2);
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, color: 0xffffff, roughness: 0.97, metalness: 0 });
  const crossMat = new THREE.MeshStandardMaterial({ map: crossTex, color: 0xffffff, roughness: 0.97, metalness: 0 });

  const road = new THREE.Mesh(new THREE.PlaneGeometry(9.5, CFG.MAP * 2 + 10), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(1.5, 0.018, 0);
  road.receiveShadow = true;
  worldGroup.add(road);

  const cross = new THREE.Mesh(new THREE.PlaneGeometry(CFG.MAP * 2 + 10, 8), crossMat);
  cross.rotation.x = -Math.PI / 2;
  cross.position.set(0, 0.019, 2.5);
  cross.receiveShadow = true;
  worldGroup.add(cross);

  // Shoulders / gravel strips.
  const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x746e5e, roughness: 1 });
  addBox(1.1, 0.02, CFG.MAP * 2 + 10, shoulderMat, -4.1, 0.024, 0, 0, { cast: false, ray: false });
  addBox(1.1, 0.02, CFG.MAP * 2 + 10, shoulderMat, 7.1, 0.024, 0, 0, { cast: false, ray: false });
  addBox(CFG.MAP * 2 + 10, 0.02, 1.0, shoulderMat, 0, 0.025, -2.1, 0, { cast: false, ray: false });
  addBox(CFG.MAP * 2 + 10, 0.02, 1.0, shoulderMat, 0, 0.025, 7.1, 0, { cast: false, ray: false });

  // Lane dashes.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xb8b09a });
  for (let z = -CFG.MAP; z < CFG.MAP; z += 8) {
    addBox(0.18, 0.02, 3, dashMat, 1.5, 0.035, z, 0, { cast: false, receive: false, ray: false });
  }
  for (let x = -CFG.MAP; x < CFG.MAP; x += 8) {
    addBox(3, 0.02, 0.18, dashMat, x, 0.035, 2.5, 0, { cast: false, receive: false, ray: false });
  }

  buildBoundary();
}

function supportsInstancing() {
  try {
    return !!renderer && (renderer.capabilities.isWebGL2 || renderer.extensions.has('ANGLE_instanced_arrays'));
  } catch (e) { return false; }
}

function buildBoundary() {
  const lim = CFG.MAP;
  const postGeo = new THREE.BoxGeometry(0.14, 1.7, 0.14);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x4a4b45, roughness: 0.8, metalness: 0.2 });
  const canInstance = supportsInstancing();
  if (canInstance) {
    const count = 4 * 31;
    const posts = new THREE.InstancedMesh(postGeo, postMat, count);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let i = 0; i <= 30; i++) {
      const t = -lim + (i / 30) * lim * 2;
      for (const side of [0, 1, 2, 3]) {
        if (idx >= count) break;
        if (side === 0) dummy.position.set(t, 0.85, -lim);
        else if (side === 1) dummy.position.set(t, 0.85, lim);
        else if (side === 2) dummy.position.set(-lim, 0.85, t);
        else dummy.position.set(lim, 0.85, t);
        dummy.updateMatrix();
        posts.setMatrixAt(idx++, dummy.matrix);
      }
    }
    posts.count = idx;
    posts.castShadow = false;
    posts.receiveShadow = false;
    worldGroup.add(posts);
  } else {
    // WebGL1 fallback: just enough posts to read as a perimeter fence.
    for (const x of [-lim, 0, lim]) {
      addBox(0.18, 1.7, 0.18, postMat, x, 0.85, -lim, 0, { cast: false, receive: false, ray: false });
      addBox(0.18, 1.7, 0.18, postMat, x, 0.85, lim, 0, { cast: false, receive: false, ray: false });
    }
    for (const z of [-lim, 0, lim]) {
      addBox(0.18, 1.7, 0.18, postMat, -lim, 0.85, z, 0, { cast: false, receive: false, ray: false });
      addBox(0.18, 1.7, 0.18, postMat, lim, 0.85, z, 0, { cast: false, receive: false, ray: false });
    }
  }

  // Wire rails (visual only).
  const railMat = new THREE.MeshBasicMaterial({ color: 0x3d4146 });
  for (const y of [0.55, 1.12, 1.62]) {
    addBox(lim * 2, 0.025, 0.025, railMat, 0, y, -lim, 0, { cast: false, receive: false, ray: false });
    addBox(lim * 2, 0.025, 0.025, railMat, 0, y, lim, 0, { cast: false, receive: false, ray: false });
    addBox(0.025, 0.025, lim * 2, railMat, -lim, y, 0, 0, { cast: false, receive: false, ray: false });
    addBox(0.025, 0.025, lim * 2, railMat, lim, y, 0, 0, { cast: false, receive: false, ray: false });
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 10. BUILDINGS
// ───────────────────────────────────────────────────────────────────────────
function addWallSegment(cx, cz, len, alongX, h, t, mat) {
  const w = alongX ? len : t;
  const d = alongX ? t : len;
  const m = addBox(w, h, d, mat, cx, h / 2, cz, 0, { ray: true });
  registerBox(cx, cz, w, d);
  return m;
}

function addWindow(x, y, z, ry, w, h) {
  const frame = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), MAT.glass);
  frame.add(glass);
  const barMat = MAT.black;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.08, 0.08), barMat);
  top.position.y = h / 2;
  frame.add(top);
  const bottom = top.clone(); bottom.position.y = -h / 2; frame.add(bottom);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.08, h + 0.16, 0.08), barMat);
  left.position.x = -w / 2; frame.add(left);
  const right = left.clone(); right.position.x = w / 2; frame.add(right);
  const mid = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.04), barMat);
  frame.add(mid);
  frame.position.set(x, y, z);
  frame.rotation.y = ry;
  worldGroup.add(frame);
}

function buildBuilding(cfg) {
  const x = cfg.x, z = cfg.z, w = cfg.w, d = cfg.d, h = cfg.h;
  const doorSide = cfg.door || 'S';
  const doorW = cfg.doorW || 2.4;
  const t = 0.3;
  const wallMat = new THREE.MeshStandardMaterial({ map: Tex.concrete, color: cfg.wall || 0xc3bba8, roughness: 0.9, metalness: 0.02 });
  const trimMat = new THREE.MeshStandardMaterial({ color: cfg.trim || 0x6a6559, roughness: 0.8, metalness: 0.1 });
  const roofMat = cfg.roof === 'red' ? MAT.roofRed : (cfg.roof === 'metal' ? MAT.metal : MAT.roof);

  // Interior slab
  addBox(w - 0.5, 0.06, d - 0.5, MAT.concreteDark, x, 0.03, z, 0, { cast: false, ray: true });

  // Walls. Axis-aligned so door openings line up with collision boxes.
  // South wall (z + d/2)
  {
    const wz = z + d / 2 - t / 2;
    if (doorSide === 'S') {
      const side = (w - doorW) / 2;
      addWallSegment(x - doorW / 2 - side / 2, wz, side, true, h, t, wallMat);
      addWallSegment(x + doorW / 2 + side / 2, wz, side, true, h, t, wallMat);
      addBox(doorW, h - 2.35, t, wallMat, x, h - (h - 2.35) / 2, wz, 0, { ray: true });
      addWindow(x - side * 0.48, 1.55, wz + 0.17, 0, 1.1, 1.05);
      addWindow(x + side * 0.48, 1.55, wz + 0.17, 0, 1.1, 1.05);
    } else {
      addWallSegment(x, wz, w, true, h, t, wallMat);
      addWindow(x - w * 0.25, 1.55, wz + 0.17, 0, 1.2, 1.1);
      addWindow(x + w * 0.25, 1.55, wz + 0.17, 0, 1.2, 1.1);
    }
  }
  // North wall (z - d/2)
  {
    const wz = z - d / 2 + t / 2;
    if (doorSide === 'N') {
      const side = (w - doorW) / 2;
      addWallSegment(x - doorW / 2 - side / 2, wz, side, true, h, t, wallMat);
      addWallSegment(x + doorW / 2 + side / 2, wz, side, true, h, t, wallMat);
      addBox(doorW, h - 2.35, t, wallMat, x, h - (h - 2.35) / 2, wz, 0, { ray: true });
    } else {
      addWallSegment(x, wz, w, true, h, t, wallMat);
      addWindow(x - w * 0.24, 1.55, wz - 0.17, Math.PI, 1.1, 1.0);
      addWindow(x + w * 0.24, 1.55, wz - 0.17, Math.PI, 1.1, 1.0);
    }
  }
  // West wall (x - w/2)
  {
    const wx = x - w / 2 + t / 2;
    if (doorSide === 'W') {
      const side = (d - doorW) / 2;
      addWallSegment(wx, z - doorW / 2 - side / 2, side, false, h, t, wallMat);
      addWallSegment(wx, z + doorW / 2 + side / 2, side, false, h, t, wallMat);
      addBox(t, h - 2.35, doorW, wallMat, wx, h - (h - 2.35) / 2, z, 0, { ray: true });
    } else {
      addWallSegment(wx, z, d, false, h, t, wallMat);
      addWindow(wx - 0.17, 1.55, z, -Math.PI / 2, 1.1, 1.0);
    }
  }
  // East wall (x + w/2)
  {
    const wx = x + w / 2 - t / 2;
    if (doorSide === 'E') {
      const side = (d - doorW) / 2;
      addWallSegment(wx, z - doorW / 2 - side / 2, side, false, h, t, wallMat);
      addWallSegment(wx, z + doorW / 2 + side / 2, side, false, h, t, wallMat);
      addBox(t, h - 2.35, doorW, wallMat, wx, h - (h - 2.35) / 2, z, 0, { ray: true });
    } else {
      addWallSegment(wx, z, d, false, h, t, wallMat);
      addWindow(wx + 0.17, 1.55, z, Math.PI / 2, 1.1, 1.0);
    }
  }

  // Door frame / step.
  if (doorSide === 'S' || doorSide === 'N') {
    const dz = doorSide === 'S' ? z + d / 2 + 0.02 : z - d / 2 - 0.02;
    addBox(doorW + 0.6, 0.12, 0.8, MAT.concreteDark, x, 0.06, dz, 0, { cast: false, ray: false });
    addBox(0.16, 2.4, 0.16, trimMat, x - doorW / 2, 1.2, dz, 0, { ray: true });
    addBox(0.16, 2.4, 0.16, trimMat, x + doorW / 2, 1.2, dz, 0, { ray: true });
  } else {
    const dx = doorSide === 'E' ? x + w / 2 + 0.02 : x - w / 2 - 0.02;
    addBox(0.8, 0.12, doorW + 0.6, MAT.concreteDark, dx, 0.06, z, 0, { cast: false, ray: false });
    addBox(0.16, 2.4, 0.16, trimMat, dx, 1.2, z - doorW / 2, 0, { ray: true });
    addBox(0.16, 2.4, 0.16, trimMat, dx, 1.2, z + doorW / 2, 0, { ray: true });
  }

  // Roof + fascia.
  addBox(w + 0.7, 0.3, d + 0.7, roofMat, x, h + 0.15, z, 0, { ray: true });
  addBox(w + 0.8, 0.1, 0.16, trimMat, x, h + 0.02, z + d / 2 + 0.3, 0, { cast: false, ray: false });
  addBox(w + 0.8, 0.1, 0.16, trimMat, x, h + 0.02, z - d / 2 - 0.3, 0, { cast: false, ray: false });

  // Interior light.
  const lamp = new THREE.PointLight(0xffd6a0, cfg.lamp || 150, Math.max(w, d) * 1.35, 2);
  lamp.position.set(x, h - 0.9, z);
  lamp.castShadow = false;
  scene.add(lamp);

  // Sign above the door.
  if (cfg.sign) {
    const side = doorSide;
    let sx = x, sz = z, ry = 0;
    if (side === 'S') { sz = z + d / 2 + 0.06; ry = 0; }
    if (side === 'N') { sz = z - d / 2 - 0.06; ry = Math.PI; }
    if (side === 'E') { sx = x + w / 2 + 0.06; ry = Math.PI / 2; }
    if (side === 'W') { sx = x - w / 2 - 0.06; ry = -Math.PI / 2; }
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.85),
      new THREE.MeshBasicMaterial({ map: Tex.sign(cfg.sign), transparent: false })
    );
    sign.position.set(sx, h - 0.72, sz);
    sign.rotation.y = ry;
    worldGroup.add(sign);
  }

  World.buildings.push({ x, z, w, d, h });
  return { x, z, w, d, h };
}

// ───────────────────────────────────────────────────────────────────────────
// 11. PROPS
// ───────────────────────────────────────────────────────────────────────────
function buildContainer(x, z, ry, colorMat, stack) {
  const w = 6.0, h = 2.55, d = 2.5;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = ry || 0;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), colorMat);
  body.position.y = h / 2 + (stack ? 2.55 : 0);
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);
  World.solids.push(body);

  // Ribs.
  const ribMat = new THREE.MeshStandardMaterial({ color: 0x2f3439, roughness: 0.65, metalness: 0.5 });
  for (let i = -2; i <= 2; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, h - 0.2, d + 0.06), ribMat);
    rib.position.set(i * 1.2, h / 2 + (stack ? 2.55 : 0), 0);
    group.add(rib);
  }
  // Door seams on the short ends.
  for (const side of [-1, 1]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.05, h - 0.4, 0.06), ribMat);
    seam.position.set(side * (w / 2 - 0.05), h / 2 + (stack ? 2.55 : 0), 0);
    group.add(seam);
  }
  worldGroup.add(group);

  if (!stack) {
    const cw = Math.abs(Math.cos(ry || 0)) * w + Math.abs(Math.sin(ry || 0)) * d;
    const cd = Math.abs(Math.sin(ry || 0)) * w + Math.abs(Math.cos(ry || 0)) * d;
    registerBox(x, z, cw, cd);
  }
}

function buildCrate(x, z, size, ry, mat) {
  size = size || 1.1;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry || 0;
  const box = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.85, size), mat || MAT.wood);
  box.position.y = size * 0.425;
  box.castShadow = true; box.receiveShadow = true;
  g.add(box);
  World.solids.push(box);
  const braceMat = new THREE.MeshStandardMaterial({ color: 0x4a3522, roughness: 0.9 });
  for (const s of [-1, 1]) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(size * 1.01, size * 0.09, 0.06), braceMat);
    brace.position.set(0, size * 0.425, s * (size / 2 + 0.02));
    brace.rotation.z = s * 0.7;
    g.add(brace);
  }
  worldGroup.add(g);
  registerBox(x, z, size + 0.1, size + 0.1);
  if (Math.random() < 0.5) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(size * 0.7, size * 0.35, size * 0.7), mat || MAT.woodDark);
    top.position.set(rand(-0.1, 0.1), size * 0.85 + size * 0.17, rand(-0.1, 0.1));
    top.castShadow = true;
    g.add(top);
  }
}

function buildSandbags(x, z, ry, len) {
  len = len || 3.2;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry || 0;
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const countHere = r === rows - 1 ? 3 : 4;
    for (let i = 0; i < countHere; i++) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.36, 0.58), MAT.sandbag);
      bag.position.set(-len / 2 + (i + 0.5) * (len / countHere) + (r % 2 ? 0.08 : 0), 0.19 + r * 0.34, rand(-0.04, 0.04));
      bag.rotation.y = rand(-0.06, 0.06);
      bag.castShadow = true; bag.receiveShadow = true;
      g.add(bag);
    }
  }
  worldGroup.add(g);
  const cw = Math.abs(Math.cos(ry || 0)) * len + Math.abs(Math.sin(ry || 0)) * 0.75;
  const cd = Math.abs(Math.sin(ry || 0)) * len + Math.abs(Math.cos(ry || 0)) * 0.75;
  registerBox(x, z, cw, cd);
}

function buildBarrel(x, z, color, fire) {
  const mat = new THREE.MeshStandardMaterial({ color: color || 0x8a3b2d, roughness: 0.6, metalness: 0.35 });
  const b = addCylinder(0.45, 0.42, 1.1, 12, mat, x, 0.55, z, { ray: true });
  addCylinder(0.47, 0.47, 0.06, 12, MAT.black, x, 0.25, z, { ray: false, cast: false });
  addCylinder(0.47, 0.47, 0.06, 12, MAT.black, x, 0.88, z, { ray: false, cast: false });
  registerCircle(x, z, 0.5);
  if (fire) {
    const light = new THREE.PointLight(0xff7b2a, 6, 9, 2);
    light.position.set(x, 1.7, z);
    scene.add(light);
    G.fireBarrels.push({ x, z, light, t: 0 });
  }
}

function buildWatchtower(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x4e4a3d, roughness: 0.95 });
  const offsets = [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]];
  for (const o of offsets) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 5.4, 0.24), legMat);
    leg.position.set(o[0], 2.7, o[1]);
    leg.castShadow = true;
    g.add(leg);
    registerCircle(x + o[0], z + o[1], 0.25);
  }
  // Cross bracing.
  const braceMat = new THREE.MeshStandardMaterial({ color: 0x3c3a32, roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.12, 7.4, 0.12), braceMat);
    brace.position.set(i < 2 ? -1.7 : 1.7, 2.6, i % 2 ? -1.7 : 1.7);
    brace.rotation.z = i % 2 ? 0.42 : -0.42;
    g.add(brace);
  }
  const platform = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 4.4), MAT.woodDark);
  platform.position.y = 5.3;
  platform.castShadow = true; platform.receiveShadow = true;
  g.add(platform); World.solids.push(platform);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.08, 0.08), MAT.woodDark);
  for (let i = 0; i < 4; i++) {
    const r = rail.clone();
    r.position.set(0, 6.1, 0);
    r.rotation.y = i * Math.PI / 2;
    r.position.x = Math.sin(i * Math.PI / 2) * 2.2;
    r.position.z = Math.cos(i * Math.PI / 2) * 2.2;
    g.add(r);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.15, 4.6), MAT.roofRed);
  roof.position.y = 7.0;
  roof.castShadow = true;
  g.add(roof);
  for (const o of offsets) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.5, 0.13), legMat);
    post.position.set(o[0], 6.3, o[1]);
    g.add(post);
  }
  worldGroup.add(g);
}

function buildTree(x, z) {
  const h = rand(4.5, 7.5);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(rand(0.22, 0.35), rand(0.32, 0.48), h * 0.55, 7), MAT.trunk);
  trunk.position.y = h * 0.275;
  trunk.castShadow = true; trunk.receiveShadow = true;
  g.add(trunk);
  World.solids.push(trunk);
  const leafMat = Math.random() < 0.5 ? MAT.leaf1 : MAT.leaf2;
  const crownY = h * 0.62;
  for (let i = 0; i < 3; i++) {
    const r = rand(1.3, 2.3);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leafMat);
    leaf.position.set(rand(-0.7, 0.7), crownY + rand(0, 1.4), rand(-0.7, 0.7));
    leaf.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    leaf.castShadow = true;
    g.add(leaf);
  }
  worldGroup.add(g);
  registerCircle(x, z, 0.55);
}

function buildRock(x, z, r) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), MAT.rock);
  rock.position.set(x, r * 0.55, z);
  rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  rock.castShadow = true; rock.receiveShadow = true;
  worldGroup.add(rock);
  World.solids.push(rock);
  registerCircle(x, z, r * 0.8);
}

function buildGrass() {
  if (!supportsInstancing()) { World.grass = null; return; }
  const geo = new THREE.PlaneGeometry(0.65, 0.7);
  geo.translate(0, 0.35, 0);
  const mat = new THREE.MeshStandardMaterial({
    map: Tex.grassBlade, transparent: false, alphaTest: 0.35,
    side: THREE.DoubleSide, roughness: 1, metalness: 0,
  });
  const count = G.mobile ? 440 : 900;
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  let placed = 0, guard = 0;
  while (placed < count && guard < count * 8) {
    guard++;
    const x = rand(-CFG.MAP, CFG.MAP);
    const z = rand(-CFG.MAP, CFG.MAP);
    if (Math.abs(x) < 5.2 || Math.abs(z) < 4.4) continue;
    if (!isFreeForProp(x, z, 0.2)) continue;
    dummy.position.set(x, 0, z);
    dummy.rotation.y = rand(0, TAU);
    const s = rand(0.65, 1.35);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    inst.setMatrixAt(placed++, dummy.matrix);
  }
  inst.count = placed;
  inst.castShadow = false; inst.receiveShadow = false;
  worldGroup.add(inst);
  World.grass = inst;
}

function buildDust() {
  const count = G.mobile ? 150 : 280;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = rand(-CFG.MAP, CFG.MAP);
    positions[i * 3 + 1] = rand(0.5, 14);
    positions[i * 3 + 2] = rand(-CFG.MAP, CFG.MAP);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xe8d9b0, size: 0.055, transparent: true, opacity: 0.42, depthWrite: false, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  World.dust = pts;
}

function buildFireBarrels() {
  G.fireBarrels = G.fireBarrels || [];
}

// ───────────────────────────────────────────────────────────────────────────
// 12. WORLD ASSEMBLY
// ───────────────────────────────────────────────────────────────────────────
function buildWorld() {
  G.fireBarrels = [];
  buildSky();
  buildLights();
  buildNightLight();
  buildTerrain();

  // Main compound buildings.
  buildBuilding({ x: -24, z: -20, w: 16, d: 11, h: 3.8, door: 'S', wall: 0xd3cab5, roof: 'metal', sign: 'BARRACKS 04', lamp: 120 });
  buildBuilding({ x: 25, z: -24, w: 20, d: 15, h: 5.1, door: 'S', doorW: 4.6, wall: 0xc4c3b1, roof: 'metal', sign: 'WAREHOUSE', lamp: 220 });
  buildBuilding({ x: -27, z: 23, w: 11, d: 9, h: 3.2, door: 'E', wall: 0xd6c4a9, roof: 'red', sign: 'BUNK 02', lamp: 90 });
  buildBuilding({ x: 27, z: 22, w: 8, d: 7, h: 2.9, door: 'W', wall: 0xc9c2ae, roof: 'red', sign: 'STORAGE', lamp: 70 });
  buildBuilding({ x: 1, z: -43, w: 10, d: 8, h: 3.0, door: 'N', wall: 0xbcc0b2, roof: 'metal', sign: 'CHECKPOINT', lamp: 80 });

  // Shipping containers & cover.
  buildContainer(9.5, 12, 0, MAT.blueMetal, false);
  buildContainer(16, 12, 0, MAT.rust, false);
  buildContainer(9.5, 12, 0, MAT.greenMetal, true);
  buildContainer(-10.5, 9, Math.PI / 2, MAT.rust, false);
  buildContainer(15, -8.5, 0, MAT.greenMetal, false);
  buildContainer(-17.5, -4, Math.PI / 2, MAT.blueMetal, false);

  // Crates.
  const crateSpots = [
    [-18, -13, 1.2, 0.2, MAT.wood], [-16.6, -14.4, 1.0, 0.7, MAT.woodDark],
    [20, -17, 1.25, 0.4, MAT.greenCrate], [18.4, -17.8, 0.9, 0.9, MAT.wood],
    [21.2, -17.4, 0.8, 0.1, MAT.woodDark], [-27, 26, 1.1, 0.3, MAT.wood],
    [29, 25, 0.9, 0.8, MAT.woodDark], [3.5, 8.5, 1.0, 0.5, MAT.wood],
    [-2.8, 10.5, 0.85, 0.1, MAT.greenCrate], [-20, 2, 1.1, 0.3, MAT.wood],
    [11.5, -2.5, 0.95, 0.8, MAT.woodDark], [28, -8, 1.1, 0.2, MAT.wood],
    [-6, -13, 1.0, 0.6, MAT.wood], [22.5, 8.5, 0.9, 0.2, MAT.greenCrate],
  ];
  for (const c of crateSpots) buildCrate(c[0], c[1], c[2], c[3], c[4]);

  // Sandbags.
  buildSandbags(0, 17, 0, 3.8);
  buildSandbags(-13, -4, Math.PI / 2, 3.4);
  buildSandbags(20, 4, 0.15, 3.6);
  buildSandbags(-3, -27, Math.PI / 2, 3.2);
  buildSandbags(7, -34, 0, 3.0);
  buildSandbags(-19, 18, 0.25, 3.4);

  // Barrels.
  buildBarrel(18.5, -14, 0x8a3b2d, true);
  buildBarrel(19.6, -13.4, 0x3d5a78, false);
  buildBarrel(-18.5, 19.5, 0x5c6b3c, false);
  buildBarrel(-19.4, 20.4, 0x8a3b2d, false);
  buildBarrel(26.5, -11, 0x3d5a78, false);
  buildBarrel(-9.5, -33, 0x8a3b2d, true);

  // Watchtower and checkpoint details.
  buildWatchtower(-9, -39);
  buildWatchtower(33, -12);

  // Barriers.
  for (const b of [[-6, 3, 0.1], [7, -3, -0.05], [-31, -12, Math.PI / 2], [31, 14, Math.PI / 2]]) {
    const g = new THREE.Group();
    g.position.set(b[0], 0, b[1]);
    g.rotation.y = b[2];
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.55, 0.8), MAT.concreteDark);
    base.position.y = 0.28; base.castShadow = true; base.receiveShadow = true;
    g.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.55, 0.6), MAT.concrete);
    top.position.y = 0.78; top.castShadow = true; top.receiveShadow = true;
    g.add(top);
    worldGroup.add(g);
    registerBox(b[0], b[1], Math.abs(Math.cos(b[2])) * 2.8 + Math.abs(Math.sin(b[2])) * 0.8, Math.abs(Math.sin(b[2])) * 2.8 + Math.abs(Math.cos(b[2])) * 0.8);
  }

  // Trees at the perimeter and handful inside.
  const treeSpots = [
    [-43, -36], [-50, -15], [-45, 8], [-52, 33], [-37, 45], [-20, 49], [-6, 48],
    [12, 48], [26, 46], [42, 42], [49, 24], [51, 4], [48, -18], [43, -38],
    [30, -46], [12, -50], [-8, -50], [-28, -47], [-40, 20], [34, 32],
    [38, -30], [-34, -30], [17, 36], [-14, 37], [36, 6], [-39, 3],
  ];
  for (const t of treeSpots) buildTree(t[0] + rand(-1.5, 1.5), t[1] + rand(-1.5, 1.5));

  // Rocks.
  for (const r of [[-46, 28, 1.8], [44, 34, 2.2], [-40, -44, 2.0], [41, -44, 1.6], [53, -4, 1.4], [-53, -30, 1.7], [53, 37, 1.9]]) {
    buildRock(r[0], r[1], r[2]);
  }

  buildGrass();
  buildDust();
}

// ───────────────────────────────────────────────────────────────────────────
// 13. WEAPON DEFINITIONS
// ───────────────────────────────────────────────────────────────────────────
const WEAPONS = [
  { name: 'P1911', type: 'pistol', dmg: 34, mag: 12, rof: 165, reload: 1000, spread: 0.022, adsSpread: 0.009, range: 110, pellets: 1, reserveCap: Infinity, adsFov: 64, zoom: 1, recoil: 0.010, auto: false, price: 0, ico: '🔫', color: 0x9aa6b2 },
  { name: 'UMP45', type: 'smg', dmg: 26, mag: 30, rof: 82, reload: 1400, spread: 0.030, adsSpread: 0.012, range: 120, pellets: 1, reserveCap: 240, adsFov: 60, zoom: 1, recoil: 0.007, auto: true, price: 850, ico: '🔫', color: 0x3fa9ff },
  { name: 'M416', type: 'ar', dmg: 47, mag: 30, rof: 108, reload: 1800, spread: 0.013, adsSpread: 0.005, range: 190, pellets: 1, reserveCap: 180, adsFov: 50, zoom: 1, recoil: 0.012, auto: true, price: 1600, ico: '🎯', color: 0xffb347 },
  { name: 'S686', type: 'shotgun', dmg: 16, mag: 6, rof: 700, reload: 2300, spread: 0.075, adsSpread: 0.050, range: 42, pellets: 8, reserveCap: 48, adsFov: 62, zoom: 1, recoil: 0.030, auto: false, price: 1200, ico: '💥', color: 0xff5f3b },
  { name: 'Mini14', type: 'dmr', dmg: 62, mag: 20, rof: 245, reload: 1900, spread: 0.0045, adsSpread: 0.0015, range: 250, pellets: 1, reserveCap: 120, adsFov: 32, zoom: 4, recoil: 0.022, auto: false, price: 1900, ico: '🔭', color: 0x63b3ff },
  { name: 'AWM', type: 'sniper', dmg: 220, mag: 5, rof: 1400, reload: 3000, spread: 0.0018, adsSpread: 0.0004, range: 330, pellets: 1, reserveCap: 30, adsFov: 18, zoom: 8, recoil: 0.048, auto: false, price: 0, legendary: true, ico: '🎯', color: 0x68e6a0 },
  { name: 'MINIGUN', type: 'minigun', dmg: 17, mag: 100, rof: 48, reload: 3800, spread: 0.055, adsSpread: 0.032, range: 140, pellets: 1, reserveCap: 500, adsFov: 58, zoom: 1, recoil: 0.006, auto: true, price: 0, legendary: true, ico: '⚙️', color: 0xff8a3d },
  { name: 'GROZA', type: 'ar', dmg: 43, mag: 30, rof: 78, reload: 2100, spread: 0.016, adsSpread: 0.007, range: 170, pellets: 1, reserveCap: 180, adsFov: 48, zoom: 1, recoil: 0.011, auto: true, price: 0, legendary: true, ico: '🔥', color: 0xf05a3c },
];

const RESERVE_CAP = [Infinity, 240, 180, 48, 120, 30, 500, 180];
const MAX_UPGRADE = 3;

function weaponDmg(idx) {
  const lv = G.upgrades[idx] || 0;
  return WEAPONS[idx].dmg * (1 + lv * 0.18);
}
function weaponRof(idx) {
  const lv = G.upgrades[idx] || 0;
  return WEAPONS[idx].rof * (1 - lv * 0.06);
}
function weaponMag(idx) {
  const lv = G.upgrades[idx] || 0;
  return WEAPONS[idx].mag + Math.ceil(WEAPONS[idx].mag * 0.12) * lv;
}
function weaponReload(idx) {
  return WEAPONS[idx].reload * (1 - (G.perks.reload || 0) * 0.09);
}
function currentWeapon() { return WEAPONS[G.weaponIndex]; }

// ───────────────────────────────────────────────────────────────────────────
// 14. VIEWMODEL
// ───────────────────────────────────────────────────────────────────────────
let gunRoot = null, gunMuzzle = null, gunFlash = null, gunLight = null;
let viewParts = [];
let muzzleTimer = 0;
const gunMaterials = {
  metal: new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.34, metalness: 0.82, emissive: 0x0c1014, emissiveIntensity: 0.7 }),
  metalLight: new THREE.MeshStandardMaterial({ color: 0x59626b, roughness: 0.3, metalness: 0.9, emissive: 0x161c22, emissiveIntensity: 0.5 }),
  polymer: new THREE.MeshStandardMaterial({ color: 0x1b1e23, roughness: 0.72, metalness: 0.12, emissive: 0x080a0c, emissiveIntensity: 0.65 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x3a3128, roughness: 0.92, metalness: 0.03, emissive: 0x120e0a, emissiveIntensity: 0.4 }),
  skin: new THREE.MeshStandardMaterial({ color: 0x8a5c3e, roughness: 0.88, metalness: 0.02, emissive: 0x22150e, emissiveIntensity: 0.25 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x0c1a1e, roughness: 0.08, metalness: 0.8, emissive: 0x1a4a44, emissiveIntensity: 0.55 }),
};

function clearViewmodel() {
  if (!gunRoot) return;
  for (let i = gunRoot.children.length - 1; i >= 0; i--) {
    const child = gunRoot.children[i];
    gunRoot.remove(child);
    child.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== gunMaterials.metal && o.material !== gunMaterials.metalLight &&
        o.material !== gunMaterials.polymer && o.material !== gunMaterials.glove && o.material !== gunMaterials.skin &&
        o.material !== gunMaterials.lens && o.material.map !== Tex.spark) {
        o.material.dispose();
      }
    });
  }
  viewParts = [];
}

function makeGunPart(geo, mat, x, y, z, rx, ry, rz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  if (ry) m.rotation.y = ry;
  if (rz) m.rotation.z = rz;
  m.castShadow = false;
  m.receiveShadow = false;
  gunRoot.add(m);
  viewParts.push(m);
  return m;
}

function buildViewmodel() {
  if (!gunRoot) {
    gunRoot = new THREE.Group();
    gunRoot.position.set(0.34, -0.30, -0.78);
    gunRoot.scale.setScalar(0.68);
    camera.add(gunRoot);
    gunLight = new THREE.PointLight(0xffb060, 0, 7, 2);
    gunLight.position.set(0.15, -0.05, -1);
    gunRoot.add(gunLight);
  }
  clearViewmodel();
  if (gunLight && !gunLight.parent) gunRoot.add(gunLight);

  const w = WEAPONS[G.weaponIndex];
  const idx = G.weaponIndex;
  const accent = new THREE.MeshStandardMaterial({
    color: w.color, roughness: 0.38, metalness: 0.55,
    emissive: w.color, emissiveIntensity: 0.22,
  });

  const lengths = [0.26, 0.36, 0.52, 0.58, 0.60, 0.70, 0.64, 0.54];
  const L = lengths[idx] || 0.4;
  const bodyH = idx === 6 ? 0.18 : 0.115;
  const bodyW = idx === 6 ? 0.14 : 0.085;

  // Receiver.
  makeGunPart(new THREE.BoxGeometry(bodyW, bodyH, L), gunMaterials.metal, 0, 0, -L / 2);
  if (idx === 0) {
    // Pistol slide — gives the P1911 a readable silhouette.
    makeGunPart(new THREE.BoxGeometry(bodyW * 0.96, 0.045, L * 0.92), gunMaterials.metalLight, 0, bodyH / 2 + 0.012, -L * 0.46);
  }
  // Top rail.
  makeGunPart(new THREE.BoxGeometry(bodyW * 0.7, 0.025, L * 0.8), gunMaterials.metalLight, 0, bodyH / 2 + 0.014, -L * 0.48);
  // Barrel.
  const brlLen = idx === 6 ? 0.42 : (L * 0.55);
  const brl = makeGunPart(new THREE.CylinderGeometry(0.022, 0.025, brlLen, 8), gunMaterials.metalLight, 0, 0.006, -L - brlLen / 2 + 0.03, Math.PI / 2);
  // Muzzle.
  makeGunPart(new THREE.CylinderGeometry(0.034, 0.034, 0.09, 8), accent, 0, 0.006, -L - brlLen + 0.06, Math.PI / 2);
  // Stock.
  if (idx !== 0) {
    makeGunPart(new THREE.BoxGeometry(bodyW * 0.9, bodyH * 0.8, 0.18), gunMaterials.polymer, 0, -0.01, 0.09);
    makeGunPart(new THREE.BoxGeometry(bodyW * 0.7, 0.03, 0.16), accent, 0, bodyH * 0.38, 0.09);
  }
  // Grip.
  const isPistol = idx === 0;
  makeGunPart(new THREE.BoxGeometry(0.05, isPistol ? 0.12 : 0.16, 0.065), gunMaterials.polymer, 0, isPistol ? -0.10 : -0.13, -0.03, 0.22);
  // Magazine.
  const magH = isPistol ? 0.10 : (idx === 6 ? 0.29 : 0.17);
  makeGunPart(new THREE.BoxGeometry(bodyW * 0.8, magH, 0.085), gunMaterials.polymer, 0, -bodyH / 2 - magH / 2 + 0.02, -L * 0.32, 0.14);
  // Handguard.
  makeGunPart(new THREE.BoxGeometry(bodyW * 1.15, bodyH * 0.85, L * 0.3), accent, 0, -0.002, -L * 0.74);
  // Side accent plate (visible from the player's left).
  makeGunPart(new THREE.BoxGeometry(0.008, 0.04, L * 0.42), accent, -bodyW / 2 - 0.004, -0.006, -L * 0.46);
  // Scope / sights.
  if (w.zoom >= 4) {
    const scope = makeGunPart(new THREE.CylinderGeometry(0.038, 0.042, 0.24, 10), gunMaterials.metal, 0, bodyH / 2 + 0.075, -L * 0.38, Math.PI / 2);
    makeGunPart(new THREE.CylinderGeometry(0.03, 0.03, 0.015, 10), gunMaterials.lens, 0, bodyH / 2 + 0.075, -L * 0.38 - 0.126, Math.PI / 2);
    makeGunPart(new THREE.BoxGeometry(0.035, 0.06, 0.035), gunMaterials.metalLight, 0, bodyH / 2 + 0.035, -L * 0.38);
  } else {
    makeGunPart(new THREE.BoxGeometry(0.028, 0.045, 0.08), gunMaterials.metalLight, 0, bodyH / 2 + 0.035, -L * 0.24);
    makeGunPart(new THREE.BoxGeometry(0.018, 0.018, 0.03), accent, 0, bodyH / 2 + 0.07, -L * 0.24);
  }
  // Hands (right on grip, left on handguard).
  makeGunPart(new THREE.BoxGeometry(0.065, 0.10, 0.075), gunMaterials.glove, 0.005, -0.155, -0.02, 0.3);
  makeGunPart(new THREE.BoxGeometry(0.052, 0.075, 0.09), gunMaterials.skin, 0.01, -0.108, -0.04, 0.35);
  makeGunPart(new THREE.BoxGeometry(0.070, 0.08, 0.11), gunMaterials.glove, -0.01, -0.078, -L * 0.64, -0.15);
  makeGunPart(new THREE.BoxGeometry(0.052, 0.062, 0.085), gunMaterials.skin, 0.005, -0.05, -L * 0.64, -0.1);

  // Muzzle marker + flash sprite.
  gunMuzzle = new THREE.Object3D();
  gunMuzzle.position.set(0, 0.006, -L - brlLen + 0.01);
  gunRoot.add(gunMuzzle);

  gunFlash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: Tex.spark, color: 0xffd27a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  gunFlash.scale.set(0.42, 0.42, 1);
  gunFlash.position.set(0, 0.006, -L - brlLen + 0.03);
  gunRoot.add(gunFlash);

  gunRoot.visible = G.mode === 'playing' || G.mode === 'paused';
}

function updateViewmodel(dt) {
  if (!gunRoot) return;
  const w = currentWeapon();
  const now = nowMs();
  G.adsAmt = damp(G.adsAmt, G.ads ? 1 : 0, 14, dt);
  const ads = G.adsAmt;

  // Base pose — hip vs ADS.
  const hipX = 0.34, hipY = -0.30, hipZ = -0.78;
  const adsX = 0.0, adsY = -0.10, adsZ = -0.60;
  let px = lerp(hipX, adsX, ads);
  let py = lerp(hipY, adsY, ads);
  let pz = lerp(hipZ, adsZ, ads);

  // Bob.
  const bob = Math.sin(G.bobPhase) * 0.011 * (1 - ads * 0.7) * G.bobAmt;
  const bobV = Math.abs(Math.cos(G.bobPhase)) * 0.008 * (1 - ads * 0.7) * G.bobAmt;
  px += bob;
  py += bobV;

  // Sway (damped).
  G.swayX = damp(G.swayX || 0, 0, 9, dt);
  G.swayY = damp(G.swayY || 0, 0, 9, dt);
  px += G.swayX * 0.05 * (1 - ads * 0.4);
  py += G.swayY * 0.05 * (1 - ads * 0.4);

  // Recoil kick.
  G.recoilKick = damp(G.recoilKick, 0, 16, dt);
  pz += G.recoilKick * 0.55;
  let rx = G.recoilKick * 1.6;
  let rz = -G.recoilKick * 0.35;

  // Reload dip + tilt.
  if (G.reloading) {
    const t = clamp(1 - (G.reloadEnd - now) / Math.max(1, G.reloadDuration || 1), 0, 1);
    const s = Math.sin(t * Math.PI);
    py -= s * 0.16;
    rz += s * 0.45;
    rx += s * 0.32;
  }

  // Weapon swap dip.
  if (G.switchT > 0) {
    const s = clamp(G.switchT / 0.28, 0, 1);
    py -= Math.sin(s * Math.PI) * 0.42;
    rz += Math.sin(s * Math.PI) * 0.35;
  }

  gunRoot.position.set(px, py, pz);
  gunRoot.rotation.set(rx, lerp(0.22, 0, ads), rz);

  // Hide viewmodel when fully scoped.
  const scoped = w.zoom >= 4 && ads > 0.72;
  gunRoot.visible = !scoped && (G.mode === 'playing' || G.mode === 'paused');

  // FOV.
  let targetFov = 75;
  if (G.ads) targetFov = w.adsFov;
  if (G.sprinting && !G.ads) targetFov = 81;
  camera.fov = damp(camera.fov, targetFov, 12, dt);
  camera.updateProjectionMatrix();

  // Muzzle flash decay.
  if (muzzleTimer > 0) {
    muzzleTimer -= dt;
    if (muzzleTimer <= 0) {
      if (gunFlash) gunFlash.material.opacity = 0;
      if (gunLight) gunLight.intensity = 0;
    }
  }

  updateScopeUI(scoped);
}

function muzzleFlashVisual() {
  if (gunFlash) {
    gunFlash.material.opacity = 1;
    const s = rand(0.32, 0.55);
    gunFlash.scale.set(s, s, 1);
    gunFlash.material.rotation = rand(0, TAU);
  }
  if (gunLight) gunLight.intensity = 12;
  muzzleTimer = 0.045;
  // World-space flash for atmosphere.
  const p = new THREE.Vector3();
  gunMuzzle.getWorldPosition(p);
  const light = new THREE.PointLight(0xffb060, 10, 9, 2);
  light.position.copy(p);
  scene.add(light);
  addEffect(light, { life: 0.06, maxLife: 0.06, remove: true });
}

// ───────────────────────────────────────────────────────────────────────────
// 15. EFFECTS
// ───────────────────────────────────────────────────────────────────────────
function addEffect(obj, cfg) {  cfg = cfg || {};
  const e = {
    obj, life: cfg.life || 1, maxLife: cfg.life || 1,
    vel: cfg.vel || null, gravity: cfg.gravity || 0,
    fade: cfg.fade !== false, spin: cfg.spin || null,
    grow: cfg.grow || 0, remove: cfg.remove || false,
    geometry: cfg.geometry || null, material: cfg.material || null,
    baseScale: cfg.baseScale || 1,
  };
  G.effects.push(e);
  if (G.effects.length > 260) {
    const old = G.effects.shift();
    cleanupEffect(old);
  }
  return e;
}

function cleanupEffect(e) {
  if (!e || !e.obj) return;
  if (e.obj.parent) e.obj.parent.remove(e.obj);
  if (e.geometry) e.geometry.dispose();
  if (e.material) e.material.dispose();
}

function disposeObject3D(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) {
        for (const m of o.material) m.dispose();
      } else {
        o.material.dispose();
      }
    }
  });
}

function updateEffects(dt) {
  for (let i = G.effects.length - 1; i >= 0; i--) {
    const e = G.effects[i];
    e.life -= dt;
    if (e.life <= 0) {
      cleanupEffect(e);
      G.effects.splice(i, 1);
      continue;
    }
    const o = e.obj;
    if (e.vel) {
      o.position.addScaledVector(e.vel, dt);
      e.vel.y -= e.gravity * dt;
    }
    if (e.fade && o.material && o.material.opacity !== undefined) {
      o.material.opacity = clamp(e.life / e.maxLife, 0, 1) * (e.baseOpacity == null ? 1 : e.baseOpacity);
    }
    if (e.spin && o.rotation) {
      o.rotation.x += e.spin.x * dt;
      o.rotation.y += e.spin.y * dt;
      o.rotation.z += e.spin.z * dt;
    }
    if (e.grow) {
      const s = 1 + (1 - e.life / e.maxLife) * e.grow;
      o.scale.setScalar(s * e.baseScale);
    }
  }

  // Bullet-hole decals fade out and are capped.
  for (let i = G.decals.length - 1; i >= 0; i--) {
    const d = G.decals[i];
    d.life -= dt;
    if (d.life <= 0) {
      if (d.mesh.parent) d.mesh.parent.remove(d.mesh);
      d.mesh.geometry.dispose();
      d.mesh.material.dispose();
      G.decals.splice(i, 1);
    } else if (d.life < 1.5 && d.mesh.material) {
      d.mesh.material.opacity = d.life / 1.5;
    }
  }
}

function spawnTracer(from, to, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({
    color: color || 0xffe18a, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  scene.add(line);
  addEffect(line, { life: 0.075, maxLife: 0.075, material: mat, geometry: geo, baseOpacity: 0.9 });
}

function spawnImpact(point, normal, color) {
  const n = normal || new THREE.Vector3(0, 1, 0);
  // Hot spark flash.
  const spMat = new THREE.SpriteMaterial({ map: Tex.spark, color: color || 0xffc46a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const sprite = new THREE.Sprite(spMat);
  sprite.position.copy(point);
  sprite.scale.setScalar(0.36);
  scene.add(sprite);
  addEffect(sprite, { life: 0.12, maxLife: 0.12, grow: 1.2, material: spMat, baseScale: 0.36 });

  // Sparks.
  for (let i = 0; i < 4; i++) {
    const sMat = new THREE.SpriteMaterial({ map: Tex.spark, color: 0xffb347, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const s = new THREE.Sprite(sMat);
    s.position.copy(point);
    s.scale.setScalar(rand(0.06, 0.12));
    scene.add(s);
    addEffect(s, {
      life: rand(0.22, 0.45), maxLife: 0.45,
      vel: new THREE.Vector3(n.x * 2 + rand(-2.2, 2.2), rand(0.6, 3.2), n.z * 2 + rand(-2.2, 2.2)),
      gravity: 10, material: sMat, baseScale: 0.1,
    });
  }

  // Small dust puff.
  const dMat = new THREE.SpriteMaterial({ map: Tex.smoke, color: 0xb8ad97, transparent: true, opacity: 0.35, depthWrite: false });
  const dust = new THREE.Sprite(dMat);
  dust.position.copy(point).addScaledVector(n, 0.03);
  dust.scale.setScalar(0.5);
  scene.add(dust);
  addEffect(dust, { life: 0.6, maxLife: 0.6, grow: 2.2, material: dMat, baseScale: 0.5, vel: new THREE.Vector3(n.x * 0.4, 0.45, n.z * 0.4) });

  // Decal, but only on mostly-vertical or ground surfaces.
  if (Math.abs(n.y) < 0.95 || point.y < 0.1) {
    const geo = new THREE.PlaneGeometry(0.18, 0.18);
    const mat = new THREE.MeshBasicMaterial({ map: Tex.bulletHole, transparent: true, opacity: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const decal = new THREE.Mesh(geo, mat);
    decal.position.copy(point).addScaledVector(n, 0.012);
    decal.lookAt(point.clone().add(n));
    decal.renderOrder = 3;
    decalGroup.add(decal);
    G.decals.push({ mesh: decal, life: 14 });
    if (G.decals.length > CFG.MAX_DECALS) {
      const old = G.decals.shift();
      if (old.mesh.parent) old.mesh.parent.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
    }
  }
}

function spawnBlood(point, dir) {
  for (let i = 0; i < 7; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: i % 2 ? 0x8e1d1d : 0xb52b2b, transparent: true });
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.055), mat);
    p.position.copy(point);
    scene.add(p);
    addEffect(p, {
      life: rand(0.45, 0.8), maxLife: 0.8,
      vel: new THREE.Vector3(dir.x * rand(1, 3) + rand(-1.4, 1.4), rand(0.8, 2.8), dir.z * rand(1, 3) + rand(-1.4, 1.4)),
      gravity: 12, spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), 0),
      material: mat, geometry: p.geometry,
    });
  }
}

function spawnDeathBurst(pos, color) {
  const flashMat = new THREE.SpriteMaterial({ map: Tex.spark, color: color || 0xff8a5a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = new THREE.Sprite(flashMat);
  flash.position.copy(pos).y += 1;
  flash.scale.setScalar(1.4);
  scene.add(flash);
  addEffect(flash, { life: 0.18, maxLife: 0.18, grow: 2, material: flashMat, baseScale: 1.4 });

  for (let i = 0; i < 14; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: i % 3 ? (color || 0xcc4433) : 0x2a2a2a, transparent: true });
    const p = new THREE.Mesh(new THREE.BoxGeometry(rand(0.06, 0.16), rand(0.06, 0.16), rand(0.06, 0.16)), mat);
    p.position.copy(pos).y += rand(0.3, 1.4);
    scene.add(p);
    addEffect(p, {
      life: rand(0.5, 1.1), maxLife: 1.1,
      vel: new THREE.Vector3(rand(-4.5, 4.5), rand(1.5, 6.5), rand(-4.5, 4.5)),
      gravity: 16, spin: new THREE.Vector3(rand(-10, 10), rand(-10, 10), rand(-10, 10)),
      material: mat, geometry: p.geometry,
    });
  }

  const dustMat = new THREE.SpriteMaterial({ map: Tex.smoke, color: 0x8a7f6d, transparent: true, opacity: 0.45, depthWrite: false });
  const dust = new THREE.Sprite(dustMat);
  dust.position.copy(pos).y += 0.8;
  dust.scale.setScalar(1.4);
  scene.add(dust);
  addEffect(dust, { life: 1.0, maxLife: 1.0, grow: 3, material: dustMat, baseScale: 1.4 });
}

function spawnExplosion(pos) {
  const flashMat = new THREE.SpriteMaterial({ map: Tex.spark, color: 0xffb14a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = new THREE.Sprite(flashMat);
  flash.position.copy(pos).y += 0.4;
  flash.scale.setScalar(2.4);
  scene.add(flash);
  addEffect(flash, { life: 0.35, maxLife: 0.35, grow: 3.5, material: flashMat, baseScale: 2.4 });

  const light = new THREE.PointLight(0xff8a2a, 40, 26, 2);
  light.position.copy(pos).y += 1;
  scene.add(light);
  addEffect(light, { life: 0.22, maxLife: 0.22, remove: true });

  // Ground shockwave ring.
  const ringGeo = new THREE.RingGeometry(0.6, 0.85, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(pos).y = 0.12;
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);
  addEffect(ring, { life: 0.45, maxLife: 0.45, grow: 10, material: ringMat, geometry: ringGeo, baseScale: 1 });

  for (let i = 0; i < 22; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: i % 3 ? 0xff9f3a : 0x3a3530, transparent: true });
    const p = new THREE.Mesh(new THREE.BoxGeometry(rand(0.08, 0.2), rand(0.08, 0.2), rand(0.08, 0.2)), mat);
    p.position.copy(pos).y += 0.5;
    scene.add(p);
    addEffect(p, {
      life: rand(0.5, 1.2), maxLife: 1.2,
      vel: new THREE.Vector3(rand(-9, 9), rand(2, 11), rand(-9, 9)),
      gravity: 18, spin: new THREE.Vector3(rand(-12, 12), rand(-12, 12), 0),
      material: mat, geometry: p.geometry,
    });
  }

  const smokeMat = new THREE.SpriteMaterial({ map: Tex.smoke, color: 0x3d3a36, transparent: true, opacity: 0.6, depthWrite: false });
  for (let i = 0; i < 3; i++) {
    const sm = new THREE.Sprite(smokeMat.clone());
    sm.position.copy(pos).y += rand(1, 2);
    sm.scale.setScalar(rand(1.4, 2.2));
    scene.add(sm);
    addEffect(sm, { life: rand(1.4, 2.2), maxLife: 2.2, grow: 2.8, vel: new THREE.Vector3(rand(-0.6, 0.6), 0.9, rand(-0.6, 0.6)), material: sm.material, baseScale: 1.8 });
  }

  // Screen effects.
  G.camShake = Math.max(G.camShake, 0.55);
  flashVignette(0.5);
  Audio.explosion();
}

function spawnShell() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xd6aa52, roughness: 0.35, metalness: 0.8 });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.045, 6), mat);
  const p = new THREE.Vector3(rand(0.2, 0.3), -0.2, -0.55);
  camera.localToWorld(p);
  shell.position.copy(p);
  scene.add(shell);
  addEffect(shell, {
    life: 0.9, maxLife: 0.9,
    vel: new THREE.Vector3(rand(1.4, 2.6), rand(1.2, 2.4), rand(-0.4, 0.4)),
    gravity: 12, spin: new THREE.Vector3(rand(-20, 20), rand(-20, 20), rand(-20, 20)),
    material: mat, geometry: shell.geometry,
  });
}

function flashVignette(amount) {
  G.vignette = Math.max(G.vignette, amount);
}

// ───────────────────────────────────────────────────────────────────────────
// 16. COMBAT
// ───────────────────────────────────────────────────────────────────────────
function getSpread() {
  const w = currentWeapon();
  let s = G.ads ? w.adsSpread : w.spread;
  if (G.moveAmount > 0.1) s *= 1.55;
  if (!G.onGround) s *= 1.9;
  if (G.crouch) s *= 0.72;
  s *= 1 + G.upgrades[G.weaponIndex] * -0.03;
  return Math.max(0.0004, s);
}

function getMuzzleWorld() {
  const p = new THREE.Vector3();
  camera.updateMatrixWorld();
  if (gunMuzzle) {
    gunRoot.updateWorldMatrix(true, false);
    gunMuzzle.getWorldPosition(p);
  } else {
    camera.localToWorld(p.set(0.25, -0.2, -0.9));
  }
  return p;
}

function fireWeapon() {
  if (G.mode !== 'playing' || !G.running || G.over) return;
  if (G.reloading || G.switchT > 0) return;
  const now = nowMs();
  if (now < G.nextShot) return;

  const idx = G.weaponIndex;
  const w = WEAPONS[idx];
  if (G.ammo[idx] <= 0) {
    Audio.empty();
    G.nextShot = now + 180;
    if (G.reserve[idx] > 0) startReload();
    return;
  }

  G.ammo[idx]--;
  G.shotsFired++;
  G.nextShot = now + weaponRof(idx);
  G.firing = true;
  Audio.shoot(w);
  muzzleFlashVisual();
  spawnShell();
  G.recoilKick = Math.min(0.14, G.recoilKick + w.recoil);
  G.recoil = Math.min(0.085, G.recoil + w.recoil * 0.55);
  G.camShake = Math.max(G.camShake, w.recoil * 1.5);
  G.crossTarget = Math.min(42, G.crossTarget + (w.type === 'shotgun' ? 12 : 5));

  const baseDir = new THREE.Vector3();
  camera.getWorldDirection(baseDir);
  scene.updateMatrixWorld(true);
  const origin = camera.position.clone();
  const muzzle = getMuzzleWorld();
  const pellets = w.pellets || 1;
  const spread = getSpread();
  let anyHit = false;

  for (let p = 0; p < pellets; p++) {
    const dir = baseDir.clone();
    dir.x += rand(-spread, spread) * 3.2;
    dir.y += rand(-spread, spread) * 3.2;
    dir.z += rand(-spread, spread) * 3.2;
    dir.normalize();

    raycaster.set(origin, dir);
    raycaster.far = w.range;
    raycaster.params.Line.threshold = 0.05;

    let wallDist = Infinity;
    let wallHit = null;
    const worldHits = raycaster.intersectObjects(World.solids, false);
    if (worldHits.length) {
      wallDist = worldHits[0].distance;
      wallHit = worldHits[0];
    }

    let best = null, bestDist = Infinity, bestPoint = null, bestPart = 'body';
    for (let ei = 0; ei < G.enemies.length; ei++) {
      const e = G.enemies[ei];
      if (!e.alive || !e.mesh) continue;
      const hits = raycaster.intersectObjects(e.hitMeshes, false);
      if (hits.length && hits[0].distance < bestDist) {
        bestDist = hits[0].distance;
        best = e;
        bestPoint = hits[0].point;
        bestPart = hits[0].object.userData.part || 'body';
      }
    }

    if (best && bestDist < wallDist) {
      const falloff = w.type === 'shotgun' ? clamp(1 - (bestDist / w.range) * 0.55, 0.35, 1) : 1;
      const mult = bestPart === 'head' ? 2.2 : (bestPart === 'limb' ? 0.72 : 1);
      const dmg = weaponDmg(idx) * falloff * mult * (G.ads ? 1.08 : 1);
      damageEnemy(best, dmg, bestPart === 'head', bestPoint, dir);
      spawnBlood(bestPoint, dir);
      anyHit = true;
      spawnTracer(muzzle, bestPoint, 0xffcf7a);
    } else if (wallHit) {
      const normal = wallHit.face ? wallHit.face.normal.clone().transformDirection(wallHit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      spawnImpact(wallHit.point, normal, 0xffc46a);
      spawnTracer(muzzle, wallHit.point, 0xffe0a0);
    } else {
      const far = origin.clone().addScaledVector(dir, w.range);
      spawnTracer(muzzle, far, 0xffe0a0);
    }
  }

  if (anyHit) {
    G.shotsHit++;
    Audio.hit();
  }
  updateAmmoUI();
  if (!anyHit) showHitmarker(null);

  if (G.ammo[idx] === 0) startReload();
}

function damageEnemy(enemy, dmg, isHead, point, dir) {
  if (!enemy || !enemy.alive) return;
  enemy.hp -= dmg;
  G.damageDealt += dmg;
  enemy.lastHitAt = G.elapsed;
  enemy.hpBar.visible = true;
  const pct = clamp(enemy.hp / enemy.maxHp, 0, 1);
  enemy.hpFill.scale.x = Math.max(0.001, pct);

  // Hit flash.
  enemy.flash = 0.12;
  for (const m of enemy.flashMats) {
    if (m.emissive) { m.emissive.setHex(isHead ? 0xff5a5a : 0xffb05a); m.emissiveIntensity = 0.85; }
  }
  enemy.hitLean = 0.25;

  showDamageNumber(point, Math.round(dmg), isHead);
  if (isHead) {
    G.headshots++;
    Audio.headshot();
    showHitmarker('head');
  } else {
    showHitmarker('hit');
  }

  if (enemy.hp <= 0) killEnemy(enemy, isHead);
}

function killEnemy(enemy, wasHead) {
  if (!enemy.alive) return;
  enemy.alive = false;
  enemy.dead = true;
  G.kills++;
  const def = enemy.def;
  let cash = def.cash;
  let score = def.score;
  // Combo multiplier.
  if (G.elapsed - G.comboAt < 3.0) G.combo = Math.min(6, G.combo + 1);
  else G.combo = 1;
  G.comboAt = G.elapsed;
  if (G.combo > 1) {
    cash = Math.round(cash * (1 + (G.combo - 1) * 0.25));
    score = Math.round(score * (1 + (G.combo - 1) * 0.2));
  }
  G.cash += cash;
  G.score += score;

  spawnDeathBurst(enemy.mesh.position, def.accent);
  if (def.boss) {
    G.camShake = 1.2;
    flashVignette(0.8);
    showStreak('BOSS ELIMINATED +' + money(cash));
    setTimeout(() => { if (G.mode === 'playing') spawnAirdrop(true); }, 900);
  }

  const name = def.label || enemy.type.toUpperCase();
  killFeed((wasHead ? '🎯 ' : '💀 ') + name + ' eliminated  +$' + cash + (wasHead ? '  · HEADSHOT' : ''), wasHead ? 'gold' : '');
  dropLootFromEnemy(enemy);
  Audio.kill();
  showHitmarker('kill');

  // Remove mesh and collision.
  if (enemy.mesh.parent) enemy.mesh.parent.remove(enemy.mesh);
  disposeObject3D(enemy.mesh);
  if (enemy.hpBar.parent) enemy.hpBar.parent.remove(enemy.hpBar);
  disposeObject3D(enemy.hpBar);
  if (enemy.laser && enemy.laser.parent) { enemy.laser.parent.remove(enemy.laser); disposeObject3D(enemy.laser); }
  const idx = G.enemies.indexOf(enemy);
  if (idx >= 0) G.enemies.splice(idx, 1);
  updateEnemyUI();
  updateStatsUI();

  // Streak callouts.
  if (G.kills > 0 && G.kills % 10 === 0) showStreak('🔥 ' + G.kills + ' KILL STREAK');
  if (G.combo === 3) showStreak('TRIPLE KILL');
  else if (G.combo === 4) showStreak('RAMPAGE');
  else if (G.combo >= 5) showStreak('UNSTOPPABLE');

  checkWaveClear();
}

function startReload() {
  if (G.reloading || G.mode !== 'playing') return;
  const idx = G.weaponIndex;
  const w = WEAPONS[idx];
  const cap = weaponMag(idx);
  if (G.ammo[idx] >= cap) return;
  if (G.reserve[idx] <= 0) { showToast('NO RESERVE AMMO'); Audio.deny(); return; }
  G.reloading = true;
  G.reloadWeapon = idx;
  G.reloadStart = nowMs();
  G.reloadDuration = weaponReload(idx);
  G.reloadEnd = G.reloadStart + G.reloadDuration;
  G.firing = false;
  Audio.reloadStart();
  UI.reloadBar.classList.remove('hidden');
  UI.reloadFill.style.width = '0%';
}

function completeReload() {
  const idx = G.reloadWeapon;
  if (idx < 0) return;
  const cap = weaponMag(idx);
  let need = cap - G.ammo[idx];
  if (need <= 0) { endReload(); return; }
  const have = G.reserve[idx];
  if (have === Infinity) {
    G.ammo[idx] = cap;
  } else {
    const take = Math.min(need, have);
    G.reserve[idx] -= take;
    G.ammo[idx] += take;
  }
  endReload();
  Audio.reloadEnd();
  updateAmmoUI();
}

function endReload() {
  G.reloading = false;
  G.reloadWeapon = -1;
  UI.reloadBar.classList.add('hidden');
  UI.reloadFill.style.width = '0%';
}

function switchWeapon(idx) {
  if (idx === G.weaponIndex) return;
  if (G.owned.indexOf(idx) === -1) { showToast('WEAPON NOT OWNED'); Audio.deny(); return; }
  if (G.mode !== 'playing' && G.mode !== 'paused') return;
  G.weaponIndex = idx;
  G.reloading = false;
  endReload();
  G.trigger = false;
  G.firing = false;
  G.switchT = 0.28;
  G.nextShot = nowMs() + 200;
  buildViewmodel();
  updateAmmoUI();
  updateWeaponSlots();
  UI.weaponName.textContent = WEAPONS[idx].name;
  Audio.reloadStart();
}

function cycleWeapon(dir) {
  if (G.owned.length < 2) return;
  const sorted = G.owned.slice().sort((a, b) => a - b);
  let at = sorted.indexOf(G.weaponIndex);
  at = (at + dir + sorted.length) % sorted.length;
  switchWeapon(sorted[at]);
}

function updateWeapon(dt, now) {
  if (G.switchT > 0) G.switchT = Math.max(0, G.switchT - dt);
  if (G.reloading) {
    const pct = clamp(1 - (G.reloadEnd - now) / Math.max(1, G.reloadDuration), 0, 1);
    UI.reloadFill.style.width = (pct * 100) + '%';
    if (now >= G.reloadEnd) completeReload();
  }
  if (G.firing && currentWeapon().auto && G.mode === 'playing' && G.running) {
    fireWeapon();
  }
  // Crosshair spread eases toward target.
  G.crossTarget = damp(G.crossTarget, G.ads ? 5 : (G.crouch ? 7 : 11), 8, dt);
  G.crossSpread = damp(G.crossSpread, G.crossTarget, 12, dt);
  updateCrosshair();
}

function updateCrosshair() {
  const s = G.crossSpread;
  const t = UI.chT, b = UI.chB, l = UI.chL, r = UI.chR;
  if (!t) return;
  t.style.transform = 'translateY(' + (-s * 0.45) + 'px)';
  b.style.transform = 'translateY(' + (s * 0.45) + 'px)';
  l.style.transform = 'translateX(' + (-s * 0.45) + 'px)';
  r.style.transform = 'translateX(' + (s * 0.45) + 'px)';
}

// ───────────────────────────────────────────────────────────────────────────
// 17. ENEMY DEFINITIONS / MODELS
// ───────────────────────────────────────────────────────────────────────────
const ENEMY_TYPES = {
  grunt: {
    label: 'GRUNT', hp: 92, speed: 2.35, dmg: 8, rof: 2000, range: 34, acc: 0.50,
    cash: 30, score: 10, scale: 1.0, color: 0x7e3a2d, accent: 0xff6b4a, preferred: 18, melee: false,
  },
  runner: {
    label: 'RUNNER', hp: 68, speed: 5.35, dmg: 12, rof: 850, range: 2.5, acc: 0.92,
    cash: 25, score: 15, scale: 0.9, color: 0xb85a1f, accent: 0xffa53d, preferred: 1.2, melee: true,
  },
  heavy: {
    label: 'JUGGERNAUT', hp: 300, speed: 1.72, dmg: 15, rof: 1450, range: 30, acc: 0.54,
    cash: 80, score: 35, scale: 1.32, color: 0x493b78, accent: 0xa855f7, preferred: 14, melee: false,
  },
  sniper: {
    label: 'MARKSMAN', hp: 82, speed: 2.0, dmg: 25, rof: 2900, range: 66, acc: 0.82,
    cash: 65, score: 25, scale: 1.02, color: 0x2b5744, accent: 0x39ff88, preferred: 40, melee: false, laser: true,
  },
  boss: {
    label: 'WARLORD', hp: 1350, speed: 1.68, dmg: 20, rof: 820, range: 48, acc: 0.64,
    cash: 550, score: 220, scale: 1.95, color: 0x61111f, accent: 0xff2d55, preferred: 20, melee: false, boss: true,
  },
};

function makeSoldier(type) {
  const def = ENEMY_TYPES[type];
  const sc = def.scale;
  const group = new THREE.Group();

  const cloth = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.82, metalness: 0.08 });
  const vest = new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.62, metalness: 0.32 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x9f7152, roughness: 0.9, metalness: 0 });
  const helmet = new THREE.MeshStandardMaterial({ color: 0x1d2229, roughness: 0.5, metalness: 0.45, emissive: def.accent, emissiveIntensity: def.boss ? 0.3 : 0.1 });
  const visor = new THREE.MeshBasicMaterial({ color: def.boss ? 0xff2d55 : 0xff5a4a });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.42, metalness: 0.7 });
  const accentMat = new THREE.MeshStandardMaterial({ color: def.accent, roughness: 0.45, metalness: 0.4, emissive: def.accent, emissiveIntensity: 0.35 });
  const flashMats = [cloth, vest, helmet];
  for (const m of flashMats) m.userData.baseEmissive = m.emissiveIntensity || 0;

  const hitMeshes = [];
  const addPart = (mesh, part) => {
    mesh.userData.part = part;
    mesh.castShadow = part !== 'limb';
    mesh.receiveShadow = false;
    if (!mesh.parent) group.add(mesh);
    hitMeshes.push(mesh);
    return mesh;
  };

  // Legs — pivots so they can swing.
  const legGeo = new THREE.BoxGeometry(0.19 * sc, 0.80 * sc, 0.22 * sc);
  const legL = new THREE.Group();
  const legLMesh = new THREE.Mesh(legGeo, cloth);
  legLMesh.position.y = -0.40 * sc;
  legL.add(legLMesh);
  legL.position.set(0.145 * sc, 0.84 * sc, 0);
  group.add(legL);
  addPart(legLMesh, 'limb');

  const legR = new THREE.Group();
  const legRMesh = new THREE.Mesh(legGeo, cloth);
  legRMesh.position.y = -0.40 * sc;
  legR.add(legRMesh);
  legR.position.set(-0.145 * sc, 0.84 * sc, 0);
  group.add(legR);
  addPart(legRMesh, 'limb');

  // Boots.
  for (const s of [0.145, -0.145]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.21 * sc, 0.16 * sc, 0.30 * sc), vest);
    boot.position.set(s * sc, 0.08 * sc, 0.05 * sc);
    boot.castShadow = false;
    group.add(boot);
    hitMeshes.push(boot); boot.userData.part = 'limb';
  }

  // Torso + vest + belt.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54 * sc, 0.66 * sc, 0.30 * sc), cloth);
  torso.position.y = 1.22 * sc;
  addPart(torso, 'body');
  const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.60 * sc, 0.40 * sc, 0.36 * sc), vest);
  vestMesh.position.y = 1.24 * sc;
  addPart(vestMesh, 'body');
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.55 * sc, 0.10 * sc, 0.33 * sc), vest);
  belt.position.y = 0.93 * sc;
  group.add(belt);
  hitMeshes.push(belt); belt.userData.part = 'body';

  // Shoulders.
  for (const s of [1, -1]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.18 * sc, 0.18 * sc, 0.30 * sc), vest);
    pad.position.set(s * 0.35 * sc, 1.48 * sc, 0);
    addPart(pad, 'limb');
  }

  // Arms (raised, holding the rifle).
  const armGeo = new THREE.BoxGeometry(0.14 * sc, 0.55 * sc, 0.16 * sc);
  const armL = new THREE.Group();
  const armLMesh = new THREE.Mesh(armGeo, cloth);
  armLMesh.position.y = -0.275 * sc;
  armL.add(armLMesh);
  armL.position.set(0.34 * sc, 1.48 * sc, 0.02 * sc);
  armL.rotation.x = -1.28;
  armL.rotation.z = 0.18;
  group.add(armL);
  addPart(armLMesh, 'limb');

  const armR = new THREE.Group();
  const armRMesh = new THREE.Mesh(armGeo, cloth);
  armRMesh.position.y = -0.275 * sc;
  armR.add(armRMesh);
  armR.position.set(-0.34 * sc, 1.48 * sc, 0.02 * sc);
  armR.rotation.x = -1.28;
  armR.rotation.z = -0.18;
  group.add(armR);
  addPart(armRMesh, 'limb');

  // Head, helmet, visor.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * sc, 0.11 * sc, 0.12 * sc, 8), skin);
  neck.position.y = 1.49 * sc;
  group.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.215 * sc, 14, 12), skin);
  head.position.y = 1.66 * sc;
  addPart(head, 'head');
  const helmetMesh = new THREE.Mesh(new THREE.SphereGeometry(0.245 * sc, 14, 10, 0, TAU, 0, Math.PI / 1.75), helmet);
  helmetMesh.position.y = 1.69 * sc;
  addPart(helmetMesh, 'head');
  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.27 * sc, 0.065 * sc, 0.045 * sc), visor);
  visorMesh.position.set(0, 1.67 * sc, 0.195 * sc);
  group.add(visorMesh);

  // Rifle.
  const rifle = new THREE.Group();
  const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.075 * sc, 0.09 * sc, 0.78 * sc), gunMat);
  rifle.add(rBody);
  const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.06 * sc, 0.15 * sc, 0.09 * sc), gunMat);
  rMag.position.set(0, -0.10 * sc, 0.04 * sc);
  rifle.add(rMag);
  const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * sc, 0.02 * sc, 0.22 * sc, 7), accentMat);
  rBarrel.rotation.x = Math.PI / 2;
  rBarrel.position.set(0, 0.015 * sc, 0.48 * sc);
  rifle.add(rBarrel);
  rifle.position.set(0, 1.28 * sc, 0.34 * sc);
  group.add(rifle);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02 * sc, 0.62 * sc);
  rifle.add(muzzle);

  // Ground shadow blob.
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55 * sc, 16), shadowMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.015;
  group.add(blob);

  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armL = armL;
  group.userData.armR = armR;
  group.userData.rifle = rifle;
  group.userData.muzzle = muzzle;
  group.userData.flashMats = flashMats;

  return { group, hitMeshes, flashMats, muzzle, legL, legR, armL, armR, visor, shadowMat };
}

function makeHealthBar() {
  const bar = new THREE.Group();
  const bgGeo = new THREE.PlaneGeometry(1.14, 0.115);
  const bgMat = new THREE.MeshBasicMaterial({ color: 0x0a0d12, transparent: true, opacity: 0.85, depthWrite: false });
  const bg = new THREE.Mesh(bgGeo, bgMat);
  bg.renderOrder = 20;
  bar.add(bg);

  const fillGeo = new THREE.PlaneGeometry(1.08, 0.075);
  fillGeo.translate(0.54, 0, 0);
  const fillMat = new THREE.MeshBasicMaterial({ color: 0x74f0a6, transparent: true, opacity: 0.95, depthWrite: false });
  const fill = new THREE.Mesh(fillGeo, fillMat);
  fill.position.set(-0.54, 0, 0.001);
  fill.renderOrder = 21;
  bar.add(fill);

  bar.visible = false;
  bar.userData.noHit = true;
  return { bar, fill, fillMat, bgMat, fillGeo, bgGeo };
}

function enemyScale(enemy) { return enemy.def.scale; }

function findSpawnPoint(minDist, maxDist) {
  minDist = minDist || 24;
  maxDist = maxDist || 48;
  const px = camera.position.x, pz = camera.position.z;
  for (let tries = 0; tries < 60; tries++) {
    const a = rand(0, TAU);
    const r = rand(minDist, maxDist);
    const x = clamp(px + Math.cos(a) * r, -CFG.MAP + 4, CFG.MAP - 4);
    const z = clamp(pz + Math.sin(a) * r, -CFG.MAP + 4, CFG.MAP - 4);
    if (Math.hypot(x - px, z - pz) < minDist * 0.8) continue;
    if (pointInBuilding(x, z, 1.2)) continue;
    let free = true;
    for (let i = 0; i < World.obstacles.length; i++) {
      const o = World.obstacles[i];
      if (o.type === 'box') {
        if (x > o.minX - 1.0 && x < o.maxX + 1.0 && z > o.minZ - 1.0 && z < o.maxZ + 1.0) { free = false; break; }
      } else if (Math.hypot(x - o.x, z - o.z) < o.r + 1.0) { free = false; break; }
    }
    if (free) return { x, z };
  }
  // Fallback: an open point at the map edge.
  return { x: clamp(px + rand(-30, 30), -CFG.MAP + 5, CFG.MAP - 5), z: clamp(pz + rand(-30, 30), -CFG.MAP + 5, CFG.MAP - 5) };
}

function spawnEnemy(type, at) {
  if (G.enemies.length >= CFG.MAX_ENEMIES) return null;
  const def = ENEMY_TYPES[type] || ENEMY_TYPES.grunt;
  const pos = at || findSpawnPoint(type === 'boss' ? 26 : 22, type === 'boss' ? 40 : 50);
  const model = makeSoldier(type);
  const group = model.group;
  group.position.set(pos.x, 0, pos.z);
  enemyGroup.add(group);

  const hpInfo = makeHealthBar();
  scene.add(hpInfo.bar);

  const hp = def.boss ? Math.round(def.hp + G.wave * 95) : Math.round(def.hp * (1 + Math.max(0, G.wave - 1) * 0.055));
  const e = {
    type, def, mesh: group, hp, maxHp: hp,
    hpBar: hpInfo.bar, hpFill: hpInfo.fill, hpFillMat: hpInfo.fillMat,
    hitMeshes: model.hitMeshes, flashMats: model.flashMats,
    muzzle: model.muzzle, legL: model.legL, legR: model.legR,
    armL: model.armL, armR: model.armR,
    alive: true, dying: false,
    lastShot: 0, strafeDir: Math.random() < 0.5 ? 1 : -1, strafeTimer: rand(0.5, 2),
    walkPhase: rand(0, TAU), lastHitAt: -99, flash: 0, hitLean: 0,
    los: true, losCheck: 0, aimTime: 0, burstLeft: 0, burstAt: 0,
    laser: null, laserMat: null, laserGeo: null,
  };

  if (def.laser) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineBasicMaterial({ color: 0xff3d4d, transparent: true, opacity: 0.36, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    e.laser = line; e.laserMat = mat; e.laserGeo = geo;
  }

  G.enemies.push(e);
  updateEnemyUI();

  // Spawn flare.
  const light = new THREE.PointLight(def.accent, 12, 10, 2);
  light.position.set(pos.x, 1.2, pos.z);
  scene.add(light);
  addEffect(light, { life: 0.5, maxLife: 0.5, remove: true });
  const smMat = new THREE.SpriteMaterial({ map: Tex.smoke, color: def.accent, transparent: true, opacity: 0.5, depthWrite: false });
  const sm = new THREE.Sprite(smMat);
  sm.position.set(pos.x, 1.2, pos.z);
  sm.scale.setScalar(1.6);
  scene.add(sm);
  addEffect(sm, { life: 0.9, maxLife: 0.9, grow: 2.5, material: smMat, baseScale: 1.6, vel: new THREE.Vector3(0, 1.3, 0) });

  if (def.boss) { showBossIntro(); }
  return e;
}

// ───────────────────────────────────────────────────────────────────────────
// 18. ENEMY AI
// ───────────────────────────────────────────────────────────────────────────
function hasLineOfSight(fromPos, toPos) {
  const o = fromPos.clone();
  o.y = 1.25;
  const d = toPos.clone().sub(o);
  const dist = d.length();
  if (dist < 0.5) return true;
  d.normalize();
  losRaycaster.set(o, d);
  losRaycaster.far = dist - 0.7;
  const hits = losRaycaster.intersectObjects(World.solids, false);
  return hits.length === 0;
}

function enemyMuzzleWorld(e) {
  const p = new THREE.Vector3();
  e.muzzle.getWorldPosition(p);
  return p;
}

function enemyShoot(e, now) {
  const def = e.def;
  const muzzle = enemyMuzzleWorld(e);
  const target = camera.position.clone();
  const dist = muzzle.distanceTo(target);
  const dir = target.clone().sub(muzzle).normalize();

  // Accuracy shrinks with movement, crouch and range.
  let chance = def.acc;
  chance -= (dist / def.range) * 0.18;
  if (G.moveAmount > 0.1) chance -= 0.11;
  if (G.sprinting) chance -= 0.08;
  if (G.crouch) chance -= 0.045;
  if (!G.onGround) chance -= 0.04;
  chance = clamp(chance, 0.12, 0.94);

  const hit = Math.random() < chance;
  const end = target.clone();
  if (!hit) {
    const spread = 0.16 + dist * 0.004;
    end.x += rand(-spread, spread) * 12;
    end.y += rand(-0.5, 0.9);
    end.z += rand(-spread, spread) * 12;
  }

  spawnTracer(muzzle, end, hit ? 0xff6a5a : 0xffa080);
  spawnEnemyMuzzle(e);
  Audio.enemyShot(def.laser ? 'sniper' : (def.boss ? 'boss' : 'grunt'));

  if (hit) {
    damagePlayer(def.dmg * (def.boss ? 1.05 : 1), e.mesh.position);
  }
  e.lastShot = now;
  if (e.laser) { e.laser.visible = false; }
}

function spawnEnemyMuzzle(e) {
  const p = enemyMuzzleWorld(e);
  const light = new THREE.PointLight(0xffb060, 7, 7, 2);
  light.position.copy(p);
  scene.add(light);
  addEffect(light, { life: 0.05, maxLife: 0.05, remove: true });
  const mat = new THREE.SpriteMaterial({ map: Tex.spark, color: 0xffc46a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.position.copy(p);
  s.scale.setScalar(0.36);
  scene.add(s);
  addEffect(s, { life: 0.07, maxLife: 0.07, material: mat, baseScale: 0.36 });
}

function pushOutOfObstacles(pos, radius) {
  const obs = World.obstacles;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (o.type === 'box') {
      const cx = clamp(pos.x, o.minX, o.maxX);
      const cz = clamp(pos.z, o.minZ, o.maxZ);
      const dx = pos.x - cx, dz = pos.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        if (d < 0.0001) {
          const left = pos.x - o.minX, right = o.maxX - pos.x;
          const front = pos.z - o.minZ, back = o.maxZ - pos.z;
          const m = Math.min(left, right, front, back);
          if (m === left) pos.x = o.minX - radius;
          else if (m === right) pos.x = o.maxX + radius;
          else if (m === front) pos.z = o.minZ - radius;
          else pos.z = o.maxZ + radius;
        } else {
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        }
      }
    } else {
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const d = Math.hypot(dx, dz);
      const minR = o.r + radius;
      if (d < minR && d > 0.0001) {
        pos.x = o.x + (dx / d) * minR;
        pos.z = o.z + (dz / d) * minR;
      }
    }
  }
}

function updateEnemies(dt, now) {
  const px = camera.position.x, pz = camera.position.z;
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (!e.alive) continue;
    const m = e.mesh;
    let dx = px - m.position.x;
    let dz = pz - m.position.z;
    let dist = Math.hypot(dx, dz) || 0.001;

    m.rotation.y = Math.atan2(dx, dz);

    // Flash decay.
    if (e.flash > 0) {
      e.flash -= dt;
      if (e.flash <= 0) {
        for (const mm of e.flashMats) if (mm.emissive) mm.emissiveIntensity = mm.userData.baseEmissive || 0;
      }
    }

    // Periodic line-of-sight.
    e.losCheck -= dt;
    if (e.losCheck <= 0) {
      e.los = hasLineOfSight(m.position, camera.position);
      e.losCheck = 0.18 + Math.random() * 0.16;
    }

    // Movement.
    const def = e.def;
    const speed = def.speed * (1 + Math.min(0.22, G.wave * 0.018));
    let mx = 0, mz = 0;
    const preferred = def.preferred;
    if (dist > preferred + 2.5) {
      mx = (dx / dist) * speed;
      mz = (dz / dist) * speed;
    } else if (dist < preferred - 3.5) {
      mx = -(dx / dist) * speed * 0.7;
      mz = -(dz / dist) * speed * 0.7;
    }
    e.strafeTimer -= dt;
    if (e.strafeTimer <= 0) {
      e.strafeTimer = rand(0.8, 2.8);
      e.strafeDir *= -1;
    }
    const perpX = -dz / dist, perpZ = dx / dist;
    const strafeAmt = def.melee ? 0.75 : 0.46;
    mx += perpX * e.strafeDir * speed * strafeAmt;
    mz += perpZ * e.strafeDir * speed * strafeAmt;

    // Bosses don't strafe much.
    if (def.boss) { mx *= 0.55; mz *= 0.55; }

    const oldX = m.position.x, oldZ = m.position.z;
    m.position.x += mx * dt;
    m.position.z += mz * dt;
    pushOutOfObstacles(m.position, 0.55 * def.scale);

    // Enemy separation.
    for (let j = 0; j < G.enemies.length; j++) {
      if (j === i) continue;
      const o = G.enemies[j];
      if (!o.alive) continue;
      const sx = m.position.x - o.mesh.position.x;
      const sz = m.position.z - o.mesh.position.z;
      const sd = Math.hypot(sx, sz);
      const sr = 0.55 * (def.scale + o.def.scale);
      if (sd < sr && sd > 0.0001) {
        const push = (sr - sd) * 0.5;
        m.position.x += (sx / sd) * push;
        m.position.z += (sz / sd) * push;
      }
    }

    // Keep out of the player's body.
    const pdx = m.position.x - px, pdz = m.position.z - pz;
    const pd = Math.hypot(pdx, pdz);
    const stopR = 0.55 + 0.5 * def.scale;
    if (pd < stopR && pd > 0.0001) {
      m.position.x = px + (pdx / pd) * stopR;
      m.position.z = pz + (pdz / pd) * stopR;
    }

    // Bounds.
    m.position.x = clamp(m.position.x, -CFG.MAP + 1.5, CFG.MAP - 1.5);
    m.position.z = clamp(m.position.z, -CFG.MAP + 1.5, CFG.MAP - 1.5);
    m.position.y = 0;

    // Walk animation.
    const moved = Math.hypot(m.position.x - oldX, m.position.z - oldZ);
    e.walkPhase += dt * (2 + moved * 5.8);
    const swing = Math.sin(e.walkPhase) * Math.min(0.7, moved * 5);
    if (e.legL) e.legL.rotation.x = swing;
    if (e.legR) e.legR.rotation.x = -swing;
    if (e.armL) e.armL.rotation.x = -1.28 + Math.sin(e.walkPhase * 2) * 0.04;
    // Hit lean.
    e.hitLean = damp(e.hitLean, 0, 10, dt);
    m.rotation.z = e.hitLean * 0.5;

    // Health bar.
    const showBar = e.hp < e.maxHp || (G.elapsed - e.lastHitAt < 3) || def.boss;
    e.hpBar.visible = showBar;
    if (showBar) {
      e.hpBar.position.set(m.position.x, 2.25 * def.scale + 0.35, m.position.z);
      e.hpBar.quaternion.copy(camera.quaternion);
      const pct = clamp(e.hp / e.maxHp, 0, 1);
      e.hpFill.scale.x = Math.max(0.001, pct);
      e.hpFillMat.color.setHex(pct > 0.5 ? 0x74f0a6 : pct > 0.22 ? 0xffc247 : 0xff4d5e);
    }

    // Sniper laser sight.
    if (e.laser) {
      if (e.los && dist < def.range && now - e.lastShot > def.rof * 0.35) {
        const o = enemyMuzzleWorld(e);
        e.laserGeo.setFromPoints([o, camera.position.clone()]);
        e.laser.visible = true;
        e.laserMat.opacity = 0.18 + Math.abs(Math.sin(now * 0.006)) * 0.2;
      } else {
        e.laser.visible = false;
      }
    }

    // Attack.
    const canSee = e.los && dist < def.range;
    if (def.melee) {
      if (dist < 2.3 && e.los && now - e.lastShot > def.rof) {
        e.lastShot = now;
        damagePlayer(def.dmg, m.position);
        flashVignette(0.5);
        G.camShake = Math.max(G.camShake, 0.3);
        Audio.enemyShot('melee');
      }
    } else if (canSee) {
      if (def.boss) {
        if (e.burstLeft > 0 && now >= e.burstAt) {
          e.burstLeft--;
          e.burstAt = now + 105;
          enemyShoot(e, now);
          if (e.burstLeft === 0) e.lastShot = now;
        } else if (e.burstLeft === 0 && now - e.lastShot > def.rof) {
          e.burstLeft = 5;
          e.burstAt = 0;
          e.lastShot = now - def.rof + 180;
        }
      } else if (now - e.lastShot > def.rof) {
        // Snipers take a moment to settle before firing.
        if (def.laser) {
          e.aimTime += dt;
          if (e.aimTime > 0.55) { e.aimTime = 0; enemyShoot(e, now); }
        } else {
          enemyShoot(e, now);
        }
      }
    } else if (!def.melee && now - e.lastShot > def.rof * 2.4) {
      // Suppressing fire when the player is not visible, so the arena stays loud.
      if (Math.random() < 0.35) {
        const o = enemyMuzzleWorld(e);
        const end = camera.position.clone().add(new THREE.Vector3(rand(-4, 4), rand(-1, 2), rand(-4, 4)));
        spawnTracer(o, end, 0xff8a70);
        spawnEnemyMuzzle(e);
        e.lastShot = now;
        Audio.enemyShot('grunt');
      }
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 19. PLAYER DAMAGE / HEALING
// ───────────────────────────────────────────────────────────────────────────
function damagePlayer(amount, sourcePos) {
  if (G.mode !== 'playing' || G.over) return;
  let dmg = amount;
  if (G.armor > 0) {
    const absorb = Math.min(G.armor, dmg * 0.62);
    G.armor -= absorb;
    dmg -= absorb;
    Audio.armorHit();
  }
  G.hp -= dmg;
  G.lastDamage = G.elapsed;
  G.combo = 0;
  flashVignette(clamp(0.35 + amount / 70, 0.35, 1));
  G.camShake = Math.max(G.camShake, clamp(amount / 55, 0.2, 0.9));
  if (sourcePos) showDamageDirection(sourcePos);
  Audio.hurt();
  updateHPUI();
  if (G.hp <= 0) {
    G.hp = 0;
    updateHPUI();
    gameOver();
  }
}

function healPlayer(amount) {
  if (G.mode !== 'playing' && G.mode !== 'paused') return;
  G.hp = Math.min(G.maxHp, G.hp + amount);
  updateHPUI();
  G.vignette = 0;
  Audio.pickup();
}

function useMedkit() {
  if (G.mode !== 'playing' || !G.running) return;
  if (G.medkits <= 0) { showToast('NO MEDKITS LEFT'); Audio.deny(); return; }
  if (G.hp >= G.maxHp) { showToast('HEALTH IS FULL'); Audio.deny(); return; }
  G.medkits--;
  healPlayer(55);
  updateConsumablesUI();
  showToast('+55 HP');
  flashHeal();
}

function useArmorPlate() {
  if (G.mode !== 'playing' || !G.running) return;
  if (G.plates <= 0) { showToast('NO ARMOR PLATES'); Audio.deny(); return; }
  if (G.armor >= G.maxArmor) { showToast('ARMOR IS FULL'); Audio.deny(); return; }
  G.plates--;
  G.armor = Math.min(G.maxArmor, G.armor + 50);
  updateArmorUI();
  updateConsumablesUI();
  showToast('+50 ARMOR');
  Audio.buy();
}

// ───────────────────────────────────────────────────────────────────────────
// 20. LOOT
// ───────────────────────────────────────────────────────────────────────────
const LOOT_COLORS = {
  weapon: 0x3fa9ff, ammo: 0xff9f1c, health: 0x2ee08a,
  armor: 0x63b3ff, grenade: 0xff5f3b, cash: 0xf7c04a,
};

function makeLootMesh(kind) {
  const col = LOOT_COLORS[kind] || 0xffffff;
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.34, metalness: 0.45 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 0.48), mat);
  box.castShadow = true;
  g.add(box);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.52), new THREE.MeshStandardMaterial({ color: 0x1a1f26, roughness: 0.6, metalness: 0.4 }));
  lid.position.y = 0.19;
  g.add(lid);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.44, 0.58, 24),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.31;
  g.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 2.2, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  beam.position.y = 1.1;
  g.add(beam);
  return g;
}

function spawnLoot(kind, x, z, payload, label) {
  const mesh = makeLootMesh(kind);
  mesh.position.set(x, 0.7, z);
  lootGroup.add(mesh);
  const item = {
    kind, mesh, payload: payload || {},
    label: label || kind.toUpperCase(),
    baseY: 0.7, phase: rand(0, TAU), spin: rand(0.5, 1.4),
  };
  G.loot.push(item);
  return item;
}

function clearLoot() {
  for (const it of G.loot) {
    if (it.mesh.parent) it.mesh.parent.remove(it.mesh);
    disposeObject3D(it.mesh);
  }
  G.loot.length = 0;
  G.nearLoot = null;
  if (UI.lootPrompt) UI.lootPrompt.classList.add('hidden');
}

function spawnRandomLoot() {
  clearLoot();
  const spots = [
    [-27.5, -18.5], [-21.5, -22], [-22, -13.5],
    [23, -24], [28, -28], [21.5, -30],
    [-28, 22], [-24.5, 26], [25, 23], [29, 19],
    [2, -41], [-2, -39], [3, 9.5], [-8.5, 10.5],
    [18.5, 9.5], [-20, 5], [12, -17], [-11, -17],
    [37, 0], [-37, 0], [0, 37], [0, -33],
  ];
  const shuffled = spots.sort(() => Math.random() - 0.5);
  const count = 10 + Math.min(6, G.wave);
  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const p = shuffled[i];
    const r = Math.random();
    let kind, label, payload = {};
    if (r < 0.30) {
      kind = 'ammo'; label = 'AMMO';
    } else if (r < 0.50) {
      kind = 'health'; label = 'MEDKIT';
    } else if (r < 0.68) {
      kind = 'armor'; label = 'ARMOR PLATE';
    } else if (r < 0.82) {
      kind = 'grenade'; label = 'GRENADE';
    } else if (r < 0.92) {
      kind = 'cash'; label = 'CASH';
    } else {
      const pool = [1, 2, 3, 4].filter((idx) => G.owned.indexOf(idx) === -1);
      if (pool.length === 0) { kind = 'ammo'; label = 'AMMO'; }
      else {
        const wi = pick(pool);
        kind = 'weapon'; label = WEAPONS[wi].name; payload = { weaponIndex: wi };
      }
    }
    spawnLoot(kind, p[0] + rand(-0.4, 0.4), p[1] + rand(-0.4, 0.4), payload, label);
  }
}

function dropLootFromEnemy(enemy) {
  if (!enemy) return;
  const chance = enemy.def.boss ? 1 : 0.42;
  if (Math.random() > chance) return;
  const p = enemy.mesh.position;
  const r = Math.random();
  let kind = 'ammo', label = 'AMMO', payload = {};
  if (enemy.def.boss) {
    kind = 'armor'; label = 'ARMOR PLATE';
  } else if (r < 0.26) {
    kind = 'health'; label = 'MEDKIT';
  } else if (r < 0.46) {
    kind = 'armor'; label = 'ARMOR PLATE';
  } else if (r < 0.62) {
    kind = 'grenade'; label = 'GRENADE';
  } else if (r < 0.76) {
    kind = 'cash'; label = 'CASH';
  } else if (r < 0.84) {
    const pool = [1, 2, 3, 4].filter((idx) => G.owned.indexOf(idx) === -1);
    if (pool.length) {
      const wi = pick(pool);
      kind = 'weapon'; label = WEAPONS[wi].name; payload = { weaponIndex: wi };
    }
  }
  spawnLoot(kind, clamp(p.x + rand(-0.5, 0.5), -CFG.MAP + 2, CFG.MAP - 2), clamp(p.z + rand(-0.5, 0.5), -CFG.MAP + 2, CFG.MAP - 2), payload, label);
}

function updateLoot(dt) {
  let nearest = null, nearestDist = 2.8;
  for (let i = 0; i < G.loot.length; i++) {
    const it = G.loot[i];
    it.phase += dt * 2.2;
    it.mesh.position.y = it.baseY + Math.sin(it.phase) * 0.10;
    it.mesh.rotation.y += dt * it.spin;
    const d = Math.hypot(camera.position.x - it.mesh.position.x, camera.position.z - it.mesh.position.z);
    if (d < nearestDist) { nearest = it; nearestDist = d; }
  }
  G.nearLoot = nearest;
}

function applyLoot(it) {
  if (it.kind === 'weapon') {
    const wi = it.payload.weaponIndex;
    if (G.owned.indexOf(wi) === -1) {
      G.owned.push(wi);
      G.ammo[wi] = weaponMag(wi);
      G.reserve[wi] = Math.min(RESERVE_CAP[wi], Math.round(WEAPONS[wi].mag * 3));
      switchWeapon(wi);
      showToast('PICKED UP ' + WEAPONS[wi].name);
    } else {
      G.ammo[wi] = weaponMag(wi);
      G.reserve[wi] = Math.min(RESERVE_CAP[wi], G.reserve[wi] + Math.round(WEAPONS[wi].mag * 2));
      showToast(WEAPONS[wi].name + ' AMMO REFILLED');
    }
  } else if (it.kind === 'ammo') {
    const idx = G.weaponIndex;
    G.ammo[idx] = weaponMag(idx);
    if (G.reserve[idx] !== Infinity) {
      G.reserve[idx] = Math.min(RESERVE_CAP[idx], G.reserve[idx] + Math.round(WEAPONS[idx].mag * 2));
    }
    updateAmmoUI();
    showToast('AMMO RESUPPLIED');
  } else if (it.kind === 'health') {
    G.medkits++;
    updateConsumablesUI();
    showToast('+1 MEDKIT');
  } else if (it.kind === 'armor') {
    G.plates++;
    updateConsumablesUI();
    showToast('+1 ARMOR PLATE');
  } else if (it.kind === 'grenade') {
    G.grenades += 2;
    updateConsumablesUI();
    showToast('+2 GRENADES');
  } else if (it.kind === 'cash') {
    G.cash += 75;
    updateStatsUI();
    showToast('+$75');
  }
  Audio.pickup();
}

function tryPickup() {
  if (G.mode !== 'playing' || !G.running) return;
  if (G.nearAirdrop) { openAirdrop(G.nearAirdrop); return; }
  if (!G.nearLoot) return;
  const it = G.nearLoot;
  applyLoot(it);
  if (it.mesh.parent) it.mesh.parent.remove(it.mesh);
  disposeObject3D(it.mesh);
  const idx = G.loot.indexOf(it);
  if (idx >= 0) G.loot.splice(idx, 1);
  G.nearLoot = null;
}

// ───────────────────────────────────────────────────────────────────────────
// 21. AIRDROPS
// ───────────────────────────────────────────────────────────────────────────
function makeParachute() {
  const g = new THREE.Group();
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c6, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8, 0, TAU, 0, Math.PI / 2.1), canopyMat);
  canopy.rotation.x = Math.PI;
  canopy.position.y = 2.7;
  g.add(canopy);
  const strapMat = new THREE.MeshBasicMaterial({ color: 0x3c3f42 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.5, 4), strapMat);
    strap.position.set(Math.cos(a) * 0.7, 1.3, Math.sin(a) * 0.7);
    strap.rotation.z = Math.cos(a) * 0.35;
    strap.rotation.x = -Math.sin(a) * 0.35;
    g.add(strap);
  }
  return g;
}

function spawnAirdropPlane() {
  if (G.plane && G.plane.mesh.parent) scene.remove(G.plane.mesh);
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6d7478, roughness: 0.55, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(8, 1.3, 1.4), bodyMat);
  g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 11), bodyMat);
  g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 0.16), bodyMat);
  tail.position.set(-3.4, 0.9, 0);
  g.add(tail);
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 3.4), bodyMat);
  tailWing.position.set(-3.4, 0.8, 0);
  g.add(tailWing);
  for (const z of [-2.4, 2.4]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 4.2, 8), MAT.black);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(0, -0.5, z);
    g.add(engine);
  }
  g.position.set(-90, 42, -45);
  g.rotation.y = 0.35;
  scene.add(g);
  G.plane = { mesh: g, life: 16, vy: 0 };
}

function spawnAirdrop(forced) {
  const p = findSpawnPoint(18, 44);
  const x = p.x, z = p.z;
  const group = new THREE.Group();
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 1.55, 1.55),
    new THREE.MeshStandardMaterial({ color: 0x7a5b30, roughness: 0.68, metalness: 0.3 })
  );
  crate.castShadow = true;
  group.add(crate);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(1.62, 0.22, 1.62),
    new THREE.MeshStandardMaterial({ color: 0xf7c04a, emissive: 0xf7c04a, emissiveIntensity: 0.55, roughness: 0.4 })
  );
  group.add(stripe);
  const glow = new THREE.PointLight(0x68e6a0, 3, 10, 2);
  glow.position.y = 0.9;
  group.add(glow);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 20, 6),
    new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  beacon.position.y = 10.2;
  group.add(beacon);
  const parachute = makeParachute();
  group.add(parachute);
  group.position.set(x, 30, z);
  scene.add(group);

  const ad = {
    mesh: group, crate, parachute, beacon, glow,
    y: 30, vy: 2, landed: false,
    x, z, smokeT: 0, phase: 0,
  };
  G.airdrops.push(ad);
  spawnAirdropPlane();
  Audio.airdrop();
  showToast('🪂 AIRDROP INBOUND — follow the green beacon');
  killFeed('🪂 AIRDROP INBOUND', 'green');
  if (forced) showStreak('AIRDROP DEPLOYED');
}

function updateAirdrops(dt) {
  let nearest = null, nearestDist = 2.9;
  for (let i = G.airdrops.length - 1; i >= 0; i--) {
    const ad = G.airdrops[i];
    if (!ad.landed) {
      ad.vy = Math.min(13, ad.vy + 11 * dt);
      ad.y -= ad.vy * dt;
      ad.mesh.position.y = ad.y;
      ad.mesh.rotation.y += dt * 0.2;
      ad.mesh.rotation.z = Math.sin(ad.y * 0.2) * 0.06;
      if (ad.y <= 0.8) {
        ad.y = 0.8;
        ad.mesh.position.y = 0.8;
        ad.mesh.rotation.z = 0;
        ad.landed = true;
        ad.parachute.visible = false;
        ad.beacon.scale.y = 1;
        Audio.kill();
        showToast('✅ AIRDROP LANDED — press E to open');
        killFeed('✅ AIRDROP LANDED', 'green');
      }
    } else {
      ad.phase += dt;
      ad.mesh.rotation.y += dt * 0.32;
      ad.glow.intensity = 4 + Math.sin(ad.phase * 5) * 1.6;
      ad.smokeT -= dt;
      if (ad.smokeT <= 0) {
        ad.smokeT = 0.22;
        const smMat = new THREE.SpriteMaterial({ map: Tex.smoke, color: 0x3aff8c, transparent: true, opacity: 0.32, depthWrite: false });
        const sm = new THREE.Sprite(smMat);
        sm.position.set(ad.x + rand(-0.3, 0.3), 1.3, ad.z + rand(-0.3, 0.3));
        sm.scale.setScalar(0.7);
        scene.add(sm);
        addEffect(sm, { life: 1.2, maxLife: 1.2, grow: 3, vel: new THREE.Vector3(rand(-0.3, 0.3), 1.4, rand(-0.3, 0.3)), material: smMat, baseScale: 0.7 });
      }
      const d = Math.hypot(camera.position.x - ad.x, camera.position.z - ad.z);
      if (d < nearestDist) { nearest = ad; nearestDist = d; }
    }
  }
  G.nearAirdrop = nearest;

  if (G.plane) {
    G.plane.mesh.position.x += dt * 13;
    G.plane.mesh.position.y += Math.sin(G.elapsed * 0.2) * dt * 0.2;
    G.plane.life -= dt;
    if (G.plane.life <= 0) {
      if (G.plane.mesh.parent) scene.remove(G.plane.mesh);
      G.plane = null;
    }
  }
}

function openAirdrop(ad) {
  if (!ad || !ad.landed) return;
  const pool = [5, 6, 7];
  const widx = pick(pool);
  const w = WEAPONS[widx];
  let msg = '';
  if (G.owned.indexOf(widx) === -1) {
    G.owned.push(widx);
    G.ammo[widx] = weaponMag(widx);
    G.reserve[widx] = RESERVE_CAP[widx];
    switchWeapon(widx);
    msg = 'LEGENDARY ' + w.name + ' ACQUIRED';
  } else {
    G.ammo[widx] = weaponMag(widx);
    G.reserve[widx] = RESERVE_CAP[widx];
    msg = w.name + ' FULLY RESTOCKED';
  }
  G.plates++;
  G.medkits++;
  Audio.upgrade();
  showStreak(msg);
  killFeed('🎁 AIRDROP: ' + msg, 'green');
  updateConsumablesUI();
  if (ad.mesh.parent) scene.remove(ad.mesh);
  disposeObject3D(ad.mesh);
  const idx = G.airdrops.indexOf(ad);
  if (idx >= 0) G.airdrops.splice(idx, 1);
  G.nearAirdrop = null;
}

function clearAirdrops() {
  for (const ad of G.airdrops) { if (ad.mesh.parent) scene.remove(ad.mesh); disposeObject3D(ad.mesh); }
  G.airdrops.length = 0;
  G.nearAirdrop = null;
  if (G.plane && G.plane.mesh.parent) scene.remove(G.plane.mesh);
  G.plane = null;
}

// ───────────────────────────────────────────────────────────────────────────
// 22. GRENADES
// ───────────────────────────────────────────────────────────────────────────
function throwGrenade() {
  if (G.mode !== 'playing' || !G.running) return;
  if (G.grenades <= 0) { showToast('NO GRENADES'); Audio.deny(); return; }
  if (G.grenadesActive.length >= 4) return;
  G.grenades--;
  updateConsumablesUI();

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0x2f4a2c, roughness: 0.55, metalness: 0.35, emissive: 0x133d16, emissiveIntensity: 0.5 })
  );
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  mesh.position.copy(camera.position).add(dir.clone().multiplyScalar(0.55));
  scene.add(mesh);

  G.grenadesActive.push({
    mesh,
    vel: dir.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4.6, 0)),
    fuse: 2.1,
    done: false,
    spin: new THREE.Vector3(rand(-10, 10), rand(-10, 10), rand(-10, 10)),
  });
  Audio.shoot({ type: 'pistol' });
  showToast('GRENADE OUT');
}

function updateGrenades(dt) {
  for (let i = G.grenadesActive.length - 1; i >= 0; i--) {
    const g = G.grenadesActive[i];
    if (g.done) { G.grenadesActive.splice(i, 1); continue; }
    g.vel.y -= 22 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    g.mesh.rotation.x += g.spin.x * dt;
    g.mesh.rotation.y += g.spin.y * dt;
    g.mesh.rotation.z += g.spin.z * dt;

    if (g.mesh.position.y < 0.16) {
      g.mesh.position.y = 0.16;
      if (Math.abs(g.vel.y) > 2) Audio.nadeBounce();
      g.vel.y = Math.abs(g.vel.y) * 0.34;
      g.vel.x *= 0.68;
      g.vel.z *= 0.68;
    }
    const before = g.mesh.position.clone();
    pushOutOfObstacles(g.mesh.position, 0.16);
    if (Math.abs(before.x - g.mesh.position.x) > 0.001 || Math.abs(before.z - g.mesh.position.z) > 0.001) {
      g.vel.x *= -0.45;
      g.vel.z *= -0.45;
      Audio.nadeBounce();
    }
    g.fuse -= dt;
    if (g.fuse <= 0) {
      detonateGrenade(g.mesh.position.clone());
      if (g.mesh.parent) scene.remove(g.mesh);
      disposeObject3D(g.mesh);
      g.done = true;
      G.grenadesActive.splice(i, 1);
    }
  }
}

function detonateGrenade(pos) {
  const RADIUS = 7.0;
  const MAX_DMG = 145;
  spawnExplosion(pos);
  const toKill = [];
  for (let i = 0; i < G.enemies.length; i++) {
    const e = G.enemies[i];
    if (!e.alive) continue;
    const d = Math.hypot(e.mesh.position.x - pos.x, e.mesh.position.z - pos.z);
    if (d < RADIUS) {
      const dmg = MAX_DMG * (1 - d / RADIUS);
      e.hp -= dmg;
      G.damageDealt += dmg;
      e.lastHitAt = G.elapsed;
      e.hpBar.visible = true;
      const pct = clamp(e.hp / e.maxHp, 0, 1);
      e.hpFill.scale.x = Math.max(0.001, pct);
      e.flash = 0.15;
      for (const m of e.flashMats) if (m.emissive) { m.emissive.setHex(0xff8a3d); m.emissiveIntensity = 1.0; }
      showDamageNumber(new THREE.Vector3(e.mesh.position.x, 1.2, e.mesh.position.z), Math.round(dmg), false);
      if (e.hp <= 0) toKill.push(e);
    }
  }
  for (const e of toKill) killEnemy(e, false);

  const pd = Math.hypot(camera.position.x - pos.x, camera.position.z - pos.z);
  if (pd < RADIUS) damagePlayer(MAX_DMG * (1 - pd / RADIUS) * 0.45, pos);
  killFeed('💥 GRENADE DETONATED', 'gold');
}

// ───────────────────────────────────────────────────────────────────────────
// 23. AMBIENT FIRE
// ───────────────────────────────────────────────────────────────────────────
function updateFireBarrels(dt) {
  if (!G.fireBarrels) return;
  for (const f of G.fireBarrels) {
    f.t -= dt;
    f.light.intensity = 4.5 + Math.abs(Math.sin(G.elapsed * 7 + f.x)) * 3.5;
    if (f.t <= 0) {
      f.t = rand(0.12, 0.28);
      const mat = new THREE.SpriteMaterial({ map: Tex.spark, color: 0xff8a2a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.position.set(f.x + rand(-0.18, 0.18), 1.25, f.z + rand(-0.18, 0.18));
      sp.scale.setScalar(rand(0.2, 0.4));
      scene.add(sp);
      addEffect(sp, { life: rand(0.25, 0.5), maxLife: 0.5, grow: 1.8, vel: new THREE.Vector3(rand(-0.2, 0.2), rand(0.7, 1.4), rand(-0.2, 0.2)), material: mat, baseScale: 0.3 });
      if (Math.random() < 0.35) {
        const smMat = new THREE.SpriteMaterial({ map: Tex.smoke, color: 0x403c38, transparent: true, opacity: 0.18, depthWrite: false });
        const sm = new THREE.Sprite(smMat);
        sm.position.set(f.x, 1.8, f.z);
        sm.scale.setScalar(0.7);
        scene.add(sm);
        addEffect(sm, { life: 2.4, maxLife: 2.4, grow: 3.5, vel: new THREE.Vector3(rand(-0.2, 0.2), 0.75, rand(-0.2, 0.2)), material: smMat, baseScale: 0.7 });
      }
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 24. PLAYER MOVEMENT / CAMERA
// ───────────────────────────────────────────────────────────────────────────
function updatePlayer(dt, now) {
  const k = G.keys || (G.keys = {});
  const forward = new THREE.Vector3(-Math.sin(G.yaw), 0, -Math.cos(G.yaw));
  const right = new THREE.Vector3(Math.cos(G.yaw), 0, -Math.sin(G.yaw));

  const wantCrouch = G.crouch;
  G.crouchAmt = damp(G.crouchAmt, wantCrouch ? 1 : 0, 12, dt);

  let inputX = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);
  let inputZ = (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
  let inputMag = Math.min(1, Math.hypot(inputX, inputZ));

  if (G.mobile) {
    const tm = G.touchMove || { x: 0, y: 0 };
    const mag = Math.hypot(tm.x, tm.y);
    if (mag > 0.12) {
      inputX = tm.x;
      inputZ = -tm.y;
      inputMag = Math.min(1, mag);
    } else {
      inputX = 0;
      inputZ = 0;
      inputMag = 0;
    }
  }

  const moving = inputMag > 0.08;
  const touchForwardSprint = G.mobile && G.touchMove && G.touchMove.y < -0.82 && Math.abs(G.touchMove.x) < 0.46;
  const wantSprint = ((k['ShiftLeft'] || k['ShiftRight']) && inputZ > 0 && !G.ads && !G.crouch) || touchForwardSprint;
  G.sprinting = wantSprint && G.stamina > 2 && moving;

  if (G.sprinting) {
    G.stamina = Math.max(0, G.stamina - 26 * dt);
  } else {
    G.stamina = Math.min(G.maxStamina, G.stamina + (moving ? 12 : 20) * dt);
  }

  let speed = CFG.WALK;
  if (G.sprinting) speed *= CFG.SPRINT_MULT;
  if (G.crouch) speed *= 0.55;
  if (G.ads) speed *= 0.62;
  speed *= 1 + (G.perks.speed || 0) * 0.05;

  const move = new THREE.Vector3();
  if (inputZ) move.addScaledVector(forward, inputZ);
  if (inputX) move.addScaledVector(right, inputX);
  if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * inputMag);

  G.velX = damp(G.velX || 0, move.x, 16, dt);
  G.velZ = damp(G.velZ || 0, move.z, 16, dt);
  if (!moving) {
    G.velX = damp(G.velX, 0, 18, dt);
    G.velZ = damp(G.velZ, 0, 18, dt);
  }

  camera.position.x += G.velX * dt;
  camera.position.z += G.velZ * dt;
  pushOutOfObstacles(camera.position, CFG.PLAYER_R);

  // Push out of enemy bodies.
  for (let i = 0; i < G.enemies.length; i++) {
    const e = G.enemies[i];
    if (!e.alive) continue;
    const er = 0.5 * e.def.scale;
    const dx = camera.position.x - e.mesh.position.x;
    const dz = camera.position.z - e.mesh.position.z;
    const d = Math.hypot(dx, dz);
    const minD = CFG.PLAYER_R + er;
    if (d < minD && d > 0.0001) {
      camera.position.x = e.mesh.position.x + (dx / d) * minD;
      camera.position.z = e.mesh.position.z + (dz / d) * minD;
    }
  }

  // Jump / gravity.
  if (k['Space'] && G.onGround && !G.jumpHeld && !G.crouch) {
    G.vy = CFG.JUMP;
    G.onGround = false;
    G.jumpHeld = true;
  }
  if (!k['Space']) G.jumpHeld = false;
  const eyeY = lerp(CFG.PLAYER_H, CFG.CROUCH_H, G.crouchAmt) + Math.max(0, G.vy) * 0.02;
  if (G.onGround && G.vy === 0) camera.position.y = eyeY;
  G.vy -= CFG.GRAVITY * dt;
  camera.position.y += G.vy * dt;
  if (camera.position.y <= eyeY) {
    if (!G.onGround && G.vy < -6) {
      G.camShake = Math.max(G.camShake, 0.12);
      Audio.footstep(false);
    }
    camera.position.y = eyeY;
    G.vy = 0;
    G.onGround = true;
  }

  // Bounds.
  camera.position.x = clamp(camera.position.x, -CFG.MAP + 1.2, CFG.MAP - 1.2);
  camera.position.z = clamp(camera.position.z, -CFG.MAP + 1.2, CFG.MAP - 1.2);
  pushOutOfObstacles(camera.position, CFG.PLAYER_R);

  // Bob & footsteps.
  const speedNow = Math.hypot(G.velX, G.velZ);
  G.moveAmount = clamp(speedNow / CFG.WALK, 0, 1.6);
  G.bobAmt = damp(G.bobAmt, G.onGround ? clamp(G.moveAmount, 0, 1) : 0, 10, dt);
  G.bobPhase += dt * (G.sprinting ? 13.5 : 9) * Math.max(0.2, G.moveAmount);
  if (G.onGround && G.moveAmount > 0.15) {
    G.stepTimer -= dt;
    if (G.stepTimer <= 0) {
      G.stepTimer = G.sprinting ? 0.28 : 0.42;
      Audio.footstep(G.sprinting);
    }
  }

  // Health regen after a quiet spell.
  if (G.hp > 0 && G.elapsed - G.lastDamage > 9 && G.hp < G.maxHp) {
    G.hp = Math.min(G.maxHp, G.hp + 3.2 * dt);
    updateHPUI();
  }

  updateStaminaUI();
}

function updateCamera(dt) {
  G.recoil = damp(G.recoil, 0, 12, dt);
  const pitch = clamp(G.pitch + G.recoil, -1.48, 1.48);
  const dir = new THREE.Vector3(
    -Math.sin(G.yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(G.yaw) * Math.cos(pitch)
  );
  const bob = Math.sin(G.bobPhase) * 0.018 * G.bobAmt;
  const target = camera.position.clone().add(dir);
  camera.lookAt(target);

  // Shake and bob after lookAt so aim stays honest.
  camera.position.y += Math.abs(Math.cos(G.bobPhase)) * 0.012 * G.bobAmt;
  G.camShake = damp(G.camShake, 0, 8, dt);
  if (G.camShake > 0.002) {
    const s = G.camShake * 0.018;
    camera.rotateZ(rand(-s, s));
    camera.rotateX(rand(-s * 0.65, s * 0.65));
    camera.position.x += rand(-s, s) * 0.4;
    camera.position.z += rand(-s, s) * 0.4;
  }
  camera.position.y += bob * 0.25;
}

function updateMenuCamera(dt) {
  G.menuAngle = (G.menuAngle || 0) + dt * 0.055;
  const a = G.menuAngle;
  camera.position.set(Math.cos(a) * 44, 15 + Math.sin(a * 0.7) * 2.5, Math.sin(a) * 44);
  camera.lookAt(0, 4, 0);
  camera.fov = 64;
  camera.updateProjectionMatrix();
  if (gunRoot) gunRoot.visible = false;
}

// ───────────────────────────────────────────────────────────────────────────
// 25. INPUT
// ───────────────────────────────────────────────────────────────────────────
function requestLock() {
  if (G.mobile) { G.freeLook = true; return; }
  if (window.__noPointerLock) { G.freeLook = true; return; }
  G.suppressLock = true;
  setTimeout(() => { G.suppressLock = false; }, 650);
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => { G.freeLook = true; });
  } catch (e) { G.freeLook = true; }
}

function onLockChange() {
  if (document.pointerLockElement === renderer.domElement) {
    G.freeLook = false;
    if (G.mode === 'paused') {
      G.mode = 'playing';
      G.running = true;
      G.paused = false;
      UI.pause.classList.add('hidden');
    }
  } else if (G.mode === 'playing' && !G.freeLook && !G.suppressLock) {
    pauseGame();
  }
}

function keyDown(e) {
  const code = e.code;
  if (G.mode === 'menu') {
    if (code === 'Enter' || code === 'NumpadEnter') { e.preventDefault(); startRun(); }
    return;
  }
  if (code === 'Escape') {
    if (G.mode === 'playing') { e.preventDefault(); pauseGame(); }
    else if (G.mode === 'paused') { e.preventDefault(); resumeGame(); }
    return;
  }
  if (code === 'KeyM') { toggleMute(); return; }
  if (G.mode === 'over' || G.mode === 'shop') return;
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight'].indexOf(code) !== -1) {
    e.preventDefault();
  }
  G.keys[code] = true;

  if (code === 'KeyR' && !e.repeat) startReload();
  if (code === 'KeyG' && !e.repeat) throwGrenade();
  if (code === 'KeyH' && !e.repeat) useMedkit();
  if (code === 'KeyT' && !e.repeat) useArmorPlate();
  if (code === 'KeyE' && !e.repeat) tryPickup();
  if (code === 'KeyC' && !e.repeat) { G.crouch = !G.crouch; }
  if (code === 'ControlLeft' && !e.repeat) { G.crouch = !G.crouch; }
  if (code === 'KeyF' && !e.repeat) toggleFlashlight();
  if (code === 'Digit1') switchWeapon(0);
  if (code === 'Digit2') switchWeapon(1);
  if (code === 'Digit3') switchWeapon(2);
  if (code === 'Digit4') switchWeapon(3);
  if (code === 'Digit5') switchWeapon(4);
  if (code === 'Digit6') switchWeapon(5);
  if (code === 'Digit7') switchWeapon(6);
  if (code === 'Digit8') switchWeapon(7);
}

function keyUp(e) {
  G.keys[e.code] = false;
}

function mouseMove(e) {
  if (G.mobile) return;
  if (G.mode !== 'playing' || !G.running) return;
  if (!document.pointerLockElement && !G.freeLook) return;
  const sens = 0.0017 * G.sens * (G.ads ? 0.52 : 1) * (G.crouch ? 0.9 : 1);
  G.yaw -= (e.movementX || 0) * sens;
  G.pitch -= (e.movementY || 0) * sens;
  G.pitch = clamp(G.pitch, -1.42, 1.42);
  G.swayX = clamp((G.swayX || 0) + (e.movementX || 0) * 0.0009, -0.5, 0.5);
  G.swayY = clamp((G.swayY || 0) + (e.movementY || 0) * 0.0009, -0.5, 0.5);
}

function mouseDown(e) {
  if (G.mobile) return;
  if (G.mode !== 'playing' || !G.running) return;
  if (e.button === 0) {
    G.trigger = true;
    G.firing = true;
    fireWeapon();
  } else if (e.button === 2) {
    G.ads = true;
  }
}

function mouseUp(e) {
  if (G.mobile) return;
  if (e.button === 0) { G.trigger = false; G.firing = false; }
  if (e.button === 2) G.ads = false;
}

function wheelEvent(e) {
  if (G.mode !== 'playing' || !G.running) return;
  e.preventDefault();
  cycleWeapon(e.deltaY > 0 ? 1 : -1);
}

// ── Touch controls ──
const TOUCH = {};

function touchCapture(el, id) {
  try { el.setPointerCapture(id); } catch (e) { /* ignore */ }
}

function updateTouchButtons() {
  if (!G.mobile || !TOUCH.ads) return;
  TOUCH.ads.classList.toggle('active', !!G.ads);
  TOUCH.crouch.classList.toggle('active', !!G.crouch);
}

function initTouchControls() {
  if (!G.mobile) return;
  document.body.classList.add('touch');

  TOUCH.layer = $('touchLayer');
  TOUCH.look = $('lookPad');
  TOUCH.stick = $('stickBase');
  TOUCH.knob = $('stickKnob');
  TOUCH.fire = $('btnFire');
  TOUCH.ads = $('btnAds');
  TOUCH.reload = $('btnReload');
  TOUCH.jump = $('btnJump');
  TOUCH.crouch = $('btnCrouch');
  TOUCH.interact = $('btnInteract');
  TOUCH.medkit = $('btnMedkit');
  TOUCH.grenade = $('btnGrenade');
  TOUCH.pause = $('btnPause');
  TOUCH.slots = $('weaponSlots');

  const tap = (el, fn) => {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('active');
      setTimeout(() => el.classList.remove('active'), 110);
      fn(e);
    }, { passive: false });
  };
  const hold = (el, onDown, onUp) => {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      touchCapture(el, e.pointerId);
      el.classList.add('active');
      if (onDown) onDown(e);
    }, { passive: false });
    const end = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      el.classList.remove('active');
      if (onUp) onUp(e);
    };
    el.addEventListener('pointerup', end, { passive: false });
    el.addEventListener('pointercancel', end, { passive: false });
    el.addEventListener('lostpointercapture', end, { passive: false });
  };

  // Fire — hold for automatic weapons, tap for semi-auto.
  hold(TOUCH.fire, () => {
    if (G.mode !== 'playing' || !G.running) return;
    G.trigger = true;
    G.firing = true;
    fireWeapon();
  }, () => {
    G.trigger = false;
    G.firing = false;
  });

  tap(TOUCH.ads, () => {
    G.ads = !G.ads;
    updateTouchButtons();
    Audio.ui();
  });
  tap(TOUCH.reload, () => startReload());
  tap(TOUCH.crouch, () => {
    G.crouch = !G.crouch;
    updateTouchButtons();
    Audio.ui();
  });
  tap(TOUCH.interact, () => tryPickup());
  tap(TOUCH.medkit, () => useMedkit());
  tap(TOUCH.grenade, () => throwGrenade());
  tap(TOUCH.pause, () => pauseGame());
  hold(TOUCH.jump, () => { G.keys['Space'] = true; }, () => { G.keys['Space'] = false; });

  // Movement stick.
  let stickId = null;
  let centerX = 0, centerY = 0, radius = 42;
  const stickMove = (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;
    const d = Math.hypot(dx, dy);
    if (d > radius) {
      dx = (dx / d) * radius;
      dy = (dy / d) * radius;
    }
    G.touchMove.x = clamp(dx / radius, -1, 1);
    G.touchMove.y = clamp(dy / radius, -1, 1);
    TOUCH.knob.style.transform = 'translate(-50%, -50%) translate(' + dx + 'px,' + dy + 'px)';
    e.preventDefault();
  };
  TOUCH.stick.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    stickId = e.pointerId;
    const r = TOUCH.stick.getBoundingClientRect();
    centerX = r.left + r.width / 2;
    centerY = r.top + r.height / 2;
    radius = r.width * 0.33;
    touchCapture(TOUCH.stick, e.pointerId);
    stickMove(e);
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });
  TOUCH.stick.addEventListener('pointermove', stickMove, { passive: false });
  const stickEnd = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    G.touchMove.x = 0;
    G.touchMove.y = 0;
    TOUCH.knob.style.transform = 'translate(-50%, -50%)';
    e.preventDefault();
  };
  TOUCH.stick.addEventListener('pointerup', stickEnd, { passive: false });
  TOUCH.stick.addEventListener('pointercancel', stickEnd, { passive: false });
  TOUCH.stick.addEventListener('lostpointercapture', stickEnd, { passive: false });

  // Free-look pad (right side of the screen).
  let lookId = null;
  let lastX = 0, lastY = 0;
  TOUCH.look.addEventListener('pointerdown', (e) => {
    if (lookId !== null) return;
    lookId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    touchCapture(TOUCH.look, e.pointerId);
    e.preventDefault();
  }, { passive: false });
  TOUCH.look.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId || G.mode !== 'playing') return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const sens = 0.0034 * G.sens * (G.ads ? 0.58 : 1) * (G.crouch ? 0.9 : 1);
    G.yaw -= dx * sens;
    G.pitch = clamp(G.pitch - dy * sens, -1.42, 1.42);
    G.swayX = clamp((G.swayX || 0) + dx * 0.0016, -0.5, 0.5);
    G.swayY = clamp((G.swayY || 0) + dy * 0.0016, -0.5, 0.5);
    e.preventDefault();
  }, { passive: false });
  const lookEnd = (e) => {
    if (e.pointerId !== lookId) return;
    lookId = null;
    e.preventDefault();
  };
  TOUCH.look.addEventListener('pointerup', lookEnd, { passive: false });
  TOUCH.look.addEventListener('pointercancel', lookEnd, { passive: false });
  TOUCH.look.addEventListener('lostpointercapture', lookEnd, { passive: false });

  // Tap weapon slots to switch.
  TOUCH.slots.addEventListener('pointerdown', (e) => {
    const slot = e.target && e.target.closest ? e.target.closest('.slot') : null;
    if (!slot) return;
    const i = Number(slot.getAttribute('data-i'));
    if (!isNaN(i)) switchWeapon(i);
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });

  updateTouchButtons();
  showToast('TOUCH CONTROLS READY');
}

function toggleFlashlight() {
  G.flashlight = !G.flashlight;
  if (torchLight) torchLight.intensity = G.flashlight ? 95 : 0;
  showToast(G.flashlight ? 'FLASHLIGHT ON' : 'FLASHLIGHT OFF');
  Audio.ui();
}

function toggleMute() {
  const m = !G.muted;
  Audio.setMuted(m);
  SAVE.muted = m;
  persist();
  if (UI.muteBtn) UI.muteBtn.textContent = m ? '🔇 SOUND OFF' : '🔊 SOUND ON';
  showToast(m ? 'SOUND OFF' : 'SOUND ON');
}

// ───────────────────────────────────────────────────────────────────────────
// 26. PAUSE / RESUME
// ───────────────────────────────────────────────────────────────────────────
function pauseGame() {
  if (G.mode !== 'playing') return;
  G.mode = 'paused';
  G.running = false;
  G.paused = true;
  G.trigger = false;
  G.firing = false;
  G.ads = false;
  G.keys = {};
  G.touchMove.x = 0;
  G.touchMove.y = 0;
  UI.pause.classList.remove('hidden');
  UI.pauseWave.textContent = G.wave;
  UI.pauseKills.textContent = G.kills;
  UI.pauseScore.textContent = G.score;
  G.suppressLock = true;
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => { G.suppressLock = false; }, 80);
}

function resumeGame() {
  if (G.mode !== 'paused') return;
  G.mode = 'playing';
  G.running = true;
  G.paused = false;
  UI.pause.classList.add('hidden');
  Audio.resume();
  requestLock();
}

// ───────────────────────────────────────────────────────────────────────────
// 27. UI CACHE / FEEDBACK
// ───────────────────────────────────────────────────────────────────────────
const UI = {};
function $(id) { return document.getElementById(id); }

function cacheUI() {
  const ids = [
    'menu', 'hud', 'shop', 'pause', 'gameOver', 'startBtn', 'restartBtn', 'menuBtn',
    'resumeBtn', 'pauseRestartBtn', 'nextWaveBtn', 'muteBtn', 'sensRange', 'sensVal',
    'bestWave', 'bestScore', 'bestKills',
    'hpFill', 'hpText', 'armorFill', 'armorText', 'staminaFill', 'statusChips',
    'waveNum', 'enemyLeft', 'cashNum', 'scoreNum', 'minimap', 'mmKills', 'mmTime',
    'compass', 'killFeed', 'dmgLayer', 'hitMarker', 'scope', 'scopeZoom',
    'damageDir', 'vignette', 'lowHp', 'weaponSlots', 'weaponName', 'ammoLine',
    'ammoCount', 'ammoMax', 'ammoReserve', 'reloadBar', 'reloadFill',
    'grenadeCount', 'medkitCount', 'plateCount', 'lootPrompt', 'waveAnnounce',
    'waveMain', 'waveSub', 'streakBanner', 'toast', 'bossBar', 'bossFill', 'bossLabel',
    'shopWave', 'shopCash', 'shopItems', 'objective', 'pauseWave', 'pauseKills',
    'pauseScore', 'goSub', 'recordBanner', 'goKills', 'goWave', 'goScore', 'goAcc',
    'goHead', 'goTime', 'controlsHint',
  ];
  for (const id of ids) UI[id] = $(id);
  UI.chT = document.querySelector('#crosshair .ch-t');
  UI.chB = document.querySelector('#crosshair .ch-b');
  UI.chL = document.querySelector('#crosshair .ch-l');
  UI.chR = document.querySelector('#crosshair .ch-r');
  UI.shopTabs = Array.prototype.slice.call(document.querySelectorAll('.shop-tab'));
  UI.pauseScreen = UI.pause;
  UI.menuScreen = UI.menu;
  UI.overScreen = UI.gameOver;
  UI.healFlash = document.createElement('div');
  UI.healFlash.className = 'heal-flash';
  document.body.appendChild(UI.healFlash);
  UI.objective.style.transition = 'opacity 0.5s ease';
  UI.scope.style.transition = 'opacity 0.12s ease';
  UI.scope.style.opacity = '0';
  UI.scope.classList.add('hidden');
}

function updateHPUI() {
  if (!UI.hpFill) return;
  const pct = clamp(G.hp / G.maxHp, 0, 1) * 100;
  UI.hpFill.style.width = pct + '%';
  UI.hpText.textContent = Math.ceil(G.hp);
  if (pct > 55) UI.hpFill.style.background = 'linear-gradient(90deg,#1c8f60,#4fe0a3)';
  else if (pct > 28) UI.hpFill.style.background = 'linear-gradient(90deg,#b97a20,#ffc247)';
  else UI.hpFill.style.background = 'linear-gradient(90deg,#a01e2b,#ff4d5e)';
  if (UI.lowHp) UI.lowHp.style.opacity = pct < 32 ? String(clamp((32 - pct) / 32, 0, 0.85)) : '0';
}

function updateArmorUI() {
  if (!UI.armorFill) return;
  UI.armorFill.style.width = clamp(G.armor / G.maxArmor, 0, 1) * 100 + '%';
  UI.armorText.textContent = '🛡 ' + Math.ceil(G.armor);
}

function updateStaminaUI() {
  if (!UI.staminaFill) return;
  UI.staminaFill.style.width = clamp(G.stamina / G.maxStamina, 0, 1) * 100 + '%';
  UI.staminaFill.parentElement.classList.toggle('low', G.stamina < 22);
}

function updateAmmoUI() {
  if (!UI.ammoCount) return;
  const idx = G.weaponIndex;
  const w = WEAPONS[idx];
  const cap = weaponMag(idx);
  UI.ammoCount.textContent = G.ammo[idx];
  UI.ammoMax.textContent = cap;
  const rv = G.reserve[idx];
  UI.ammoReserve.textContent = rv === Infinity ? '∞' : rv;
  UI.ammoLine.classList.toggle('low', G.ammo[idx] <= Math.max(1, Math.floor(cap * 0.25)));
  UI.weaponName.textContent = w.name;
}

function updateConsumablesUI() {
  if (!UI.grenadeCount) return;
  UI.grenadeCount.textContent = G.grenades;
  UI.medkitCount.textContent = G.medkits;
  UI.plateCount.textContent = G.plates;
}

function updateWeaponSlots() {
  if (!UI.weaponSlots) return;
  let html = '';
  for (let i = 0; i < WEAPONS.length; i++) {
    const owned = G.owned.indexOf(i) !== -1;
    const active = i === G.weaponIndex;
    const w = WEAPONS[i];
    const cls = 'slot' + (owned ? ' owned' : '') + (active ? ' active' : '') + (w.legendary ? ' legendary' : '');
    html += '<div class="' + cls + '" data-i="' + i + '" title="' + w.name + '">' + (i + 1) + '</div>';
  }
  UI.weaponSlots.innerHTML = html;
}

function updateStatsUI() {
  if (!UI.waveNum) return;
  UI.waveNum.textContent = G.wave;
  UI.cashNum.textContent = Math.round(G.cash);
  UI.scoreNum.textContent = Math.round(G.score);
  UI.mmKills.textContent = G.kills + ' KILLS';
  updateEnemyUI();
}

function updateEnemyUI() {
  if (!UI.enemyLeft) return;
  UI.enemyLeft.textContent = G.enemies.filter((e) => e.alive).length + G.spawnQueue.length;
}

function updateBestLabels() {
  UI.bestWave.textContent = SAVE.bestWave;
  UI.bestScore.textContent = SAVE.bestScore.toLocaleString('en-US');
  UI.bestKills.textContent = SAVE.bestKills;
}

function updateBossBar() {
  if (!UI.bossBar) return;
  let boss = null;
  for (const e of G.enemies) if (e.alive && e.def.boss) { boss = e; break; }
  if (!boss) { UI.bossBar.classList.add('hidden'); return; }
  UI.bossBar.classList.remove('hidden');
  const pct = clamp(boss.hp / boss.maxHp, 0, 1) * 100;
  UI.bossFill.style.width = pct + '%';
  UI.bossLabel.textContent = 'WARLORD  ·  ' + Math.ceil(boss.hp) + ' / ' + boss.maxHp;
}

function showHitmarker(kind) {
  if (!UI.hitMarker) return;
  UI.hitMarker.classList.remove('show', 'kill', 'head');
  if (!kind) return;
  if (kind === 'head') UI.hitMarker.classList.add('head');
  if (kind === 'kill') UI.hitMarker.classList.add('kill');
  // Restart animation.
  void UI.hitMarker.offsetWidth;
  UI.hitMarker.classList.add('show');
  clearTimeout(G._hitTimer);
  G._hitTimer = setTimeout(() => { UI.hitMarker.classList.remove('show'); }, kind === 'head' ? 190 : 110);
}

function showDamageNumber(worldPos, amount, isHead) {
  if (!UI.dmgLayer) return;
  const v = projVec.copy(worldPos).project(camera);
  if (v.z > 1 || v.z < -1) return;
  const x = (v.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
  if (x < -50 || x > window.innerWidth + 50 || y < -50 || y > window.innerHeight + 50) return;
  const el = document.createElement('div');
  el.className = 'dmg-num' + (isHead ? ' head' : '');
  el.textContent = (isHead ? 'HEAD ' : '') + Math.round(amount);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  UI.dmgLayer.appendChild(el);
  setTimeout(() => el.remove(), 760);
  while (UI.dmgLayer.children.length > 24) UI.dmgLayer.removeChild(UI.dmgLayer.firstChild);
}

function showDamageDirection(sourcePos) {
  if (!UI.damageDir) return;
  const fx = -Math.sin(G.yaw), fz = -Math.cos(G.yaw);
  const vx = sourcePos.x - camera.position.x;
  const vz = sourcePos.z - camera.position.z;
  const cross = fx * vz - fz * vx;
  const dot = fx * vx + fz * vz;
  const deg = Math.atan2(cross, dot) / DEG;
  UI.damageDir.style.transform = 'rotate(' + deg + 'deg)';
  UI.damageDir.style.opacity = '0.65';
  G.dmgDirT = 0.8;
}

function flashHeal() {
  if (!UI.healFlash) return;
  UI.healFlash.style.opacity = '0.65';
  setTimeout(() => { UI.healFlash.style.opacity = '0'; }, 240);
}

function showToast(msg, ms) {
  if (!UI.toast) return;
  UI.toast.textContent = msg;
  UI.toast.classList.add('show');
  clearTimeout(G._toastTimer);
  G._toastTimer = setTimeout(() => UI.toast.classList.remove('show'), ms || 2200);
}

function showStreak(text) {
  if (!UI.streakBanner) return;
  UI.streakBanner.textContent = text;
  UI.streakBanner.classList.remove('hidden', 'show');
  void UI.streakBanner.offsetWidth;
  UI.streakBanner.classList.add('show');
  clearTimeout(G._streakTimer);
  G._streakTimer = setTimeout(() => {
    UI.streakBanner.classList.remove('show');
    UI.streakBanner.classList.add('hidden');
  }, 1700);
}

function showBossIntro() {
  showStreak('☠ WARLORD');
  killFeed('⚠ WARLORD HAS ENTERED THE ARENA', 'gold');
}

function killFeed(text, cls) {
  if (!UI.killFeed) return;
  const el = document.createElement('div');
  el.className = 'kill-entry ' + (cls || '');
  el.textContent = text;
  UI.killFeed.appendChild(el);
  setTimeout(() => el.remove(), 3400);
  while (UI.killFeed.children.length > 5) UI.killFeed.removeChild(UI.killFeed.firstChild);
}

function announceWave(title, sub) {
  if (!UI.waveAnnounce) return;
  UI.waveMain.textContent = title;
  UI.waveSub.textContent = sub || 'HOLD THE LINE';
  UI.waveAnnounce.classList.remove('hidden');
  // Restart animations.
  UI.waveMain.style.animation = 'none'; UI.waveSub.style.animation = 'none';
  void UI.waveMain.offsetWidth;
  UI.waveMain.style.animation = ''; UI.waveSub.style.animation = '';
  clearTimeout(G._waveAnnounceTimer);
  G._waveAnnounceTimer = setTimeout(() => UI.waveAnnounce.classList.add('hidden'), 1950);
}

function updateScopeUI(scoped) {
  if (!UI.scope) return;
  if (scoped) {
    UI.scope.classList.remove('hidden');
    UI.scope.style.opacity = '1';
    UI.scopeZoom.textContent = currentWeapon().zoom + '×';
  } else {
    UI.scope.style.opacity = '0';
    clearTimeout(G._scopeTimer);
    G._scopeTimer = setTimeout(() => { if (G.adsAmt < 0.4) UI.scope.classList.add('hidden'); }, 120);
  }
  UI.crosshair = UI.crosshair || document.getElementById('crosshair');
  UI.crosshair.classList.toggle('scoped', !!scoped);
}

// ───────────────────────────────────────────────────────────────────────────
// 28. HUD RENDER (compass / minimap / per-frame bits)
// ───────────────────────────────────────────────────────────────────────────
function drawCompass() {
  const cv = UI.compass;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const heading = headingOf(G.yaw);
  const pxPerDeg = 6.7;
  const cx = W / 2;

  // Baseline.
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, 'rgba(247,192,74,0)');
  grad.addColorStop(0.18, 'rgba(247,192,74,0.22)');
  grad.addColorStop(0.82, 'rgba(247,192,74,0.22)');
  grad.addColorStop(1, 'rgba(247,192,74,0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 48); ctx.lineTo(W, 48); ctx.stroke();

  const start = Math.ceil((heading - 68) / 5) * 5;
  for (let a = start; a <= heading + 68; a += 5) {
    const norm = ((a % 360) + 360) % 360;
    const d = a - heading;
    const x = cx + d * pxPerDeg;
    const major = Math.abs(norm % 15) < 0.01;
    const cardinal = Math.abs(norm % 45) < 0.01;
    ctx.strokeStyle = cardinal ? 'rgba(255,255,255,0.85)' : major ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = cardinal ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 48);
    ctx.lineTo(x, cardinal ? 29 : major ? 37 : 41);
    ctx.stroke();

    if (cardinal) {
      const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
      const label = labels[norm] || '';
      ctx.fillStyle = norm === 0 ? '#ff8a86' : 'rgba(236,243,252,0.92)';
      ctx.font = (label.length === 1 ? '700 15px ' : '700 11px ') + 'Bahnschrift, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, 22);
    } else if (major) {
      ctx.fillStyle = 'rgba(180,196,216,0.55)';
      ctx.font = '600 8px Bahnschrift, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(norm)).padStart(2, '0'), x, 40);
    }
  }

  // Center caret.
  ctx.fillStyle = '#f7c04a';
  ctx.beginPath();
  ctx.moveTo(cx, 51);
  ctx.lineTo(cx - 5, 57);
  ctx.lineTo(cx + 5, 57);
  ctx.closePath();
  ctx.fill();

  // Airdrop bearing.
  if (G.airdrops && G.airdrops.length) {
    let best = null, bestD = Infinity;
    for (const ad of G.airdrops) {
      const d = Math.hypot(camera.position.x - ad.x, camera.position.z - ad.z);
      if (d < bestD) { bestD = d; best = ad; }
    }
    if (best) {
      const bearing = bearingTo(camera.position.x, camera.position.z, best.x, best.z);
      let diff = shortAngle(bearing - heading);
      diff = clamp(diff, -67, 67);
      const x = cx + diff * pxPerDeg;
      ctx.save();
      ctx.translate(x, 42);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#68e6a0';
      ctx.shadowColor = '#68e6a0';
      ctx.shadowBlur = 8;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
      ctx.fillStyle = '#68e6a0';
      ctx.font = '600 8px Bahnschrift, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(bestD) + 'm', x, 57);
    }
  }
}

function drawMinimap() {
  const cv = UI.minimap;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(7,11,17,0.95)';
  ctx.fillRect(0, 0, W, H);

  const px = camera.position.x, pz = camera.position.z;
  const RANGE = 78;
  const scale = (W / 2) / RANGE;
  const cx = W / 2, cy = H / 2;

  // Grid.
  ctx.strokeStyle = 'rgba(120,145,175,0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const x = (i / 4) * W, y = (i / 4) * H;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Roads.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(70,76,84,0.55)';
  ctx.fillRect((1.5 - px) * scale - 4.7 * scale, -200 * scale, 9.4 * scale, 400 * scale);
  ctx.fillRect(-200 * scale, (2.5 - pz) * scale - 4 * scale, 400 * scale, 8 * scale);
  ctx.restore();

  // Buildings.
  ctx.fillStyle = 'rgba(142,154,168,0.55)';
  for (const b of World.buildings) {
    const x = cx + (b.x - px) * scale;
    const z = cy + (b.z - pz) * scale;
    const w = b.w * scale, d = b.d * scale;
    if (x + w < 0 || x - w > W || z + d < 0 || z - d > H) continue;
    ctx.fillRect(x - w / 2, z - d / 2, w, d);
  }

  // Loot.
  for (const it of G.loot) {
    const x = cx + (it.mesh.position.x - px) * scale;
    const z = cy + (it.mesh.position.z - pz) * scale;
    if (x < 0 || x > W || z < 0 || z > H) continue;
    ctx.fillStyle = it.kind === 'weapon' ? '#3fa9ff' : it.kind === 'health' ? '#2ee08a' : it.kind === 'cash' ? '#f7c04a' : '#ff9f1c';
    ctx.fillRect(x - 1.6, z - 1.6, 3.2, 3.2);
  }

  // Airdrops.
  for (const ad of G.airdrops) {
    const x = cx + (ad.x - px) * scale;
    const z = cy + (ad.z - pz) * scale;
    if (x < 0 || x > W || z < 0 || z > H) continue;
    ctx.fillStyle = '#68e6a0';
    ctx.beginPath(); ctx.arc(x, z, ad.landed ? 3.4 : 5, 0, TAU); ctx.fill();
    if (!ad.landed) {
      ctx.strokeStyle = 'rgba(104,230,160,0.5)';
      ctx.beginPath(); ctx.arc(x, z, 8 + Math.sin(G.elapsed * 5) * 2, 0, TAU); ctx.stroke();
    }
  }

  // Enemies.
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const x = cx + (e.mesh.position.x - px) * scale;
    const z = cy + (e.mesh.position.z - pz) * scale;
    if (x < -6 || x > W + 6 || z < -6 || z > H + 6) continue;
    ctx.fillStyle = e.def.boss ? '#ff2d55' : e.type === 'sniper' ? '#39ff88' : e.type === 'heavy' ? '#a855f7' : e.type === 'runner' ? '#ffa53d' : '#ff5a5a';
    ctx.beginPath();
    ctx.arc(x, z, e.def.boss ? 5.5 : 2.8, 0, TAU);
    ctx.fill();
    if (e.def.boss) {
      ctx.strokeStyle = 'rgba(255,45,85,0.55)';
      ctx.beginPath(); ctx.arc(x, z, 9 + Math.sin(G.elapsed * 4) * 2, 0, TAU); ctx.stroke();
    }
  }

  // Player view cone + arrow.
  const heading = headingOf(G.yaw) * DEG;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(heading);
  ctx.fillStyle = 'rgba(247,192,74,0.12)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 28, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f7c04a';
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5.5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5.5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // North marker.
  ctx.fillStyle = 'rgba(255,150,150,0.9)';
  ctx.font = '700 9px Bahnschrift, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('N', W / 2, 12);

  // Border.
  ctx.strokeStyle = 'rgba(247,192,74,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}

function updateHUD(dt) {
  if (!UI.hud) return;
  const now = G.elapsed;
  if (G.mobile) updateTouchButtons();
  UI.mmTime.textContent = fmtTime(now);
  UI.objective.style.opacity = now < 14 ? '1' : '0';

  // Vignette from damage.
  G.vignette = damp(G.vignette, 0, 4.5, dt);
  UI.vignette.style.opacity = String(clamp(G.vignette, 0, 1));

  // Damage direction fade.
  if (G.dmgDirT > 0) {
    G.dmgDirT -= dt;
    UI.damageDir.style.opacity = String(clamp(G.dmgDirT / 0.8, 0, 0.65));
    if (G.dmgDirT <= 0) UI.damageDir.style.opacity = '0';
  }

  // Low-health pulse.
  if (G.hp > 0 && G.hp / G.maxHp < 0.3) {
    UI.lowHp.style.opacity = String(0.25 + Math.abs(Math.sin(now * 4)) * 0.35);
  }

  updateBossBar();

  G.hudAccum = (G.hudAccum || 0) + dt;
  if (G.hudAccum >= 0.045) {
    G.hudAccum = 0;
    drawCompass();
    drawMinimap();
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 29. SHOP
// ───────────────────────────────────────────────────────────────────────────
let SHOP_TAB = 'supplies';

function openShop() {
  G.mode = 'shop';
  G.running = false;
  G.trigger = false;
  G.firing = false;
  G.ads = false;
  G.adsAmt = 0;
  G.keys = {};
  G.touchMove.x = 0;
  G.touchMove.y = 0;
  UI.scope.classList.add('hidden');
  UI.scope.style.opacity = '0';
  UI.hud.classList.add('hidden');
  UI.shop.classList.remove('hidden');
  UI.shopWave.textContent = G.wave;
  SHOP_TAB = 'supplies';
  updateShopTabs();
  renderShop();
  Audio.buy();
  G.suppressLock = true;
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => { G.suppressLock = false; }, 80);
}

function updateShopTabs() {
  for (const tab of UI.shopTabs) {
    tab.classList.toggle('active', tab.getAttribute('data-tab') === SHOP_TAB);
  }
}

function setShopTab(tab) {
  SHOP_TAB = tab;
  updateShopTabs();
  renderShop();
  Audio.ui();
}

function shopButton(label, price, disabled, onClick, cls) {
  const btn = document.createElement('button');
  btn.className = 'buy' + (cls ? ' ' + cls : '');
  btn.textContent = label;
  btn.disabled = !!disabled;
  if (!disabled && onClick) btn.onclick = onClick;
  return btn;
}

function makeShopItem(entry) {
  const row = document.createElement('div');
  row.className = 'shop-item' + (entry.state ? ' ' + entry.state : '');
  const ico = document.createElement('div');
  ico.className = 'ico';
  ico.textContent = entry.ico;
  row.appendChild(ico);
  const info = document.createElement('div');
  info.className = 'info';
  const b = document.createElement('b');
  b.textContent = entry.name;
  const sm = document.createElement('small');
  sm.textContent = entry.desc;
  info.appendChild(b); info.appendChild(sm);
  row.appendChild(info);
  const btn = shopButton(
    entry.label || money(entry.price),
    entry.price,
    entry.disabled,
    entry.buy ? () => {
      if (G.cash < entry.price) return;
      G.cash -= entry.price;
      entry.buy();
      Audio.buy();
      updateStatsUI();
      renderShop();
    } : null
  );
  row.appendChild(btn);
  return row;
}

function renderShop() {
  if (!UI.shopItems) return;
  UI.shopItems.innerHTML = '';
  UI.shopCash.textContent = Math.round(G.cash);
  let entries = [];

  if (SHOP_TAB === 'supplies') {
    entries.push({
      ico: '🩹', name: 'MEDKIT', desc: 'Field healing item. Press H to restore 55 HP.',
      price: 100, disabled: G.cash < 100 || G.medkits >= 9,
      label: G.medkits >= 9 ? 'MAX' : '$100',
      buy: () => { G.medkits++; updateConsumablesUI(); showToast('+1 MEDKIT'); },
    });
    entries.push({
      ico: '🛡️', name: 'ARMOR PLATE', desc: 'Press T to reinforce armour by 50 points.',
      price: 150, disabled: G.cash < 150 || G.plates >= 9,
      label: G.plates >= 9 ? 'MAX' : '$150',
      buy: () => { G.plates++; updateConsumablesUI(); showToast('+1 ARMOR PLATE'); },
    });
    entries.push({
      ico: '💣', name: 'GRENADE PACK', desc: 'Two frag grenades. Great for clearing campers.',
      price: 80, disabled: G.cash < 80 || G.grenades >= 9,
      label: G.grenades >= 9 ? 'MAX' : '$80',
      buy: () => { G.grenades += 2; updateConsumablesUI(); showToast('+2 GRENADES'); },
    });
    entries.push({
      ico: '📦', name: 'AMMO CRATE', desc: 'Refill the current weapon and add reserve ammo.',
      price: 70, disabled: G.cash < 70,
      label: '$70',
      buy: () => {
        const idx = G.weaponIndex;
        G.ammo[idx] = weaponMag(idx);
        if (G.reserve[idx] !== Infinity) G.reserve[idx] = Math.min(RESERVE_CAP[idx], G.reserve[idx] + WEAPONS[idx].mag * 3);
        updateAmmoUI(); showToast('AMMO RESUPPLIED');
      },
    });
    entries.push({
      ico: '❤️', name: 'FULL PATCH-UP', desc: 'Instant full health. Expensive, but worth it.',
      price: 260, disabled: G.cash < 260 || G.hp >= G.maxHp,
      label: G.hp >= G.maxHp ? 'FULL' : '$260',
      buy: () => { G.hp = G.maxHp; updateHPUI(); flashHeal(); showToast('HEALTH RESTORED'); },
    });
  } else if (SHOP_TAB === 'weapons') {
    const base = [1, 2, 3, 4];
    for (const idx of base) {
      const w = WEAPONS[idx];
      const owned = G.owned.indexOf(idx) !== -1;
      const desc = w.type.toUpperCase() + ' · ' + w.dmg + ' dmg · ' + w.mag + ' mag' + (w.auto ? ' · AUTO' : '');
      entries.push({
        ico: w.ico, name: w.name, desc,
        price: w.price, disabled: owned || G.cash < w.price,
        state: owned ? 'owned' : '',
        label: owned ? 'OWNED' : money(w.price),
        buy: owned ? null : () => {
          G.owned.push(idx);
          G.ammo[idx] = weaponMag(idx);
          G.reserve[idx] = Math.max(G.reserve[idx], Math.round(w.mag * 3));
          G.weaponIndex = idx;
          updateWeaponSlots();
          updateAmmoUI();
          showToast(w.name + ' ACQUIRED — equipped for next wave');
        },
      });
    }
  } else {
    const idx = G.weaponIndex;
    const lv = G.upgrades[idx] || 0;
    const w = WEAPONS[idx];
    const price = 250 + lv * 250;
    const maxed = lv >= MAX_UPGRADE;
    entries.push({
      ico: '⚡', name: 'UPGRADE ' + w.name + '  ·  LV ' + lv + '/' + MAX_UPGRADE,
      desc: maxed ? 'Maximum level reached.' : '+18% damage · +6% fire rate · +12% magazine',
      price, disabled: maxed || G.cash < price,
      state: maxed ? 'maxed' : '',
      label: maxed ? 'MAX' : money(price),
      buy: maxed ? null : () => {
        G.upgrades[idx] = lv + 1;
        G.ammo[idx] = Math.min(G.ammo[idx], weaponMag(idx));
        Audio.upgrade();
        showToast(w.name + ' UPGRADED TO LV ' + (lv + 1));
        updateAmmoUI();
      },
    });

    const hpLv = G.perks.hp || 0;
    const hpPrice = 320 + hpLv * 180;
    entries.push({
      ico: '❤️‍🔥', name: 'VITALITY  ·  ' + hpLv + '/3',
      desc: hpLv >= 3 ? 'Maximum health fully upgraded.' : '+25 max HP, instantly healed.',
      price: hpPrice, disabled: hpLv >= 3 || G.cash < hpPrice,
      state: hpLv >= 3 ? 'maxed' : '',
      label: hpLv >= 3 ? 'MAX' : money(hpPrice),
      buy: hpLv >= 3 ? null : () => {
        G.perks.hp = hpLv + 1;
        G.maxHp += 25;
        G.hp = Math.min(G.maxHp, G.hp + 25);
        updateHPUI();
        showToast('MAX HP +25');
      },
    });

    const spLv = G.perks.speed || 0;
    const spPrice = 300 + spLv * 200;
    entries.push({
      ico: '🥾', name: 'AGILITY  ·  ' + spLv + '/3',
      desc: spLv >= 3 ? 'Maximum movement speed.' : '+5% movement speed.',
      price: spPrice, disabled: spLv >= 3 || G.cash < spPrice,
      state: spLv >= 3 ? 'maxed' : '',
      label: spLv >= 3 ? 'MAX' : money(spPrice),
      buy: spLv >= 3 ? null : () => {
        G.perks.speed = spLv + 1;
        showToast('MOVEMENT SPEED +5%');
      },
    });

    const rlLv = G.perks.reload || 0;
    const rlPrice = 280 + rlLv * 180;
    entries.push({
      ico: '🔄', name: 'QUICK HANDS  ·  ' + rlLv + '/3',
      desc: rlLv >= 3 ? 'Maximum reload speed.' : '-9% reload time on every weapon.',
      price: rlPrice, disabled: rlLv >= 3 || G.cash < rlPrice,
      state: rlLv >= 3 ? 'maxed' : '',
      label: rlLv >= 3 ? 'MAX' : money(rlPrice),
      buy: rlLv >= 3 ? null : () => {
        G.perks.reload = rlLv + 1;
        showToast('RELOAD SPEED +9%');
      },
    });
  }

  for (const entry of entries) UI.shopItems.appendChild(makeShopItem(entry));
}

function nextWave() {
  if (G.mode !== 'shop') return;
  UI.shop.classList.add('hidden');
  UI.hud.classList.remove('hidden');
  G.mode = 'playing';
  G.running = true;
  G.trigger = false;
  G.firing = false;
  Audio.resume();
  buildViewmodel();
  requestLock();
  startWave(G.wave + 1);
}

// ───────────────────────────────────────────────────────────────────────────
// 30. NIGHT MODE / WEATHER
// ───────────────────────────────────────────────────────────────────────────
const LIGHT_BASE = { ambient: 0.64, hemi: 0.82, sun: 1.7, fillA: 18, fillB: 13, exposure: 1.24 };

function applyNight(enabled, instant) {
  G.night = !!enabled;
  G.nightTarget = enabled ? 1 : 0;
  if (enabled) {
    G.flashlight = true;
    showToast('NIGHT OPS — flashlight auto-equipped (F to toggle)');
  } else {
    G.flashlight = false;
  }
  if (instant) {
    G.nightAmt = G.nightTarget;
    if (!enabled && torchLight) torchLight.intensity = 0;
    updateAmbient(0);
  }
}

function updateAmbient(dt) {
  const target = G.night ? 1 : 0;
  G.nightAmt = damp(G.nightAmt, target, 1.8, Math.max(dt, 0.0001));
  const a = G.nightAmt;
  if (ambientLight) ambientLight.intensity = lerp(LIGHT_BASE.ambient, 0.10, a);
  if (hemiLight) hemiLight.intensity = lerp(LIGHT_BASE.hemi, 0.16, a);
  if (sunLight) sunLight.intensity = lerp(LIGHT_BASE.sun, 0.12, a);
  if (fillLightA) fillLightA.intensity = lerp(LIGHT_BASE.fillA, 6, a);
  if (fillLightB) fillLightB.intensity = lerp(LIGHT_BASE.fillB, 5, a);
  if (nightDome) nightDome.material.opacity = a * 0.76;
  if (renderer) renderer.toneMappingExposure = lerp(LIGHT_BASE.exposure, 0.78, a);
  if (scene && scene.fog) {
    scene.fog.color.copy(World.originalFog.color).lerp(new THREE.Color(0x0a1320), a);
    scene.fog.near = lerp(World.originalFog.near, 26, a);
    scene.fog.far = lerp(World.originalFog.far, 125, a);
  }
  if (torchLight) {
    const targetIntensity = G.flashlight ? 95 : 0;
    torchLight.intensity = damp(torchLight.intensity, targetIntensity, 8, Math.max(dt, 0.0001));
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 31. WAVES
// ───────────────────────────────────────────────────────────────────────────
function pickEnemyType(wave, swarm) {
  const w = {
    grunt: Math.max(14, 52 - wave * 2.2),
    runner: wave >= 2 ? (swarm ? 48 : Math.min(38, 16 + wave * 2.2)) : 0,
    heavy: wave >= 4 ? Math.min(28, 8 + wave * 1.6) : 0,
    sniper: wave >= 6 ? Math.min(22, 6 + wave * 1.3) : 0,
  };
  let total = 0;
  for (const k in w) total += w[k];
  let roll = Math.random() * total;
  for (const k in w) {
    roll -= w[k];
    if (roll <= 0) return k;
  }
  return 'grunt';
}

function startWave(n) {
  G.wave = n;
  G.waveEnding = false;
  G.spawnQueue = [];
  G.spawnTimer = 0.8;
  G.airdropAt = Infinity;
  G.mode = 'playing';
  G.running = true;
  UI.hud.classList.remove('hidden');
  UI.shop.classList.add('hidden');
  UI.pause.classList.add('hidden');
  UI.gameOver.classList.add('hidden');

  const boss = n % 5 === 0;
  const swarm = n % 6 === 0 && !boss;
  const night = n >= 4 && n % 4 === 0 && !boss;

  let count;
  if (boss) {
    G.spawnQueue.push('boss');
    count = 4 + Math.floor(n * 0.7);
    for (let i = 0; i < count; i++) G.spawnQueue.push(pickEnemyType(n, false));
  } else {
    count = Math.min(26, 4 + Math.floor(n * 1.3));
    if (swarm) count += 6;
    for (let i = 0; i < count; i++) G.spawnQueue.push(pickEnemyType(n, swarm));
  }

  // Shuffle, but keep the boss near the front.
  const bossType = G.spawnQueue.shift();
  G.spawnQueue.sort(() => Math.random() - 0.5);
  if (bossType) G.spawnQueue.unshift(bossType);

  applyNight(night, false);

  if (boss) {
    announceWave('WAVE ' + n, 'WARLORD INCOMING');
    Audio.boss();
    UI.objective.textContent = '🎯 Kill the Warlord and its escort';
  } else if (night) {
    announceWave('NIGHT OPS', 'WAVE ' + n + ' · LOW VISIBILITY');
    Audio.wave();
    UI.objective.textContent = '🎯 Night wave · use the flashlight';
  } else if (swarm) {
    announceWave('SWARM', 'WAVE ' + n + ' · MASS ASSAULT');
    Audio.wave();
    UI.objective.textContent = '🎯 Swarm inbound · hold your ground';
  } else {
    announceWave('WAVE ' + n, n === 1 ? 'HOLD THE LINE' : 'ENEMIES INBOUND');
    Audio.wave();
    UI.objective.textContent = '🎯 Eliminate every hostile · Survive the wave';
  }

  if (n === 1) {
    spawnRandomLoot();
  } else {
    // Keep the map stocked between waves.
    const existing = G.loot.length;
    if (existing < 12) {
      const spots = [[-25, -16], [22, -20], [-26, 24], [26, 22], [0, 28], [2, -36], [15, 3], [-13, 10]];
      for (let i = 0; i < Math.min(4, spots.length); i++) {
        const p = spots[i];
        const r = Math.random();
        if (r < 0.34) spawnLoot('ammo', p[0], p[1], {}, 'AMMO');
        else if (r < 0.58) spawnLoot('health', p[0], p[1], {}, 'MEDKIT');
        else if (r < 0.78) spawnLoot('armor', p[0], p[1], {}, 'ARMOR PLATE');
        else spawnLoot('grenade', p[0], p[1], {}, 'GRENADE');
      }
    }
  }

  if (n % 3 === 0) G.airdropAt = G.elapsed + 9;

  updateStatsUI();
  updateWeaponSlots();
  updateAmmoUI();
  updateHPUI();
  updateArmorUI();
  updateConsumablesUI();
}

function updateWaves(dt, now) {
  if (G.airdropAt && G.elapsed >= G.airdropAt) {
    G.airdropAt = Infinity;
    spawnAirdrop(false);
  }
  if (G.spawnQueue.length > 0) {
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      const type = G.spawnQueue.shift();
      spawnEnemy(type);
      const base = Math.max(0.48, 1.9 - G.wave * 0.055);
      G.spawnTimer = base * rand(0.78, 1.2);
      updateEnemyUI();
    }
  }
  if (G.spawnQueue.length === 0 && G.enemies.length === 0) checkWaveClear();
}

function checkWaveClear() {
  if (G.mode !== 'playing' || !G.running || G.waveEnding || G.wave === 0) return;
  if (G.enemies.length > 0 || G.spawnQueue.length > 0) return;
  G.waveEnding = true;
  G.waveClearedAt = G.elapsed;
  setTimeout(() => {
    if (G.mode === 'playing' && G.waveEnding && G.enemies.length === 0 && G.spawnQueue.length === 0) waveCleared();
  }, 950);
}

function waveCleared() {
  if (G.mode !== 'playing') { G.waveEnding = false; return; }
  G.mode = 'shop';
  G.running = false;
  G.waveEnding = false;
  G.trigger = false;
  G.firing = false;
  G.ads = false;

  const bonus = 110 + G.wave * 55;
  G.cash += bonus;
  G.score += 120 * G.wave;
  G.hp = Math.min(G.maxHp, G.hp + 18);
  if (G.wave > SAVE.bestWave) { SAVE.bestWave = G.wave; persist(); updateBestLabels(); }
  updateStatsUI();
  updateHPUI();
  flashHeal();
  Audio.wave();
  showStreak('WAVE ' + G.wave + ' CLEARED  ·  +' + money(bonus));
  openShop();
}

// ───────────────────────────────────────────────────────────────────────────
// 32. RUN FLOW
// ───────────────────────────────────────────────────────────────────────────
function clearCombatObjects() {
  for (const e of G.enemies) {
    if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
    disposeObject3D(e.mesh);
    if (e.hpBar.parent) e.hpBar.parent.remove(e.hpBar);
    disposeObject3D(e.hpBar);
    if (e.laser && e.laser.parent) e.laser.parent.remove(e.laser);
    if (e.laser) disposeObject3D(e.laser);
  }
  G.enemies.length = 0;
  G.spawnQueue.length = 0;
  for (const g of G.grenadesActive) {
    if (g.mesh && g.mesh.parent) g.mesh.parent.remove(g.mesh);
    if (g.mesh) disposeObject3D(g.mesh);
  }
  G.grenadesActive.length = 0;
  clearLoot();
  clearAirdrops();
  for (const e of G.effects) cleanupEffect(e);
  G.effects.length = 0;
  for (const d of G.decals) {
    if (d.mesh.parent) d.mesh.parent.remove(d.mesh);
    d.mesh.geometry.dispose();
    d.mesh.material.dispose();
  }
  G.decals.length = 0;
  UI.dmgLayer.innerHTML = '';
  UI.killFeed.innerHTML = '';
  UI.scope.classList.add('hidden');
  UI.scope.style.opacity = '0';
}

function resetRun() {
  clearCombatObjects();
  G.wave = 0;
  G.kills = 0;
  G.score = 0;
  G.cash = 0;
  G.headshots = 0;
  G.shotsFired = 0;
  G.shotsHit = 0;
  G.damageDealt = 0;
  G.elapsed = 0;
  G.lastDamage = -99;
  G.combo = 0;
  G.comboAt = 0;
  G.hp = 100;
  G.maxHp = 100;
  G.armor = 0;
  G.maxArmor = 100;
  G.stamina = 100;
  G.grenades = 3;
  G.medkits = 2;
  G.plates = 1;
  G.owned = [0];
  G.weaponIndex = 0;
  G.ammo = [12, 0, 0, 0, 0, 0, 0, 0];
  G.reserve = [Infinity, 0, 0, 0, 0, 0, 0, 0];
  G.upgrades = [0, 0, 0, 0, 0, 0, 0, 0];
  G.perks = { hp: 0, speed: 0, reload: 0 };
  G.reloading = false;
  G.reloadWeapon = -1;
  G.reloadEnd = 0;
  G.switchT = 0;
  G.firing = false;
  G.trigger = false;
  G.ads = false;
  G.adsAmt = 0;
  G.crouch = false;
  G.crouchAmt = 0;
  G.onGround = true;
  G.vy = 0;
  G.velX = 0;
  G.velZ = 0;
  G.bobPhase = 0;
  G.bobAmt = 0;
  G.camShake = 0;
  G.vignette = 0;
  G.yaw = 0;
  G.pitch = 0;
  G.recoil = 0;
  G.recoilKick = 0;
  G.dmgDirT = 0;
  G.hudAccum = 0;
  G.keys = {};
  G.touchMove.x = 0;
  G.touchMove.y = 0;
  G.over = false;
  G.waveEnding = false;
  G.nearLoot = null;
  G.nearAirdrop = null;
  G.airdropAt = Infinity;
  G.plane = null;
  G.hp = 100;
  camera.position.set(0, CFG.PLAYER_H, 4);
  camera.fov = 75;
  camera.updateProjectionMatrix();
  applyNight(false, true);
  if (gunRoot) gunRoot.visible = false;
  UI.hud.classList.remove('hidden');
  UI.pause.classList.add('hidden');
  UI.shop.classList.add('hidden');
  UI.gameOver.classList.add('hidden');
  UI.lootPrompt.classList.add('hidden');
  UI.waveAnnounce.classList.add('hidden');
  UI.streakBanner.classList.add('hidden');
  UI.bossBar.classList.add('hidden');
  UI.reloadBar.classList.add('hidden');
  UI.damageDir.style.opacity = '0';
  UI.vignette.style.opacity = '0';
  UI.toast.classList.remove('show');
  UI.recordBanner.classList.add('hidden');
  updateHPUI();
  updateArmorUI();
  updateStaminaUI();
  updateAmmoUI();
  updateConsumablesUI();
  updateWeaponSlots();
  updateStatsUI();
}

function startRun() {
  if (G.mode === 'playing' && G.running) return;
  Audio.resume();
  Audio.startAmbience();
  resetRun();
  G.bestWaveAtStart = SAVE.bestWave;
  G.bestScoreAtStart = SAVE.bestScore;
  G.bestKillsAtStart = SAVE.bestKills;
  G.started = true;
  G.mode = 'playing';
  G.running = true;
  G.paused = false;
  G.over = false;
  UI.menu.classList.add('hidden');
  UI.hud.classList.remove('hidden');
  buildViewmodel();
  updateWeaponSlots();
  updateAmmoUI();
  updateHPUI();
  updateArmorUI();
  updateConsumablesUI();
  updateStatsUI();
  requestLock();
  startWave(1);
  showToast('WELCOME TO THE ARENA — STAY ALIVE');
}

function gameOver() {
  if (G.mode === 'over') return;
  G.over = true;
  G.mode = 'over';
  G.running = false;
  G.trigger = false;
  G.firing = false;
  G.ads = false;
  G.adsAmt = 0;
  G.keys = {};
  G.touchMove.x = 0;
  G.touchMove.y = 0;
  G.suppressLock = true;
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => { G.suppressLock = false; }, 80);

  const acc = Math.round((G.shotsHit / Math.max(1, G.shotsFired)) * 100);
  const prevWave = G.bestWaveAtStart == null ? SAVE.bestWave : G.bestWaveAtStart;
  const prevScore = G.bestScoreAtStart == null ? SAVE.bestScore : G.bestScoreAtStart;
  const prevKills = G.bestKillsAtStart == null ? SAVE.bestKills : G.bestKillsAtStart;
  const newRecord = G.score > prevScore || G.wave > prevWave || G.kills > prevKills;
  if (G.score > SAVE.bestScore) SAVE.bestScore = Math.round(G.score);
  if (G.wave > SAVE.bestWave) SAVE.bestWave = G.wave;
  if (G.kills > SAVE.bestKills) SAVE.bestKills = G.kills;
  persist();
  updateBestLabels();

  UI.hud.classList.add('hidden');
  UI.gameOver.classList.remove('hidden');
  UI.recordBanner.classList.toggle('hidden', !newRecord);
  UI.scope.classList.add('hidden');
  UI.scope.style.opacity = '0';
  UI.goSub.textContent = 'You survived ' + G.wave + (G.wave === 1 ? ' wave' : ' waves') + ' and ' + fmtTime(G.elapsed) + '.';
  UI.goKills.textContent = G.kills;
  UI.goWave.textContent = G.wave;
  UI.goScore.textContent = Math.round(G.score);
  UI.goAcc.textContent = acc + '%';
  UI.goHead.textContent = G.headshots;
  UI.goTime.textContent = fmtTime(G.elapsed);
  if (gunRoot) gunRoot.visible = false;
  G.flashlight = false;
  if (torchLight) torchLight.intensity = 0;
  Audio.hurt();
}

function goMenu() {
  resetRun();
  G.mode = 'menu';
  G.running = false;
  G.paused = false;
  G.over = false;
  G.started = false;
  UI.gameOver.classList.add('hidden');
  UI.pause.classList.add('hidden');
  UI.shop.classList.add('hidden');
  UI.hud.classList.add('hidden');
  UI.menu.classList.remove('hidden');
  if (gunRoot) gunRoot.visible = false;
  if (torchLight) torchLight.intensity = 0;
  updateBestLabels();
  Audio.ui();
}

function restartRun() {
  UI.gameOver.classList.add('hidden');
  UI.pause.classList.add('hidden');
  startRun();
}

// ───────────────────────────────────────────────────────────────────────────
// 33. EVENT BINDING
// ───────────────────────────────────────────────────────────────────────────
function bindEvents() {
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('mousemove', mouseMove);
  window.addEventListener('mousedown', mouseDown);
  window.addEventListener('mouseup', mouseUp);
  window.addEventListener('wheel', wheelEvent, { passive: false });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.mode === 'playing') pauseGame();
  });

  UI.startBtn.addEventListener('click', () => { Audio.resume(); startRun(); });
  UI.restartBtn.addEventListener('click', restartRun);
  UI.menuBtn.addEventListener('click', goMenu);
  UI.resumeBtn.addEventListener('click', resumeGame);
  UI.pauseRestartBtn.addEventListener('click', restartRun);
  UI.nextWaveBtn.addEventListener('click', nextWave);
  UI.muteBtn.addEventListener('click', toggleMute);

  UI.pause.addEventListener('click', (e) => { if (e.target === UI.pause) resumeGame(); });

  for (const tab of UI.shopTabs) {
    tab.addEventListener('click', () => setShopTab(tab.getAttribute('data-tab')));
  }

  UI.sensRange.value = String(Math.round(G.sens * 100));
  UI.sensVal.textContent = G.sens.toFixed(2) + '×';
  const updateSensUI = () => {
    const v = Number(UI.sensRange.value);
    G.sens = v / 100;
    UI.sensVal.textContent = G.sens.toFixed(2) + '×';
    SAVE.sens = G.sens;
    persist();
    const pct = ((v - 40) / 180) * 100;
    UI.sensRange.style.background = 'linear-gradient(90deg, #f7c04a 0%, #f7c04a ' + pct + '%, #2b3546 ' + pct + '%, #2b3546 100%)';
  };
  UI.sensRange.addEventListener('input', updateSensUI);
  UI.sensRange.addEventListener('change', () => Audio.ui());
  updateSensUI();

  UI.muteBtn.textContent = G.muted ? '🔇 SOUND OFF' : '🔊 SOUND ON';

  window.addEventListener('blur', () => {
    if (G.mode === 'playing') { G.firing = false; G.trigger = false; }
  });
}

// ───────────────────────────────────────────────────────────────────────────
// 34. MAIN LOOP
// ───────────────────────────────────────────────────────────────────────────
function updateInteractionPrompt() {
  if (!UI.lootPrompt) return;
  if (G.nearAirdrop) {
    UI.lootPrompt.classList.remove('hidden');
    UI.lootPrompt.innerHTML = 'Press <kbd>E</kbd> to open <b style="color:#68e6a0">AIRDROP</b>';
  } else if (G.nearLoot) {
    UI.lootPrompt.classList.remove('hidden');
    UI.lootPrompt.innerHTML = 'Press <kbd>E</kbd> to pick up <b>' + G.nearLoot.label + '</b>';
  } else {
    UI.lootPrompt.classList.add('hidden');
  }
}

function tick(dt) {
  const now = nowMs();
  updateAmbient(dt);

  if (G.mode === 'menu') {
    updateMenuCamera(dt);
    return;
  }

  if (G.mode === 'playing' && G.running) {
    G.elapsed += dt;
    updatePlayer(dt, now);
    updateEnemies(dt, now);
    updateGrenades(dt);
    updateLoot(dt);
    updateAirdrops(dt);
    updateFireBarrels(dt);
    updateEffects(dt);
    updateWeapon(dt, now);
    updateWaves(dt, now);
    updateCamera(dt);
    updateViewmodel(dt);
    updateHUD(dt);
    updateInteractionPrompt();
  } else if (G.mode === 'paused') {
    updateViewmodel(dt);
  } else {
    updateEffects(dt);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  tick(dt);
  renderer.render(scene, camera);
}

// ───────────────────────────────────────────────────────────────────────────
// 35. BOOT
// ───────────────────────────────────────────────────────────────────────────
function init() {
  G.mobile = IS_TOUCH;
  if (G.mobile) document.body.classList.add('touch');
  cacheUI();
  initEngine();
  buildTextures();
  buildMaterials();
  buildWorld();
  bindEvents();
  initTouchControls();
  applyNight(false, true);
  updateBestLabels();
  updateHPUI();
  updateArmorUI();
  updateStaminaUI();
  updateAmmoUI();
  updateConsumablesUI();
  updateWeaponSlots();
  updateStatsUI();
  UI.menu.classList.remove('hidden');
  UI.hud.classList.add('hidden');
  UI.gameOver.classList.add('hidden');
  UI.pause.classList.add('hidden');
  UI.shop.classList.add('hidden');
  UI.scope.classList.add('hidden');
  UI.scope.style.opacity = '0';
  G.lastFrame = nowMs();
  animate();

  // Debug / automation hooks.
  window.PUBG3D = {
    G, WEAPONS, World, renderer, scene, camera,
    startRun, startWave, spawnEnemy, spawnAirdrop, spawnLoot, gameOver, goMenu, applyNight,
    fireWeapon, switchWeapon, startReload, damageEnemy, openShop, waveCleared, nextWave,
    spawnRandomLoot, throwGrenade, useMedkit, useArmorPlate,
    pauseGame, resumeGame, initTouchControls,
  };
  window.__androidBack = function () {
    if (!window.PUBG3D) return 'exit';
    const mode = PUBG3D.G.mode;
    if (mode === 'playing') { PUBG3D.pauseGame(); return 'paused'; }
    if (mode === 'paused' || mode === 'shop' || mode === 'over') { PUBG3D.goMenu(); return 'menu'; }
    return 'exit';
  };
  window.__sim = function (dt, frames) {
    dt = dt || 0.016;
    frames = frames || 1;
    for (let i = 0; i < frames; i++) tick(dt);
    renderer.render(scene, camera);
  };
  window.__render = function () { renderer.render(scene, camera); };
}

init();

/*__END__*/







