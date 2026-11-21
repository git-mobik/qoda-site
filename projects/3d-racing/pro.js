// ═══════════════════════════════════════════════════════════
// APEX DRIVE — PRO EDITION LAYER (pro.js)
// Loaded AFTER script.js. Adds professional meta-game systems:
//  • Difficulty (ROOKIE/RACER/APEX) + Garage (3 cars) + Paints
//  • Achievements with toast notifications
//  • Records panel + persistent profile
//  • Pause-menu stats, quit-to-menu
//  • Damage / nitro vignette, rank & combo HUD badges
//  • Top-speed tracking + detailed game-over stats
// All settings persist in localStorage.
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';
  if (typeof G === 'undefined') return;

  // ── Config ──
  var DIFFS = {
    easy:   { name: 'ROOKIE', maxSpeed: 48, accel: 13, aiCount: 2, aiSpeedMul: 0.80, damage: 15, scoreMul: 1.0, coinMul: 1.15 },
    normal: { name: 'RACER',  maxSpeed: 55, accel: 14, aiCount: 3, aiSpeedMul: 1.00, damage: 25, scoreMul: 1.0, coinMul: 1.0 },
    hard:   { name: 'APEX',   maxSpeed: 62, accel: 16, aiCount: 4, aiSpeedMul: 1.20, damage: 35, scoreMul: 1.5, coinMul: 1.0 }
  };
  var CARS = [
    { id: 'sport',  emoji: '🏎️', name: 'VORTEX GT',  maxSpeedMul: 1.00, accelMul: 1.00, gripMul: 1.00, desc: 'Balanced all-rounder' },
    { id: 'muscle', emoji: '🚗', name: 'TITAN V8',   maxSpeedMul: 0.92, accelMul: 1.18, gripMul: 1.20, desc: 'Strong grip, quick off line' },
    { id: 'hyper',  emoji: '🚘', name: 'PHANTOM X',  maxSpeedMul: 1.12, accelMul: 1.05, gripMul: 0.82, desc: 'Top speed, tricky handling' }
  ];
  var PAINTS = [
    { hex: 0xff5f1f, css: '#ff5f1f' }, { hex: 0x2f7fd0, css: '#2f7fd0' },
    { hex: 0x22c55e, css: '#22c55e' }, { hex: 0xffd23b, css: '#ffd23b' },
    { hex: 0xa855f7, css: '#a855f7' }, { hex: 0xff3b6b, css: '#ff3b6b' },
    { hex: 0x14b8a6, css: '#14b8a6' }, { hex: 0xffffff, css: '#ffffff' },
    { hex: 0x1a1a1e, css: '#1a1a1e' }, { hex: 0xc0c0c8, css: '#c0c0c8' }
  ];
  var ACHIEVEMENTS = [
    { id: 'firstCoin', icon: '💰', name: 'First Blood',    desc: 'Collect a coin',             key: 'coins',      goal: 1 },
    { id: 'coins10',   icon: '💰', name: 'Coin Collector', desc: '10 coins in one run',        key: 'coins',      goal: 10 },
    { id: 'coins100',  icon: '💎', name: 'Treasure Hunter',desc: '100 coins collected total',  key: 'totalCoins', goal: 100 },
    { id: 'speed180',  icon: '💨', name: 'Speed Demon',    desc: 'Reach 180 km/h',             key: 'topSpeed',   goal: 180 },
    { id: 'dist1000',  icon: '🛣️', name: 'Marathoner',     desc: 'Drive 1000 m in one run',    key: 'distance',   goal: 1000 },
    { id: 'dist5000',  icon: '🌍', name: 'Long Hauler',    desc: 'Drive 5000 m total',         key: 'totalDist',  goal: 5000 },
    { id: 'combo10',   icon: '🔥', name: 'On Fire',        desc: 'Reach a x10 combo',          key: 'maxCombo',   goal: 10 },
    { id: 'score5000', icon: '⭐', name: 'Star Driver',    desc: 'Score 5000 in one run',      key: 'score',      goal: 5000 }
  ];

  // ── Persistent profile ──
  var P = {
    highScore: 0, bestLap: null, totalCoins: 0, totalDist: 0, races: 0,
    diff: 'normal', car: 'sport', paint: 0, stability: 0.5, unlocked: {}
  };
  function loadProfile() {
    try {
      var raw = localStorage.getItem('apexProfile');
      if (raw) {
        var o = JSON.parse(raw);
        for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) P[k] = o[k];
      }
      var st = parseFloat(localStorage.getItem('apexStability'));
      if (!isNaN(st)) P.stability = st;
      var hs = parseInt(localStorage.getItem('apexHighScore') || '0', 10);
      if (!isNaN(hs) && hs > P.highScore) P.highScore = hs;
    } catch (e) {}
  }
  function saveProfile() {
    try { localStorage.setItem('apexProfile', JSON.stringify(P)); } catch (e) {}
  }
  loadProfile();

  // Per-run extended stats
  var RUN = { topSpeed: 0, maxCombo: 0 }; try { window.RUN = RUN; } catch (e) {}
  var runStarted = false;
  var lastHealth = 100;

  // ── Toast ──
  var toastTimer = null;
  function showAchieveToast(icon, name) {
    var el = document.getElementById('achieveToast');
    if (!el) return;
    el.innerHTML = '<span class="t-icon">' + icon + '</span><span><span class="t-sub">ACHIEVEMENT UNLOCKED</span>' + name + '</span>';
    el.classList.remove('hidden');
    void el.offsetWidth;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3200);
  }

  function checkAchievements() {
    var m = {
      coins: G.coins, totalCoins: P.totalCoins, topSpeed: RUN.topSpeed,
      distance: G.distance, totalDist: P.totalDist, maxCombo: RUN.maxCombo, score: G.score
    };
    var changed = false;
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      var a = ACHIEVEMENTS[i];
      if (P.unlocked[a.id]) continue;
      if ((m[a.key] || 0) >= a.goal) {
        P.unlocked[a.id] = true;
        changed = true;
        showAchieveToast(a.icon, a.name);
        try { Sound.blip(1200, 0.12); setTimeout(function () { Sound.blip(1500, 0.14); }, 130); } catch (e) {}
      }
    }
    if (changed) { saveProfile(); renderAchievements(); }
  }

  // ── Apply difficulty + car stats to the live G object ──
  function applyDifficulty() {
    var d = DIFFS[P.diff] || DIFFS.normal;
    var c = CARS.filter(function (x) { return x.id === P.car; })[0] || CARS[0];
    G.maxSpeed = d.maxSpeed * c.maxSpeedMul;
    G.accel = d.accel * c.accelMul;
    G._diff = d;
    G._car = c;
    G._damage = d.damage;
    G._scoreMul = d.scoreMul;
    G._coinMul = d.coinMul;
    G._gripMul = c.gripMul;
    G._aiSpeedMul = d.aiSpeedMul;
    G._aiCount = d.aiCount;
  }

  // ── Paint ──
  function applyPaint() {
    var col = PAINTS[P.paint] ? PAINTS[P.paint].hex : PAINTS[0].hex;
    if (window.SHARED && SHARED.paintMat && SHARED.paintMat.color) SHARED.paintMat.color.setHex(col);
    if (typeof car !== 'undefined' && car) {
      car.traverse(function (o) {
        if (o.isMesh && o.material && o.material.color && o.userData && o.userData.isPaint) {
          o.material.color.setHex(col);
        }
      });
    }
  }

  // ── Rebuild AI traffic to match difficulty ──
  function rebuildTraffic() {
    if (typeof makeAICar !== 'function' || typeof resetAI !== 'function' || !G.aiCars) return;
    var want = (DIFFS[P.diff] || DIFFS.normal).aiCount;
    for (var i = 0; i < G.aiCars.length; i++) {
      var ai = G.aiCars[i];
      if (ai.parent) ai.parent.remove(ai);
    }
    G.aiCars = [];
    if (typeof AI_COLORS === 'undefined') return;
    for (var j = 0; j < want; j++) {
      var c2 = makeAICar(AI_COLORS[j % AI_COLORS.length]);
      G.aiCars.push(c2);
      resetAI(c2, j);
    }
  }

  // ── Vignette ──
  var vig = document.getElementById('vignette');
  var vigTimer = null;
  function flashDamage() {
    if (!vig) return;
    vig.classList.add('damage');
    if (vigTimer) clearTimeout(vigTimer);
    vigTimer = setTimeout(function () { vig.classList.remove('damage'); }, 380);
  }

  // ── HUD badges ──
  var rankVal = document.getElementById('rankVal');
  var comboBadge = document.getElementById('comboBadge');
  var comboVal = document.getElementById('comboVal');

  function updateProHUD() {
    if (rankVal) {
      var rank = 10;
      if (G.score > 0) {
        var ratio = P.highScore > 0 ? Math.min(1, G.score / P.highScore) : Math.min(1, G.score / 5000);
        rank = Math.max(1, 10 - Math.floor(ratio * 9));
      }
      rankVal.textContent = rank;
    }
    if (comboBadge && comboVal) {
      if (G.combo >= 2) {
        comboBadge.classList.remove('hidden');
        comboVal.textContent = 'x' + G.combo;
        if (G.combo > RUN.maxCombo) RUN.maxCombo = G.combo;
      } else {
        comboBadge.classList.add('hidden');
      }
    }
    var kmh = Math.abs(G.speed) * 3.6;
    if (kmh > RUN.topSpeed) RUN.topSpeed = kmh;
    if (vig) {
      if (G.nitroActive) vig.classList.add('nitro');
      else vig.classList.remove('nitro');
    }
  }

  // ── Render panels ──
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
  function renderDifficulty() {
    var cards = document.querySelectorAll('.diff-card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute('data-diff') === P.diff) cards[i].classList.add('active');
      else cards[i].classList.remove('active');
    }
  }
  function renderGarage() {
    var grid = document.getElementById('garageGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < CARS.length; i++) {
      var c = CARS[i];
      var el = document.createElement('div');
      el.className = 'car-card' + (c.id === P.car ? ' active' : '');
      el.innerHTML = '<div class="car-emoji">' + c.emoji + '</div><div class="car-name">' + c.name + '</div><div class="car-stat">' + c.desc + '</div>';
      el.addEventListener('click', (function (id) {
        return function () { P.car = id; saveProfile(); applyDifficulty(); renderGarage(); try { Sound.blip(700, 0.06); } catch (e) {} };
      })(c.id));
      grid.appendChild(el);
    }
  }
  function renderPaint() {
    var grid = document.getElementById('paintGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < PAINTS.length; i++) {
      var sw = document.createElement('div');
      sw.className = 'paint-swatch' + (i === P.paint ? ' active' : '');
      sw.style.background = PAINTS[i].css;
      sw.addEventListener('click', (function (idx) {
        return function () { P.paint = idx; saveProfile(); applyPaint(); renderPaint(); try { Sound.blip(800, 0.06); } catch (e) {} };
      })(i));
      grid.appendChild(sw);
    }
  }
  function renderRecords() {
    setText('recHigh', P.highScore);
    setText('recLap', P.bestLap !== null ? P.bestLap.toFixed(2) + 's' : '--');
    setText('recCoins', P.totalCoins);
    setText('recDist', Math.round(P.totalDist) + ' m');
    setText('recRaces', P.races);
  }
  function renderAchievements() {
    var list = document.getElementById('achieveList');
    if (!list) return;
    list.innerHTML = '';
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      var a = ACHIEVEMENTS[i];
      var el = document.createElement('div');
      el.className = 'achieve-item' + (P.unlocked[a.id] ? ' unlocked' : '');
      el.innerHTML = '<span class="achieve-icon">' + a.icon + '</span><span class="achieve-info"><span class="achieve-name">' + a.name + '</span><span class="achieve-desc">' + a.desc + '</span></span>';
      list.appendChild(el);
    }
  }

  // ── Tabs & difficulty wiring ──
  function setupTabs() {
    var tabs = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        var t = this.getAttribute('data-tab');
        var allTabs = document.querySelectorAll('.tab-btn');
        for (var j = 0; j < allTabs.length; j++) allTabs[j].classList.remove('active');
        this.classList.add('active');
        var panels = document.querySelectorAll('.tab-panel');
        for (var k = 0; k < panels.length; k++) panels[k].classList.remove('active');
        var target = document.getElementById('tab-' + t);
        if (target) target.classList.add('active');
        try { Sound.blip(600, 0.05); } catch (e) {}
      });
    }
  }
  function setupDifficulty() {
    var cards = document.querySelectorAll('.diff-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].addEventListener('click', function () {
        P.diff = this.getAttribute('data-diff');
        saveProfile(); applyDifficulty(); rebuildTraffic(); renderDifficulty();
        try { Sound.blip(720, 0.06); } catch (e) {}
      });
    }
  }

  // ── Start button: apply settings then call base startGame ──
  function hookStart() {
    var sb = document.getElementById('startBtn');
    if (!sb) return;
    sb.addEventListener('click', function () {
      applyDifficulty();
      applyPaint();
      rebuildTraffic();
      RUN.topSpeed = 0; RUN.maxCombo = 0; lastHealth = 100; try { window.RUN = RUN; } catch (e) {}
      P.races++;
      saveProfile();
      renderRecords();
    });
  }

  // ── Persist run results when game ends ──
  function onRunEnd() {
    P.totalCoins += G.coins || 0;
    P.totalDist += G.distance || 0;
    if ((G.score || 0) > P.highScore) P.highScore = G.score;
    if (G.bestLap !== null && (P.bestLap === null || G.bestLap < P.bestLap)) P.bestLap = G.bestLap;
    saveProfile();
    checkAchievements();
    setText('goTopSpeed', Math.round(RUN.topSpeed));
    setText('goHigh', P.highScore);
    var title = document.getElementById('goTitle');
    var sub = document.getElementById('goSub');
    var wasRecord = G.score > 0 && G.score >= P.highScore;
    if (title) title.textContent = wasRecord ? 'NEW RECORD!' : 'GAME OVER';
    if (sub) sub.textContent = wasRecord ? 'You set a personal best' : 'Your car is wrecked';
    var rb = document.getElementById('goRankBadge');
    if (rb) {
      var rank = Math.max(1, 10 - Math.floor(Math.min(1, G.score / Math.max(1, P.highScore || 5000)) * 9));
      rb.textContent = rank <= 1 ? '🥇' : rank <= 3 ? '🥈' : rank <= 5 ? '🥉' : '🏁';
    }
    renderRecords();
  }

  // ── Pause menu stats + quit ──
  function renderPauseStats() {
    var el = document.getElementById('pauseStats');
    if (!el) return;
    el.innerHTML =
      '<div>Score <span>' + (G.score || 0) + '</span></div>' +
      '<div>Coins <span>' + (G.coins || 0) + '</span></div>' +
      '<div>Dist <span>' + Math.round(G.distance || 0) + 'm</span></div>' +
      '<div>HP <span>' + Math.round(G.health || 0) + '</span></div>';
  }
  function setupPauseExtras() {
    var quitBtn = document.getElementById('quitBtn');
    if (quitBtn) {
      quitBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        G.paused = false; G.running = false; G._suppressLockPause = true; setTimeout(function(){G._suppressLockPause=false;},500);
        var ps = document.getElementById('pauseScreen'); if (ps) ps.classList.add('hidden');
        var hud = document.getElementById('hud'); if (hud) hud.classList.add('hidden');
        var go = document.getElementById('gameOverScreen'); if (go) go.classList.add('hidden');
        var menu = document.getElementById('menu'); if (menu) menu.classList.remove('hidden');
        renderRecords(); renderAchievements();
        if (document.exitPointerLock) document.exitPointerLock();
      });
    }
    var menuBtn = document.getElementById('menuBtn');
    if (menuBtn) {
      menuBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var go = document.getElementById('gameOverScreen'); if (go) go.classList.add('hidden');
        var menu = document.getElementById('menu'); if (menu) menu.classList.remove('hidden');
        renderRecords(); renderAchievements();
      });
    }
    // stop click-through from pause buttons hitting the "resume anywhere" handler
    var ps = document.getElementById('pauseScreen');
    if (ps) ps.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'BUTTON') e.stopPropagation();
    }, true);
  }

  // ── Per-frame watcher (piggybacks on requestAnimationFrame) ──
  function watch() {
    requestAnimationFrame(watch);
    if (!G.running || G.paused) return;
    if (!runStarted) { runStarted = true; lastHealth = G.health; }
    updateProHUD();
    if (G.health < lastHealth) flashDamage();
    lastHealth = G.health;
    if (G.gameOver && runStarted) { runStarted = false; onRunEnd(); }
  }

  // ── Boot ──
  function boot() {
    setupTabs();
    setupDifficulty();
    setupPauseExtras();
    hookStart();
    renderDifficulty();
    renderGarage();
    renderPaint();
    renderRecords();
    renderAchievements();
    applyDifficulty();
    applyPaint();

    // stability slider sync
    var sl = document.getElementById('stabilitySlider');
    var sv = document.getElementById('stabilityValue');
    if (sl && sv) {
      sl.value = String(Math.round(P.stability * 100));
      sv.textContent = P.stability < 0.34 ? 'Assist' : (P.stability > 0.66 ? 'Raw' : 'Balanced');
      sl.addEventListener('input', function () {
        var v = parseFloat(sl.value) / 100;
        if (isNaN(v)) v = 0.5;
        P.stability = v; G.stability = v; saveProfile();
        sv.textContent = v < 0.34 ? 'Assist' : (v > 0.66 ? 'Raw' : 'Balanced');
      });
    }
    // Make sure the menu is shown on boot
    var menu = document.getElementById('menu'); if (menu) menu.classList.remove('hidden');

    watch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();