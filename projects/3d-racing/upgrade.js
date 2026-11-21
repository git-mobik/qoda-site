// ═══════════════════════════════════════════════════════════
// APEX DRIVE — POWER-UPS & NEAR-MISS UPGRADE (upgrade.js)
// Loaded AFTER script.js and pro.js. Adds:
//  • 5 power-ups spawned on the road (nitro/shield/repair/overdrive/combo)
//  • Near-miss bonus (pass AI traffic close for bonus points)
//  • HUD badges for active power-ups + near-miss counter
//  • Auto reset on new race / restart
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';
  if (typeof G === 'undefined' || typeof THREE === 'undefined') return;

  var TYPES = [
    { id: 'nitro',     icon: '\u26A1', color: 0x00e5ff, label: 'NITRO FILLED' },
    { id: 'shield',    icon: '\uD83D\uDEE1\uFE0F', color: 0x22c55e, label: 'SHIELD ACTIVE' },
    { id: 'repair',    icon: '\u2764\uFE0F', color: 0xff3b6b, label: 'REPAIRED +30' },
    { id: 'overdrive', icon: '\uD83D\uDD25', color: 0xff9500, label: 'OVERDRIVE!' },
    { id: 'combo',     icon: '\uD83D\uDCA5', color: 0xa855f7, label: 'COMBO BOOST' }
  ];
  var SPAWN_MIN = 100, SPAWN_MAX = 220, MAX_ACTIVE = 2;
  var NEAR_MISS_DIST = 5.5, NEAR_MISS_BONUS = 50;

  var powerups = [];
  var puTimer = 3;
  var shieldSphere = null;
  var shieldTime = 0;
  var overdriveTime = 0;
  var overdriveOrig = null;
  var nearMissPrev = [];
  var nearMissCount = 0;
  var tmpV = new THREE.Vector3();

  function makePU(type) {
    var g = new THREE.Group();
    var ringMat = new THREE.MeshStandardMaterial({
      color: type.color, emissive: type.color, emissiveIntensity: 0.85,
      metalness: 0.55, roughness: 0.28
    });
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.11, 8, 22), ringMat);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);

    var coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: type.color, emissiveIntensity: 1.3,
      metalness: 0.85, roughness: 0.08, transparent: true, opacity: 0.92
    });
    var core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.52, 0), coreMat);
    g.add(core);

    var markerMat = new THREE.MeshBasicMaterial({ color: type.color });
    var marker = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), markerMat);
    marker.position.y = 1.15;
    g.add(marker);

    g.userData.spin = 0;
    return g;
  }

  function pickType() {
    return TYPES[Math.floor(Math.random() * TYPES.length)];
  }

  function spawnPowerup(ahead) {
    var active = 0;
    for (var i = 0; i < powerups.length; i++) if (powerups[i].visible) active++;
    if (active >= MAX_ACTIVE) return;

    var type = pickType();
    var pu = makePU(type);
    pu.userData.type = type.id;
    pu.userData.active = true;
    pu.userData.zWorld = car.position.z + ahead;
    pu.userData.xOffset = (Math.random() * 2 - 1) * (ROAD_WIDTH / 2 - 2.5);
    pu.visible = true;
    pu.position.set(0, 1.0, 0);
    scene.add(pu);
    try { placeCoinOnRoad(pu); } catch (e) {}
    powerups.push(pu);
  }

  function updatePowerups(dt) {
    var playerMoving = Math.abs(G.speed) > 2;
    puTimer -= dt;
    if (puTimer <= 0 && playerMoving && G.speed > 0) {
      var ahead = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      spawnPowerup(ahead);
      puTimer = 3 + Math.random() * 4;
    }

    for (var i = powerups.length - 1; i >= 0; i--) {
      var pu = powerups[i];
      if (!pu.visible) {
        if (pu.parent) pu.parent.remove(pu);
        powerups.splice(i, 1);
        continue;
      }
      if (pu.userData.zWorld < car.position.z - 40) {
        if (pu.parent) pu.parent.remove(pu);
        powerups.splice(i, 1);
        continue;
      }

      try { placeCoinOnRoad(pu); } catch (e) {}
      pu.userData.spin = (pu.userData.spin || 0) + dt * 3;
      pu.position.y = 1.0 + Math.sin(pu.userData.spin) * 0.16;
      pu.rotation.y += dt * 1.9;

      pu.getWorldPosition(tmpV);
      var dx = tmpV.x - car.position.x;
      var dz = tmpV.z - car.position.z;
      if (Math.abs(dx) < 2.7 && Math.abs(dz) < 2.9) {
        applyPowerup(pu.userData.type);
        pu.visible = false;
        if (pu.parent) pu.parent.remove(pu);
        powerups.splice(i, 1);
      }
    }
  }

  function applyPowerup(typeId) {
    var type = null;
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === typeId) { type = TYPES[i]; break; }
    if (!type) return;

    if (typeId === 'nitro') {
      G.nitro = 100;
      showPopup('\u26A1 ' + type.label);
    } else if (typeId === 'shield') {
      G.invuln = Math.max(G.invuln || 0, 5);
      shieldTime = 5;
      enableShieldVisual(true);
      showPopup('\uD83D\uDEE1\uFE0F ' + type.label);
    } else if (typeId === 'repair') {
      G.health = Math.min(100, (G.health || 0) + 30);
      showPopup('\u2764\uFE0F ' + type.label);
    } else if (typeId === 'overdrive') {
      if (overdriveOrig === null) overdriveOrig = G.maxSpeed;
      G.maxSpeed = overdriveOrig * 1.25;
      overdriveTime = 4;
      showPopup('\uD83D\uDD25 ' + type.label);
    } else if (typeId === 'combo') {
      G.combo = (G.combo || 0) + 5;
      G.comboTimer = Math.max(G.comboTimer || 0, 5);
      showPopup('\uD83D\uDCA5 ' + type.label);
    }
    try { Sound.blip(1250, 0.14); } catch (e) {}
    updatePUHud();
  }

  function ensureShield() {
    if (shieldSphere) return;
    var geo = new THREE.SphereGeometry(2.5, 20, 14);
    var mat = new THREE.MeshBasicMaterial({
      color: 0x22c55e, transparent: true, opacity: 0.18,
      side: THREE.DoubleSide
    });
    shieldSphere = new THREE.Mesh(geo, mat);
    shieldSphere.visible = false;
  }

  function enableShieldVisual(on) {
    ensureShield();
    if (on && car) {
      if (shieldSphere.parent !== car) car.add(shieldSphere);
      shieldSphere.visible = true;
      shieldSphere.position.set(0, 0.95, 0);
    } else if (shieldSphere) {
      shieldSphere.visible = false;
    }
  }

  function updateNearMiss(dt) {
    if (!G.aiCars) return;
    if (nearMissPrev.length !== G.aiCars.length) nearMissPrev.length = 0;
    for (var i = 0; i < G.aiCars.length; i++) {
      var ai = G.aiCars[i];
      var d = ai.userData;
      if (!d || !d.active) { nearMissPrev[i] = null; continue; }

      var prev = nearMissPrev[i];
      if (!prev || prev.ai !== ai) {
        nearMissPrev[i] = { prevZ: d.zWorld, passed: false, ai: ai };
        continue;
      }

      var carZ = car.position.z;
      if (prev.prevZ > carZ && d.zWorld <= carZ && !prev.passed) {
        prev.passed = true;
        ai.getWorldPosition(tmpV);
        var lateral = Math.abs(tmpV.x - car.position.x);
        if (lateral < NEAR_MISS_DIST && (G.invuln || 0) <= 0) {
          var mult = Math.max(1, G.combo || 1);
          var pts = NEAR_MISS_BONUS * mult;
          G.score += pts;
          G.combo = (G.combo || 0) + 1;
          G.comboTimer = 2.5;
          nearMissCount++;
          showPopup('\uD83D\uDCA8 NEAR MISS! +' + pts);
          try { Sound.blip(980, 0.07); } catch (e) {}
          updatePUHud();
        }
      }
      if (d.zWorld > carZ + 6) prev.passed = false;
      prev.prevZ = d.zWorld;
    }
  }

  function ensurePUHud() {
    var existing = document.getElementById('puHud');
    if (existing) return existing;
    var hud = document.getElementById('hud');
    if (!hud) return null;
    var el = document.createElement('div');
    el.id = 'puHud';
    el.innerHTML =
      '<div class="pu-row" id="puShieldRow"><span class="pu-icon">\uD83D\uDEE1\uFE0F</span><span class="pu-time" id="puShieldTime">0.0s</span></div>' +
      '<div class="pu-row" id="puOverdriveRow"><span class="pu-icon">\uD83D\uDD25</span><span class="pu-time" id="puOverdriveTime">0.0s</span></div>' +
      '<div class="pu-stat">\uD83D\uDCA8 Near Miss: <span id="puNearMiss">0</span></div>';
    hud.appendChild(el);
    return el;
  }

  function updatePUHud() {
    var nm = document.getElementById('puNearMiss');
    if (nm) nm.textContent = nearMissCount;

    var sr = document.getElementById('puShieldRow');
    var st = document.getElementById('puShieldTime');
    if (sr && st) {
      if (shieldTime > 0) { sr.style.display = 'flex'; st.textContent = shieldTime.toFixed(1) + 's'; }
      else { sr.style.display = 'none'; }
    }
    var orow = document.getElementById('puOverdriveRow');
    var ot = document.getElementById('puOverdriveTime');
    if (orow && ot) {
      if (overdriveTime > 0) { orow.style.display = 'flex'; ot.textContent = overdriveTime.toFixed(1) + 's'; }
      else { orow.style.display = 'none'; }
    }
  }

  function tickTimers(dt) {
    if (shieldTime > 0) {
      shieldTime -= dt;
      if (shieldTime <= 0) { shieldTime = 0; enableShieldVisual(false); }
    }
    if (overdriveTime > 0) {
      overdriveTime -= dt;
      if (overdriveTime <= 0) {
        overdriveTime = 0;
        if (overdriveOrig !== null) { G.maxSpeed = overdriveOrig; overdriveOrig = null; }
      }
    }
  }

  function resetAll() {
    for (var i = 0; i < powerups.length; i++) {
      var p = powerups[i];
      if (p.parent) p.parent.remove(p);
    }
    powerups.length = 0;
    puTimer = 3;
    shieldTime = 0;
    overdriveTime = 0;
    if (overdriveOrig !== null) { G.maxSpeed = overdriveOrig; overdriveOrig = null; }
    enableShieldVisual(false);
    nearMissPrev.length = 0;
    nearMissCount = 0;
    updatePUHud();
  }

  var lastT = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastT) lastT = t;
    var dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    if (!G.running || G.paused || G.gameOver) return;
    try {
      tickTimers(dt);
      updatePowerups(dt);
      updateNearMiss(dt);
      updatePUHud();
    } catch (e) {}
  }

  function ready() {
    if (typeof car === 'undefined' || !car || typeof scene === 'undefined' || !scene) {
      setTimeout(ready, 150);
      return;
    }
    ensurePUHud();
    requestAnimationFrame(loop);

    var sb = document.getElementById('startBtn');
    if (sb) sb.addEventListener('click', function () { setTimeout(resetAll, 60); });
    var rb = document.getElementById('restartBtn');
    if (rb) rb.addEventListener('click', function () { setTimeout(resetAll, 60); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
// ── Load bugfix layer (fix.js) after all systems are ready ──
(function () {
  try {
    var s = document.createElement('script');
    s.src = 'fix.js';
    s.async = false;
    document.body.appendChild(s);
  } catch (e) {}
})();