// ═══════════════════════════════════════════════════════════
// APEX DRIVE — FINAL FIX LAYER (final-fix.js)
// Loaded LAST (after script.js / pro.js / upgrade.js / patch.js).
//
// Fixes:
//  1) START POSITION: the car starts 3 metres AHEAD of the default
//     starting point. We detect a fresh race (car at origin, G.running
//     true, countdown just finishing) and nudge the car forward once.
//  2) QUIT TO MENU: pause-menu QUIT / game-over MENU reliably return
//     to the main menu, releasing pointer lock and resetting the run.
//  3) ROAD CHANGES BY ITSELF: handled directly in script.js
//     (spawnRoadSegment stronger self-curve).
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (typeof G === 'undefined' || typeof THREE === 'undefined') return;

  var START_AHEAD = 3;

  // ─────────────────────────────────────────────────────────
  // FIX 1 — start the car 3 m ahead
  // ─────────────────────────────────────────────────────────
  // We cannot hook resetCar (module-scoped binding), so we watch the
  // car position each frame. A fresh race leaves the car near origin
  // with heading 0. Once G.running becomes true and the countdown has
  // cleared, we apply a ONE-TIME +3 m forward offset.
  var armed = false;        // ready to nudge on the next race
  var prevRunning = false;

  function tickStartOffset() {
    if (!G.running) {
      // Race ended or paused-out: arm for the next start.
      if (prevRunning) armed = true;
      prevRunning = G.running;
      return;
    }
    if (!prevRunning) {
      // Rising edge of G.running -> new race just started.
      armed = true;
    }
    prevRunning = G.running;

    if (!armed) return;
    if (typeof car === 'undefined' || !car) return;
    // Wait for the countdown to clear so the nudge is part of "GO".
    if (G.countdown > 0) return;
    // Only nudge if the car is essentially at the start line.
    if (Math.abs(car.position.x) > 0.5 || Math.abs(car.position.z) > 0.5) {
      armed = false;
      return;
    }
    var h = G.heading || 0;
    car.position.x += Math.sin(h) * START_AHEAD;
    car.position.z += Math.cos(h) * START_AHEAD;
    if (G.pos && G.pos.copy) G.pos.copy(car.position);
    armed = false;
  }

  function startOffsetLoop() {
    requestAnimationFrame(startOffsetLoop);
    try { tickStartOffset(); } catch (e) {}
  }
  startOffsetLoop();

  // ─────────────────────────────────────────────────────────
  // FIX 2 — reliable QUIT TO MENU
  // ─────────────────────────────────────────────────────────
  function goToMenu() {
    G.paused = false;
    G.running = false;
    G.gameOver = false;
    G.countdown = 0;
    G._suppressLockPause = true;
    setTimeout(function () { G._suppressLockPause = false; }, 600);

    var ps = document.getElementById('pauseScreen'); if (ps) ps.classList.add('hidden');
    var hud = document.getElementById('hud'); if (hud) hud.classList.add('hidden');
    var go = document.getElementById('gameOverScreen'); if (go) go.classList.add('hidden');
    var cd = document.getElementById('countdown'); if (cd) cd.classList.add('hidden');
    var menu = document.getElementById('menu'); if (menu) menu.classList.remove('hidden');

    try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {}
  }

  // Capture phase so this beats the pause-screen "click to resume" handler.
  var quitBtn = document.getElementById('quitBtn');
  if (quitBtn && !quitBtn.__finalQuitHooked) {
    quitBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      goToMenu();
    }, true);
    quitBtn.__finalQuitHooked = true;
  }

  var menuBtn = document.getElementById('menuBtn');
  if (menuBtn && !menuBtn.__finalMenuHooked) {
    menuBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      goToMenu();
    }, true);
    menuBtn.__finalMenuHooked = true;
  }

  window.ApexGoToMenu = goToMenu;
})();