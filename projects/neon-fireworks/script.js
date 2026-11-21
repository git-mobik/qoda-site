'use strict';

var canvas = document.getElementById('sky');
var ctx = canvas.getContext('2d');
var W = 0, H = 0, DPR = 1;
var stars = [];
var rockets = [];
var particles = [];
var shockwaves = [];
var confetti = [];
var shootingStars = [];
var aura = [];
var last = performance.now();

var autoShow = false;
var soundOn = true;
var attractMode = false;
var mouse = { x: -999, y: -999, down: false };
var launchCount = 0;
var combo = 0;
var comboTimer = 0;
var shake = 0;
var wind = 0;
var windTarget = 0;
var windTimer = 0;
var frameCount = 0;
var fpsAcc = 0, fpsFrames = 0;
var quality = 'high';
var gravityMul = 1;
var sizeMul = 1;
var trailFade = 0.22;
var theme = 'neon';
var shootingTimer = 200;

var THEMES = {
  neon: [
    [0, 255, 255], [255, 60, 200], [255, 210, 60],
    [120, 255, 140], [255, 120, 60], [180, 120, 255], [255, 255, 255]
  ],
  pastel: [
    [255, 182, 193], [173, 216, 230], [221, 160, 221],
    [176, 224, 230], [255, 218, 185], [200, 230, 201], [245, 245, 220]
  ],
  fire: [
    [255, 94, 0], [255, 154, 0], [255, 206, 84],
    [255, 61, 0], [255, 0, 0], [255, 180, 100], [255, 240, 180]
  ],
  ice: [
    [180, 230, 255], [100, 200, 255], [220, 240, 255],
    [150, 200, 255], [200, 255, 255], [80, 160, 255], [255, 255, 255]
  ],
  rainbow: [
    [255, 0, 0], [255, 127, 0], [255, 255, 0],
    [0, 255, 0], [0, 127, 255], [75, 0, 130], [148, 0, 211]
  ]
};

var TYPES = [
  'peony', 'ring', 'palm', 'willow', 'heart', 'star', 'double',
  'crackle', 'chrysanthemum', 'crossette', 'fish', 'spiral', 'strobe'
];

function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rgba(r, g, b, a) { return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function getPalette() { return THEMES[theme] || THEMES.neon; }

function loadState() {
  try {
    var s = JSON.parse(localStorage.getItem('nf_state') || '{}');
    if (s.theme && THEMES[s.theme]) theme = s.theme;
    if (s.quality) quality = s.quality;
    if (typeof s.gravityMul === 'number') gravityMul = s.gravityMul;
    if (typeof s.sizeMul === 'number') sizeMul = s.sizeMul;
    if (typeof s.trailFade === 'number') trailFade = s.trailFade;
    if (typeof s.soundOn === 'boolean') soundOn = s.soundOn;
  } catch (e) {}
}

function saveState() {
  try {
    localStorage.setItem('nf_state', JSON.stringify({
      theme: theme, quality: quality, gravityMul: gravityMul,
      sizeMul: sizeMul, trailFade: trailFade, soundOn: soundOn
    }));
  } catch (e) {}
}

var Sound = (function () {
  var actx = null;
  function ac() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function noise(dur, vol, freq) {
    if (!soundOn) return;
    try {
      var c = ac();
      var buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      var src = c.createBufferSource();
      src.buffer = buf;
      var f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq || 800;
      var g = c.createGain();
      g.gain.setValueAtTime(vol || 0.2, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start(); src.stop(c.currentTime + dur);
    } catch (e) {}
  }
  function tone(f0, f1, dur, vol, type) {
    if (!soundOn) return;
    try {
      var c = ac();
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(f1, c.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.1, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + dur);
    } catch (e) {}
  }
  return {
    launch: function () { noise(0.2, 0.09, 1400); tone(500, 1100, 0.25, 0.04); },
    boom: function (big) {
      noise(big ? 0.6 : 0.42, big ? 0.32 : 0.22, big ? 380 : 600);
      tone(big ? 90 : 130, 40, big ? 0.48 : 0.32, 0.15);
    },
    pop: function () { tone(900, 400, 0.12, 0.06, 'triangle'); }
  };
})();

function toast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove('show'); }, 1400);
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  buildStars();
  buildAura();
}

function buildStars() {
  stars = [];
  var count = Math.floor((W * H) / 6000);
  for (var i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * W, y: Math.random() * H,
      r: rand(0.3, 1.6), tw: rand(0, 6.283), sp: rand(0.008, 0.038)
    });
  }
}

function buildAura() {
  aura = [];
  for (var i = 0; i < 4; i++) {
    aura.push({
      y: rand(H * 0.5, H * 0.95),
      amp: rand(40, 110),
      freq: rand(0.002, 0.006),
      speed: rand(0.15, 0.4),
      phase: rand(0, 6.283),
      hue: i
    });
  }
}

function pickColor() { return pick(getPalette()); }

function updateCount() { var el = document.getElementById('count'); if (el) el.textContent = launchCount; }
function updateCombo() { var el = document.getElementById('combo'); if (el) el.textContent = combo; }
function updateParticles() { var el = document.getElementById('pcount'); if (el) el.textContent = particles.length; }
function updateFps(v) { var el = document.getElementById('fps'); if (el) el.textContent = Math.round(v); }

function launch(x, targetY, big, type) {
  var col = pickColor();
  rockets.push({
    x: x, y: H + 10,
    vx: rand(-0.5, 0.5),
    vy: -(10 + Math.random() * 4) - (big ? 2.2 : 0),
    targetY: Math.min(targetY, H * 0.85),
    color: col, big: !!big, type: type || null, trail: []
  });
  launchCount++;
  updateCount();
  Sound.launch();
}

function addParticle(x, y, vx, vy, color, opts) {
  opts = opts || {};
  var s = opts.size !== undefined ? opts.size : rand(1, 2.6);
  var dec = opts.decay !== undefined ? opts.decay : rand(0.008, 0.02);
  var gr = opts.gravity !== undefined ? opts.gravity : 0.05;
  var fr = opts.friction !== undefined ? opts.friction : 0.985;
  var mix = 0.65 + Math.random() * 0.35;
  particles.push({
    x: x, y: y, vx: vx, vy: vy,
    r: Math.round(color[0] * mix),
    g: Math.round(color[1] * mix),
    b: Math.round(color[2] * mix),
    life: 1, decay: dec, size: s * sizeMul,
    gravity: gr * gravityMul, friction: fr,
    twinkle: !!opts.twinkle, tw: rand(0, 6.283)
  });
}

function expPeony(x, y, color, big) {
  var n = big ? 170 : 110, base = big ? 9 : 7;
  for (var i = 0; i < n; i++) {
    var a = rand(0, 6.283), sp = Math.pow(Math.random(), 0.55) * base + 1.2;
    addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, color, {
      size: rand(1, 3.2), decay: rand(0.008, 0.02), gravity: 0.05, friction: 0.985,
      twinkle: Math.random() < 0.4
    });
  }
}

function expRing(x, y, color, big) {
  var n = 100, base = big ? 8.5 : 6.5;
  for (var i = 0; i < n; i++) {
    var a = (i / n) * 6.283 + rand(-0.03, 0.03), sp = base * rand(0.92, 1.08);
    addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, color, {
      size: rand(1.2, 2.8), decay: rand(0.008, 0.016), gravity: 0.045, friction: 0.987
    });
  }
}

function expPalm(x, y, color, big) {
  var n = big ? 28 : 20;
  for (var i = 0; i < n; i++) {
    var a = rand(0, 6.283), sp = rand(6, big ? 11 : 9);
    addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, color, {
      size: rand(2.5, 4), decay: rand(0.004, 0.009), gravity: 0.09, friction: 0.977
    });
  }
}

function expWillow(x, y, color, big) {
  var n = big ? 90 : 60;
  for (var i = 0; i < n; i++) {
    var a = rand(0, 6.283), sp = rand(2.5, 6);
    addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, color, {
      size: rand(1.1, 2.4), decay: rand(0.0035, 0.007), gravity: 0.07, friction: 0.992,
      twinkle: Math.random() < 0.5
    });
  }
}

function expHeart(x, y, color, big) {
  var n = 120, mx = big ? 9 : 7;
  for (var i = 0; i < n; i++) {
    var t = (i / n) * 6.283, st = Math.sin(t);
    var hx = 16 * st * st * st;
    var hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    addParticle(x, y, (hx / 16) * mx + rand(-0.3, 0.3), (-hy / 16) * mx + rand(-0.3, 0.3), color, {
      size: rand(1, 2.6), decay: rand(0.007, 0.013), gravity: 0.035, friction: 0.987
    });
  }
}

function expStar(x, y, color, big) {
  var n = 110, mx = big ? 9.5 : 7.5;
  for (var i = 0; i < n; i++) {
    var a = rand(0, 6.283), k = Math.cos(5 * a);
    var rr = 0.4 + 0.6 * Math.pow((k + 1) / 2, 0.7);
    addParticle(x, y, Math.cos(a) * rr * mx, Math.sin(a) * rr * mx, color, {
      size: rand(1, 2.8), decay: rand(0.008, 0.016), gravity: 0.04, friction: 0.986
    });
  }
}

function expDouble(x, y, color, big) {
  var c2 = pickColor(), n = 70, base = big ? 8 : 6;
  for (var i = 0; i < n; i++) {
    var a = (i / n) * 6.283;
    addParticle(x, y, Math.cos(a) * base, Math.sin(a) * base, color, {
      size: rand(1.4, 3), decay: rand(0.008, 0.014), gravity: 0.05, friction: 0.986
    });
  }
  for (var j = 0; j < n; j++) {
    var a2 = (j / n) * 6.283 + 0.05;
    addParticle(x, y, Math.cos(a2) * base * 0.6, Math.sin(a2) * base * 0.6, c2, {
      size: rand(1, 2.2), decay: rand(0.009, 0.016), gravity: 0.05, friction: 0.986
    });
  }
}

function expCrackle(x, y, color, big) {
  var n = big ? 140 : 95, base = big ? 8 : 6;
  var white = [255, 255, 255];
  for (var i = 0; i < n; i++) {
    var a = rand(0, 6.283), sp = Math.pow(Math.random(), 0.4) * base + 1;
    var useW = Math.random() < 0.3;
    addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, useW ? white : color, {
      size: rand(0.8, 1.8), decay: rand(0.02, 0.045), gravity: 0.03, friction: 0.965,
      twinkle: true
    });
  }
}

function expChrysanthemum(x, y, color, big) {
  var n = big ? 180 : 120, base = big ? 7 : 5.5;
  for (var i = 0; i < n; i++) {
    var a = rand(0, 6.283), sp = base * rand(0.6, 1.1);
    addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, color, {
      size: rand(1, 2.6), decay: rand(0.004, 0.008), gravity: 0.08, friction: 0.995
    });
  }
}

function expCrossette(x, y, color, big) {
  var n = 12, base = big ? 7.5 : 6;
  for (var i = 0; i < n; i++) {
    var a = (i / n) * 6.283;
    for (var k = 0; k < 6; k++) {
      var aa = a + rand(-0.15, 0.15), sp = base * rand(0.6, 1.1);
      addParticle(x, y, Math.cos(aa) * sp, Math.sin(aa) * sp, color, {
        size: rand(1, 2.2), decay: rand(0.009, 0.016), gravity: 0.05, friction: 0.985
      });
    }
  }
}

function expFish(x, y, color, big) {
  var n = big ? 90 : 60;
  for (var i = 0; i < n; i++) {
    var a = rand(0, 6.283), sp = rand(1.5, 4);
    addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, color, {
      size: rand(1.5, 3), decay: rand(0.01, 0.022), gravity: 0.02, friction: 0.998
    });
  }
}

function expSpiral(x, y, color, big) {
  var n = big ? 130 : 90;
  for (var i = 0; i < n; i++) {
    var t = i / n * 6.283 * 2.2;
    var sp = 0.6 + (i / n) * (big ? 8 : 6);
    addParticle(x, y, Math.cos(t) * sp, Math.sin(t) * sp, color, {
      size: rand(1, 2.4), decay: rand(0.008, 0.016), gravity: 0.03, friction: 0.99,
      twinkle: true
    });
  }
}

function expStrobe(x, y, color, big) {
  var n = big ? 90 : 60;
  for (var i = 0; i < n; i++) {
    var a = rand(0, 6.283), sp = rand(1.5, big ? 8 : 6);
    addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, color, {
      size: rand(1, 2.2), decay: rand(0.018, 0.032), gravity: 0.02, friction: 0.99,
      twinkle: true
    });
  }
}

var EXP = {
  peony: expPeony, ring: expRing, palm: expPalm, willow: expWillow,
  heart: expHeart, star: expStar, double: expDouble, crackle: expCrackle,
  chrysanthemum: expChrysanthemum, crossette: expCrossette, fish: expFish,
  spiral: expSpiral, strobe: expStrobe
};

function explode(x, y, color, big, type) {
  Sound.boom(big);
  shake = Math.min(shake + (big ? 13 : 8), 28);
  shockwaves.push({
    x: x, y: y, r: 6, max: big ? 200 : 135, life: 1, color: color, line: big ? 3 : 2
  });

  combo++; comboTimer = 80; updateCombo();
  var t = type || pick(TYPES);
  (EXP[t] || expPeony)(x, y, color, big);
}

function spawnShootingStar() {
  shootingStars.push({
    x: rand(0, W * 0.5), y: rand(0, H * 0.4),
    vx: rand(6, 12), vy: rand(2, 5),
    len: rand(60, 140), life: 1, decay: rand(0.006, 0.012)
  });
}

function spawnConfetti() {
  var pal = getPalette();
  var n = 220;
  for (var i = 0; i < n; i++) {
    var c = pick(pal);
    confetti.push({
      x: rand(0, W), y: rand(-H * 0.3, 0),
      vx: rand(-2, 2), vy: rand(2, 6),
      rot: rand(0, 6.283), vr: rand(-0.2, 0.2),
      w: rand(4, 10), h: rand(3, 7),
      life: 1, decay: rand(0.002, 0.005),
      color: c
    });
  }
  toast('CONFETTI!');
}

function update(dt) {
  if (autoShow) {
    autoTimer -= dt;
    if (autoTimer <= 0) {
      autoTimer = rand(20, 48);
      launch(W * rand(0.15, 0.85), H * rand(0.1, 0.45), Math.random() < 0.25);
    }
  }

  windTimer -= dt;
  if (windTimer <= 0) {
    windTarget = rand(-0.8, 0.8);
    windTimer = rand(180, 420);
  }
  wind += (windTarget - wind) * 0.01 * dt;

  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0 && combo > 0) { combo = 0; updateCombo(); }
  }

  shake *= Math.pow(0.9, dt);
  if (shake < 0.2) shake = 0;

  shootingTimer -= dt;
  if (shootingTimer <= 0) {
    shootingTimer = rand(180, 500);
    spawnShootingStar();
  }

  var i, rk;
  for (i = rockets.length - 1; i >= 0; i--) {
    rk = rockets[i];
    rk.trail.push({ x: rk.x, y: rk.y });
    if (rk.trail.length > 8) rk.trail.shift();
    rk.x += rk.vx * dt;
    rk.y += rk.vy * dt;
    rk.vy += 0.15 * dt;

    if (quality !== 'low' && Math.random() < 0.55) {
      addParticle(rk.x, rk.y, rand(-0.4, 0.4), rand(0, 0.7), rk.color, {
        size: rand(0.6, 1.4), decay: rand(0.04, 0.08), gravity: 0.02, friction: 0.94
      });
    }

    if (rk.vy >= 0 || rk.y <= rk.targetY) {
      explode(rk.x, rk.y, rk.color, rk.big, rk.type);
      rockets.splice(i, 1);
    }
  }

  var p, f;
  for (i = particles.length - 1; i >= 0; i--) {
    p = particles[i];
    if (attractMode && mouse.x > -100) {
      var dx = mouse.x - p.x, dy = mouse.y - p.y;
      var d2 = dx * dx + dy * dy + 400;
      p.vx += dx / d2 * 60 * dt;
      p.vy += dy / d2 * 60 * dt;
    }
    p.vx += wind * 0.03 * dt;
    p.vy += p.gravity * dt;
    f = Math.pow(p.friction, dt);
    p.vx *= f; p.vy *= f;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= p.decay * dt;
    p.tw += 0.25 * dt;
    if (p.life <= 0 || p.y > H + 60) particles.splice(i, 1);
  }

  var w;
  for (i = shockwaves.length - 1; i >= 0; i--) {
    w = shockwaves[i];
    w.r += (w.max - w.r) * 0.12 * dt;
    w.life -= 0.03 * dt;
    if (w.life <= 0) shockwaves.splice(i, 1);
  }

  var cf;
  for (i = confetti.length - 1; i >= 0; i--) {
    cf = confetti[i];
    cf.vx += Math.sin(cf.y * 0.02) * 0.15 * dt;
    cf.x += cf.vx * dt;
    cf.y += cf.vy * dt;
    cf.rot += cf.vr * dt;
    cf.life -= cf.decay * dt;
    if (cf.y > H + 40 || cf.life <= 0) confetti.splice(i, 1);
  }

  var ss;
  for (i = shootingStars.length - 1; i >= 0; i--) {
    ss = shootingStars[i];
    ss.x += ss.vx * dt;
    ss.y += ss.vy * dt;
    ss.life -= ss.decay * dt;
    if (ss.life <= 0 || ss.x > W + 100) shootingStars.splice(i, 1);
  }
}

function drawStars() {
  var i, st;
  for (i = 0; i < stars.length; i++) {
    st = stars[i];
    st.tw += st.sp;
    var tw = 0.5 + Math.sin(st.tw) * 0.5;
    ctx.fillStyle = 'rgba(200,220,255,' + (0.22 + tw * 0.6) + ')';
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.r, 0, 6.283);
    ctx.fill();
  }
}

function drawAura(now) {
  var i;
  ctx.globalCompositeOperation = 'lighter';
  for (i = 0; i < aura.length; i++) {
    var a = aura[i];
    var yy = a.y + Math.sin(now * 0.0004 * (i + 1) + a.phase) * a.amp;
    var g = ctx.createLinearGradient(0, yy - 90, 0, yy + 90);
    var baseCol = getPalette()[i % getPalette().length];
    g.addColorStop(0, rgba(baseCol[0], baseCol[1], baseCol[2], 0));
    g.addColorStop(0.5, rgba(baseCol[0], baseCol[1], baseCol[2], 0.055));
    g.addColorStop(1, rgba(baseCol[0], baseCol[1], baseCol[2], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, yy - 90, W, 180);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawShootingStars() {
  var i, ss;
  ctx.globalCompositeOperation = 'lighter';
  for (i = 0; i < shootingStars.length; i++) {
    ss = shootingStars[i];
    var g = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.len, ss.y - ss.len * (ss.vy / ss.vx));
    g.addColorStop(0, 'rgba(255,255,255,' + ss.life + ')');
    g.addColorStop(1, 'rgba(180,220,255,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ss.x, ss.y);
    ctx.lineTo(ss.x - ss.len, ss.y - ss.len * (ss.vy / ss.vx));
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function draw() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(2,2,9,' + trailFade + ')';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (shake > 0.3) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);

  drawStars();
  drawAura(performance.now());
  drawShootingStars();

  ctx.globalCompositeOperation = 'lighter';

  var i, w;
  for (i = 0; i < shockwaves.length; i++) {
    w = shockwaves[i];
    var wa = Math.max(w.life, 0) * 0.5;
    if (wa <= 0) continue;
    ctx.strokeStyle = rgba(w.color[0], w.color[1], w.color[2], wa);
    ctx.lineWidth = w.line * Math.max(w.life, 0.1);
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r, 0, 6.283);
    ctx.stroke();
  }

  var rk, t, c, a;
  for (i = 0; i < rockets.length; i++) {
    rk = rockets[i];
    c = rk.color;
    for (t = 0; t < rk.trail.length; t++) {
      a = (t / rk.trail.length) * 0.6;
      ctx.fillStyle = rgba(c[0], c[1], c[2], a);
      ctx.beginPath();
      ctx.arc(rk.trail[t].x, rk.trail[t].y, 2, 0, 6.283);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(rk.x, rk.y, 2.6, 0, 6.283);
    ctx.fill();
  }

  var p, al;
  for (i = 0; i < particles.length; i++) {
    p = particles[i];
    al = p.life > 0 ? p.life : 0;
    if (al <= 0) continue;
    if (p.twinkle) {
      var twk = 0.55 + 0.45 * Math.sin(p.tw);
      al *= twk;
      if (al <= 0) continue;
    }
    if (quality === 'high' && al > 0.45) {
      ctx.fillStyle = rgba(p.r, p.g, p.b, al * 0.18);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.6, 0, 6.283);
      ctx.fill();
    }
    ctx.fillStyle = rgba(p.r, p.g, p.b, Math.min(al, 1));
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, 6.283);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';

  var cf;
  for (i = 0; i < confetti.length; i++) {
    cf = confetti[i];
    ctx.save();
    ctx.translate(cf.x, cf.y);
    ctx.rotate(cf.rot);
    ctx.fillStyle = rgba(cf.color[0], cf.color[1], cf.color[2], cf.life);
    ctx.fillRect(-cf.w / 2, -cf.h / 2, cf.w, cf.h);
    ctx.restore();
  }

  ctx.restore();
}

var autoTimer = 0;

function frame(now) {
  var delta = now - last;
  last = now;
  var dt = Math.min(delta / 16.667, 3);

  fpsAcc += delta; fpsFrames++;
  if (fpsFrames >= 20) {
    updateFps(1000 / (fpsAcc / fpsFrames));
    fpsAcc = 0; fpsFrames = 0;
  }

  update(dt);
  draw();

  frameCount++;
  if (frameCount % 10 === 0) updateParticles();
  requestAnimationFrame(frame);
}

function burst() {
  var n = 5 + Math.floor(Math.random() * 4);
  for (var i = 0; i < n; i++) {
    (function (k) {
      setTimeout(function () {
        launch(rand(W * 0.15, W * 0.85), rand(H * 0.1, H * 0.45), Math.random() < 0.35);
      }, k * 70);
    })(i);
  }
  toast('BURST x' + n);
}

function megaBurst(x, y) {
  for (var i = 0; i < 8; i++) {
    (function (k) {
      setTimeout(function () {
        var c = pickColor();
        explode(x + rand(-60, 60), y + rand(-60, 60), c, true, pick(TYPES));
      }, k * 60);
    })(i);
  }
  toast('MEGA BURST!');
}

function screenshot() {
  try {
    var url = canvas.toDataURL('image/png');
    var a = document.createElement('a');
    a.href = url;
    a.download = 'neon-fireworks-' + Date.now() + '.png';
    a.click();
    toast('SAVED!');
  } catch (e) { toast('SAVE FAILED'); }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}

function specialAt(x, y) {
  var c = pickColor();
  var t = pick(['heart', 'star', 'spiral', 'crossette', 'fish']);
  explode(x, y, c, true, t);
  toast(t.toUpperCase());
}

function bindUI() {
  var btnAuto = document.getElementById('btnAuto');
  var btnSound = document.getElementById('btnSound');
  var btnBurst = document.getElementById('btnBurst');
  var btnAttract = document.getElementById('btnAttract');
  var btnConfetti = document.getElementById('btnConfetti');
  var btnShot = document.getElementById('btnShot');
  var btnFull = document.getElementById('btnFull');
  var btnSettings = document.getElementById('btnSettings');
  var panel = document.getElementById('panel');
  var btnClose = document.getElementById('btnClose');
  var btnReset = document.getElementById('btnReset');
  var help = document.getElementById('help');
  var btnHelpClose = document.getElementById('btnHelpClose');

  btnAuto.addEventListener('click', function () {
    autoShow = !autoShow;
    if (autoShow) autoTimer = 0;
    btnAuto.classList.toggle('active', autoShow);
  });

  btnSound.addEventListener('click', function () {
    soundOn = !soundOn;
    btnSound.classList.toggle('active', soundOn);
    saveState();
  });

  btnBurst.addEventListener('click', function () { burst(); });

  btnAttract.addEventListener('click', function () {
    attractMode = !attractMode;
    btnAttract.classList.toggle('active', attractMode);
    toast(attractMode ? 'ATTRACT ON' : 'ATTRACT OFF');
  });

  btnConfetti.addEventListener('click', function () { spawnConfetti(); });
  btnShot.addEventListener('click', function () { screenshot(); });
  btnFull.addEventListener('click', function () { toggleFullscreen(); });

  btnSettings.addEventListener('click', function () {
    panel.classList.toggle('hidden');
  });
  btnClose.addEventListener('click', function () { panel.classList.add('hidden'); });

  btnReset.addEventListener('click', function () {
    rockets = []; particles = []; shockwaves = []; confetti = [];
    launchCount = 0; combo = 0; comboTimer = 0; shake = 0;
    updateCount(); updateCombo(); updateParticles();
    toast('RESET');
  });

  btnHelpClose.addEventListener('click', function () {
    help.classList.add('hidden');
  });

  var tb = document.getElementById('themeButtons');
  Object.keys(THEMES).forEach(function (name) {
    var b = document.createElement('button');
    b.textContent = name.toUpperCase();
    if (name === theme) b.classList.add('active');
    b.addEventListener('click', function () {
      theme = name;
      Array.prototype.forEach.call(tb.children, function (n) { n.classList.remove('active'); });
      b.classList.add('active');
      saveState();
      toast('THEME: ' + name.toUpperCase());
    });
    tb.appendChild(b);
  });

  var qb = document.getElementById('qualityButtons');
  ['low', 'med', 'high'].forEach(function (name) {
    var b = document.createElement('button');
    b.textContent = name.toUpperCase();
    if (name === quality) b.classList.add('active');
    b.addEventListener('click', function () {
      quality = name;
      Array.prototype.forEach.call(qb.children, function (n) { n.classList.remove('active'); });
      b.classList.add('active');
      saveState();
      toast('QUALITY: ' + name.toUpperCase());
    });
    qb.appendChild(b);
  });

  var gs = document.getElementById('gravity');
  gs.value = gravityMul;
  gs.addEventListener('input', function () {
    gravityMul = parseFloat(gs.value);
    saveState();
  });

  var ps = document.getElementById('psize');
  ps.value = sizeMul;
  ps.addEventListener('input', function () {
    sizeMul = parseFloat(ps.value);
    saveState();
  });

  var fs = document.getElementById('fade');
  fs.value = trailFade;
  fs.addEventListener('input', function () {
    trailFade = parseFloat(fs.value);
    saveState();
  });

  if (!soundOn) btnSound.classList.remove('active');

  canvas.addEventListener('pointerdown', function (e) {
    mouse.down = true;
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (e.button === 2) {
      specialAt(e.clientX, e.clientY);
      return;
    }
    launch(e.clientX, e.clientY, Math.random() < 0.18);
  });

  canvas.addEventListener('pointermove', function (e) {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (mouse.down) {
      if (Math.random() < 0.12) launch(e.clientX + rand(-30, 30), e.clientY + rand(-20, 20), Math.random() < 0.1);
    }
  });

  window.addEventListener('pointerup', function () { mouse.down = false; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  canvas.addEventListener('dblclick', function (e) {
    megaBurst(e.clientX, e.clientY);
  });

  window.addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    var k = e.key.toLowerCase();
    if (e.code === 'Space') {
      e.preventDefault();
      autoShow = !autoShow;
      if (autoShow) autoTimer = 0;
      btnAuto.classList.toggle('active', autoShow);
    } else if (k === 'b') { burst(); }
    else if (k === 'a') {
      attractMode = !attractMode;
      btnAttract.classList.toggle('active', attractMode);
    }
    else if (k === 'c') { spawnConfetti(); }
    else if (k === 's') { screenshot(); }
    else if (k === 'f') { toggleFullscreen(); }
    else if (k === 'h') { help.classList.toggle('hidden'); }
  });

  window.addEventListener('resize', resize);
  window.addEventListener('blur', function () { mouse.down = false; });
}

loadState();
bindUI();
resize();
requestAnimationFrame(frame);