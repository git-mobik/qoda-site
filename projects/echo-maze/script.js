// ECHO MAZE - upgraded edition
// Your past is hunting you.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const CELL = 40;
const COLS = 20;
const ROWS = 15;
const W = COLS * CELL;
const H = ROWS * CELL;
canvas.width = W;
canvas.height = H;

// ---------- Difficulty ----------
const BASE_ECHO_DELAY = 300;
const MIN_ECHO_DELAY = 170;
const ECHO_DELAY_STEP = 10;
let ECHO_DELAY = BASE_ECHO_DELAY;

const PLAYER_SPEED = 3.2;
const DASH_SPEED = 10;
const DASH_FRAMES = 9;
const DASH_CD_FRAMES = 80;

const ORB_POINTS = 100;
const LEVEL_BONUS = 250;

// ---------- Fun-factor tuning ----------
const COMBO_WINDOW = 180;
const COMBO_MAX_MULT = 3.5;
const COMBO_STEP = 0.5;
const NEAR_MISS_DIST = 46;
const NEAR_MISS_BONUS = 150;
const WARP_FRAMES = 120;

// ---------- State ----------
let game = null;
let paused = false;
let running = false;
let lastTime = 0;
let rafId = null;
let shakeMag = 0;
let shakeDecay = 0.85;

// ---------- Persistence ----------
const STORE_KEY = 'echo-maze-v2';
let store = { best: 0, sound: true, motion: true, haptics: true };

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (typeof s.best === 'number') store.best = s.best;
      if (typeof s.sound === 'boolean') store.sound = s.sound;
      if (typeof s.motion === 'boolean') store.motion = s.motion;
      if (typeof s.haptics === 'boolean') store.haptics = s.haptics;
    }
  } catch (e) { /* ignore */ }
}
function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
}
loadStore();

// ---------- Audio ----------
let audioCtx = null;
function ensureAudio() {
  if (audioCtx) return audioCtx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  } catch (e) { audioCtx = null; }
  return audioCtx;
}
function beep(freq, dur, type, vol) {
  if (!store.sound) return;
  const ac = ensureAudio();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  gain.gain.value = vol == null ? 0.06 : vol;
  osc.connect(gain);
  gain.connect(ac.destination);
  const t = ac.currentTime;
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}
function sfxOrb() { beep(880, 0.12, 'triangle', 0.07); setTimeout(function () { beep(1320, 0.1, 'triangle', 0.05); }, 60); }
function sfxDash() { beep(220, 0.1, 'sawtooth', 0.05); }
function sfxDeath() { beep(140, 0.5, 'sawtooth', 0.09); setTimeout(function () { beep(90, 0.6, 'square', 0.06); }, 90); }
function sfxWin() {
  beep(523, 0.12, 'triangle', 0.07);
  setTimeout(function () { beep(659, 0.12, 'triangle', 0.07); }, 110);
  setTimeout(function () { beep(784, 0.22, 'triangle', 0.08); }, 220);
}

// ---------- Particles ----------
const particles = [];
function spawnParticles(x, y, count, color, speed) {
  if (!store.motion) count = Math.min(count, 4);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (0.5 + Math.random()) * (speed || 2.5);
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 1, decay: 0.02 + Math.random() * 0.03,
      r: 1.5 + Math.random() * 2.5,
      color: color,
    });
  }
}
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.96; p.vy *= 0.96;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function drawParticles() {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------- Haptics ----------
function haptic(ms) {
  if (!store.haptics) return;
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ---------- Maze generation ----------
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function genMaze(cols, rows) {
  const gw = cols * 2 + 1;
  const gh = rows * 2 + 1;
  const g = Array.from({ length: gh }, function () { return Array(gw).fill(1); });
  const stack = [[0, 0]];
  g[1][1] = 0;
  const visited = new Set(['0,0']);
  while (stack.length) {
    const top = stack[stack.length - 1];
    const cx = top[0], cy = top[1];
    const dirs = shuffle([[0,-1],[1,0],[0,1],[-1,0]]);
    let moved = false;
    for (let i = 0; i < dirs.length; i++) {
      const dx = dirs[i][0], dy = dirs[i][1];
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (visited.has(nx + ',' + ny)) continue;
      g[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 0;
      g[ny * 2 + 1][nx * 2 + 1] = 0;
      visited.add(nx + ',' + ny);
      stack.push([nx, ny]);
      moved = true;
      break;
    }
    if (!moved) stack.pop();
  }
  return g;
}

function isWall(cx, cy) {
  if (!game || !game.level) return true;
  const L = game.level;
  if (cx < 0 || cy < 0 || cx >= L.cols || cy >= L.rows) return true;
  return L.grid[cy][cx] === 1;
}
function toCell(px, py) {
  return [Math.floor(px / CELL), Math.floor(py / CELL)];
}
function collidesWall(px, py, r) {
  const pts = [
    [px - r, py - r], [px + r, py - r],
    [px - r, py + r], [px + r, py + r],
  ];
  for (let i = 0; i < pts.length; i++) {
    const c = toCell(pts[i][0], pts[i][1]);
    if (isWall(c[0], c[1])) return true;
  }
  return false;
}

function bfs(grid, sx, sy) {
  const dist = {};
  const q = [[sx, sy, 0]];
  dist[sy + ',' + sx] = 0;
  const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
  while (q.length) {
    const cur = q.shift();
    const x = cur[0], y = cur[1], d = cur[2];
    for (let i = 0; i < dirs.length; i++) {
      const nx = x + dirs[i][0], ny = y + dirs[i][1];
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (grid[ny][nx] !== 0) continue;
      const k = ny + ',' + nx;
      if (k in dist) continue;
      dist[k] = d + 1;
      q.push([nx, ny, d + 1]);
    }
  }
  const out = Array.from({ length: ROWS }, function () { return Array(COLS).fill(undefined); });
  for (const k in dist) {
    const parts = k.split(',');
    out[Number(parts[0])][Number(parts[1])] = dist[k];
  }
  return out;
}

// ---------- Level generation ----------
function makeLevel(levelNum) {
  const maxCols = Math.floor((COLS - 1) / 2);
  const maxRows = Math.floor((ROWS - 1) / 2);
  const cols = Math.min(maxCols, 6 + Math.min(levelNum, 4));
  const rows = Math.min(maxRows, 5 + Math.min(levelNum, 3));

  ECHO_DELAY = Math.max(MIN_ECHO_DELAY, BASE_ECHO_DELAY - (levelNum - 1) * ECHO_DELAY_STEP);
  const ghostCount = 1 + Math.floor((levelNum - 1) / 3);

  const raw = genMaze(cols, rows);
  const rowsG = raw.length;
  const colsG = raw[0].length;

  const grid = Array.from({ length: ROWS }, function () { return Array(COLS).fill(1); });
  const offX = Math.floor((COLS - colsG) / 2);
  const offY = Math.floor((ROWS - rowsG) / 2);
  for (let y = 0; y < rowsG; y++)
    for (let x = 0; x < colsG; x++)
      grid[y + offY][x + offX] = raw[y][x];

  const floors = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (grid[y][x] === 0) floors.push([x, y]);

  const startCell = floors[0];
  const sx = startCell[0], sy = startCell[1];
  const dist = bfs(grid, sx, sy);
  let exit = floors[0], bestD = 0;
  for (let i = 0; i < floors.length; i++) {
    const x = floors[i][0], y = floors[i][1];
    const d = dist[y][x];
    if (d !== undefined && d > bestD) { bestD = d; exit = [x, y]; }
  }

  const orbCount = Math.min(floors.length - 2, 2 + Math.min(levelNum, 4));
  const cands = floors.filter(function (f) {
    const x = f[0], y = f[1];
    return !(x === sx && y === sy) && !(x === exit[0] && y === exit[1]);
  });
  shuffle(cands);
  const orbs = cands.slice(0, orbCount).map(function (f) {
    return {
      x: f[0] * CELL + CELL / 2,
      y: f[1] * CELL + CELL / 2,
      taken: false,
      phase: Math.random() * Math.PI * 2,
    };
  });

  // Shield powerup on higher levels
  let shield = null;
  if (levelNum >= 3 && cands.length > orbs.length) {
    const f = cands[orbs.length];
    shield = { x: f[0] * CELL + CELL / 2, y: f[1] * CELL + CELL / 2, taken: false, phase: 0 };
  }

  // Time warp powerup on higher levels
  let warp = null;
  if (levelNum >= 4 && cands.length > orbs.length + (shield ? 1 : 0)) {
    const f = cands[orbs.length + (shield ? 1 : 0)];
    warp = { x: f[0] * CELL + CELL / 2, y: f[1] * CELL + CELL / 2, taken: false, phase: 0 };
  }

  return {
    level: levelNum,
    cols: COLS, rows: ROWS, grid: grid,
    start: { x: sx * CELL + CELL / 2, y: sy * CELL + CELL / 2 },
    exit: { x: exit[0] * CELL + CELL / 2, y: exit[1] * CELL + CELL / 2 },
    orbs: orbs, orbTotal: orbs.length, orbsLeft: orbs.length,
    ghostCount: ghostCount,
    shield: shield,
    warp: warp,
  };
}

function initPlayer(level) {
  return {
    x: level.start.x, y: level.start.y, r: CELL * 0.28,
    history: [], ghostActive: false,
    dashCD: 0, dashFrames: 0, dashVX: 0, dashVY: 0,
    lastMoveX: 1, lastMoveY: 0,
    shieldFrames: 0,
    comboCount: 0, comboTimer: 0,
    nearMissArmed: false, nearMissFrames: 0,
    warpFrames: 0, warpAnchorLen: 0,
    echoDist: Infinity, trail: [],
  };
}
function getEchoPositions(player) {
  const out = [];
  const n = game.level.ghostCount;
  const baseLen = player.warpFrames > 0 ? player.warpAnchorLen : player.history.length;
  for (let g = 1; g <= n; g++) {
    const idx = baseLen - ECHO_DELAY * g;
    if (idx >= 0 && player.history[idx]) out.push(player.history[idx]);
  }
  return out;
}

// ---------- Input ----------
const keys = {};
const pointer = { active: false, x: 0, y: 0 };
let lastTapTime = 0;

function canvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top) * (H / rect.height),
  };
}

canvas.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  const c = canvasCoords(e);
  pointer.active = true;
  pointer.x = c.x; pointer.y = c.y;
  if (e.pointerType !== 'mouse') {
    const now = performance.now();
    if (now - lastTapTime < 280) tryDash();
    lastTapTime = now;
  }
});
canvas.addEventListener('pointermove', function (e) {
  if (!pointer.active) return;
  const c = canvasCoords(e);
  pointer.x = c.x; pointer.y = c.y;
});
window.addEventListener('pointerup', function () { pointer.active = false; });
window.addEventListener('pointercancel', function () { pointer.active = false; });
canvas.addEventListener('pointerleave', function () { pointer.active = false; });
canvas.addEventListener('dblclick', function (e) { e.preventDefault(); tryDash(); });
canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

window.addEventListener('keydown', function (e) {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (e.key === ' ') { e.preventDefault(); togglePause(); }
  if (k === 'r' && running) restart();
  if (k === 'shift') { e.preventDefault(); tryDash(); }
});
window.addEventListener('keyup', function (e) {
  keys[e.key.toLowerCase()] = false;
});

// Joystick
const joyBase = document.getElementById('joy-base');
const joyKnob = document.getElementById('joy-knob');
const joy = { active: false, dx: 0, dy: 0, id: null, cx: 0, cy: 0, radius: 44 };

if (joyBase && joyKnob) {
  joyBase.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    const r = joyBase.getBoundingClientRect();
    joy.active = true;
    joy.id = e.pointerId;
    joy.cx = r.left + r.width / 2;
    joy.cy = r.top + r.height / 2;
    joy.radius = r.width / 2;
    moveJoy(e.clientX, e.clientY);
    joyBase.setPointerCapture(e.pointerId);
  });
  joyBase.addEventListener('pointermove', function (e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    moveJoy(e.clientX, e.clientY);
  });
  function endJoy(e) {
    if (e.pointerId !== joy.id) return;
    joy.active = false; joy.dx = 0; joy.dy = 0; joy.id = null;
    joyKnob.style.transform = 'translate(0,0)';
  }
  joyBase.addEventListener('pointerup', endJoy);
  joyBase.addEventListener('pointercancel', endJoy);
  function moveJoy(x, y) {
    let dx = x - joy.cx, dy = y - joy.cy;
    const d = Math.hypot(dx, dy);
    const max = joy.radius * 0.7;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    joyKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    joy.dx = dx / max;
    joy.dy = dy / max;
  }
}

const dashBtn = document.getElementById('dash-btn');
if (dashBtn) dashBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); tryDash(); });

function getMoveDir() {
  let dx = 0, dy = 0;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;

  if (!dx && !dy && joy.active) {
    const m = Math.hypot(joy.dx, joy.dy);
    if (m > 0.18) { dx = joy.dx; dy = joy.dy; }
  }
  if (!dx && !dy && pointer.active && game) {
    const ddx = pointer.x - game.player.x;
    const ddy = pointer.y - game.player.y;
    const d = Math.hypot(ddx, ddy);
    if (d > 4) { dx = ddx / d; dy = ddy / d; }
  } else if (dx && dy && (keys['a'] || keys['d'] || keys['w'] || keys['s'] ||
             keys['arrowleft'] || keys['arrowright'] || keys['arrowup'] || keys['arrowdown'])) {
    dx *= 0.7071; dy *= 0.7071;
  }
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  return { dx: dx, dy: dy };
}

function tryDash() {
  if (!game || paused || !running) return;
  const p = game.player;
  if (p.dashCD > 0 || p.dashFrames > 0) return;
  const dir = getMoveDir();
  let dx = dir.dx, dy = dir.dy;
  if (!dx && !dy) { dx = p.lastMoveX || 1; dy = p.lastMoveY || 0; }
  const len = Math.hypot(dx, dy) || 1;
  p.dashFrames = DASH_FRAMES;
  p.dashVX = (dx / len) * DASH_SPEED;
  p.dashVY = (dy / len) * DASH_SPEED;
  spawnParticles(p.x, p.y, 8, '#4affa8', 3);
  sfxDash();
  haptic(12);
}

// ---------- Update ----------
function update() {
  if (!game || paused) return;
  const p = game.player;

  if (p.dashCD > 0) p.dashCD--;
  if (p.shieldFrames > 0) p.shieldFrames--;
  if (p.dashFrames === 0 && p.dashCD > 0 && p.dashCD % 4 === 0 && store.motion) {
    spawnParticles(p.x, p.y, 1, '#ffd24a', 1.2);
  }

  let moveX = 0, moveY = 0;
  if (p.dashFrames > 0) {
    moveX = p.dashVX;
    moveY = p.dashVY;
    p.dashFrames--;
    if (store.motion) spawnParticles(p.x, p.y, 2, '#4affa8', 2);
    if (p.dashFrames === 0) p.dashCD = DASH_CD_FRAMES;
  } else {
    const dir = getMoveDir();
    moveX = dir.dx * PLAYER_SPEED;
    moveY = dir.dy * PLAYER_SPEED;
  }

  const nx = p.x + moveX;
  const ny = p.y + moveY;
  if (!collidesWall(nx, p.y, p.r)) p.x = nx;
  else if (p.dashFrames > 0) p.dashFrames = 0;
  if (!collidesWall(p.x, ny, p.r)) p.y = ny;
  else if (p.dashFrames > 0) p.dashFrames = 0;

  if (moveX !== 0 || moveY !== 0) {
    p.history.push({ x: p.x, y: p.y });
    const len = Math.hypot(moveX, moveY) || 1;
    p.lastMoveX = moveX / len;
    p.lastMoveY = moveY / len;
    p.trail.push({ x: p.x, y: p.y, life: 1 });
    if (p.trail.length > 18) p.trail.shift();
  } else {
    p.history.push(null);
  }
  for (let ti = p.trail.length - 1; ti >= 0; ti--) {
    p.trail[ti].life -= 0.055;
    if (p.trail[ti].life <= 0) p.trail.splice(ti, 1);
  }
  if (p.history.length > ECHO_DELAY * (game.level.ghostCount + 2)) p.history.shift();

  for (let i = 0; i < game.level.orbs.length; i++) {
    const orb = game.level.orbs[i];
    if (orb.taken) continue;
    if (Math.hypot(orb.x - p.x, orb.y - p.y) < p.r + CELL * 0.22) {
      orb.taken = true;
      game.level.orbsLeft--;
      p.comboCount = (p.comboTimer > 0 ? p.comboCount : 0) + 1;
      p.comboTimer = COMBO_WINDOW;
      const comboMult = Math.min(COMBO_MAX_MULT, 1 + (p.comboCount - 1) * COMBO_STEP);
      const pts = Math.round(ORB_POINTS * comboMult);
      game.score += pts;
      spawnParticles(orb.x, orb.y, 14, '#ffd24a', 3);
      sfxOrb();
      haptic(10);
      if (p.comboCount > 1) {
        showToast('COMBO x' + p.comboCount + '  +' + pts);
        beep(880 + p.comboCount * 80, 0.09, 'square', 0.04);
      } else {
        showToast('+' + pts);
      }
      if (game.level.orbsLeft === 0) showToast('EXIT OPEN');
    }
  }

  if (game.level.shield && !game.level.shield.taken) {
    const sh = game.level.shield;
    if (Math.hypot(sh.x - p.x, sh.y - p.y) < p.r + CELL * 0.22) {
      sh.taken = true;
      p.shieldFrames = 180;
      spawnParticles(sh.x, sh.y, 14, '#4ad6ff', 3);
      showToast('SHIELD');
      beep(660, 0.15, 'sine', 0.06);
    }
  }

  if (game.level.warp && !game.level.warp.taken) {
    const wp = game.level.warp;
    if (Math.hypot(wp.x - p.x, wp.y - p.y) < p.r + CELL * 0.22) {
      wp.taken = true;
      p.warpFrames = WARP_FRAMES;
      p.warpAnchorLen = p.history.length;
      spawnParticles(wp.x, wp.y, 16, '#b388ff', 3);
      showToast('TIME WARP');
      beep(520, 0.2, 'sine', 0.07);
      setTimeout(function () { beep(780, 0.25, 'sine', 0.06); }, 100);
    }
  }

  if (p.comboTimer > 0) { p.comboTimer--; if (p.comboTimer === 0) p.comboCount = 0; }
  if (p.warpFrames > 0) p.warpFrames--;

  const echoes = getEchoPositions(p);
  p.ghostActive = echoes.length > 0;
  let closestEcho = Infinity;
  for (let i = 0; i < echoes.length; i++) {
    const e = echoes[i];
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < closestEcho) closestEcho = d;
    if (d < p.r * 1.15) {
      if (p.shieldFrames > 0) {
        p.shieldFrames = 0;
        p.history = [];
        p.warpFrames = 0;
        spawnParticles(p.x, p.y, 22, '#4ad6ff', 4);
        showToast('SHIELD USED');
        beep(420, 0.2, 'square', 0.07);
        haptic(30);
        shakeMag = store.motion ? 6 : 0;
        return;
      }
      gameOver('Your echo caught you.');
      return;
    }
  }
  p.echoDist = closestEcho;

  if (closestEcho < NEAR_MISS_DIST) {
    if (!p.nearMissArmed) { p.nearMissArmed = true; p.nearMissFrames = 0; }
    p.nearMissFrames++;
  } else if (p.nearMissArmed && closestEcho > NEAR_MISS_DIST * 1.6) {
    if (p.nearMissFrames > 20) {
      game.score += NEAR_MISS_BONUS;
      showToast('NEAR MISS  +' + NEAR_MISS_BONUS);
      spawnParticles(p.x, p.y, 10, '#ffd24a', 2.5);
      beep(1180, 0.12, 'triangle', 0.05);
      haptic(15);
    }
    p.nearMissArmed = false;
  }

  const dExit = Math.hypot(game.level.exit.x - p.x, game.level.exit.y - p.y);
  if (dExit < p.r + CELL * 0.28 && game.level.orbsLeft === 0) {
    levelComplete();
    return;
  }
  game.frame++;
  game.timeAccum += 1 / 60;

  updateParticles();
  if (shakeMag > 0.1) shakeMag *= shakeDecay; else shakeMag = 0;
}
// ---------- Render ----------
function render() {
  ctx.clearRect(0, 0, W, H);
  if (!game) return;
  const L = game.level;
  const p = game.player;

  ctx.save();
  if (shakeMag > 0) {
    ctx.translate((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag);
  }

  for (let y = 0; y < L.rows; y++) {
    for (let x = 0; x < L.cols; x++) {
      if (L.grid[y][x] === 1) {
        ctx.fillStyle = '#191830';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        ctx.fillStyle = 'rgba(122,92,255,0.07)';
        ctx.fillRect(x * CELL, y * CELL, CELL, 2);
      } else {
        ctx.fillStyle = '#0b0a14';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  }

  // Exit
  const pulse = 1 + Math.sin(game.frame * 0.08) * 0.08;
  ctx.save();
  ctx.shadowBlur = 22;
  ctx.shadowColor = L.orbsLeft === 0 ? '#4affa8' : '#2a6a4a';
  ctx.fillStyle = L.orbsLeft === 0 ? '#4affa8' : '#2a6a4a';
  ctx.beginPath();
  ctx.arc(L.exit.x, L.exit.y, CELL * 0.3 * pulse, 0, Math.PI * 2);
  ctx.fill();
  if (L.orbsLeft === 0) {
    ctx.strokeStyle = 'rgba(74,255,168,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(L.exit.x, L.exit.y, CELL * 0.44 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Orbs
  for (let i = 0; i < L.orbs.length; i++) {
    const orb = L.orbs[i];
    if (orb.taken) continue;
    const bob = Math.sin(game.frame * 0.1 + orb.phase) * 2;
    ctx.save();
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#ffd24a';
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.arc(orb.x, orb.y + bob, CELL * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Shield pickup
  if (L.shield && !L.shield.taken) {
    const sh = L.shield;
    const bob = Math.sin(game.frame * 0.1) * 2;
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#4ad6ff';
    ctx.strokeStyle = '#4ad6ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sh.x, sh.y + bob, CELL * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Time warp pickup
  if (L.warp && !L.warp.taken) {
    const wp = L.warp;
    const bob = Math.sin(game.frame * 0.12) * 2;
    const spin = game.frame * 0.08;
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#b388ff';
    ctx.strokeStyle = '#b388ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(wp.x, wp.y + bob, CELL * 0.22, spin, spin + Math.PI * 1.4);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(179,136,255,0.55)';
    ctx.beginPath();
    ctx.arc(wp.x, wp.y + bob, CELL * 0.22, spin + Math.PI, spin + Math.PI * 2.4);
    ctx.stroke();
    ctx.restore();
  }

  // Echoes
  const echoes = getEchoPositions(p);
  for (let i = 0; i < echoes.length; i++) {
    const e = echoes[i];
    ctx.save();
    ctx.shadowBlur = 22;
    ctx.shadowColor = '#ff6b8a';
    ctx.globalAlpha = i === 0 ? 0.9 : 0.55;
    ctx.fillStyle = i === 0 ? 'rgba(255,107,138,0.9)' : 'rgba(255,107,138,0.6)';
    ctx.beginPath();
    ctx.arc(e.x, e.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const gap = Math.hypot(e.x - p.x, e.y - p.y);
    const range = CELL * 3.5;
    if (i === 0 && gap < range) {
      ctx.strokeStyle = 'rgba(255,107,138,' + (0.7 * (1 - gap / range)).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Shield aura
  if (p.shieldFrames > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(74,214,255,' + (0.5 + Math.sin(game.frame * 0.2) * 0.2).toFixed(2) + ')';
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#4ad6ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (pointer.active && !joy.active) {
    ctx.strokeStyle = 'rgba(185,166,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (p.dashFrames > 0) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#4affa8';
    ctx.beginPath();
    ctx.arc(p.x - p.dashVX * 0.7, p.y - p.dashVY * 0.7, p.r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Player trail
  if (store.motion) {
    for (let ti = 0; ti < p.trail.length; ti++) {
      const tp = p.trail[ti];
      ctx.globalAlpha = tp.life * 0.35;
      ctx.fillStyle = p.dashFrames > 0 ? '#4affa8' : '#8a6cff';
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, p.r * tp.life * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.shadowBlur = 18;
  ctx.shadowColor = p.dashFrames > 0 ? '#4affa8' : '#7a5cff';
  ctx.fillStyle = p.dashFrames > 0 ? '#8affc8' : '#a88bff';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Echo proximity danger vignette
  if (p.echoDist < CELL * 3 && store.motion) {
    const inten = Math.max(0, 1 - p.echoDist / (CELL * 3));
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(255,107,138,0)');
    vg.addColorStop(1, 'rgba(255,107,138,' + (inten * 0.35).toFixed(3) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  // Combo badge
  if (p.comboCount > 1 && p.comboTimer > 0) {
    const alpha = Math.min(1, p.comboTimer / 40);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd24a';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ffd24a';
    ctx.fillText('COMBO x' + p.comboCount, 14, 30);
    ctx.restore();
  }

  drawParticles();
  ctx.restore();
}

// ---------- HUD / UI ----------
const elLevel = document.getElementById('level');
const elScore = document.getElementById('score');
const elOrbs = document.getElementById('orbs');
const elTimer = document.getElementById('timer');
const elGhosts = document.getElementById('ghosts');
const elDash = document.getElementById('dash');
const elDashStat = elDash ? elDash.parentElement : null;
const elPauseTag = document.getElementById('pause-tag');
const elToast = document.getElementById('toast');
const overlay = document.getElementById('overlay');
const screenTitle = document.getElementById('screen-title');
const screenComplete = document.getElementById('screen-complete');
const screenOver = document.getElementById('screen-over');
const settingsPanel = document.getElementById('settings-panel');

let toastTimeout = null;
function showToast(msg) {
  if (!elToast) return;
  elToast.textContent = msg;
  elToast.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(function () { elToast.classList.remove('show'); }, 1400);
}

function updateHUD() {
  if (!game) return;
  elLevel.textContent = game.level.level;
  elScore.textContent = game.score;
  elOrbs.textContent = (game.level.orbTotal - game.level.orbsLeft) + '/' + game.level.orbTotal;
  elTimer.textContent = game.timeAccum.toFixed(1);
  elGhosts.textContent = game.level.ghostCount;
  if (elDash) {
    const p = game.player;
    if (p.dashFrames > 0) elDash.textContent = 'DASH!';
    else if (p.dashCD > 0) elDash.textContent = (p.dashCD / 60).toFixed(1) + 's';
    else elDash.textContent = 'READY';
    if (elDashStat) elDashStat.classList.toggle('cooling', p.dashCD > 0);
  }
  if (dashBtn) dashBtn.disabled = game.player.dashCD > 0 || game.player.dashFrames > 0;
  if (elPauseTag) elPauseTag.classList.toggle('show', paused);
}

function showScreen(which) {
  screenTitle.hidden = which !== 'title';
  screenComplete.hidden = which !== 'complete';
  screenOver.hidden = which !== 'over';
}

function startGame() {
  ensureAudio();
  game = { level: makeLevel(1), player: null, frame: 0, timeAccum: 0, score: 0 };
  game.player = initPlayer(game.level);
  paused = false;
  running = true;
  overlay.classList.remove('show');
  showScreen(null);
  if (rafId) cancelAnimationFrame(rafId);
  lastTime = performance.now();
  loop(lastTime);
}

function levelComplete() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  const timeBonus = Math.max(0, Math.round(300 - game.timeAccum * 10));
  game.score += LEVEL_BONUS + timeBonus;
  spawnParticles(game.level.exit.x, game.level.exit.y, 30, '#4affa8', 4);
  render();
  sfxWin();
  haptic([20, 40, 20]);

  const stars = game.timeAccum < 15 ? 3 : (game.timeAccum < 30 ? 2 : 1);
  document.getElementById('c-time').textContent = game.timeAccum.toFixed(1);
  document.getElementById('c-orbs').textContent = game.level.orbTotal + '/' + game.level.orbTotal;
  document.getElementById('c-score').textContent = game.score;
  const starEl = document.getElementById('c-stars');
  if (starEl) starEl.textContent = ['', '★☆☆', '★★☆', '★★★'][stars] || '★☆☆';

  showScreen('complete');
  overlay.classList.add('show');
}

function nextLevel() {
  const next = game.level.level + 1;
  const keepScore = game.score;
  game = { level: makeLevel(next), player: null, frame: 0, timeAccum: 0, score: keepScore };
  game.player = initPlayer(game.level);
  paused = false;
  running = true;
  overlay.classList.remove('show');
  showScreen(null);
  lastTime = performance.now();
  if (rafId) cancelAnimationFrame(rafId);
  loop(lastTime);
}

function gameOver(reason) {
  running = false;
  paused = false;
  if (rafId) cancelAnimationFrame(rafId);

  const isBest = game.score > store.best;
  if (isBest) { store.best = game.score; saveStore(); }

  spawnParticles(game.player.x, game.player.y, 26, '#ff6b8a', 4);
  if (store.motion) shakeMag = 10;
  render();
  sfxDeath();
  haptic(80);

  document.getElementById('o-reason').textContent = reason;
  document.getElementById('o-level').textContent = game.level.level;
  document.getElementById('o-score').textContent = game.score;
  document.getElementById('o-best').textContent = store.best;

  showScreen('over');
  overlay.classList.add('show');
  if (elPauseTag) elPauseTag.classList.remove('show');
}

function restart() { startGame(); }

function togglePause() {
  if (!running) return;
  paused = !paused;
  if (elPauseTag) elPauseTag.classList.toggle('show', paused);
  if (!paused) { lastTime = performance.now(); loop(lastTime); }
  else if (rafId) cancelAnimationFrame(rafId);
}

function loop(now) {
  if (!running || paused) return;
  const dt = Math.min(now - lastTime, 50);
  lastTime = now;
  const steps = Math.max(1, Math.min(4, Math.round(dt / 16.67)));
  for (let i = 0; i < steps; i++) update();
  render();
  updateHUD();
  rafId = requestAnimationFrame(loop);
}

// ---------- Settings ----------
const setSound = document.getElementById('set-sound');
const setMotion = document.getElementById('set-motion');
const setHaptics = document.getElementById('set-haptics');

function syncSettings() {
  if (setSound) setSound.checked = store.sound;
  if (setMotion) setMotion.checked = store.motion;
  if (setHaptics) setHaptics.checked = store.haptics;
}
syncSettings();

if (setSound) setSound.addEventListener('change', function () { store.sound = setSound.checked; saveStore(); });
if (setMotion) setMotion.addEventListener('change', function () { store.motion = setMotion.checked; saveStore(); });
if (setHaptics) setHaptics.addEventListener('change', function () { store.haptics = setHaptics.checked; saveStore(); });

const settingsBtn = document.getElementById('settings-btn');
const settingsClose = document.getElementById('settings-close');
if (settingsBtn) settingsBtn.addEventListener('click', function () {
  settingsPanel.classList.remove('hidden');
  syncSettings();
});
if (settingsClose) settingsClose.addEventListener('click', function () {
  settingsPanel.classList.add('hidden');
});

// ---------- Buttons ----------
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('retryBtn').addEventListener('click', startGame);
document.getElementById('nextBtn').addEventListener('click', nextLevel);

// ---------- Boot ----------
game = { level: makeLevel(1), player: null, frame: 0, timeAccum: 0, score: 0 };
game.player = initPlayer(game.level);
render();