/* smooth-mix-fix.js
   Fixes: (1) smooth road turns, (2) exact edge collision,
   (3) biome mixing highway -> jungle -> city -> highway.
   Loaded AFTER all other scripts in index.html. */
(function () {
  'use strict';

  var MIX_CYCLE_LENGTH = 1600;

  function biomeAt(meters) {
    var phase = (meters / MIX_CYCLE_LENGTH) % 1;
    if (phase < 0) phase += 1;
    var w = { highway: 0, jungle: 0, city: 0 };
    if (phase < 0.30) w.highway = 1;
    else if (phase < 0.40) { var t1 = (phase - 0.30) / 0.10; w.highway = 1 - t1; w.jungle = t1; }
    else if (phase < 0.60) w.jungle = 1;
    else if (phase < 0.70) { var t2 = (phase - 0.60) / 0.10; w.jungle = 1 - t2; w.city = t2; }
    else if (phase < 0.90) w.city = 1;
    else { var t3 = (phase - 0.90) / 0.10; w.city = 1 - t3; w.highway = t3; }
    return w;
  }

  function pickBiome(w) {
    var total = w.highway + w.jungle + w.city;
    if (total <= 0.001) return 'highway';
    var r = Math.random() * total;
    if (r < w.highway) return 'highway';
    if (r < w.highway + w.jungle) return 'jungle';
    return 'city';
  }

  function blendHex(colors, weights) {
    var r = 0, g = 0, b = 0, sum = 0;
    for (var k in weights) {
      var wt = weights[k];
      if (wt <= 0.001) continue;
      var c = colors[k];
      r += ((c >> 16) & 255) * wt;
      g += ((c >> 8) & 255) * wt;
      b += (c & 255) * wt;
      sum += wt;
    }
    if (sum > 0) { r /= sum; g /= sum; b /= sum; }
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }

  function smoothNoise(n) {
    return Math.sin(n * 0.13 + 1.7) * 0.6
         + Math.sin(n * 0.31 + 4.1) * 0.3
         + Math.sin(n * 0.07 + 2.3) * 0.4;
  }

  if (typeof TRACKS !== 'undefined' && !TRACKS.mixed) {
    TRACKS.mixed = {
      label: 'MIXED',
      ground: 0x3f5a2c, hill: 0x2e4a24, fog: 0xa8c8e8, sky: 0xa8c8e8,
      curbA: 0xc0392b, curbB: 0xf0f0f0, grass: 0x4a6a38,
      prop: 'highway'
    };
  }
  window.spawnRoadSegment = function (index) {
    if (!ROAD_TEXTURE && typeof makeRoadTexture === 'function') ROAD_TEXTURE = makeRoadTexture();
    var group = new THREE.Group();

    if (!SHARED.roadGeo) {
      SHARED.curbGeo = new THREE.BoxGeometry(0.8, 0.3, SEGMENT_LENGTH / 5);
      SHARED.grassGeo = new THREE.PlaneGeometry(30, SEGMENT_LENGTH, 1, 1); SHARED.grassGeo.rotateX(-Math.PI / 2);
      SHARED.roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, SEGMENT_LENGTH, 1, 1); SHARED.roadGeo.rotateX(-Math.PI / 2);
    }
    if (!SHARED.road) {
      SHARED.road = new THREE.MeshStandardMaterial({ map: ROAD_TEXTURE, roughness: 0.92, metalness: 0.05 });
      SHARED.curbA = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 });
      SHARED.curbB = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.7 });
      SHARED.grass = new THREE.MeshStandardMaterial({ color: 0x4a6a38, roughness: 1.0 });
    }

    var road = new THREE.Mesh(SHARED.roadGeo, SHARED.road);
    road.position.set(0, 0, -SEGMENT_LENGTH / 2); road.userData.sharedGeo = true; group.add(road);

    for (var s = -1; s <= 1; s += 2) {
      for (var k = 0; k < 5; k++) {
        var curb = new THREE.Mesh(SHARED.curbGeo, k % 2 === 0 ? SHARED.curbA : SHARED.curbB);
        curb.position.set(s * (ROAD_WIDTH / 2 + 0.4), 0.15, -SEGMENT_LENGTH + (k + 0.5) * (SEGMENT_LENGTH / 5));
        curb.userData.sharedGeo = true; group.add(curb);
      }
    }

    for (var s2 = -1; s2 <= 1; s2 += 2) {
      var grass = new THREE.Mesh(SHARED.grassGeo, SHARED.grass);
      grass.position.set(s2 * (ROAD_WIDTH / 2 + 15 + 0.4), -0.02, -SEGMENT_LENGTH / 2);
      grass.userData.sharedGeo = true; group.add(grass);
    }

    var x = G.roadEndX, z = G.roadEndZ, rot = G.roadEndRot;
    group.position.set(x, 0, z);
    group.rotation.y = rot;

    var turn = 0;
    if (index >= 4) {
      var raw = smoothNoise(index) * 0.16;
      var dev = rot - Math.PI;
      while (dev > Math.PI) dev -= Math.PI * 2;
      while (dev < -Math.PI) dev += Math.PI * 2;
      turn = raw + dev * 0.04;
    }

    group.userData = {
      index: index,
      entranceX: x, entranceZ: z,
      endX: x - Math.sin(rot) * SEGMENT_LENGTH,
      endZ: z - Math.cos(rot) * SEGMENT_LENGTH,
      turn: turn,
      cumDist: (G._cumDist || 0)
    };
    G._cumDist = (G._cumDist || 0) + SEGMENT_LENGTH;

    G.roadEndX = group.userData.endX;
    G.roadEndZ = group.userData.endZ;
    G.roadEndRot = rot - turn;

    scene.add(group);
    roadSegments.push(group);
    window.addRoadsideProps(group);
  };
  window.addRoadsideProps = function (seg) {
    var segLen = SEGMENT_LENGTH;
    var mix;
    if (G.mixMode || G.track === 'mixed') {
      mix = biomeAt(seg.userData.cumDist || 0);
    } else {
      var theme = (typeof TRACKS !== 'undefined' && TRACKS[G.track]) || TRACKS.highway;
      mix = { highway: 0, jungle: 0, city: 0 };
      if (theme.prop === 'city') mix.city = 1;
      else if (theme.prop === 'jungle') mix.jungle = 1;
      else mix.highway = 1;
    }

    var count = 2 + Math.floor(Math.random() * 2);
    for (var i = 0; i < count; i++) {
      var side = Math.random() < 0.5 ? -1 : 1;
      var b = pickBiome(mix);
      var z = -segLen * Math.random();
      if (b === 'city') {
        var bldg = makeCityBuilding(side);
        bldg.position.set(side * (ROAD_WIDTH / 2 + 6 + Math.random() * 6), 0, z);
        seg.add(bldg);
      } else if (b === 'jungle') {
        var tree = makeJungleTree(side);
        tree.position.set(side * (ROAD_WIDTH / 2 + 6 + Math.random() * 12), 0, z);
        seg.add(tree);
      } else {
        var ht = makeTree();
        ht.position.set(side * (ROAD_WIDTH / 2 + 8 + Math.random() * 16), 0, z);
        ht.scale.setScalar(0.8 + Math.random() * 0.6);
        seg.add(ht);
      }
    }

    if ((mix.highway + mix.city) > 0.3 && seg.userData.index % 2 === 0) {
      for (var s3 = -1; s3 <= 1; s3 += 2) {
        var lamp = makeStreetLamp(s3);
        lamp.position.set(s3 * (ROAD_WIDTH / 2 + 3), 0, -segLen * Math.random());
        seg.add(lamp);
      }
    }

    if (seg.userData.index % 3 === 0) {
      for (var s4 = -1; s4 <= 1; s4 += 2) {
        var bar = makeBarrier();
        bar.position.set(s4 * (ROAD_WIDTH / 2 + 1.5), 0, -segLen / 2);
        seg.add(bar);
      }
    }
  };
  var _cInv = new THREE.Matrix4();
  var _cLocal = new THREE.Vector3();
  var _cBest = new THREE.Vector3();
  window.clampCarToRoad = function () {
    if (!car || !roadSegments.length) return;
    var half = ROAD_WIDTH / 2 - 1.3;
    var best = null, bestD = Infinity, i, s;

    for (i = 0; i < roadSegments.length; i++) {
      s = roadSegments[i];
      s.updateMatrixWorld();
      _cInv.copy(s.matrixWorld).invert();
      _cLocal.copy(car.position).applyMatrix4(_cInv);
      if (_cLocal.z > 2 || _cLocal.z < -SEGMENT_LENGTH - 2) continue;
      var d = _cLocal.x * _cLocal.x;
      if (d < bestD) { bestD = d; best = s; _cBest.copy(_cLocal); }
    }

    if (!best) {
      bestD = Infinity;
      for (i = 0; i < roadSegments.length; i++) {
        s = roadSegments[i];
        var dx = car.position.x - s.position.x;
        var dz = car.position.z - s.position.z;
        var d2 = dx * dx + dz * dz;
        if (d2 < bestD) { bestD = d2; best = s; }
      }
      if (!best) return;
      best.updateMatrixWorld();
      _cInv.copy(best.matrixWorld).invert();
      _cBest.copy(car.position).applyMatrix4(_cInv);
    }

    var clamped = Math.max(-half, Math.min(half, _cBest.x));
    if (clamped !== _cBest.x) {
      _cBest.x = clamped;
      car.position.copy(_cBest.applyMatrix4(best.matrixWorld));
      G.pos.copy(car.position);
      G.speed *= 0.97;
      G.shake = Math.max(G.shake, 0.15);
    }
  };
  function applyBiomeAt(cumDist) {
    if (typeof scene === 'undefined' || typeof TRACKS === 'undefined') return;
    var mix = biomeAt(cumDist);
    var fogHex = blendHex({ highway: TRACKS.highway.fog, jungle: TRACKS.jungle.fog, city: TRACKS.city.fog }, mix);
    var groundHex = blendHex({ highway: TRACKS.highway.ground, jungle: TRACKS.jungle.ground, city: TRACKS.city.ground }, mix);
    if (scene.fog) scene.fog.color.setHex(fogHex);
    if (renderer) renderer.setClearColor(fogHex, 1);
    if (typeof skyMat !== 'undefined' && skyMat) skyMat.color.setHex(fogHex);
    if (G.ground && G.ground.material) G.ground.material.color.setHex(groundHex);
  }

  var _origUpdateDN = window.updateDayNight;
  window.updateDayNight = function (dt) {
    if (typeof _origUpdateDN === 'function') _origUpdateDN.call(this, dt);
    if (!(G.mixMode || G.track === 'mixed')) return;
    if (!car || !roadSegments.length) return;
    var best = null, bestD = Infinity;
    for (var i = 0; i < roadSegments.length; i++) {
      var s = roadSegments[i];
      var dx = car.position.x - s.position.x;
      var dz = car.position.z - s.position.z;
      var d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best) return;
    applyBiomeAt(best.userData.cumDist || 0);
  };

  var _origReset = window.resetCar;
  if (typeof _origReset === 'function') {
    window.resetCar = function () {
      G._cumDist = 0;
      return _origReset.apply(this, arguments);
    };
  }

  var _origSetTrack = window.setTrack;
  window.setTrack = function (id) {
    if (id === 'mixed') {
      G.mixMode = true; G.track = 'mixed';
      try { localStorage.setItem('apexTrack', 'mixed'); } catch (e) {}
      var cs = document.querySelectorAll('.track-card');
      for (var i = 0; i < cs.length; i++) cs[i].classList.toggle('active', cs[i].getAttribute('data-track') === 'mixed');
      var tg = document.getElementById('trackTag');
      if (tg) tg.textContent = 'APEX MIXED';
      return;
    }
    G.mixMode = false;
    if (typeof _origSetTrack === 'function') _origSetTrack.call(this, id);
  };
  function addMixCard() {
    var grid = document.getElementById('trackGrid');
    if (!grid) return;
    if (grid.querySelector('[data-track="mixed"]')) return;
    var card = document.createElement('div');
    card.className = 'track-card';
    card.setAttribute('data-track', 'mixed');
    card.innerHTML = '<div class="track-icon">&#127757;</div>' +
      '<div class="track-name">MIXED</div>' +
      '<div class="track-desc">Desert &rarr; Jungle &rarr; City in one run</div>';
    card.addEventListener('click', function () { window.setTrack('mixed'); });
    grid.appendChild(card);
  }

  function boot() {
    addMixCard();
    var saved = 'highway';
    try { saved = localStorage.getItem('apexTrack') || 'highway'; } catch (e) {}
    if (saved === 'mixed') {
      G.mixMode = true; G.track = 'mixed';
      var cs = document.querySelectorAll('.track-card');
      for (var i = 0; i < cs.length; i++) cs[i].classList.toggle('active', cs[i].getAttribute('data-track') === 'mixed');
      var tg = document.getElementById('trackTag');
      if (tg) tg.textContent = 'APEX MIXED';
    }

    try {
      G._cumDist = 0;
      for (var j = 0; j < roadSegments.length; j++) scene.remove(roadSegments[j]);
      roadSegments = [];
      G.roadEndX = 0; G.roadEndZ = 0; G.roadEndRot = Math.PI;
      for (var k = 0; k < SEGMENTS_AHEAD + 6; k++) window.spawnRoadSegment(k);
      if (typeof car !== 'undefined' && car) {
        car.position.set(0, 0, 0);
        G.pos.set(0, 0, 0);
        G.heading = 0;
      }
    } catch (e) { console.warn('[mix-fix] rebuild failed:', e); }

    var sb = document.getElementById('startBtn');
    if (sb && typeof startGame === 'function') sb.onclick = startGame;
    var rb = document.getElementById('restartBtn');
    if (rb && typeof restartGame === 'function') rb.onclick = restartGame;
    console.log('[mix-fix] smooth turns + exact collision + biome mixing loaded');
  }

  if (document.readyState === 'complete') setTimeout(boot, 30);
  else window.addEventListener('load', function () { setTimeout(boot, 30); });
})();