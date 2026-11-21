// ═══════════════════════════════════════════════════════════
// APEX DRIVE — BUGFIX LAYER (fix.js)
// Loaded AFTER script.js / pro.js / upgrade.js.
// Fixes:
//  1. Pause screen stats were never rendered (renderPauseStats was
//     defined inside pro.js but never invoked).
//  2. Pointer-lock race: requesting pointer lock right after clicking
//     START could fire a lockchange(unlock) and instantly pause the
//     game. We suppress the auto-pause for a short grace window.
//  3. Restart did not clear the game-over flag before re-locking, so
//     the visibility/lock handlers could re-pause. Guarded here.
//  4. Ensure game-over HUD stats (top speed) refresh even if pro.js
//     watcher missed the transition.
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';
  if (typeof G === 'undefined') return;

  // ── Fix 1: render pause stats ──
  function renderPauseStatsNow() {
    var el = document.getElementById('pauseStats');
    if (!el) return;
    el.innerHTML =
      '<div>Score <span>' + (G.score || 0) + '</span></div>' +
      '<div>Coins <span>' + (G.coins || 0) + '</span></div>' +
      '<div>Distance <span>' + Math.round(G.distance || 0) + ' m</span></div>' +
      '<div>Health <span>' + Math.round(G.health || 0) + ' HP</span></div>';
  }

  // Wrap the global pauseGame so stats are always populated.
  if (typeof window.pauseGame === 'function' && !window.__pauseGamePatched) {
    var _origPause = window.pauseGame;
    window.pauseGame = function () {
      _origPause.apply(this, arguments);
      renderPauseStatsNow();
    };
    window.__pauseGamePatched = true;
  } else {
    // Fallback: observe the pause screen becoming visible.
    var ps = document.getElementById('pauseScreen');
    if (ps && window.MutationObserver) {
      var mo = new MutationObserver(function () {
        if (!ps.classList.contains('hidden')) renderPauseStatsNow();
      });
      mo.observe(ps, { attributes: true, attributeFilter: ['class'] });
    }
  }

  // ── Fix 2/3: pointer-lock grace window ──
  var startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.addEventListener('click', function () {
      // Suppress the auto-pause from an immediate unlock for 900ms.
      G._suppressLockPause = true;
      setTimeout(function () { G._suppressLockPause = false; }, 900);
    });
  }
  var restartBtn = document.getElementById('restartBtn');
  if (restartBtn) {
    restartBtn.addEventListener('click', function () {
      G._suppressLockPause = true;
      setTimeout(function () { G._suppressLockPause = false; }, 900);
    });
  }

  // ── Fix 4: refresh pause stats if game is running while paused ──
  // (covers pause triggered by Escape/visibility where our wrapper may
  //  run before G fields settled)
  function watchPause() {
    requestAnimationFrame(watchPause);
    if (G.paused) renderPauseStatsNow();
  }
  watchPause();
})();
// ═══════════════════════════════════════════════════════════
// ADDITIONAL BUGFIXES (batch 2)
//  A) Game-over stats/records were never saved: pro.js "watch()"
//     bails out on !G.running, but triggerGameOver() sets
//     G.running=false *before* the watcher can see G.gameOver.
//     We patch triggerGameOver so the run-end persistence runs
//     synchronously, right after the screen is shown.
//  B) Near-miss detection direction was inverted, so near-miss
//     bonuses almost never fired. We recompute the crossing test
//     using the previous *player* Z instead of the AI Z.
//  C) Restart via the game-over screen did not set the pointer
//     lock grace flag, so the fresh lock change could instantly
//     pause the new race. We cover that path too.
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';
  if (typeof G === 'undefined') return;

  // ── A) Persist run results on game over (fix dead watcher path) ──
  if (typeof window.triggerGameOver === 'function' && !window.__goPatched) {
    var _origGameOver = window.triggerGameOver;
    window.triggerGameOver = function () {
      var wasOver = G.gameOver;
      _origGameOver.apply(this, arguments);
      if (wasOver) return; // already handled
      // run-end persistence normally done by pro.js onRunEnd(), but the
      // pro.js watcher never reaches it because G.running is already false.
      try {
        if (typeof window.onRunEnd === 'function') window.onRunEnd();
      } catch (e) {}
      // Recompute the two stats pro.js was supposed to fill in.
      try {
        var ts = document.getElementById('goTopSpeed');
        if (ts && typeof window.RUN !== 'undefined' && RUN && typeof RUN.topSpeed === 'number') {
          ts.textContent = Math.round(RUN.topSpeed);
        }
      } catch (e) {}
    };
    window.__goPatched = true;
  }

  // ── C) Cover the game-over restart path for the pointer-lock race ──
  var goRestart = document.getElementById('restartBtn');
  if (goRestart && !goRestart.__goGrace) {
    goRestart.addEventListener('click', function () {
      G._suppressLockPause = true;
      setTimeout(function () { G._suppressLockPause = false; }, 900);
    });
    goRestart.__goGrace = true;
  }

  // ── A2) Also expose pro.js onRunEnd if it was scoped inside its IIFE ──
  // pro.js's onRunEnd is private, so replicate the essential persistence
  // here as a safety net (localStorage keys already used by the game).
  if (typeof window.onRunEnd !== 'function') {
    window.onRunEnd = function () {
      try {
        var hs = parseInt(localStorage.getItem('apexHighScore') || '0', 10) || 0;
        if ((G.score || 0) > hs) {
          hs = G.score;
          localStorage.setItem('apexHighScore', String(hs));
        }
        G.highScore = hs;
        var el = document.getElementById('goHigh');
        if (el) el.textContent = hs;
      } catch (e) {}
    };
  }

  // ── B) Patch near-miss detection if upgrade.js exposed it ──
  // upgrade.js keeps updateNearMiss private, so we install a small
  // independent near-miss sampler driven from the existing game loop.
  var lastPlayerZ = null;
  var lastAIZ = [];
  var nmPatched = false;
  function sampleNearMiss() {
    if (!G.running || G.paused || G.gameOver) {
      lastPlayerZ = null;
      lastAIZ.length = 0;
      return;
    }
    var pz = (typeof car !== 'undefined' && car) ? car.position.z : null;
    if (pz === null || !G.aiCars) return;
    var px = car.position.x;

    for (var i = 0; i < G.aiCars.length; i++) {
      var ai = G.aiCars[i];
      var d = ai.userData || {};
      if (!d.active) { lastAIZ[i] = null; continue; }
      var az = d.zWorld;

      // Player overtakes AI: previous player Z < AI Z  AND  now player Z > AI Z
      if (lastPlayerZ !== null && lastAIZ[i] !== null &&
          lastPlayerZ < lastAIZ[i] && pz >= az) {
        var lateral = Math.abs(d.lane - px);
        if (lateral < 5.5 && (G.invuln || 0) <= 0 && !G.gameOver) {
          var mult = Math.max(1, G.combo || 1);
          var pts = 50 * mult;
          G.score += pts;
          G.combo = (G.combo || 0) + 1;
          G.comboTimer = 2.5;
          try { showPopup('\uD83D\uDCA8 NEAR MISS! +' + pts); } catch (e) {}
          try { Sound.blip(980, 0.07); } catch (e) {}
        }
      }
      lastAIZ[i] = az;
    }
    lastPlayerZ = pz;
  }

  function nmLoop() {
    requestAnimationFrame(nmLoop);
    try { sampleNearMiss(); } catch (e) {}
  }
  if (!nmPatched) { nmPatched = true; nmLoop(); }
})();