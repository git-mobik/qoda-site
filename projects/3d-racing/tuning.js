// ═══════════════════════════════════════════════════════════
// APEX DRIVE — PERFORMANCE TUNING SHOP (tuning.js)
// Loaded AFTER script.js / pro.js / upgrade.js.
// Adds a persistent upgrade system:
//  • 5 upgrade tracks: Engine / Turbo / Handling / Nitro / Armor
//  • Currency = CREDITS, earned from every race (coins + distance + score)
//  • Levels persist in localStorage under 'apexTuning'
//  • Upgrades are applied on top of difficulty + garage car stats
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';
  if (typeof G === 'undefined') return;

  var KEY = 'apexTuning';

  var UPG = [
    { id: 'engine', icon: '\u2699\uFE0F',            name: 'ENGINE',   desc: 'Top speed',       max: 10, base: 120, step: 110, per: 0.040 },
    { id: 'turbo',  icon: '\u26A1',                  name: 'TURBO',    desc: 'Acceleration',    max: 10, base: 100, step: 95,  per: 0.050 },
    { id: 'grip',   icon: '\uD83C\uDFAF',            name: 'HANDLING', desc: 'Steering grip',   max: 8,  base: 110, step: 100, per: 0.045 },
    { id: 'nitro',  icon: '\uD83D\uDD25',            name: 'NITRO',    desc: 'Boost duration',  max: 8,  base: 140, step: 120, per: 0.075 },
    { id: 'armor',  icon: '\uD83D\uDEE1\uFE0F',      name: 'ARMOR',    desc: 'Crash damage cut',max: 8,  base: 130, step: 115, per: 0.070 }
  ];

  var T = { credits: 0, levels: {} };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o) return;
      T.credits = Math.max(0, o.credits | 0);
      if (o.levels) {
        for (var k in o.levels) {
          if (Object.prototype.hasOwnProperty.call(o.levels, k)) {
            T.levels[k] = Math.max(0, o.levels[k] | 0);
          }
        }
      }
    } catch (e) {}
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ credits: T.credits, levels: T.levels }));
    } catch (e) {}
  }
  function lvl(id) { return T.levels[id] | 0; }
  function costOf(u) { return u.base + u.step * lvl(u.id); }
  function findUpg(id) {
    for (var i = 0; i < UPG.length; i++) if (UPG[i].id === id) return UPG[i];
    return null;
  }

  load();

  // ─────────────────────────────────────────────────────────
  // APPLY UPGRADES TO LIVE GAME STATS
  // Recomputes from the difficulty + car baseline so it is
  // idempotent (safe to call many times).
  // ─────────────────────────────────────────────────────────
  function applyUpgrades() {
    var e = lvl('engine'), t = lvl('turbo'), g = lvl('grip'), a = lvl('armor'), n = lvl('nitro');
    var d = G._diff, c = G._car;

    if (d && c) {
      G.maxSpeed = d.maxSpeed * c.maxSpeedMul * (1 + 0.040 * e);
      G.accel    = d.accel * c.accelMul * (1 + 0.050 * t);
      G._gripMul = c.gripMul * (1 + 0.045 * g);
      G._damage  = d.damage * Math.max(0.30, 1 - 0.070 * a);
    } else {
      // fallback baseline (pro.js not loaded yet)
      G.maxSpeed = 55 * (1 + 0.040 * e);
      G.accel    = 14 * (1 + 0.050 * t);
      G._gripMul = 1 + 0.045 * g;
      G._damage  = 25 * Math.max(0.30, 1 - 0.070 * a);
    }

    G._nitroRegenMul = 1 + 0.050 * n;
    G._nitroUseMul   = Math.max(0.40, 1 - 0.075 * n);
  }
  try { window.applyUpgrades = applyUpgrades; } catch (e) {}

  // ─────────────────────────────────────────────────────────
  // NITRO UPGRADE — extends boost by refunding part of the
  // drain (and speeding up regen) after the core physics ran.
  // ─────────────────────────────────────────────────────────
  function wrapUpdateCar() {
    if (typeof updateCar !== 'function' || updateCar._tuningWrapped) return;
    var orig = updateCar;
    var fn = function (dt) {
      orig.apply(this, arguments);
      try {
        var n = lvl('nitro');
        if (!n) return;
        if (G.nitroActive) {
          var refund = 1 - (G._nitroUseMul || 1);
          if (refund > 0) G.nitro = Math.min(100, G.nitro + 24 * dt * refund);
        } else {
          var extra = (G._nitroRegenMul || 1) - 1;
          if (extra > 0) G.nitro = Math.min(100, G.nitro + 11 * dt * extra);
        }
      } catch (e) {}
    };
    fn._tuningWrapped = true;
    updateCar = fn;
  }

  // ─────────────────────────────────────────────────────────
  // EARN CREDITS ON RACE END
  // ─────────────────────────────────────────────────────────
  function awardCredits() {
    var amt = Math.round(20 + (G.coins || 0) * 8 + (G.distance || 0) * 0.06 + (G.score || 0) * 0.02);
    if (amt < 10) amt = 10;
    T.credits += amt;
    save();
    renderUpgrades();
    showCreditToast('\uD83D\uDD27 +' + amt + ' CREDITS');
  }

  function wrapGameOver() {
    if (typeof triggerGameOver !== 'function' || triggerGameOver._tuningWrapped) return;
    var orig = triggerGameOver;
    var fn = function () {
      var wasOver = G.gameOver;
      var r = orig.apply(this, arguments);
      if (!wasOver && G.gameOver) {
        try { awardCredits(); } catch (e) {}
      }
      return r;
    };
    fn._tuningWrapped = true;
    triggerGameOver = fn;
  }

  // ─────────────────────────────────────────────────────────
  // TOAST
  // ─────────────────────────────────────────────────────────
  var toastEl = null, toastTimer = null;
  function showCreditToast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'credit-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  // ─────────────────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────────────────
  function pct(v) { return Math.round(v * 100); }

  function renderUpgrades() {
    var bal = document.getElementById('tuneCredits');
    if (bal) bal.textContent = T.credits;
    var list = document.getElementById('upgradeList');
    if (!list) return;

    var html = '';
    for (var i = 0; i < UPG.length; i++) {
      var u = UPG[i];
      var l = lvl(u.id);
      var maxed = l >= u.max;
      var price = costOf(u);
      var poor = !maxed && T.credits < price;

      var nowPct = pct(l * u.per);
      var nextPct = pct((l + 1) * u.per);
      var line = maxed
        ? (u.desc + ' \u2014 MAXED +' + nowPct + '%')
        : (u.desc + ' \u2014 now +' + nowPct + '% \u2192 next +' + nextPct + '%');

      var pips = '';
      for (var p = 0; p < u.max; p++) {
        pips += '<span class="upg-pip' + (p < l ? ' on' : '') + '"></span>';
      }

      var btnClass = 'upg-buy' + (maxed ? ' maxed' : (poor ? ' poor' : ''));
      var btnLabel = maxed ? 'MAX' : (price + ' CR');

      html += '<div class="upg-row" data-id="' + u.id + '">' +
                '<div class="upg-icon">' + u.icon + '</div>' +
                '<div class="upg-main">' +
                  '<div class="upg-head">' +
                    '<span class="upg-name">' + u.name + '</span>' +
                    '<span class="upg-lvl">LV ' + l + ' / ' + u.max + '</span>' +
                  '</div>' +
                  '<div class="upg-desc">' + line + '</div>' +
                  '<div class="upg-pips">' + pips + '</div>' +
                '</div>' +
                '<button type="button" class="' + btnClass + '" data-id="' + u.id + '">' + btnLabel + '</button>' +
              '</div>';
    }
    list.innerHTML = html;

    var btns = list.querySelectorAll('.upg-buy');
    for (var b = 0; b < btns.length; b++) {
      btns[b].addEventListener('click', function (ev) {
        ev.stopPropagation();
        var id = this.getAttribute('data-id');
        buyUpgrade(id);
      });
    }
  }

  function buyUpgrade(id) {
    var u = findUpg(id);
    if (!u) return;
    var l = lvl(id);
    if (l >= u.max) return;
    var price = costOf(u);
    if (T.credits < price) {
      showCreditToast('\u26A0\uFE0F NOT ENOUGH CREDITS');
      try { Sound.blip(180, 0.15); } catch (e) {}
      return;
    }
    T.credits -= price;
    T.levels[id] = l + 1;
    save();
    applyUpgrades();
    renderUpgrades();
    try { Sound.blip(880, 0.07); setTimeout(function () { Sound.blip(1180, 0.08); }, 80); } catch (e) {}
  }

  // ─────────────────────────────────────────────────────────
  // WIRING
  // ─────────────────────────────────────────────────────────
  function bindRaceButtons() {
    var sb = document.getElementById('startBtn');
    if (sb && !sb._tuningBound) {
      sb._tuningBound = true;
      sb.addEventListener('click', function () {
        // runs AFTER pro.js hookStart (applyDifficulty) has set G._diff / G._car
        setTimeout(function () { applyUpgrades(); }, 0);
        applyUpgrades();
      });
    }
    var rb = document.getElementById('restartBtn');
    if (rb && !rb._tuningBound) {
      rb._tuningBound = true;
      rb.addEventListener('click', function () {
        setTimeout(function () { applyUpgrades(); }, 0);
      });
    }
    // menu-return buttons -> refresh balance display
    var ids = ['quitBtn', 'menuBtn'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && !el._tuningBound) {
        el._tuningBound = true;
        el.addEventListener('click', function () { setTimeout(renderUpgrades, 0); });
      }
    }
    // difficulty / garage car cards change the baseline -> re-apply
    var cards = document.querySelectorAll('.diff-card, .car-card');
    for (var c = 0; c < cards.length; c++) {
      if (cards[c]._tuningBound) continue;
      cards[c]._tuningBound = true;
      cards[c].addEventListener('click', function () { setTimeout(applyUpgrades, 0); });
    }
  }

  function boot() {
    wrapUpdateCar();
    wrapGameOver();
    bindRaceButtons();
    renderUpgrades();
    applyUpgrades();
    // keep the balance fresh whenever the tuning tab is opened
    var tabBtn = document.querySelector('.tab-btn[data-tab="tuning"]');
    if (tabBtn) tabBtn.addEventListener('click', function () { setTimeout(renderUpgrades, 0); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 0);
  }
})();