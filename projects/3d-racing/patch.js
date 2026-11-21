// ═══════════════════════════════════════════════════════════
// APEX DRIVE — FINAL PATCH (patch.js)
// Loaded LAST (after script.js, pro.js, upgrade.js, fix.js).
// Fixes:
//  1) Coin popup icon rendered as an empty box on systems that
//     lack the newer coin glyph. We normalise any coin emoji in
//     the popup to the widely-supported 💰 glyph.
//  2) "Top Speed" on the game-over screen showed 0 because the
//     pro.js RUN object was private to its IIFE and the value was
//     captured after the speed had already been zeroed. We keep an
//     always-updating global top-speed tracker and force-write it
//     into #goTopSpeed when the game-over screen appears.
//  3) All AI traffic cars looked identical (only the paint colour
//     differed). We override makeAICar with several distinct body
//     silhouettes (sedan / muscle / van / sports) chosen by a
//     rotating variant index.
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (typeof THREE === 'undefined' || typeof G === 'undefined') return;

  // ─────────────────────────────────────────────────────────
  // FIX 1 — coin popup emoji normalisation
  // ─────────────────────────────────────────────────────────
  if (typeof window.showPopup === 'function' && !window.__popupPatched) {
    var _origPopup = window.showPopup;
    window.showPopup = function (text) {
      if (typeof text === 'string') {
        // Replace any "coin-like" glyph (newer U+1FA99 / older 🪙 variants)
        // that may render as a tofu box with the reliable 💰 glyph.
        text = text.replace(/\u{1FA99}/gu, '\uD83D\uDCB0'); // 🪙 -> 💰
        text = text.replace(/\u{1F4B0}/gu, '\uD83D\uDCB0'); // keep 💰
      }
      return _origPopup.call(this, text);
    };
    window.__popupPatched = true;
  }

  // ─────────────────────────────────────────────────────────
  // FIX 2 — reliable global top-speed tracker
  // ─────────────────────────────────────────────────────────
  var TopSpeed = { value: 0, running: false };

  function resetTopSpeed() {
    TopSpeed.value = 0;
    TopSpeed.running = true;
  }

  // Reset on every fresh start / restart.
  ['startBtn', 'restartBtn'].forEach(function (id) {
    var btn = document.getElementById(id);
    if (btn && !btn.__tsHooked) {
      btn.addEventListener('click', function () { resetTopSpeed(); });
      btn.__tsHooked = true;
    }
  });

  // Sample the live speed every animation frame while racing.
  function tsLoop() {
    requestAnimationFrame(tsLoop);
    try {
      if (G.running && !G.paused && !G.gameOver) {
        if (!TopSpeed.running) TopSpeed.running = true;
        var kmh = Math.abs(G.speed || 0) * 3.6;
        if (kmh > TopSpeed.value) TopSpeed.value = kmh;
        // Keep pro.js's RUN in sync if it is reachable.
        if (window.RUN && typeof window.RUN.topSpeed === 'number' && kmh > window.RUN.topSpeed) {
          window.RUN.topSpeed = kmh;
        }
      }
    } catch (e) {}
  }
  tsLoop();

  // Force the correct value into the game-over panel the moment it
  // becomes visible (covers the ordering bug where speed was zeroed
  // before the stat was written).
  function refreshGoTopSpeed() {
    var el = document.getElementById('goTopSpeed');
    if (!el) return;
    // Prefer the larger of our tracker and pro.js's RUN.
    var v = TopSpeed.value;
    if (window.RUN && typeof window.RUN.topSpeed === 'number' && window.RUN.topSpeed > v) {
      v = window.RUN.topSpeed;
    }
    el.textContent = String(Math.round(v));
  }

  var goScreen = document.getElementById('gameOverScreen');
  if (goScreen && window.MutationObserver) {
    var mo = new MutationObserver(function () {
      if (!goScreen.classList.contains('hidden')) refreshGoTopSpeed();
    });
    mo.observe(goScreen, { attributes: true, attributeFilter: ['class'] });
  }

  // Also patch triggerGameOver so the value is written synchronously.
  if (typeof window.triggerGameOver === 'function' && !window.__tsGoPatched) {
    var _origGO = window.triggerGameOver;
    window.triggerGameOver = function () {
      // capture the speed BEFORE the original zeroes anything
      var kmh = Math.abs(G.speed || 0) * 3.6;
      if (kmh > TopSpeed.value) TopSpeed.value = kmh;
      var r = _origGO.apply(this, arguments);
      refreshGoTopSpeed();
      return r;
    };
    window.__tsGoPatched = true;
  }
  // Expose for debugging / other layers.
  window.TopSpeed = TopSpeed;

  // ─────────────────────────────────────────────────────────
  // FIX 3 — distinct AI car silhouettes
  // ─────────────────────────────────────────────────────────
  // Variant definitions tweak dimensions so cars read differently
  // even at a glance: low sports car, tall van, wide muscle, sedan.
  var VARIANTS = [
    { // 0 — sports coupe (low + wide + spoiler)
      bodyW: 1.75, bodyH: 0.55, bodyL: 3.9, bodyY: 0.62,
      roofW: 1.35, roofH: 0.5, roofL: 1.4, roofY: 1.15,
      hood: true, spoiler: true, boxy: false
    },
    { // 1 — tall van (high roof, short hood)
      bodyW: 1.7, bodyH: 0.85, bodyL: 3.7, bodyY: 0.75,
      roofW: 1.6, roofH: 0.75, roofL: 2.6, roofY: 1.6,
      hood: false, spoiler: false, boxy: true
    },
    { // 2 — wide muscle (broad, low, long hood)
      bodyW: 1.95, bodyH: 0.6, bodyL: 4.2, bodyY: 0.6,
      roofW: 1.45, roofH: 0.5, roofL: 1.5, roofY: 1.15,
      hood: true, spoiler: false, boxy: false
    },
    { // 3 — compact sedan (balanced)
      bodyW: 1.72, bodyH: 0.62, bodyL: 3.8, bodyY: 0.66,
      roofW: 1.4, roofH: 0.55, roofL: 1.7, roofY: 1.28,
      hood: true, spoiler: false, boxy: false
    }
  ];
  var variantCounter = 0;

  if (typeof window.makeAICar === 'function' && !window.__aiCarPatched) {
    var _origMakeAICar = window.makeAICar;

    window.makeAICar = function (color) {
      // Build the original car first (keeps lights, wheels, materials).
      var g = _origMakeAICar(color);

      var v = VARIANTS[variantCounter % VARIANTS.length];
      variantCounter++;

      // Rescale the body / roof / cab groups that the original added.
      // The base car has: body(1.7,0.65,3.8)@y.66, roofPanel(1.4,.09,1.6),
      // cab(1.42,.52,1.6), aiRoof(1.38,.07,1.5), aiHood(1.6,.1,1.1),
      // bumper/rearBump, 4 wheels. We find them by geometry size and
      // reshape the whole model to the variant silhouette.
      g.traverse(function (o) {
        if (!o.isMesh || !o.geometry || !o.geometry.parameters) return;
        var p = o.geometry.parameters;
        // main body box
        if (p.width && Math.abs(p.width - 1.7) < 0.01 && Math.abs(p.height - 0.65) < 0.01) {
          o.scale.set(v.bodyW / 1.7, v.bodyH / 0.65, v.bodyL / 3.8);
          o.position.y = v.bodyY;
        }
        // cab (glass)
        if (p.width && Math.abs(p.width - 1.42) < 0.01 && o.material && o.material.transmission !== undefined) {
          o.scale.set(v.roofW / 1.42, v.roofH / 0.52, v.roofL / 1.6);
          o.position.y = v.roofY;
        }
        // roof panel
        if (p.width && Math.abs(p.width - 1.4) < 0.01) {
          o.scale.set(v.roofW / 1.4, 1, v.roofL / 1.6);
          o.position.y = v.roofY + v.roofH * 0.55;
        }
        // aiRoof
        if (p.width && Math.abs(p.width - 1.38) < 0.01) {
          o.scale.set(v.roofW / 1.38, 1, v.roofL / 1.5);
          o.position.y = v.roofY + v.roofH * 0.6;
        }
        // aiHood — hide for van variant
        if (p.width && Math.abs(p.width - 1.6) < 0.01 && p.height && Math.abs(p.height - 0.1) < 0.01) {
          o.visible = v.hood;
        }
      });

      // Van variant: no separate hood, taller boxy cabin already set.
      if (v.boxy) {
        // widen stance slightly at the wheels to read as a van
        g.traverse(function (o) {
          if (o.geometry && o.geometry.parameters && Math.abs((o.geometry.parameters.height || 0) - 0.3) < 0.01) {
            o.position.x *= 1.02;
          }
        });
      }

      // Add a spoiler for the sports variant (if not already present).
      if (v.spoiler) {
        var spoilerMat = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.5, metalness: 0.4 });
        var sp = new THREE.Mesh(new THREE.BoxGeometry(v.bodyW * 0.9, 0.08, 0.3), spoilerMat);
        sp.position.set(0, v.bodyY + v.bodyH * 0.7, -v.bodyL * 0.46);
        g.add(sp);
      }

      return g;
    };
    window.__aiCarPatched = true;
  }
})();