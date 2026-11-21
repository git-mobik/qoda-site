'use strict';

var canvas = document.getElementById('sand');
var ctx = canvas.getContext('2d', { alpha: false });

var CELL = 4;
var winArea = window.innerWidth * window.innerHeight;
if (winArea > 1500000) CELL = 5;
if (winArea > 3000000) CELL = 6;
if (winArea > 5200000) CELL = 7;

var W = 0, H = 0;
var grid = null, moved = null, shade = null, img = null, pixels = null;

var EMPTY = 0, SAND = 1, WATER = 2, STONE = 3, FIRE = 4, SMOKE = 5,
    STEAM = 6, WOOD = 7, PLANT = 8, LAVA = 9, ACID = 10, OIL = 11,
    ICE = 12, GUNPOWDER = 13, METAL = 14, GLASS = 15, ASH = 16;

var COLORS = [
  [8, 10, 20],
  [232, 197, 71],
  [58, 123, 213],
  [116, 116, 124],
  [255, 120, 30],
  [55, 55, 65],
  [190, 195, 210],
  [139, 90, 43],
  [74, 222, 128],
  [255, 90, 20],
  [150, 240, 60],
  [70, 58, 46],
  [170, 220, 245],
  [95, 88, 78],
  [165, 168, 180],
  [150, 205, 225],
  [72, 70, 68]
];

var DX = [0, 0, -1, 1];
var DY = [-1, 1, 0, 0];

var currentMat = SAND;
var brushRadius = 6;
var painting = false;
var lastCell = null;
var paused = false;

var DISP_WATER = 5;
var DISP_OIL = 3;
var DISP_ACID = 4;
var DISP_LAVA = 2;

function setCell(x, y, t) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  var i = y * W + x;
  grid[i] = t;
  shade[i] = (Math.random() * 256) | 0;
}

function swap(a, b) {
  var t = grid[a]; grid[a] = grid[b]; grid[b] = t;
  var s = shade[a]; shade[a] = shade[b]; shade[b] = s;
}

function init() {
  W = Math.floor(window.innerWidth / CELL);
  H = Math.floor(window.innerHeight / CELL);
  if (W < 1) W = 1;
  if (H < 1) H = 1;
  canvas.width = W;
  canvas.height = H;
  grid = new Uint8Array(W * H);
  moved = new Uint8Array(W * H);
  shade = new Uint8Array(W * H);
  img = ctx.createImageData(W, H);
  pixels = img.data;
  demoScene();
}

function makeTree(tx, baseY) {
  if (tx < 0 || tx >= W) return;
  var th = 10 + Math.floor(Math.random() * 12);
  var h, yy;
  for (h = 0; h < th; h++) {
    yy = baseY - h;
    if (yy >= 0) setCell(tx, yy, WOOD);
  }
  var ly = baseY - th;
  for (var dy = -2; dy <= 2; dy++) {
    for (var dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy > 10) continue;
      var lx = tx + dx;
      var lyy = ly + dy;
      if (lx >= 0 && lx < W && lyy >= 0 && lyy < H) {
        if (grid[lyy * W + lx] === EMPTY) setCell(lx, lyy, PLANT);
      }
    }
  }
}

function demoScene() {
  var floorY = H - Math.max(6, Math.floor(H * 0.14));
  if (floorY < 10) floorY = Math.floor(H * 0.7);
  var x, y, dd, px;
  for (x = 0; x < W; x++) {
    for (y = floorY; y < H; y++) setCell(x, y, STONE);
  }
  var duneCx = Math.floor(W * 0.16);
  var duneH = Math.min(34, Math.floor(H * 0.32));
  if (duneH < 6) duneH = 6;
  for (var row = 0; row < duneH; row++) {
    var half = duneH - row;
    for (dd = -half; dd <= half; dd++) {
      px = duneCx + dd;
      var py = floorY - 1 - row;
      if (px >= 0 && px < W && py >= 0) setCell(px, py, SAND);
    }
  }
  var lavaCx = Math.floor(W * 0.44);
  var lavaHalf = Math.max(3, Math.min(14, Math.floor(W * 0.05)));
  var lavaDepth = Math.max(3, Math.min(7, Math.floor(H * 0.08)));
  for (dd = -lavaHalf; dd <= lavaHalf; dd++) {
    px = lavaCx + dd;
    if (px < 0 || px >= W) continue;
    for (y = floorY; y < floorY + lavaDepth && y < H; y++) setCell(px, y, EMPTY);
  }
  for (dd = -lavaHalf + 1; dd <= lavaHalf - 1; dd++) {
    px = lavaCx + dd;
    if (px < 0 || px >= W) continue;
    for (y = floorY; y < floorY + lavaDepth - 1 && y < H; y++) setCell(px, y, LAVA);
  }
  var waterCx = Math.floor(W * 0.82);
  var waterHalf = Math.max(4, Math.min(18, Math.floor(W * 0.07)));
  var waterDepth = Math.max(4, Math.min(9, Math.floor(H * 0.10)));
  for (dd = -waterHalf; dd <= waterHalf; dd++) {
    px = waterCx + dd;
    if (px < 0 || px >= W) continue;
    for (y = floorY; y < floorY + waterDepth && y < H; y++) setCell(px, y, EMPTY);
  }
  for (dd = -waterHalf + 1; dd <= waterHalf - 1; dd++) {
    px = waterCx + dd;
    if (px < 0 || px >= W) continue;
    for (y = floorY; y < floorY + waterDepth - 1 && y < H; y++) setCell(px, y, WATER);
  }
  makeTree(Math.floor(W * 0.31), floorY - 1);
  makeTree(Math.floor(W * 0.62), floorY - 1);
  for (var k = 0; k < 6; k++) {
    var ix = Math.floor(W * 0.02 + Math.random() * W * 0.06);
    var iy = floorY - 1 - Math.floor(Math.random() * 2);
    setCell(ix, iy, ICE);
  }
}

function explode(cx, cy, r) {
  var rr = r * r;
  for (var dy = -r; dy <= r; dy++) {
    for (var dx = -r; dx <= r; dx++) {
      var d2 = dx * dx + dy * dy;
      if (d2 > rr) continue;
      var x = cx + dx;
      var y = cy + dy;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      var i = y * W + x;
      if (d2 < rr * 0.35) {
        grid[i] = Math.random() < 0.55 ? FIRE : EMPTY;
      } else {
        var t = grid[i];
        if (t === EMPTY) {
          grid[i] = Math.random() < 0.4 ? FIRE : SMOKE;
        } else if (t === WOOD || t === PLANT || t === OIL || t === GUNPOWDER) {
          grid[i] = FIRE;
        }
      }
      moved[i] = 1;
    }
  }
}

function canEnterLiquid(t) {
  return t === EMPTY || t === WATER || t === OIL || t === ACID ||
         t === SMOKE || t === STEAM || t === FIRE;
}

function updSolid(x, y, i, slideChance) {
  if (y + 1 < H) {
    var b = i + W;
    if (canEnterLiquid(grid[b])) {
      swap(i, b); moved[b] = 1; return;
    }
  }
  if (Math.random() > slideChance) return;
  var dir = Math.random() < 0.5 ? -1 : 1;
  for (var d = 0; d < 2; d++) {
    var dd = d === 0 ? dir : -dir;
    var nx = x + dd;
    if (nx < 0 || nx >= W || y + 1 >= H) continue;
    var ni = (y + 1) * W + nx;
    if (canEnterLiquid(grid[ni])) {
      swap(i, ni); moved[ni] = 1; return;
    }
  }
}

function updPowder(x, y, i) {
  if (y + 1 < H) {
    var b = i + W;
    var bt = grid[b];
    if (bt === EMPTY || bt === WATER || bt === OIL || bt === ACID ||
        bt === FIRE || bt === STEAM || bt === SMOKE) {
      swap(i, b); moved[b] = 1; return;
    }
  }
  var dir = Math.random() < 0.5 ? -1 : 1;
  for (var d = 0; d < 2; d++) {
    var dd = d === 0 ? dir : -dir;
    var nx = x + dd;
    if (nx < 0 || nx >= W || y + 1 >= H) continue;
    var ni = (y + 1) * W + nx;
    var nt = grid[ni];
    if (nt === EMPTY || nt === WATER || nt === OIL || nt === ACID ||
        nt === FIRE || nt === STEAM || nt === SMOKE) {
      swap(i, ni); moved[ni] = 1; return;
    }
  }
}

function updStone(x, y, i) {
  updSolid(x, y, i, 0.25);
}

function updIce(x, y, i) {
  for (var k = 0; k < 4; k++) {
    var nx = x + DX[k];
    var ny = y + DY[k];
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    var nt = grid[ny * W + nx];
    if (nt === FIRE || nt === LAVA) { grid[i] = WATER; moved[i] = 1; return; }
  }
  updSolid(x, y, i, 0.1);
}

function updMetal(x, y, i) {
  for (var k = 0; k < 4; k++) {
    var nx = x + DX[k];
    var ny = y + DY[k];
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    if (grid[ny * W + nx] === LAVA && Math.random() < 0.05) {
      grid[i] = LAVA; moved[i] = 1; return;
    }
  }
  updSolid(x, y, i, 0.2);
}

function updGlass(x, y, i) {
  for (var k = 0; k < 4; k++) {
    var nx = x + DX[k];
    var ny = y + DY[k];
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    var nt = grid[ny * W + nx];
    if ((nt === LAVA || nt === FIRE) && Math.random() < 0.06) {
      grid[i] = LAVA; moved[i] = 1; return;
    }
  }
  updSolid(x, y, i, 0.15);
}

function updWood(x, y, i) {
  if (y + 1 < H) {
    var b = i + W;
    var bt = grid[b];
    if (bt === EMPTY || bt === SMOKE || bt === STEAM) {
      swap(i, b); moved[b] = 1; return;
    }
  }
  if (Math.random() > 0.12) return;
  var dir = Math.random() < 0.5 ? -1 : 1;
  var nx = x + dir;
  if (nx >= 0 && nx < W && y + 1 < H) {
    var ni = (y + 1) * W + nx;
    if (grid[ni] === EMPTY) { swap(i, ni); moved[ni] = 1; }
  }
}

function updWater(x, y, i) {
  for (var k = 0; k < 4; k++) {
    var nx = x + DX[k];
    var ny = y + DY[k];
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    var ni = ny * W + nx;
    var nt = grid[ni];
    if (nt === FIRE) {
      grid[ni] = STEAM; moved[ni] = 1;
      grid[i] = STEAM; moved[i] = 1; return;
    }
    if (nt === LAVA) {
      grid[ni] = STONE; moved[ni] = 1;
      grid[i] = STEAM; moved[i] = 1; return;
    }
  }
  if (y + 1 < H) {
    var b = i + W;
    var bt = grid[b];
    if (bt === EMPTY || bt === SMOKE || bt === STEAM) {
      swap(i, b); moved[b] = 1; return;
    }
  }
  var dir = Math.random() < 0.5 ? -1 : 1;
  for (var d = 0; d < 2; d++) {
    var dd = d === 0 ? dir : -dir;
    var dx = x + dd;
    if (dx < 0 || dx >= W || y + 1 >= H) continue;
    var di = (y + 1) * W + dx;
    var dt = grid[di];
    if (dt === EMPTY || dt === SMOKE || dt === STEAM) {
      swap(i, di); moved[di] = 1; return;
    }
  }
  var lastFree = -1;
  for (var s = 1; s <= DISP_WATER; s++) {
    var sx = x + dir * s;
    if (sx < 0 || sx >= W) break;
    var si = y * W + sx;
    var st = grid[si];
    if (st !== EMPTY && st !== SMOKE && st !== STEAM) break;
    lastFree = si;
    if (y + 1 < H && grid[(y + 1) * W + sx] === EMPTY) break;
  }
  if (lastFree !== -1) { swap(i, lastFree); moved[lastFree] = 1; }
}

function updOil(x, y, i) {
  for (var k = 0; k < 4; k++) {
    var nx = x + DX[k];
    var ny = y + DY[k];
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    if (grid[ny * W + nx] === FIRE) {
      grid[i] = FIRE; moved[i] = 1; return;
    }
  }
  if (y - 1 >= 0 && grid[i - W] === WATER && Math.random() < 0.3) {
    swap(i, i - W); moved[i - W] = 1; return;
  }
  if (y + 1 < H) {
    var b = i + W;
    var bt = grid[b];
    if (bt === EMPTY || bt === SMOKE || bt === STEAM) {
      swap(i, b); moved[b] = 1; return;
    }
  }
  var dir = Math.random() < 0.5 ? -1 : 1;
  for (var d = 0; d < 2; d++) {
    var dd = d === 0 ? dir : -dir;
    var dx = x + dd;
    if (dx < 0 || dx >= W || y + 1 >= H) continue;
    var di = (y + 1) * W + dx;
    var dt = grid[di];
    if (dt === EMPTY || dt === SMOKE || dt === STEAM) {
      swap(i, di); moved[di] = 1; return;
    }
  }
  var lastFree = -1;
  for (var s = 1; s <= DISP_OIL; s++) {
    var sx = x + dir * s;
    if (sx < 0 || sx >= W) break;
    var si = y * W + sx;
    var st = grid[si];
    if (st !== EMPTY && st !== SMOKE && st !== STEAM) break;
    lastFree = si;
  }
  if (lastFree !== -1) { swap(i, lastFree); moved[lastFree] = 1; }
}

function updAcid(x, y, i) {
  for (var k = 0; k < 4; k++) {
    var nx = x + DX[k];
    var ny = y + DY[k];
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    var ni = ny * W + nx;
    var nt = grid[ni];
    if (nt === SAND || nt === STONE || nt === WOOD || nt === PLANT ||
        nt === METAL || nt === ASH || nt === GUNPOWDER || nt === ICE || nt === GLASS) {
      if (Math.random() < 0.28) {
        grid[ni] = Math.random() < 0.5 ? EMPTY : SMOKE;
        moved[ni] = 1;
        if (Math.random() < 0.4) { grid[i] = EMPTY; moved[i] = 1; }
        return;
      }
    }
  }
  if (y + 1 < H) {
    var b = i + W;
    var bt = grid[b];
    if (bt === EMPTY || bt === SMOKE || bt === STEAM) {
      swap(i, b); moved[b] = 1; return;
    }
  }
  var dir = Math.random() < 0.5 ? -1 : 1;
  for (var d = 0; d < 2; d++) {
    var dd = d === 0 ? dir : -dir;
    var dx = x + dd;
    if (dx < 0 || dx >= W || y + 1 >= H) continue;
    var di = (y + 1) * W + dx;
    var dt = grid[di];
    if (dt === EMPTY || dt === SMOKE || dt === STEAM) {
      swap(i, di); moved[di] = 1; return;
    }
  }
  var lastFree = -1;
  for (var s = 1; s <= DISP_ACID; s++) {
    var sx = x + dir * s;
    if (sx < 0 || sx >= W) break;
    var si = y * W + sx;
    var st = grid[si];
    if (st !== EMPTY && st !== SMOKE && st !== STEAM) break;
    lastFree = si;
  }
  if (lastFree !== -1) { swap(i, lastFree); moved[lastFree] = 1; }
}

function updLava(x, y, i) {
  for (var k = 0; k < 4; k++) {
    var nx = x + DX[k];
    var ny = y + DY[k];
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    var ni = ny * W + nx;
    var nt = grid[ni];
    if (nt === WATER) {
      grid[ni] = STEAM; moved[ni] = 1;
      grid[i] = STONE; moved[i] = 1; return;
    }
    if (nt === ICE) {
      grid[ni] = WATER; moved[ni] = 1; continue;
    }
    if (nt === GUNPOWDER) { explode(nx, ny, 7); return; }
    if (nt === WOOD || nt === PLANT || nt === OIL || nt === ASH) {
      if (Math.random() < 0.25) { grid[ni] = FIRE; moved[ni] = 1; }
    }
  }
  if (Math.random() < 0.015 && y - 1 >= 0 && grid[i - W] === EMPTY) {
    grid[i - W] = SMOKE; moved[i - W] = 1;
  }
  if (y + 1 < H) {
    var b = i + W;
    if (grid[b] === EMPTY) { swap(i, b); moved[b] = 1; return; }
  }
  var dir = Math.random() < 0.5 ? -1 : 1;
  for (var d = 0; d < 2; d++) {
    var dd = d === 0 ? dir : -dir;
    var dx = x + dd;
    if (dx < 0 || dx >= W || y + 1 >= H) continue;
    var di = (y + 1) * W + dx;
    if (grid[di] === EMPTY) { swap(i, di); moved[di] = 1; return; }
  }
  var lastFree = -1;
  for (var s = 1; s <= DISP_LAVA; s++) {
    var sx = x + dir * s;
    if (sx < 0 || sx >= W) break;
    var si = y * W + sx;
    if (grid[si] !== EMPTY) break;
    lastFree = si;
  }
  if (lastFree !== -1) { swap(i, lastFree); moved[lastFree] = 1; }
}

function updFire(x, y, i) {
  for (var k = 0; k < 4; k++) {
    var nx = x + DX[k];
    var ny = y + DY[k];
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    var ni = ny * W + nx;
    var nt = grid[ni];
    if (nt === WATER) {
      grid[i] = STEAM; moved[i] = 1; return;
    }
    if (nt === GUNPOWDER) { explode(nx, ny, 7); return; }
    if (nt === WOOD || nt === PLANT || nt === OIL || nt === ASH) {
      if (Math.random() < 0.14) { grid[ni] = FIRE; moved[ni] = 1; }
    }
    if (nt === ICE && Math.random() < 0.12) { grid[ni] = WATER; moved[ni] = 1; }
  }
  var r = Math.random();
  if (r < 0.03) { grid[i] = SMOKE; moved[i] = 1; return; }
  if (r < 0.05) { grid[i] = EMPTY; moved[i] = 1; return; }
  if (y - 1 >= 0 && grid[i - W] === EMPTY && Math.random() < 0.45) {
    swap(i, i - W); moved[i - W] = 1; return;
  }
}

function updSmoke(x, y, i) {
  if (Math.random() < 0.03) { grid[i] = EMPTY; moved[i] = 1; return; }
  if (y - 1 >= 0) {
    var up = i - W;
    if (grid[up] === EMPTY) { swap(i, up); moved[up] = 1; return; }
  }
  var dir = Math.random() < 0.5 ? -1 : 1;
  for (var d = 0; d < 2; d++) {
    var dd = d === 0 ? dir : -dir;
    var nx = x + dd;
    if (nx < 0 || nx >= W || y - 1 < 0) continue;
    var ni = (y - 1) * W + nx;
    if (grid[ni] === EMPTY) { swap(i, ni); moved[ni] = 1; return; }
  }
}

function updSteam(x, y, i) {
  if (Math.random() < 0.01) { grid[i] = WATER; moved[i] = 1; return; }
  if (y - 1 >= 0) {
    var up = i - W;
    if (grid[up] === EMPTY) { swap(i, up); moved[up] = 1; return; }
  }
  var dir = Math.random() < 0.5 ? -1 : 1;
  for (var d = 0; d < 2; d++) {
    var dd = d === 0 ? dir : -dir;
    var nx = x + dd;
    if (nx < 0 || nx >= W || y - 1 < 0) continue;
    var ni = (y - 1) * W + nx;
    if (grid[ni] === EMPTY) { swap(i, ni); moved[ni] = 1; return; }
  }
}

function updPlant(x, y, i) {
  var nearWater = false;
  for (var k = 0; k < 4; k++) {
    var nx = x + DX[k];
    var ny = y + DY[k];
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    var nt = grid[ny * W + nx];
    if (nt === WATER || nt === STEAM) { nearWater = true; break; }
  }
  if (!nearWater) return;
  if (Math.random() > 0.06) return;
  var dir = Math.floor(Math.random() * 4);
  for (var m = 0; m < 4; m++) {
    var kk = (dir + m) % 4;
    var gx = x + DX[kk];
    var gy = y + DY[kk];
    if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
    var gi = gy * W + gx;
    if (grid[gi] === EMPTY) {
      grid[gi] = PLANT;
      shade[gi] = (Math.random() * 256) | 0;
      moved[gi] = 1;
      return;
    }
  }
}

function updGunpowder(x, y, i) {
  for (var k = 0; k < 4; k++) {
    var nx = x + DX[k];
    var ny = y + DY[k];
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    var nt = grid[ny * W + nx];
    if (nt === FIRE || nt === LAVA) { explode(x, y, 7); return; }
  }
  updPowder(x, y, i);
}

function stepCell(x, y) {
  var i = y * W + x;
  if (moved[i]) return;
  var t = grid[i];
  if (t === EMPTY) return;
  if (t === SAND) updPowder(x, y, i);
  else if (t === ASH) updPowder(x, y, i);
  else if (t === STONE) updStone(x, y, i);
  else if (t === WOOD) updWood(x, y, i);
  else if (t === WATER) updWater(x, y, i);
  else if (t === OIL) updOil(x, y, i);
  else if (t === ACID) updAcid(x, y, i);
  else if (t === LAVA) updLava(x, y, i);
  else if (t === FIRE) updFire(x, y, i);
  else if (t === SMOKE) updSmoke(x, y, i);
  else if (t === STEAM) updSteam(x, y, i);
  else if (t === PLANT) updPlant(x, y, i);
  else if (t === ICE) updIce(x, y, i);
  else if (t === METAL) updMetal(x, y, i);
  else if (t === GLASS) updGlass(x, y, i);
  else if (t === GUNPOWDER) updGunpowder(x, y, i);
}

var scanFlip = false;

function update() {
  moved.fill(0);
  scanFlip = !scanFlip;
  var x, y;
  for (y = H - 1; y >= 0; y--) {
    if (scanFlip) {
      for (x = 0; x < W; x++) stepCell(x, y);
    } else {
      for (x = W - 1; x >= 0; x--) stepCell(x, y);
    }
  }
}

function render() {
  var total = W * H;
  for (var i = 0; i < total; i++) {
    var t = grid[i];
    var p = i * 4;
    if (t === EMPTY) {
      pixels[p] = 8; pixels[p + 1] = 10; pixels[p + 2] = 20; pixels[p + 3] = 255;
      continue;
    }
    if (t === FIRE) {
      var f = 0.6 + Math.random() * 0.4;
      pixels[p] = 255;
      pixels[p + 1] = (140 * f) | 0;
      pixels[p + 2] = (30 * f) | 0;
      pixels[p + 3] = 255;
      continue;
    }
    if (t === LAVA) {
      var f2 = 0.7 + Math.random() * 0.3;
      pixels[p] = 255;
      pixels[p + 1] = (90 * f2) | 0;
      pixels[p + 2] = (20 * f2) | 0;
      pixels[p + 3] = 255;
      continue;
    }
    var c = COLORS[t];
    var v = (shade[i] - 128) * 0.16;
    var r = c[0] + v;
    var g = c[1] + v;
    var b = c[2] + v;
    if (r < 0) r = 0; else if (r > 255) r = 255;
    if (g < 0) g = 0; else if (g > 255) g = 255;
    if (b < 0) b = 0; else if (b > 255) b = 255;
    pixels[p] = r | 0;
    pixels[p + 1] = g | 0;
    pixels[p + 2] = b | 0;
    pixels[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function paintAt(cx, cy) {
  var r = brushRadius;
  var r2 = r * r;
  for (var dy = -r; dy <= r; dy++) {
    for (var dx = -r; dx <= r; dx++) {
      var d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      if (d2 > r2 * 0.7 && Math.random() < 0.4) continue;
      var x = cx + dx;
      var y = cy + dy;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      var i = y * W + x;
      if (currentMat === EMPTY) {
        grid[i] = EMPTY; shade[i] = 0;
      } else if (grid[i] !== currentMat) {
        grid[i] = currentMat;
        shade[i] = (Math.random() * 256) | 0;
      }
    }
  }
}

function paintLine(x0, y0, x1, y1) {
  var dx = x1 - x0;
  var dy = y1 - y0;
  var steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) { paintAt(x1, y1); return; }
  for (var i = 0; i <= steps; i++) {
    var t = i / steps;
    paintAt(Math.round(x0 + dx * t), Math.round(y0 + dy * t));
  }
}

function cellFromEvent(e) {
  var rect = canvas.getBoundingClientRect();
  var x = (e.clientX - rect.left) / rect.width * W;
  var y = (e.clientY - rect.top) / rect.height * H;
  return { x: Math.floor(x), y: Math.floor(y) };
}

var STEP = 1000 / 60;
var stepAcc = 0;
var lastStamp = 0;

function frame(now) {
  if (!lastStamp) lastStamp = now;
  var dt = now - lastStamp;
  lastStamp = now;
  if (dt > 50) dt = 50;
  stepAcc += dt;
  if (!paused) {
    while (stepAcc >= STEP) {
      if (painting && lastCell) paintAt(lastCell.x, lastCell.y);
      update();
      stepAcc -= STEP;
    }
  } else {
    stepAcc = 0;
  }
  render();
  requestAnimationFrame(frame);
}

canvas.addEventListener('pointerdown', function (e) {
  painting = true;
  lastCell = cellFromEvent(e);
  paintAt(lastCell.x, lastCell.y);
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
});

canvas.addEventListener('pointermove', function (e) {
  if (!painting) return;
  var c = cellFromEvent(e);
  if (lastCell) paintLine(lastCell.x, lastCell.y, c.x, c.y);
  lastCell = c;
});

canvas.addEventListener('pointerup', function () {
  painting = false;
  lastCell = null;
});

canvas.addEventListener('pointercancel', function () {
  painting = false;
  lastCell = null;
});

var matButtons = document.querySelectorAll('.mat');
for (var bi = 0; bi < matButtons.length; bi++) {
  (function (btn) {
    btn.addEventListener('click', function () {
      currentMat = parseInt(btn.dataset.mat, 10);
      for (var j = 0; j < matButtons.length; j++) {
        matButtons[j].classList.remove('active');
      }
      btn.classList.add('active');
    });
  })(matButtons[bi]);
}

var brushInput = document.getElementById('brush');
if (brushInput) {
  brushInput.addEventListener('input', function (e) {
    brushRadius = parseInt(e.target.value, 10);
    document.getElementById('brushVal').textContent = brushRadius;
  });
}

var pauseBtn = document.getElementById('pause');
if (pauseBtn) {
  pauseBtn.addEventListener('click', function () {
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    if (paused) pauseBtn.classList.add('on');
    else pauseBtn.classList.remove('on');
  });
}

var clearBtn = document.getElementById('clear');
if (clearBtn) {
  clearBtn.addEventListener('click', function () {
    grid.fill(0);
    shade.fill(0);
  });
}

window.addEventListener('resize', function () {
  init();
});

init();
requestAnimationFrame(frame);