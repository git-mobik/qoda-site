// ═══════════════════════════════════════════════════════════
// APEX DRIVE — 3D Racing (UPGRADED + ROAD-FIX)
// Fixes:
// • Coins & AI traffic now follow the CURVING road (parented
// to road segments instead of a straight world-Z line).
// • Player car is clamped to the road width so it cannot drive
// off the asphalt into the grass.
// Coordinate convention:
// • Car travels toward world +Z when heading = 0.
// • Car MODEL's front is +Z, so car.rotation.y = heading.
// • Road segments: group origin = ENTRANCE, extends toward local -Z.
// ═══════════════════════════════════════════════════════════

'use strict';

// ── State ──
var G = {
running: false, paused: false, keys: {},
speed: 0, maxSpeed: 55, accel: 14, brakeForce: 26, drag: 0.4,
steer: 0, heading: 0, pos: null,
nitro: 100, nitroActive: false,
camMode: 0, lapStart: 0, bestLap: null, distance: 0, wheelSpin: 0, _lapMark: 0,
roadEndX: 0, roadEndZ: 0, roadEndRot: 0,
ground: null, hills: [],
coins: 0, headlightsOn: true, timeOfDay: 0.28, aiCars: [], coins3D: [],
shake: 0, combo: 0, comboTimer: 0, score: 0,
health: 100, highScore: 0, muted: false, countdown: 0, gameOver: false, invuln: 0,
};

var CAM_MODES = ['Chase', 'Hood', 'Far', 'Cinematic'];
var AI_CAR_COUNT = 3; // mutable: pro.js can adjust for difficulty
var AI_COLORS = [0x2f7fd0, 0x22c55e, 0xffd23b, 0xa855f7, 0xff6b6b, 0x14b8a6, 0xf97316, 0x94a3b8];

var scene, camera, renderer, clock;
var car, carBody, wheels = [], headlights = [], brakeLights = [];
var SHARED = {};
var roadSegments = [];
var sunLight, skyMesh, skyMat, hemiLight, ambientLight, fillLight;
var ROAD_WIDTH = 14, SEGMENT_LENGTH = 40, SEGMENTS_AHEAD = 16;
var ROAD_TEXTURE = null;
var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
var exhaustParticles = [], smokeParticles = [];

// ── Audio ──
var Sound = (function () {
var ctx = null, engineOsc = null, engineGain = null, started = false;
function ac() {
if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
if (ctx.state === 'suspended') ctx.resume();
return ctx;
}
return {
resume: ac,
startEngine: function () {
if (started) return;
try {
var c = ac();
engineOsc = c.createOscillator();
engineGain = c.createGain();
engineOsc.type = 'sawtooth';
engineOsc.frequency.value = 60;
engineGain.gain.value = 0.0;
var filter = c.createBiquadFilter();
filter.type = 'lowpass';
filter.frequency.value = 400;
engineOsc.connect(filter); filter.connect(engineGain); engineGain.connect(c.destination);
engineOsc.start();
started = true;
} catch (e) {}
},
setEngine: function (rpmNorm, running) {
if (!engineOsc || !engineGain) return;
engineOsc.frequency.value = 55 + rpmNorm * 160;
engineGain.gain.value = running && !G.muted ? 0.03 + rpmNorm * 0.05 : 0.0;
},
blip: function (freq, dur) {
if (G.muted) return;
try {
var c = ac(), o = c.createOscillator(), g = c.createGain();
o.type = 'square';
o.frequency.setValueAtTime(freq, c.currentTime);
g.gain.setValueAtTime(0.08, c.currentTime);
g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
o.connect(g); g.connect(c.destination);
o.start(); o.stop(c.currentTime + dur);
} catch (e) {}
},
};
})();

// ─────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────
function init() {
scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa8c8e8, 90, 260);

camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if (THREE.ACESFilmicToneMapping !== undefined) {
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
}
document.body.appendChild(renderer.domElement);

clock = new THREE.Clock();
G.pos = new THREE.Vector3(0, 0, 0);

buildLighting();
buildSky();
buildEnvironment();
buildRoad();
buildCar();
buildAITraffic();

window.addEventListener('resize', onResize);
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
document.addEventListener('pointerlockchange', onLockChange);
document.addEventListener('visibilitychange', onVisibilityChange);

document.getElementById('startBtn').onclick = startGame; (function () { var sl = document.getElementById('stabilitySlider'); var sv = document.getElementById('stabilityValue'); var saved = 0.5; try { var ls = localStorage.getItem('apexStability'); if (ls !== null) saved = parseFloat(ls); } catch (e) {} if (isNaN(saved)) saved = 0.5; G.stability = saved; if (sl) { sl.value = String(Math.round(saved * 100)); } if (sv) { sv.textContent = saved < 0.34 ? 'Easy' : (saved > 0.66 ? 'Racer' : 'Balanced'); } if (sl) { sl.addEventListener('input', function () { var v = parseFloat(sl.value) / 100; if (isNaN(v)) v = 0.5; G.stability = v; if (sv) { sv.textContent = v < 0.34 ? 'Easy' : (v > 0.66 ? 'Racer' : 'Balanced'); } try { localStorage.setItem('apexStability', String(v)); } catch (e) {} }); } })();
var restartBtn = document.getElementById('restartBtn');
if (restartBtn) restartBtn.onclick = restartGame;
var resumeBtn = document.getElementById('resumeBtn');
if (resumeBtn) resumeBtn.onclick = resumeGame;
document.getElementById('pauseScreen').addEventListener('click', resumeGame);

setupTouchControls();

if (isTouch) {
var tc = document.getElementById('touchControls');
if (tc) tc.classList.remove('hidden');
}

animate();
}

// ─────────────────────────────────────────────────────────
// LIGHTING
// ─────────────────────────────────────────────────────────
function buildLighting() {
hemiLight = new THREE.HemisphereLight(0xcfe4ff, 0x4a4030, 0.85);
scene.add(hemiLight);
ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambientLight);

sunLight = new THREE.DirectionalLight(0xfff2d8, 2.4);
sunLight.position.set(60, 90, 40);
sunLight.castShadow = false;
sunLight.shadow.mapSize.set(1024, 1024);
var sc = sunLight.shadow.camera;
sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45;
sc.near = 1; sc.far = 300;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);
scene.add(sunLight.target);

fillLight = new THREE.DirectionalLight(0x88aaff, 0.4);
fillLight.position.set(-40, 30, -50);
scene.add(fillLight);
}

// ─────────────────────────────────────────────────────────
// SKY
// ─────────────────────────────────────────────────────────
function buildSky() {
var skyGeo = new THREE.SphereGeometry(500, 32, 16);
var colors = [];
var pos = skyGeo.attributes.position;
var top = new THREE.Color(0x3a7bd5);
var mid = new THREE.Color(0x9ac4e8);
var bottom = new THREE.Color(0xd8e8f0);
for (var i = 0; i < pos.count; i++) {
var y = pos.getY(i) / 500;
var t = Math.max(0, Math.min(1, y * 0.5 + 0.5));
var c;
if (t > 0.5) c = mid.clone().lerp(top, (t - 0.5) * 2);
else c = bottom.clone().lerp(mid, t * 2);
colors.push(c.r, c.g, c.b);
}
skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
skyMesh = new THREE.Mesh(skyGeo, skyMat);
scene.add(skyMesh);

var sunSprite = new THREE.Mesh(
new THREE.CircleGeometry(24, 32),
new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.9, fog: false })
);
sunSprite.position.set(200, 180, 120);
sunSprite.lookAt(0, 40, 0);
scene.add(sunSprite);
}

// ─────────────────────────────────────────────────────────
// ENVIRONMENT
// ─────────────────────────────────────────────────────────
function buildEnvironment() {
var g = new THREE.Mesh(
new THREE.PlaneGeometry(4000, 4000),
new THREE.MeshStandardMaterial({ color: 0x3f5a2c, roughness: 1.0 })
);
g.rotation.x = -Math.PI / 2;
g.position.y = -0.15;
g.receiveShadow = true;
scene.add(g);
G.ground = g;

var hillMat = new THREE.MeshStandardMaterial({ color: 0x2e4a24, roughness: 1 });
for (var i = 0; i < 12; i++) {
var a = (i / 12) * Math.PI * 2 + Math.random() * 0.15;
var r = 900 + Math.random() * 300;
var h = 60 + Math.random() * 90;
var hill = new THREE.Mesh(new THREE.ConeGeometry(90 + Math.random() * 60, h, 6), hillMat);
hill.userData = { angle: a, radius: r, height: h };
hill.position.set(Math.cos(a) * r, h / 2 - 20, Math.sin(a) * r);
scene.add(hill);
G.hills.push(hill);
}
}

// ─────────────────────────────────────────────────────────
// ROAD
// ─────────────────────────────────────────────────────────
function makeRoadTexture() {
var c = document.createElement('canvas');
c.width = 256; c.height = 512;
var ctx = c.getContext('2d');
ctx.fillStyle = '#2a2a2e';
ctx.fillRect(0, 0, 256, 512);
for (var i = 0; i < 3000; i++) {
var g = 30 + Math.random() * 40;
ctx.fillStyle = 'rgba(' + Math.floor(g) + ',' + Math.floor(g) + ',' + Math.floor(g + 4) + ',0.5)';
ctx.fillRect(Math.random() * 256, Math.random() * 512, 2, 2);
}
ctx.fillStyle = 'rgba(240,240,240,0.85)';
for (var y = 0; y < 512; y += 80) ctx.fillRect(124, y, 8, 44);
ctx.fillStyle = 'rgba(250,250,250,0.9)';
ctx.fillRect(14, 0, 5, 512);
ctx.fillRect(237, 0, 5, 512);
var tex = new THREE.CanvasTexture(c);
tex.wrapS = THREE.RepeatWrapping;
tex.wrapT = THREE.RepeatWrapping;
tex.repeat.set(1, 2);
tex.anisotropy = 8;
return tex;
}

function buildRoad() {
roadSegments = [];
G.roadEndX = 0;
G.roadEndZ = 0;
G.roadEndRot = Math.PI;
for (var i = 0; i < SEGMENTS_AHEAD + 6; i++) spawnRoadSegment(i);
}

function spawnRoadSegment(index) {
if (!ROAD_TEXTURE) ROAD_TEXTURE = makeRoadTexture();
var group = new THREE.Group();

if (!SHARED.road) {
SHARED.road = new THREE.MeshStandardMaterial({ map: ROAD_TEXTURE, roughness: 0.92, metalness: 0.05 });
SHARED.curbA = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 });
SHARED.curbB = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.7 });
SHARED.grass = new THREE.MeshStandardMaterial({ color: 0x4a6a38, roughness: 1.0 });
SHARED.curbGeo = new THREE.BoxGeometry(0.8, 0.3, SEGMENT_LENGTH / 5);
SHARED.grassGeo = new THREE.PlaneGeometry(30, SEGMENT_LENGTH, 1, 1); SHARED.grassGeo.rotateX(-Math.PI / 2);
SHARED.roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, SEGMENT_LENGTH, 1, 1); SHARED.roadGeo.rotateX(-Math.PI / 2);
}
var road = new THREE.Mesh(SHARED.roadGeo, SHARED.road);
road.position.set(0, 0, -SEGMENT_LENGTH / 2);
road.receiveShadow = false;
group.add(road);

for (var s = -1; s <= 1; s += 2) {
for (var k = 0; k < 5; k++) {
var curb = new THREE.Mesh(
SHARED.curbGeo,
k % 2 === 0 ? SHARED.curbA : SHARED.curbB
);
curb.position.set(s * (ROAD_WIDTH / 2 + 0.4), 0.15, -SEGMENT_LENGTH + (k + 0.5) * (SEGMENT_LENGTH / 5));
curb.receiveShadow = false;
group.add(curb);
}
}


for (var s2 = -1; s2 <= 1; s2 += 2) {
var grass = new THREE.Mesh(SHARED.grassGeo, SHARED.grass);
grass.position.set(s2 * (ROAD_WIDTH / 2 + 15 + 0.4), -0.02, -SEGMENT_LENGTH / 2);
grass.receiveShadow = false;
group.add(grass);
}

var x = G.roadEndX, z = G.roadEndZ, rot = G.roadEndRot;
group.position.set(x, 0, z);
group.rotation.y = rot;

// Stronger self-curving road: the track now visibly snakes on its own.
var segAmp = index < 4 ? 0.30 * 0.65 : 0.30;

group.userData = {
index: index,
entranceX: x, entranceZ: z,
endX: x - Math.sin(rot) * SEGMENT_LENGTH,
endZ: z - Math.cos(rot) * SEGMENT_LENGTH,
turn: ((Math.random() * 2 - 1) * 0.55) * (index < 4 ? 0.30 * 0.65 : 0.30),
};

G.roadEndX = group.userData.endX;
G.roadEndZ = group.userData.endZ;
G.roadEndRot = rot - group.userData.turn;

scene.add(group);
roadSegments.push(group);
addRoadsideProps(group);
}

function addRoadsideProps(seg) {
var segLen = SEGMENT_LENGTH;
if (seg.userData.index % 2 === 0) {
for (var s = -1; s <= 1; s += 2) {
var lamp = makeStreetLamp(s);
lamp.position.set(s * (ROAD_WIDTH / 2 + 3), 0, -segLen * Math.random());
seg.add(lamp);
}
}
var treeCount = 1 + Math.floor(Math.random() * 2);
for (var i = 0; i < treeCount; i++) {
var side = Math.random() < 0.5 ? -1 : 1;
var t = makeTree();
t.position.set(side * (ROAD_WIDTH / 2 + 8 + Math.random() * 16), 0, -segLen * Math.random());
t.scale.setScalar(0.8 + Math.random() * 0.6);
seg.add(t);
}
if (seg.userData.index % 3 === 0) {
for (var s2 = -1; s2 <= 1; s2 += 2) {
var barrier = makeBarrier();
barrier.position.set(s2 * (ROAD_WIDTH / 2 + 1.6), 0, -segLen / 2);
seg.add(barrier);
}
}
}

function makeStreetLamp(side) {
var g = new THREE.Group();
var toward = (side >= 0) ? -1 : 1;
var poleMat = new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.5, metalness: 0.6 });
var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 7, 8), poleMat);
pole.position.y = 3.5; pole.castShadow = false; g.add(pole);
var arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), poleMat);
arm.position.set(toward * 0.8, 7, 0); g.add(arm);
var headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 1.1, roughness: 0.4 });
var head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.4), headMat);
head.position.set(toward * 1.5, 6.95, 0); g.add(head);
// No dynamic PointLight (huge GPU cost). The emissive head above
// already glows for free, so the lamp still looks lit at night.
return g;
}

function makeTree() {
var g = new THREE.Group();
var trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3f24, roughness: 1.0 });
var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 3.2, 6), trunkMat);
trunk.position.y = 1.6; trunk.castShadow = false; g.add(trunk);
var leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6a2a, roughness: 1.0 });
for (var i = 0; i < 3; i++) {
var cone = new THREE.Mesh(new THREE.ConeGeometry(1.8 - i * 0.4, 1.8, 8), leafMat);
cone.position.y = 3 + i * 1.0; cone.castShadow = false; g.add(cone);
}
return g;
}

function makeBarrier() {
var g = new THREE.Group();
var postMat = new THREE.MeshStandardMaterial({ color: 0x666a70, roughness: 0.6, metalness: 0.5 });
for (var i = -1; i <= 1; i++) {
var post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), postMat);
post.position.set(0, 0.6, i * 1.6); post.castShadow = false; g.add(post);
}
var railMat = new THREE.MeshStandardMaterial({ color: 0xc0c4c8, roughness: 0.4, metalness: 0.7 });
var rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 5), railMat);
rail.position.set(0, 1.0, 0); rail.castShadow = false; g.add(rail);
return g;
}

// ─────────────────────────────────────────────────────────
// CAR
// ─────────────────────────────────────────────────────────
function buildCar() {
car = new THREE.Group();

var paintMat = new THREE.MeshPhysicalMaterial({ color: 0xd81e28, roughness: 0.18, metalness: 0.85, clearcoat: 1.0, clearcoatRoughness: 0.05 }); var paintDarkMat = new THREE.MeshPhysicalMaterial({ color: 0x9c1019, roughness: 0.22, metalness: 0.8, clearcoat: 0.9 }); SHARED.paintMat = paintMat; SHARED.paintDarkMat = paintDarkMat; var carbonMat = new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.35, metalness: 0.6 }); var chromeMat = new THREE.MeshStandardMaterial({ color: 0xe8e8ee, roughness: 0.1, metalness: 1.0 }); var blackMat = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.7, metalness: 0.3 });
var chassis = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.24, 4.45), blackMat); chassis.position.y = 0.32; chassis.castShadow = true; car.add(chassis); var body = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.46, 4.35), paintMat); body.userData.isPaint = true;
body.position.y = 0.66; body.castShadow = true; body.receiveShadow = true; var upperBody = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.34, 4.12), paintMat); upperBody.position.y = 0.98; upperBody.castShadow = true; upperBody.userData.isPaint = true; car.add(upperBody); var nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 0.5), paintMat); nose.position.set(0, 0.7, 2.28); nose.castShadow = true; nose.userData.isPaint = true; car.add(nose); var splitter = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.06, 0.34), carbonMat); splitter.position.set(0, 0.42, 2.32); car.add(splitter); var grille = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.2, 0.08), blackMat); grille.position.set(0, 0.66, 2.52); car.add(grille); var rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.36, 0.4), paintMat); rearBumper.position.set(0, 0.7, -2.24); rearBumper.castShadow = true; rearBumper.userData.isPaint = true; car.add(rearBumper); var diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.14, 0.35), carbonMat); diffuser.position.set(0, 0.44, -2.26); car.add(diffuser);
car.add(body); carBody = body;

var skirtMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.5, metalness: 0.4 });
var skirt = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.16, 3.6), carbonMat);
skirt.position.y = 0.42; skirt.castShadow = true; car.add(skirt); for (var gInt = -1; gInt <= 1; gInt += 2) { var intake2 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.06), blackMat); intake2.position.set(gInt * 0.66, 0.62, 2.53); car.add(intake2); }

var windshield = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.58, 0.1), new THREE.MeshPhysicalMaterial({ color: 0x1b2a3a, roughness: 0.03, metalness: 0.1, transmission: 0.5, transparent: true, opacity: 0.78, clearcoat: 1.0 })); windshield.position.set(0, 1.32, 0.66); windshield.rotation.x = 0.34; car.add(windshield); var glassMat = new THREE.MeshPhysicalMaterial({
color: 0x223344, roughness: 0.05, metalness: 0.0,
transmission: 0.6, transparent: true, opacity: 0.85,
});
var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.52, 1.8), glassMat);
cabin.position.set(0, 1.38, -0.3); cabin.castShadow = true; car.add(cabin); var rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.5, 0.08), glassMat); rearGlass.position.set(0, 1.38, -1.2); rearGlass.rotation.x = -0.32; car.add(rearGlass); for (var pSide = -1; pSide <= 1; pSide += 2) { var apillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.58, 0.1), paintMat); apillar.position.set(pSide * 0.72, 1.32, 0.66); apillar.rotation.x = 0.34; car.add(apillar); var bpillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.08), blackMat); bpillar.position.set(pSide * 0.75, 1.38, -0.3); car.add(bpillar); }

var roof = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.09, 1.7), paintMat); roof.userData.isPaint = true;
roof.position.set(0, 1.68, -0.3); roof.castShadow = true; car.add(roof); for (var dSide = -1; dSide <= 1; dSide += 2) { var sideTrim = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 2.6), chromeMat); sideTrim.position.set(dSide * 0.94, 0.86, -0.1); car.add(sideTrim); var doorLine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.03), blackMat); doorLine.position.set(dSide * 0.94, 0.9, -0.2); car.add(doorLine); var doorHandle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.22), chromeMat); doorHandle.position.set(dSide * 0.96, 1.0, -0.1); car.add(doorHandle); }

var hood = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.13, 1.4), paintMat);
hood.position.set(0, 1.14, 1.4); hood.rotation.x = -0.04; hood.castShadow = true; car.add(hood); for (var hv = -1; hv <= 1; hv += 2) { var hoodVent = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.5), blackMat); hoodVent.position.set(hv * 0.5, 1.2, 1.5); hoodVent.rotation.x = -0.04; car.add(hoodVent); } var hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 1.35), paintDarkMat); hoodStripe.position.set(0, 1.21, 1.4); hoodStripe.rotation.x = -0.04; car.add(hoodStripe);

var trunk = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.16, 1.1), paintMat);
trunk.position.set(0, 1.13, -1.55); trunk.castShadow = true; car.add(trunk); var roofStripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 1.68), paintDarkMat); roofStripe.position.set(0, 1.73, -0.3); car.add(roofStripe);

var lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4c0, emissiveIntensity: 1.6, roughness: 0.2 });
for (var s = -1; s <= 1; s += 2) {
var hlGeo = new THREE.BoxGeometry(0.44, 0.16, 0.1); var hl = new THREE.Mesh(hlGeo, lightMat); var hlBezel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.04), chromeMat); hlBezel.position.set(0, 0, -0.06); hl.add(hlBezel);
hl.position.set(s * 0.6, 0.92, 2.11); car.add(hl);
var spot = new THREE.SpotLight(0xfff4d0, 0, 55, Math.PI / 5.5, 0.45, 1.2); var hlTarget = new THREE.Object3D(); hlTarget.position.set(s * 0.6, 0.1, 30); car.add(hlTarget); spot.target = hlTarget; spot.position.set(s * 0.6, 1.05, 2.0); car.add(spot); var pl = spot;
// (spotlight already positioned above)
headlights.push(pl);
}

var tailMat = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 1.2, roughness: 0.3 });
for (var s2 = -1; s2 <= 1; s2 += 2) {
var tl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.1), tailMat); var tlBezel = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.03), blackMat); tlBezel.position.set(0, 0, 0.06); tl.add(tlBezel);
tl.position.set(s2 * 0.6, 0.95, -2.11); car.add(tl);
brakeLights.push(tl);
}

var mirrorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.4, metalness: 0.5 });
for (var s3 = -1; s3 <= 1; s3 += 2) {
var m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.28), mirrorMat);
m.position.set(s3 * 0.98, 1.28, 0.72); car.add(m); var mirGlass = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.02), chromeMat); mirGlass.position.set(0, 0, -0.14); m.add(mirGlass); var mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.2), blackMat); mirrorArm.position.set(s3 * -0.06, 0, 0.1); m.add(mirrorArm);
}

var wheelMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.9, metalness: 0.05 });
var rimMat = new THREE.MeshStandardMaterial({ color: 0xc8c8cc, roughness: 0.25, metalness: 0.9 });
var positions = [
[-0.95, 0.42, 1.45], [0.95, 0.42, 1.45],
[-0.95, 0.42, -1.45], [0.95, 0.42, -1.45],
];
positions.forEach(function (p) {
var steerG = new THREE.Group();
var spinG = new THREE.Group();
steerG.add(spinG);
var tire = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.34, 22), wheelMat); tire.rotation.z = Math.PI / 2; var tread = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 22, 1, true), new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 1.0, side: THREE.DoubleSide })); tread.rotation.z = Math.PI / 2; spinG.add(tread);
tire.rotation.z = Math.PI / 2; tire.castShadow = true; spinG.add(tire);
var rim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.35, 16), rimMat); var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.37, 10), new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.3, metalness: 0.9 })); hub.rotation.z = Math.PI / 2; spinG.add(hub); var brakeDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0x555558, roughness: 0.5, metalness: 0.8 })); brakeDisc.rotation.z = Math.PI / 2; spinG.add(brakeDisc);
rim.rotation.z = Math.PI / 2; spinG.add(rim);
for (var sp = 0; sp < 5; sp++) {
var spoke = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.52, 0.36), rimMat);
spoke.rotation.x = (sp / 5) * Math.PI; spinG.add(spoke);
}
steerG.position.set(p[0], p[1], p[2]);
car.add(steerG);
wheels.push({ steer: steerG, spin: spinG, front: p[2] > 0, side: p[0] > 0 });
});

var spoilerMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.4, metalness: 0.5 });
var spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.07, 0.42), carbonMat);
spoiler.position.set(0, 1.42, -2.05); spoiler.rotation.x = -0.08; spoiler.castShadow = true; car.add(spoiler); for (var exTip = -1; exTip <= 1; exTip += 2) { var pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.24, 12), chromeMat); pipe.rotation.x = Math.PI / 2; pipe.position.set(exTip * 0.5, 0.5, -2.34); car.add(pipe); var pipeInner = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), blackMat); pipeInner.rotation.x = Math.PI / 2; pipeInner.position.set(exTip * 0.5, 0.5, -2.46); car.add(pipeInner); }
for (var s4 = -1; s4 <= 1; s4 += 2) {
var strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.1), spoilerMat);
strut.position.set(s4 * 0.62, 1.24, -2.05); strut.rotation.x = -0.08; car.add(strut);
}

car.rotation.set(0, 0, 0);
scene.add(car);

makeExhaust();
}

// ─────────────────────────────────────────────────────────
// PARTICLES
// ─────────────────────────────────────────────────────────
function makeExhaust() {
var mat = new THREE.MeshBasicMaterial({ color: 0xbfd0e0, transparent: true, opacity: 0.35, depthWrite: false });
var geo = new THREE.SphereGeometry(0.14, 6, 6);
for (var i = 0; i < 10; i++) {
var p = new THREE.Mesh(geo, mat.clone());
p.visible = false;
p.userData = { life: 0 };
scene.add(p);
exhaustParticles.push(p);
}
}

function makeSmoke() {
var mat = new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5, depthWrite: false });
var geo = new THREE.SphereGeometry(0.22, 6, 6);
for (var i = 0; i < 10; i++) {
var p = new THREE.Mesh(geo, mat.clone());
p.visible = false;
p.userData = { life: 0 };
scene.add(p);
smokeParticles.push(p);
}
}

function emitParticle(pool, pos, spread, up) {
for (var i = 0; i < pool.length; i++) {
var p = pool[i];
if (!p.visible) {
p.position.copy(pos);
p.position.x += (Math.random() - 0.5) * spread;
p.position.y += (Math.random() - 0.5) * spread;
p.position.z += (Math.random() - 0.5) * spread;
p.userData.life = 1;
p.userData.vy = up;
p.visible = true;
p.scale.setScalar(0.6 + Math.random() * 0.5);
return;
}
}
}

function updateParticles(dt) {
var all = exhaustParticles.concat(smokeParticles);
for (var i = 0; i < all.length; i++) {
var p = all[i];
if (!p.visible) continue;
p.userData.life -= dt * 1.6;
if (p.userData.life <= 0) { p.visible = false; continue; }
p.position.y += p.userData.vy * dt;
p.scale.multiplyScalar(1 + dt * 1.4);
p.material.opacity = p.userData.life * 0.4;
}
}

// ─────────────────────────────────────────────────────────
// AI TRAFFIC + COINS (parented to road segments = follow curves)
// ─────────────────────────────────────────────────────────
function buildAITraffic() {
makeSmoke();
for (var i = 0; i < AI_CAR_COUNT; i++) {
var ai = makeAICar(AI_COLORS[i % AI_COLORS.length]);
G.aiCars.push(ai);
resetAI(ai, i);
}
for (var c = 0; c < 5; c++) {
var coin = makeCoin();
G.coins3D.push(coin);
resetCoin(coin, c);
}
}

function makeAICar(color) {
var g = new THREE.Group();
var paint = new THREE.MeshStandardMaterial({ color: color, roughness: 0.35, metalness: 0.6 });
var body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 3.8), paint);
body.position.y = 0.66; body.castShadow = true; g.add(body); var roofPanel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.09, 1.6), paint); roofPanel.position.set(0, 1.6, -0.1); g.add(roofPanel); var bumper = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.6, metalness: 0.4 })); bumper.position.set(0, 0.55, 1.95); g.add(bumper); var rearBump = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.6, metalness: 0.4 })); rearBump.position.set(0, 0.55, -1.95); g.add(rearBump);
var cab = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.52, 1.6), new THREE.MeshPhysicalMaterial({ color: 0x1b2a3a, roughness: 0.05, metalness: 0.2, transmission: 0.45, transparent: true, opacity: 0.8 }));
cab.position.set(0, 1.24, -0.15); cab.castShadow = true; g.add(cab); var aiRoof = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.07, 1.5), paint); aiRoof.position.set(0, 1.52, -0.15); g.add(aiRoof); var aiHood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 1.1), paint); aiHood.position.set(0, 1.0, 1.1); g.add(aiHood);
var wheelMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.9 });
var ps = [[-0.85,0.38,1.3],[0.85,0.38,1.3],[-0.85,0.38,-1.3],[0.85,0.38,-1.3]];
for (var i = 0; i < 4; i++) {
var w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 18), wheelMat); var wRim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.31, 12), new THREE.MeshStandardMaterial({ color: 0xc0c0c8, roughness: 0.3, metalness: 0.9 })); wRim.rotation.z = Math.PI / 2; w.add(wRim);
w.rotation.z = Math.PI / 2; w.position.set(ps[i][0], ps[i][1], ps[i][2]);
w.castShadow = true; g.add(w);
}
var tlm = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 1 });
for (var s = -1; s <= 1; s += 2) {
var tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.07), tlm); var aiHead = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4c0, emissiveIntensity: 1.2 })); aiHead.position.set(s * 0.55, 0.88, 1.92); g.add(aiHead);
tl.position.set(s * 0.55, 0.9, -1.92); g.add(tl);
}
g.isAICar = true;
return g;
}

// ── AI TRAFFIC (redesigned: distance-based, player-aware) ──
// Design goals:
//  * Only a FEW cars (AI_CAR_COUNT).
//  * Cars SPAWN a bit ahead of the player (60-120m) only when the player
//    is actually moving, so traffic appears as you drive.
//  * After a car is OVERTAKEN (player passes it, car is ~30m behind),
//    it is hidden (invisible) - never seen popping out.
//  * If the player stops, NO new cars spawn (so waiting 5 min = no cars).
// Each car keeps a world-Z "anchor" and is placed on the nearest road
// segment each frame (so it follows the curve). We do NOT parent to a
// segment permanently anymore - that caused spawn/vanish flicker.

var AI_SPAWN_AHEAD_MIN = 60;
var AI_SPAWN_AHEAD_MAX = 120;
var AI_DESPAWN_BEHIND = 35;      // hide once this far behind player
var AI_MAX_AHEAD = 160;          // if a car drifts this far ahead, recycle

function resetAI(ai, idx) {
  // Full (re)placement of an AI car ahead of the player on the road.
  ai.visible = false;
  ai.userData.active = false;
  ai.userData.respawnTimer = 0;
  ai.userData.lane = (Math.random() * 2 - 1) * (ROAD_WIDTH / 2 - 2.5);
  ai.userData.speed = 0.35 + Math.random() * 0.35;
  ai.userData.zWorld = 0;
  ai.userData.xOffset = 0;
  placeAICarOnRoad(ai);
}

// Nearest road segment (by world-Z) helper.
function pickSegmentByZ(targetZ) {
  if (!roadSegments.length) return null;
  var best = null, bestD = Infinity;
  for (var i = 0; i < roadSegments.length; i++) {
    var s = roadSegments[i];
    var d = Math.abs((s.userData.endZ + s.userData.entranceZ) * 0.5 - targetZ);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

// Place an AI car's local coordinates so its WORLD position sits on the
// road at the given world-Z, in its lane. We read the segment's world
// matrix and convert world->local.
var _aiWorldPos = new THREE.Vector3();
var _aiInv = new THREE.Matrix4();
function placeAICarOnRoad(ai) {
  var seg = pickSegmentByZ(ai.userData.zWorld);
  if (!seg) { ai.visible = false; ai.userData.active = false; return; }
  // compute world target point on that segment's centre line
  seg.updateMatrixWorld();
  // segment's forward (local -Z) direction in world space:
  var dir = new THREE.Vector3(0, 0, -1).applyQuaternion(seg.quaternion);
  // distance along that segment from its origin to reach zWorld:
  var dz = ai.userData.zWorld - seg.position.z;
  // project (approx, since road is near-straight over one segment)
  var along = (dir.z !== 0) ? (dz / dir.z) : 0;
  if (along < 0) along = 0;
  if (along > SEGMENT_LENGTH) along = SEGMENT_LENGTH;
  var worldX = seg.position.x + dir.x * along + ai.userData.xOffset;
  var worldZ = seg.position.z + dir.z * along;
  // convert to local
  _aiInv.copy(seg.matrixWorld).invert();
  _aiWorldPos.set(worldX, 0, worldZ).applyMatrix4(_aiInv);
  // parent once
  if (ai.parent !== seg) { if (ai.parent && ai.parent.remove) ai.parent.remove(ai); seg.add(ai); }
  ai.position.set(_aiWorldPos.x, 0, _aiWorldPos.z);
  ai.rotation.y = Math.PI; // face travel direction (local -Z)
}

var _tmpAI = new THREE.Vector3();
function updateAITraffic(dt) {
  var playerMoving = Math.abs(G.speed) > 2;
  var laneRange = ROAD_WIDTH / 2 - 2.5;

  for (var i = 0; i < G.aiCars.length; i++) {
    var ai = G.aiCars[i];
    var d = ai.userData;

    // inactive (waiting to spawn): only spawn if player is moving forward
    if (!d.active) {
      d.respawnTimer -= dt;
      if (playerMoving && G.speed > 0 && d.respawnTimer <= 0) {
        d.active = true;
        ai.visible = true;
        d.lane = (Math.random() * 2 - 1) * laneRange;
        d.xOffset = d.lane;
        d.speed = 0.35 + Math.random() * 0.35;
        var ahead = AI_SPAWN_AHEAD_MIN + Math.random() * (AI_SPAWN_AHEAD_MAX - AI_SPAWN_AHEAD_MIN);
        d.zWorld = car.position.z + ahead;
        placeAICarOnRoad(ai);
      } else {
        ai.visible = false;
        continue;
      }
    }

    // Advance the car forward along world +Z? No - traffic moves the SAME
    // direction as the player but slower. Player is faster so overtakes.
    d.zWorld += (d.speed * G.maxSpeed) * dt;
    // gentle lane weave
    var weave = Math.sin(performance.now() * 0.001 + i) * 0.8;
    d.xOffset = Math.max(-laneRange, Math.min(laneRange, d.lane + weave));
    placeAICarOnRoad(ai);

    // world-space collision vs player
    ai.getWorldPosition(_tmpAI);
    var dx = _tmpAI.x - car.position.x;
    var dz = _tmpAI.z - car.position.z;
    if (Math.abs(dx) < 2.2 && Math.abs(dz) < 3.6 && G.invuln <= 0) {
      G.speed *= 0.35;
      G.shake = 0.6;
      G.combo = 0;
      var dmg = (typeof G._damage === 'number') ? G._damage : 25;
      G.health = Math.max(0, G.health - dmg);
      G.invuln = 1.2;
      showPopup('💥 CRASH! -' + dmg + ' HP');
      Sound.blip(120, 0.25);
      if (G.health <= 0) { triggerGameOver(); return; }
    }

    // OVERTAKEN: player passed it -> hide smoothly (never seen vanish)
    if (d.zWorld < car.position.z - AI_DESPAWN_BEHIND) {
      d.active = false;
      ai.visible = false;
      d.respawnTimer = 1.0 + Math.random() * 2.0; // wait before respawn
      continue;
    }

    // Drifted too far ahead while player stopped -> also hide
    if (d.zWorld > car.position.z + AI_MAX_AHEAD) {
      d.active = false;
      ai.visible = false;
      d.respawnTimer = 0.5 + Math.random() * 1.5;
    }
  }
}

function rehomeOrphans() {
  // No longer needed (cars follow by world-Z each frame), but keep a safe
  // stub so older calls do not break.
  return;
}
// ─────────────────────────────────────────────────────────
// COINS
// ─────────────────────────────────────────────────────────
function makeCoin() {
var g = new THREE.Group();
var mat = new THREE.MeshStandardMaterial({ color: 0xffd23b, emissive: 0xffa000, emissiveIntensity: 0.5, metalness: 0.9, roughness: 0.25 });
var coin = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 16), mat);
coin.rotation.x = Math.PI / 2;
g.add(coin);
var ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 20), mat);
g.add(ring);
g.isCoin = true;
return g;
}

// ── COINS (redesigned: few, ahead-only, no flicker) ──
var COIN_SPAWN_AHEAD_MIN = 80;
var COIN_SPAWN_AHEAD_MAX = 200;
var COIN_MAX_ACTIVE = 2;

function resetCoin(coin, idx) {
  coin.visible = false;
  coin.userData.active = false;
  coin.userData.respawnTimer = 0;
  coin.userData.zWorld = 0;
  coin.userData.xOffset = 0;
}

// Place a coin on the road at its world-Z, in its lane.
var _coinWorldPos = new THREE.Vector3();
var _coinInv = new THREE.Matrix4();
function placeCoinOnRoad(coin) {
  var seg = pickSegmentByZ(coin.userData.zWorld);
  if (!seg) { coin.visible = false; coin.userData.active = false; return; }
  seg.updateMatrixWorld();
  var dir = new THREE.Vector3(0, 0, -1).applyQuaternion(seg.quaternion);
  var dz = coin.userData.zWorld - seg.position.z;
  var along = (dir.z !== 0) ? (dz / dir.z) : 0;
  if (along < 0) along = 0;
  if (along > SEGMENT_LENGTH) along = SEGMENT_LENGTH;
  var worldX = seg.position.x + dir.x * along + coin.userData.xOffset;
  var worldZ = seg.position.z + dir.z * along;
  _coinInv.copy(seg.matrixWorld).invert();
  _coinWorldPos.set(worldX, 1.0, worldZ).applyMatrix4(_coinInv);
  if (coin.parent !== seg) { if (coin.parent && coin.parent.remove) coin.parent.remove(coin); seg.add(coin); }
  coin.position.set(_coinWorldPos.x, 1.0, _coinWorldPos.z);
}

var _tmpCoin = new THREE.Vector3();
function updateCoins(dt) {
  var playerMoving = Math.abs(G.speed) > 2;
  var laneRange = ROAD_WIDTH / 2 - 2.5;

  for (var i = 0; i < G.coins3D.length; i++) {
    var coin = G.coins3D[i];
    var d = coin.userData;

    if (!d.active) {
      d.respawnTimer -= dt;
      var activeCount = 0;
      for (var ac = 0; ac < G.coins3D.length; ac++) {
        if (G.coins3D[ac].userData.active) activeCount++;
      }
      if (playerMoving && G.speed > 0 && d.respawnTimer <= 0 && activeCount < COIN_MAX_ACTIVE) {
        d.active = true;
        coin.visible = true;
        d.xOffset = (Math.random() * 2 - 1) * laneRange;
        var ahead = COIN_SPAWN_AHEAD_MIN + Math.random() * (COIN_SPAWN_AHEAD_MAX - COIN_SPAWN_AHEAD_MIN);
        d.zWorld = car.position.z + ahead;
      } else {
        coin.visible = false;
        continue;
      }
    }

    coin.rotation.y += dt * 2.2;
    placeCoinOnRoad(coin);

    coin.getWorldPosition(_tmpCoin);
    var dx = _tmpCoin.x - car.position.x;
    var dz = _tmpCoin.z - car.position.z;
    if (Math.abs(dx) < 2.4 && Math.abs(dz) < 2.6) {
      coin.visible = false;
      d.active = false;
      d.respawnTimer = 2.5 + Math.random() * 2.5;
      G.coins++;
      G.combo++;
      G.comboTimer = 2.0;
      var pts = Math.round(10 * Math.max(1, G.combo) * (typeof G._scoreMul === 'number' ? G._scoreMul : 1));
      G.score += pts;
      showPopup('💰 +' + pts + (G.combo > 1 ? ' x' + G.combo : ''));
      Sound.blip(1100 + G.combo * 60, 0.08);
      document.getElementById('coinVal').textContent = G.coins;
      continue;
    }

    // passed behind -> deactivate silently
    if (d.zWorld < car.position.z - 30) {
      d.active = false;
      coin.visible = false;
      d.respawnTimer = 2.5 + Math.random() * 2.5;
    }
  }
  if (G.comboTimer > 0) {
    G.comboTimer -= dt;
    if (G.comboTimer <= 0) G.combo = 0;
  }
}
// ─────────────────────────────────────────────────────────
// POPUP FEEDBACK
// ─────────────────────────────────────────────────────────
var popupTimer = null;
function showPopup(text) {
var el = document.getElementById('popup');
if (!el) return;
el.textContent = text;
el.classList.add('show');
if (popupTimer) clearTimeout(popupTimer);
popupTimer = setTimeout(function () { el.classList.remove('show'); }, 700);
}

// ─────────────────────────────────────────────────────────
// MINIMAP
// ─────────────────────────────────────────────────────────
var minimapCtx = null;
var _mmWorld = new THREE.Vector3();
function drawMinimap() {
var canvas = document.getElementById('minimapCanvas');
if (!canvas) return;
if (!minimapCtx) minimapCtx = canvas.getContext('2d');
var ctx = minimapCtx;
var w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;
var scale = 0.35;
ctx.clearRect(0, 0, w, h);

var cos = Math.cos(-G.heading), sin = Math.sin(-G.heading);
function toMap(wx, wz) {
var dx = wx - car.position.x;
var dz = wz - car.position.z;
var rx = dx * cos - dz * sin;
var rz = dx * sin + dz * cos;
return [cx + rx * scale, cy + rz * scale];
}

ctx.strokeStyle = 'rgba(120,150,190,0.7)';
ctx.lineWidth = 3;
for (var i = 0; i < roadSegments.length; i++) {
var seg = roadSegments[i];
var a = toMap(seg.userData.entranceX, seg.userData.entranceZ);
var b = toMap(seg.userData.endX, seg.userData.endZ);
ctx.beginPath();
ctx.moveTo(a[0], a[1]);
ctx.lineTo(b[0], b[1]);
ctx.stroke();
}

ctx.fillStyle = '#ffd23b';
for (var k = 0; k < G.coins3D.length; k++) {
var c = G.coins3D[k];
if (!c.visible) continue;
c.getWorldPosition(_mmWorld);
var p = toMap(_mmWorld.x, _mmWorld.z);
if (p[0] < 0 || p[0] > w || p[1] < 0 || p[1] > h) continue;
ctx.beginPath();
ctx.arc(p[0], p[1], 2.2, 0, Math.PI * 2);
ctx.fill();
}

ctx.fillStyle = '#ff6b6b';
for (var j = 0; j < G.aiCars.length; j++) {
var ai = G.aiCars[j];
ai.getWorldPosition(_mmWorld);
var ap = toMap(_mmWorld.x, _mmWorld.z);
if (ap[0] < 0 || ap[0] > w || ap[1] < 0 || ap[1] > h) continue;
ctx.beginPath();
ctx.arc(ap[0], ap[1], 2.8, 0, Math.PI * 2);
ctx.fill();
}

ctx.fillStyle = '#4fe0a3';
ctx.beginPath();
ctx.moveTo(cx, cy - 6);
ctx.lineTo(cx - 5, cy + 5);
ctx.lineTo(cx + 5, cy + 5);
ctx.closePath();
ctx.fill();
}

// ─────────────────────────────────────────────────────────
// DAY / NIGHT CYCLE
// ─────────────────────────────────────────────────────────
function updateDayNight(dt) {
G.timeOfDay = (G.timeOfDay + dt * 0.008) % 1;
var t = G.timeOfDay;
var sunEl = Math.sin(t * Math.PI * 2);
var isNight = sunEl < -0.05;
var lightLevel = Math.max(0, sunEl * 0.5 + 0.5);

sunLight.intensity = 0.15 + lightLevel * 2.3;
sunLight.position.set(car.position.x + Math.cos(t * Math.PI * 2) * 80, 40 + sunEl * 80, car.position.z + 40);

hemiLight.intensity = 0.15 + lightLevel * 0.7;
ambientLight.intensity = 0.08 + lightLevel * 0.3;
fillLight.intensity = 0.05 + lightLevel * 0.35;

if (!scene.fog) scene.fog = new THREE.Fog(0xa8c8e8, 90, 260);
var dayFog = new THREE.Color(0xa8c8e8);
var nightFog = new THREE.Color(0x0a1230);
var duskFog = new THREE.Color(0xdd8844);
var fogCol;
if (sunEl > 0.3) fogCol = dayFog;
else if (sunEl > -0.1) fogCol = duskFog.clone().lerp(nightFog, (0.3 - sunEl) / 0.4);
else fogCol = nightFog;
scene.fog.color.copy(fogCol);
renderer.setClearColor(fogCol, 1);
if (skyMat) skyMat.color.copy(fogCol).lerp(new THREE.Color(0xffffff), sunEl * 0.3);

// (street-lamp dynamic lights removed for performance)
var wantLights = G.headlightsOn || isNight;
for (var i = 0; i < headlights.length; i++) {
headlights[i].visible = wantLights;
headlights[i].intensity = wantLights ? (isNight ? 3.2 : 1.6) : 0;
}
}

// ─────────────────────────────────────────────────────────
// INPUT
// ─────────────────────────────────────────────────────────
function onKeyDown(e) {
G.keys[e.code] = true;
if (e.code === 'KeyC') cycleCamera();
if (e.code === 'KeyR') resetCar();
if (e.code === 'KeyF') toggleHeadlights();
if (e.code === 'KeyM') toggleMute();
if (e.code === 'KeyN') toggleDayNight();
if (e.code === 'Escape' && G.running) pauseGame();
if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) !== -1) e.preventDefault();
}

function onKeyUp(e) {
G.keys[e.code] = false;
}

function onLockChange() {
if (document.pointerLockElement === renderer.domElement) {
G.paused = false;
document.getElementById('pauseScreen').classList.add('hidden');
} else if (G.running && !isTouch && !G._suppressLockPause) {
pauseGame();
}
}

function onVisibilityChange() {
if (document.hidden && G.running) pauseGame();
}

function pauseGame() {
if (!G.running) return;
G.paused = true;
document.getElementById('pauseScreen').classList.remove('hidden');
}

function resumeGame() {
if (!G.running) return;
G.paused = false;
document.getElementById('pauseScreen').classList.add('hidden');
document.getElementById('camIndicator').textContent = '📷 ' + CAM_MODES[G.camMode];
if (!isTouch) requestLock();
if (clock) clock.getDelta();
}

function cycleCamera() {
G.camMode = (G.camMode + 1) % CAM_MODES.length;
var ind = document.getElementById('camIndicator');
if (ind) ind.textContent = '📷 ' + CAM_MODES[G.camMode];
Sound.blip(660, 0.06);
}

function toggleHeadlights() {
G.headlightsOn = !G.headlightsOn;
showPopup(G.headlightsOn ? '💡 Lights ON' : '💡 Lights OFF');
Sound.blip(500, 0.06);
}

function resetCar() {
G.speed = 0; G.steer = 0; G.heading = 0;
G.pos.set(0, 0, 0);
G.distance = 0; G.wheelSpin = 0; G._lapMark = 0;
G.lapStart = performance.now();
G.combo = 0; G.comboTimer = 0; G.shake = 0;
if (car) {
car.position.set(0, 0, 0);
car.rotation.set(0, 0, 0);
}
for (var i = 0; i < roadSegments.length; i++) {
var s = roadSegments[i];
scene.remove(s);
s.traverse(function (o) {
if (o.geometry && o.geometry.dispose && !o.userData.sharedGeo) o.geometry.dispose();
});
}
roadSegments = [];
G.roadEndX = 0; G.roadEndZ = 0; G.roadEndRot = Math.PI;
for (var k = 0; k < SEGMENTS_AHEAD + 6; k++) spawnRoadSegment(k);
for (var a = 0; a < G.aiCars.length; a++) resetAI(G.aiCars[a], a);
for (var c = 0; c < G.coins3D.length; c++) resetCoin(G.coins3D[c], c);
Sound.blip(300, 0.1);
}

// ─────────────────────────────────────────────────────────
// TOUCH CONTROLS
// ─────────────────────────────────────────────────────────
function setupTouchControls() {
  var btns = document.querySelectorAll(".touch-btn");
  for (var i = 0; i < btns.length; i++) {
    (function (btn) {
      var key = btn.getAttribute("data-key");
      if (!key) return;
      var down = function (ev) { if (ev) ev.preventDefault(); G.keys[key] = true; btn.classList.add("pressed"); };
      var up = function (ev) { if (ev) ev.preventDefault(); G.keys[key] = false; btn.classList.remove("pressed"); };
      btn.addEventListener("touchstart", down, { passive: false });
      btn.addEventListener("touchend", up, { passive: false });
      btn.addEventListener("touchcancel", up, { passive: false });
      btn.addEventListener("mousedown", down);
      btn.addEventListener("mouseup", up);
      btn.addEventListener("mouseleave", up);
      btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    })(btns[i]);
  }
  var pauseBtn = document.getElementById("touchPause");
  if (pauseBtn) {
    pauseBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (G.paused && typeof resumeGame === "function") { resumeGame(); return; }
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true }));
    });
  }
  var camBtn = document.getElementById("touchCamera");
  if (camBtn) {
    camBtn.addEventListener("click", function (e) {
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", code: "KeyC", keyCode: 67, which: 67, bubbles: true }));
    });
  }
  function releaseAllTouchKeys() {
    var ks = Object.keys(G.keys);
    for (var k = 0; k < ks.length; k++) { G.keys[ks[k]] = false; }
    var pressed = document.querySelectorAll(".touch-btn.pressed");
    for (var j = 0; j < pressed.length; j++) { pressed[j].classList.remove("pressed"); }
  }
  window.addEventListener("orientationchange", function () { setTimeout(releaseAllTouchKeys, 250); });
  window.addEventListener("blur", releaseAllTouchKeys);
}

// ─────────────────────────────────────────────────────────
// GAME FLOW
// ─────────────────────────────────────────────────────────
function startGame() {
Sound.resume();
Sound.startEngine();
try { G.highScore = parseInt(localStorage.getItem('apexHighScore') || '0', 10) || 0; } catch (e) { G.highScore = 0; }
document.getElementById('menu').classList.add('hidden');
document.getElementById('gameOverScreen').classList.add('hidden');
document.getElementById('hud').classList.remove('hidden');
resetCar();
G.running = true;
G.paused = false;
G.gameOver = false;
G.health = 100;
G.score = 0;
G.coins = 0;
G.combo = 0;
G.comboTimer = 0;
startCountdown();
if (!isTouch) requestLock();
}

var _countdownToken = 0;
function startCountdown() {
G.countdown = 3;
var el = document.getElementById('countdown');
if (!el) return;
var myToken = ++_countdownToken;
function tick() {
  if (myToken !== _countdownToken) return;
  if (!G.running || G.gameOver) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.textContent = G.countdown > 0 ? String(G.countdown) : 'GO!';
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = 'countPop 0.9s ease-out';
  if (G.countdown < 0) { el.classList.add('hidden'); return; }
  G.countdown--;
  setTimeout(tick, 900);
}
tick();
}

function triggerGameOver() {
if (G.gameOver) return;
G.gameOver = true;
G.running = false;
if (G.score > G.highScore) { G.highScore = G.score; try { localStorage.setItem('apexHighScore', String(G.highScore)); } catch (e) {} }
document.getElementById('goScore').textContent = G.score;
document.getElementById('goCoins').textContent = G.coins;
document.getElementById('goDist').textContent = Math.round(G.distance);
document.getElementById('goHigh').textContent = G.highScore;
document.getElementById('gameOverScreen').classList.remove('hidden');
document.getElementById('hud').classList.add('hidden');
if (document.exitPointerLock) document.exitPointerLock();
}

function restartGame() {
startGame();
}

function toggleMute() {
G.muted = !G.muted;
showPopup(G.muted ? 'Sound OFF' : 'Sound ON');
}

function toggleDayNight() {
G.timeOfDay = (G.timeOfDay + 0.5) % 1;
showPopup(G.timeOfDay > 0.5 ? 'Night' : 'Day');
}

function requestLock() {
if (renderer.domElement.requestPointerLock) {
try {
var p = renderer.domElement.requestPointerLock();
if (p && p.catch) p.catch(function () {});
} catch (e) {}
}
}

// ─────────────────────────────────────────────────────────
// CAR PHYSICS
// ─────────────────────────────────────────────────────────
function updateCar(dt) {
var throttle = 0, brake = 0, steerInput = 0;
var locked = G.countdown > 0;
if (locked) { throttle = 0; brake = 0; steerInput = 0; }
if (!locked) {
if (G.keys['KeyW'] || G.keys['ArrowUp']) throttle = 1;
if (G.keys['KeyS'] || G.keys['ArrowDown']) brake = 1;
if (G.keys['KeyA'] || G.keys['ArrowLeft']) steerInput -= 1;
if (G.keys['KeyD'] || G.keys['ArrowRight']) steerInput += 1;
}

var nitroKey = !locked && (G.keys['ShiftLeft'] || G.keys['ShiftRight']);
G.nitroActive = nitroKey && G.nitro > 0;

var targetMax = G.maxSpeed * (G.nitroActive ? 1.45 : 1);
if (throttle) {
G.speed += G.accel * dt * (G.nitroActive ? 1.9 : 1) * (1 - Math.min(0.55, Math.abs(G.speed) / (targetMax * 1.4)));
} else if (brake) {
if (G.speed > 0.2) G.speed -= G.brakeForce * dt;
else G.speed -= G.accel * 0.5 * dt;
} else {
if (G.speed > 0.05) G.speed -= G.drag * dt * 4;
else if (G.speed < -0.05) G.speed += G.drag * dt * 4;
else G.speed = 0;
}
G.speed = Math.max(-12, Math.min(targetMax, G.speed));
if (Math.abs(G.speed) < 0.05) G.speed = 0;

if (G.nitroActive) G.nitro = Math.max(0, G.nitro - 24 * dt);
else G.nitro = Math.min(100, G.nitro + 11 * dt);

var speedFactor = Math.min(1, Math.abs(G.speed) / 12);
var stab = (typeof G.stability === 'number') ? G.stability : 0.5; var _grip = (typeof G._gripMul === 'number') ? G._gripMul : 1; var steerRateMul = 0.42 + 0.62 * stab; var steerSmooth = 1.7 + 2.4 * stab; var turnMul = (0.52 + 0.42 * stab) * _grip; var steerRate = (0.62 + 0.18 * Math.min(1, Math.abs(G.speed) / G.maxSpeed)) * speedFactor * steerRateMul;
G.steer += (steerInput - G.steer) * Math.min(1, dt * steerSmooth);

var turn = -G.steer * steerRate * dt * turnMul * (G.speed >= 0 ? 1 : -1);
G.heading += turn;

var forwardX = Math.sin(G.heading);
var forwardZ = Math.cos(G.heading);
G.pos.x += forwardX * G.speed * dt;
G.pos.z += forwardZ * G.speed * dt;

car.position.copy(G.pos);
car.rotation.y = G.heading;
var bodyRoll = -G.steer * speedFactor * 0.09; car.rotation.z += (bodyRoll - car.rotation.z) * Math.min(1, dt * 8); car.rotation.z = Math.max(-0.2, Math.min(0.2, car.rotation.z));
var pitchTarget = (throttle ? -0.025 : 0) + (brake && G.speed > 0 ? 0.04 : 0) - (G.nitroActive ? 0.03 : 0); car.rotation.x += (pitchTarget - car.rotation.x) * Math.min(1, dt * 6);

// keep the car on the road
clampCarToRoad();

if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 1.5);

for (var bi = 0; bi < brakeLights.length; bi++) {
brakeLights[bi].material.emissiveIntensity = brake ? 3.0 : 1.2;
}

G.wheelSpin += G.speed * dt * 3;
wheels.forEach(function (w) {
w.spin.rotation.x = G.wheelSpin;
if (w.front) w.steer.rotation.y = -G.steer * 0.5;
});

G.distance += Math.abs(G.speed) * dt;
if (G.invuln > 0) G.invuln -= dt;
if (G.speed > 20) G.score += Math.round(G.speed * dt * 0.5 * (typeof G._scoreMul === 'number' ? G._scoreMul : 1));

if (throttle || G.nitroActive) {
if (Math.random() < (G.nitroActive ? 0.95 : 0.4)) {
var back = new THREE.Vector3(-Math.sin(G.heading), 0.4, -Math.cos(G.heading)).multiplyScalar(2.2);
var exPos = car.position.clone().add(back);
emitParticle(exhaustParticles, exPos, 0.5, 0.6 + Math.random() * 0.5);
if (G.nitroActive) emitParticle(exhaustParticles, exPos, 0.9, 1.2);
}
}
if (Math.abs(G.steer) > 0.7 && Math.abs(G.speed) > 20) {
if (Math.random() < 0.4) {
var wheelPos = car.position.clone();
wheelPos.y = 0.2;
wheelPos.x += (G.steer > 0 ? -1 : 1) * 1.1;
wheelPos.z -= Math.cos(G.heading) * 1.4;
emitParticle(smokeParticles, wheelPos, 0.4, 0.8);
}
}

var rpm = Math.min(1, Math.abs(G.speed) / G.maxSpeed);
Sound.setEngine(rpm, G.running && !G.paused);
}

// ─────────────────────────────────────────────────────────
// ROAD CONSTRAINT — keep the car on the asphalt
// ─────────────────────────────────────────────────────────
var _clampInv = new THREE.Matrix4();
var _clampLocal = new THREE.Vector3();
function clampCarToRoad() {
if (!car || !roadSegments.length) return;

// pick the segment the car is currently over (nearest center)
var best = null, bestD = Infinity;
for (var i = 0; i < roadSegments.length; i++) {
var s = roadSegments[i];
var dx = car.position.x - s.position.x;
var dz = car.position.z - s.position.z;
var d = dx * dx + dz * dz;
if (d < bestD) { bestD = d; best = s; }
}
if (!best) return;

best.updateMatrixWorld();
_clampInv.copy(best.matrixWorld).invert();
_clampLocal.copy(car.position).applyMatrix4(_clampInv);

var half = ROAD_WIDTH / 2 - 1.3;
var clamped = Math.max(-half, Math.min(half, _clampLocal.x));
if (clamped !== _clampLocal.x) {
_clampLocal.x = clamped;
car.position.copy(_clampLocal.applyMatrix4(best.matrixWorld));
G.pos.copy(car.position);
// scrub a little speed when scraping the edge
G.speed *= 0.97; G.shake = Math.max(G.shake, 0.15);
}
}

// ─────────────────────────────────────────────────────────
// CAMERA
// ─────────────────────────────────────────────────────────
function positionCamera(dt) {
if (!car) return;
var heading = G.heading;
var fwd = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
var back = fwd.clone().multiplyScalar(-1);
var desired, lookAt;

if (G.camMode === 0) {
desired = car.position.clone().add(back.clone().multiplyScalar(8.2)).add(new THREE.Vector3(0, 3.4, 0));
lookAt = car.position.clone().add(fwd.clone().multiplyScalar(8)).add(new THREE.Vector3(0, 1.1, 0));
camera.position.lerp(desired, Math.min(1, dt * 4.5));
camera.lookAt(lookAt);
} else if (G.camMode === 1) {
desired = car.position.clone().add(fwd.clone().multiplyScalar(1.1)).add(new THREE.Vector3(0, 1.7, 0));
camera.position.copy(desired);
lookAt = car.position.clone().add(fwd.clone().multiplyScalar(30)).add(new THREE.Vector3(0, 1.0, 0));
camera.lookAt(lookAt);
} else if (G.camMode === 2) {
desired = car.position.clone().add(back.clone().multiplyScalar(16)).add(new THREE.Vector3(0, 7, 0));
camera.position.lerp(desired, Math.min(1, dt * 3));
lookAt = car.position.clone().add(new THREE.Vector3(0, 1, 0));
camera.lookAt(lookAt);
} else {
var t = performance.now() * 0.0003;
desired = car.position.clone().add(new THREE.Vector3(Math.sin(t) * 9, 4, Math.cos(t) * 9));
camera.position.lerp(desired, Math.min(1, dt * 4));
lookAt = car.position.clone().add(new THREE.Vector3(0, 1, 0));
camera.lookAt(lookAt);
}

if (G.shake > 0) {
camera.position.x += (Math.random() - 0.5) * G.shake * 0.8;
camera.position.y += (Math.random() - 0.5) * G.shake * 0.8;
}

var speedNorm = Math.min(1, Math.abs(G.speed) / G.maxSpeed);
var targetFov = 68 + speedNorm * 14 + (G.nitroActive ? 10 : 0);
camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
camera.updateProjectionMatrix();
}

// ─────────────────────────────────────────────────────────
// ROAD RECYCLING
// ─────────────────────────────────────────────────────────
function recycleRoad() {
while (roadSegments.length) {
var seg = roadSegments[0];
var _r = seg.rotation.y;
var _ez = seg.position.z - Math.cos(_r) * SEGMENT_LENGTH;
if (_ez > car.position.z - 30) break;
// NOTE: do NOT dispose geometries here - road/curb/grass/props use
// SHARED geometries reused by every segment, so disposing them
// would corrupt all remaining segments. Just detach children.
// FIX: AI cars and coins may be parented to this segment. Detaching them
// blindly would orphan them (removed from scene graph while still active
// in G.aiCars / G.coins3D). Recycle their state so they respawn cleanly.
for (var ci = seg.children.length - 1; ci >= 0; ci--) {
var child = seg.children[ci];
if (child.isAICar) {
child.userData.active = false;
child.userData.respawnTimer = 0.4 + Math.random() * 1.2;
child.userData.zWorld = 0;
seg.remove(child);
} else if (child.isCoin) {
child.userData.active = false;
child.userData.respawnTimer = 0.6 + Math.random() * 1.4;
child.userData.zWorld = 0;
seg.remove(child);
}
}
while (seg.children.length) { seg.remove(seg.children[0]); }
roadSegments.shift();
var last = roadSegments[roadSegments.length - 1];
var newIndex = last ? last.userData.index + 1 : 0;
spawnRoadSegment(newIndex);
}
}

// ─────────────────────────────────────────────────────────
// HUD
// ─────────────────────────────────────────────────────────
function kmh() { return Math.abs(G.speed) * 3.6; }

var speedoCtx = null;
function updateHUD() {
var speed = Math.round(kmh());
document.getElementById('speedVal').textContent = speed;

var gear = 'N';
if (G.speed > 0.5) gear = Math.min(6, 1 + Math.floor(speed / 35));
else if (G.speed < -0.5) gear = 'R';
document.getElementById('gearText').textContent = gear;

document.getElementById('nitroFill').style.width = G.nitro + '%';
document.getElementById('distVal').textContent = Math.round(G.distance);

var lapT = (performance.now() - G.lapStart) / 1000;
document.getElementById('lapTime').textContent = lapT.toFixed(2);
if (G.distance - (G._lapMark || 0) >= 500) {
G._lapMark = G.distance;
if (G.bestLap === null || lapT < G.bestLap) { G.bestLap = lapT; Sound.blip(880, 0.15); showPopup('🏆 NEW BEST LAP!'); }
G.lapStart = performance.now();
lapT = 0;
}
var scoreEl = document.getElementById('scoreVal');
if (scoreEl) scoreEl.textContent = G.score;
var hpEl = document.getElementById('healthVal');
if (hpEl) hpEl.textContent = Math.round(G.health);
var hpBox = document.getElementById('healthBox');
if (hpBox) { if (G.health <= 30) hpBox.classList.add('low'); else hpBox.classList.remove('low'); }
var bestEl = document.getElementById('bestTime');
if (G.bestLap !== null) bestEl.textContent = G.bestLap.toFixed(2);

var sl = document.getElementById('speedLines');
var intensity = Math.max(0, (kmh() - 100) / 150);
sl.style.opacity = Math.min(0.8, intensity + (G.nitroActive ? 0.25 : 0));

drawSpeedo(speed);
drawMinimap();
}

function drawSpeedo(speed) {
var canvas = document.getElementById('speedoCanvas');
if (!canvas) return;
if (!speedoCtx) speedoCtx = canvas.getContext('2d');
var ctx = speedoCtx;
var w = 220, h = 220, cx = 110, cy = 110, r = 92;

ctx.clearRect(0, 0, w, h);

ctx.lineWidth = 10;
ctx.strokeStyle = 'rgba(255,255,255,0.08)';
ctx.beginPath();
ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
ctx.stroke();

var maxSpeed = 220;
var frac = Math.min(1, speed / maxSpeed);
var startA = Math.PI * 0.75;
var endA = Math.PI * 2.25;
var ang = startA + (endA - startA) * frac;

var grad = ctx.createLinearGradient(0, 0, w, h);
grad.addColorStop(0, '#2f7fd0');
grad.addColorStop(0.6, '#ff9a3c');
grad.addColorStop(1, '#ff3b3b');
ctx.strokeStyle = grad;
ctx.lineWidth = 10;
ctx.lineCap = 'round';
ctx.beginPath();
ctx.arc(cx, cy, r, startA, ang);
ctx.stroke();

ctx.strokeStyle = 'rgba(255,255,255,0.35)';
ctx.lineWidth = 2;
for (var i = 0; i <= 11; i++) {
var a = startA + (endA - startA) * (i / 11);
var x1 = cx + Math.cos(a) * (r - 16);
var y1 = cy + Math.sin(a) * (r - 16);
var x2 = cx + Math.cos(a) * (r - 24);
var y2 = cy + Math.sin(a) * (r - 24);
ctx.beginPath();
ctx.moveTo(x1, y1);
ctx.lineTo(x2, y2);
ctx.stroke();
}

ctx.strokeStyle = '#ff5f1f';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(cx, cy);
ctx.lineTo(cx + Math.cos(ang) * (r - 30), cy + Math.sin(ang) * (r - 30));
ctx.stroke();

ctx.fillStyle = '#ff5f1f';
ctx.beginPath();
ctx.arc(cx, cy, 4, 0, Math.PI * 2);
ctx.fill();
}

// ─────────────────────────────────────────────────────────
// LOOP
// ─────────────────────────────────────────────────────────
function onResize() {
camera.aspect = window.innerWidth / window.innerHeight;
camera.updateProjectionMatrix();
renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
requestAnimationFrame(animate);
var dt = Math.min(clock.getDelta(), 0.05);

if (G.running && !G.paused) {
updateCar(dt);
recycleRoad();
G._rehomeTick = (G._rehomeTick || 0) + 1;
if (G._rehomeTick % 10 === 0) rehomeOrphans();
updateAITraffic(dt);
updateCoins(dt);
updateParticles(dt);
updateHUD();
}

positionCamera(dt);

if (sunLight && car) {
sunLight.target.position.copy(car.position);
sunLight.target.updateMatrixWorld();
}

if (car) {
updateDayNight(dt);
if (skyMesh) skyMesh.position.set(car.position.x, 0, car.position.z);
if (G.ground) G.ground.position.set(car.position.x, -0.15, car.position.z);
if (G.hills) {
for (var hi = 0; hi < G.hills.length; hi++) {
var hill = G.hills[hi];
var d = hill.userData;
hill.position.set(
car.position.x + Math.cos(d.angle) * d.radius,
d.height / 2 - 20,
car.position.z + Math.sin(d.angle) * d.radius
);
}
}
}

renderer.render(scene, camera);
}

// ── Boot ──
init();
// ─────────────────────────────────────────────────────────
// FIX OVERRIDE: resetCar (safe road/AI/coin teardown)
// AI cars & coins are parented to road segments; the original
// resetCar disposed their geometry along with the segment. Detach
// them first so shared meshes survive a restart.
// ─────────────────────────────────────────────────────────
resetCar = function () {
G.speed = 0; G.steer = 0; G.heading = 0;
G.pos.set(0, 0, 0);
G.distance = 0; G.wheelSpin = 0; G._lapMark = 0;
G.lapStart = performance.now();
G.combo = 0; G.comboTimer = 0; G.shake = 0;
G.invuln = 0;
if (car) {
car.position.set(0, 0, 0);
car.rotation.set(0, 0, 0);
}
for (var i = 0; i < roadSegments.length; i++) {
var s = roadSegments[i];
for (var ci = 0; ci < G.aiCars.length; ci++) {
if (G.aiCars[ci].parent === s) s.remove(G.aiCars[ci]);
}
for (var ki = 0; ki < G.coins3D.length; ki++) {
if (G.coins3D[ki].parent === s) s.remove(G.coins3D[ki]);
}
scene.remove(s);
s.traverse(function (o) {
if (o.geometry && o.geometry.dispose && !o.userData.sharedGeo) o.geometry.dispose();
});
}
roadSegments = [];
G.roadEndX = 0; G.roadEndZ = 0; G.roadEndRot = Math.PI;
for (var k = 0; k < SEGMENTS_AHEAD + 6; k++) spawnRoadSegment(k);
for (var a = 0; a < G.aiCars.length; a++) resetAI(G.aiCars[a], a);
for (var c = 0; c < G.coins3D.length; c++) resetCoin(G.coins3D[c], c);
Sound.blip(300, 0.1);
};
// ─────────────────────────────────────────────────────────
// TRAFFIC + COIN IMPROVEMENTS (override layer)
//  • Cars never overlap: enforced minimum world-Z gap + distinct lanes.
//  • Cars spawn far beyond the visible range (no pop-in) and only in
//    free slots.
//  • Coins spawn in clean lane-aligned positions, spaced from each
//    other and from AI cars — never "anywhere".
// ─────────────────────────────────────────────────────────

// Tuned distances (world Z = metres along travel direction).
var AI_SPAWN_MIN_Z = 130;          // spawn far ahead (past most visible road)
var AI_SPAWN_MAX_Z = 175;
var AI_MIN_GAP_Z = 11;             // required Z gap between two AI cars
var AI_LANE_COUNT = 3;             // discrete lanes across the road
var AI_LANE_CENTERS = (function () {
  var half = (ROAD_WIDTH / 2) - 2.6;
  var arr = [];
  for (var i = 0; i < AI_LANE_COUNT; i++) {
    // spread lanes symmetrically across usable width
    var f = AI_LANE_COUNT === 1 ? 0 : (i / (AI_LANE_COUNT - 1)) * 2 - 1;
    arr.push(f * half * 0.82);
  }
  return arr;
})();

var COIN_SPAWN_MIN_Z = 90;
var COIN_SPAWN_MAX_Z = 165;
var COIN_MIN_GAP_Z = 9;
var COIN_MAX_ACTIVE2 = 3;

// Return lane center index -> x offset
function laneX(idx) {
  if (idx < 0) idx = 0;
  if (idx >= AI_LANE_CENTERS.length) idx = AI_LANE_CENTERS.length - 1;
  return AI_LANE_CENTERS[idx];
}

// Is a candidate world-Z occupied by any active AI car (within gap)?
function aiZOccupied(z, ignoreAi) {
  for (var i = 0; i < G.aiCars.length; i++) {
    var a = G.aiCars[i];
    if (a === ignoreAi) continue;
    if (!a.userData.active) continue;
    if (Math.abs(a.userData.zWorld - z) < AI_MIN_GAP_Z) return true;
  }
  return false;
}

// Pick a free lane for a car at a target Z given other active cars.
function pickFreeLane(z, ignoreAi) {
  var used = [];
  for (var i = 0; i < G.aiCars.length; i++) {
    var a = G.aiCars[i];
    if (a === ignoreAi || !a.userData.active) continue;
    if (Math.abs(a.userData.zWorld - z) < AI_MIN_GAP_Z) used.push(a.userData.laneIdx);
  }
  var free = [];
  for (var l = 0; l < AI_LANE_CENTERS.length; l++) {
    if (used.indexOf(l) === -1) free.push(l);
  }
  if (free.length === 0) return -1;
  return free[Math.floor(Math.random() * free.length)];
}

// ── resetAI override ──
resetAI = function (ai, idx) {
  ai.visible = false;
  ai.userData.active = false;
  ai.userData.respawnTimer = 0;
  ai.userData.laneIdx = idx % AI_LANE_CENTERS.length;
  ai.userData.lane = laneX(ai.userData.laneIdx);
  ai.userData.speed = 0.34 + Math.random() * 0.30;
  ai.userData.zWorld = 0;
  ai.userData.xOffset = ai.userData.lane;
  placeAICarOnRoad(ai);
};

// ── updateAITraffic override ──
updateAITraffic = function (dt) {
  var playerMoving = Math.abs(G.speed) > 2;
  var laneRange = ROAD_WIDTH / 2 - 2.5;

  for (var i = 0; i < G.aiCars.length; i++) {
    var ai = G.aiCars[i];
    var d = ai.userData;

    // ── spawn logic ──
    if (!d.active) {
      d.respawnTimer -= dt;
      if (playerMoving && G.speed > 0 && d.respawnTimer <= 0) {
        // pick a Z far ahead that is not already taken by another car
        var tries = 0, zc = 0, okZ = false;
        while (tries < 8) {
          zc = car.position.z + AI_SPAWN_MIN_Z + Math.random() * (AI_SPAWN_MAX_Z - AI_SPAWN_MIN_Z);
          if (!aiZOccupied(zc, ai)) { okZ = true; break; }
          tries++;
        }
        var laneIdx = pickFreeLane(zc, ai);
        if (!okZ || laneIdx === -1) {
          // no room yet: wait a moment and try again
          d.respawnTimer = 0.3 + Math.random() * 0.5;
          ai.visible = false;
          continue;
        }
        d.active = true;
        ai.visible = true;
        d.laneIdx = laneIdx;
        d.lane = laneX(laneIdx);
        d.xOffset = d.lane;
        d.speed = 0.34 + Math.random() * 0.30;
        d.zWorld = zc;
        placeAICarOnRoad(ai);
      } else {
        ai.visible = false;
        continue;
      }
    }

    // ── advance (same direction as player, slower) ──
    d.zWorld += (d.speed * G.maxSpeed) * dt;

    // ── anti-overlap: if too close to another active car ahead, match
    //    its speed instead of rear-ending / stacking ──
    var nearestAhead = Infinity;
    for (var j = 0; j < G.aiCars.length; j++) {
      if (j === i) continue;
      var o = G.aiCars[j];
      if (!o.userData.active) continue;
      var dz = o.userData.zWorld - d.zWorld;
      if (dz > 0 && dz < nearestAhead) nearestAhead = dz;
    }
    if (nearestAhead < AI_MIN_GAP_Z) {
      // hold position (do not run into the car ahead)
      d.zWorld -= (d.speed * G.maxSpeed) * dt;
      d.speed = Math.max(0.18, d.speed * 0.985);
    }

    // gentle lane weave (small, stays inside lane)
    var weave = Math.sin(performance.now() * 0.001 + i) * 0.35;
    d.xOffset = Math.max(-laneRange, Math.min(laneRange, d.lane + weave));
    placeAICarOnRoad(ai);

    // ── collision with player ──
    ai.getWorldPosition(_tmpAI);
    var dx = _tmpAI.x - car.position.x;
    var dzp = _tmpAI.z - car.position.z;
    if (Math.abs(dx) < 2.2 && Math.abs(dzp) < 3.6 && G.invuln <= 0) {
      G.speed *= 0.35;
      G.shake = 0.6;
      G.combo = 0;
      var dmg = (typeof G._damage === 'number') ? G._damage : 25;
      G.health = Math.max(0, G.health - dmg);
      G.invuln = 1.2;
      showPopup('💥 CRASH! -' + dmg + ' HP');
      Sound.blip(120, 0.25);
      if (G.health <= 0) { triggerGameOver(); return; }
    }

    // ── overtaken: hide once well behind ──
    if (d.zWorld < car.position.z - AI_DESPAWN_BEHIND) {
      d.active = false;
      ai.visible = false;
      d.respawnTimer = 0.8 + Math.random() * 1.6;
      continue;
    }

    // ── drifted too far ahead -> recycle ──
    if (d.zWorld > car.position.z + AI_MAX_AHEAD) {
      d.active = false;
      ai.visible = false;
      d.respawnTimer = 0.4 + Math.random() * 1.2;
    }
  }
};

// ── coin helpers ──
function coinZOccupied(z, ignoreCoin) {
  for (var i = 0; i < G.coins3D.length; i++) {
    var c = G.coins3D[i];
    if (c === ignoreCoin || !c.userData.active) continue;
    if (Math.abs(c.userData.zWorld - z) < COIN_MIN_GAP_Z) return true;
  }
  return false;
}
function coinNearAI(z, x) {
  for (var i = 0; i < G.aiCars.length; i++) {
    var a = G.aiCars[i];
    if (!a.userData.active) continue;
    if (Math.abs(a.userData.zWorld - z) < 6 && Math.abs(a.userData.lane - x) < 2.6) return true;
  }
  return false;
}

// ── resetCoin override ──
resetCoin = function (coin, idx) {
  coin.visible = false;
  coin.userData.active = false;
  coin.userData.respawnTimer = 0;
  coin.userData.zWorld = 0;
  coin.userData.xOffset = 0;
};

// ── updateCoins override ──
updateCoins = function (dt) {
  var playerMoving = Math.abs(G.speed) > 2;
  var laneRange = ROAD_WIDTH / 2 - 2.5;

  for (var i = 0; i < G.coins3D.length; i++) {
    var coin = G.coins3D[i];
    var d = coin.userData;

    if (!d.active) {
      d.respawnTimer -= dt;
      var activeCount = 0;
      for (var ac = 0; ac < G.coins3D.length; ac++) {
        if (G.coins3D[ac].userData.active) activeCount++;
      }
      if (playerMoving && G.speed > 0 && d.respawnTimer <= 0 && activeCount < COIN_MAX_ACTIVE2) {
        // choose a clean lane-aligned position far ahead, clear of
        // other coins and of AI cars.
        var tries = 0, placed = false, zc = 0, xc = 0;
        while (tries < 10) {
          zc = car.position.z + COIN_SPAWN_MIN_Z + Math.random() * (COIN_SPAWN_MAX_Z - COIN_SPAWN_MIN_Z);
          var laneIdx = Math.floor(Math.random() * AI_LANE_CENTERS.length);
          xc = laneX(laneIdx);
          if (!coinZOccupied(zc, coin) && !coinNearAI(zc, xc)) { placed = true; break; }
          tries++;
        }
        if (!placed) {
          d.respawnTimer = 0.5 + Math.random() * 0.8;
          coin.visible = false;
          continue;
        }
        d.active = true;
        coin.visible = true;
        d.xOffset = xc;
        d.zWorld = zc;
      } else {
        coin.visible = false;
        continue;
      }
    }

    coin.rotation.y += dt * 2.2;
    placeCoinOnRoad(coin);

    coin.getWorldPosition(_tmpCoin);
    var dx = _tmpCoin.x - car.position.x;
    var dz = _tmpCoin.z - car.position.z;
    if (Math.abs(dx) < 2.4 && Math.abs(dz) < 2.6) {
      coin.visible = false;
      d.active = false;
      d.respawnTimer = 2.0 + Math.random() * 2.0;
      G.coins++;
      G.combo++;
      G.comboTimer = 2.0;
      var pts = Math.round(10 * Math.max(1, G.combo) * (typeof G._scoreMul === 'number' ? G._scoreMul : 1));
      G.score += pts;
      showPopup('💰 +' + pts + (G.combo > 1 ? ' x' + G.combo : ''));
      Sound.blip(1100 + G.combo * 60, 0.08);
      document.getElementById('coinVal').textContent = G.coins;
      continue;
    }

    if (d.zWorld < car.position.z - 30) {
      d.active = false;
      coin.visible = false;
      d.respawnTimer = 2.0 + Math.random() * 2.0;
    }
  }
  if (G.comboTimer > 0) {
    G.comboTimer -= dt;
    if (G.comboTimer <= 0) G.combo = 0;
  }
};
// ── Spawn tuning override: push spawn distance to the fog boundary so
// cars fade in from the fog instead of popping in mid-view. Also raise
// the recycle ceiling so freshly spawned far cars are not instantly
// re-cycled.
AI_SPAWN_MIN_Z = 210;
AI_SPAWN_MAX_Z = 250;
AI_MAX_AHEAD = 320;
AI_DESPAWN_BEHIND = 40;
// Coins can appear a bit closer but still clearly ahead and out of fog.
COIN_SPAWN_MIN_Z = 150;
COIN_SPAWN_MAX_Z = 220;
// ── Final coin update: adds LIVE avoidance of moving AI cars so a coin
// never visually sits on top of traffic. If a coin's lane gets occupied
// by a passing car, it hops to a free lane at the same Z; if none, it
// quietly respawns ahead.
updateCoins = function (dt) {
  var playerMoving = Math.abs(G.speed) > 2;
  var laneRange = ROAD_WIDTH / 2 - 2.5;

  for (var i = 0; i < G.coins3D.length; i++) {
    var coin = G.coins3D[i];
    var d = coin.userData;

    if (!d.active) {
      d.respawnTimer -= dt;
      var activeCount = 0;
      for (var ac = 0; ac < G.coins3D.length; ac++) {
        if (G.coins3D[ac].userData.active) activeCount++;
      }
      if (playerMoving && G.speed > 0 && d.respawnTimer <= 0 && activeCount < COIN_MAX_ACTIVE2) {
        var tries = 0, placed = false, zc = 0, xc = 0;
        while (tries < 10) {
          zc = car.position.z + COIN_SPAWN_MIN_Z + Math.random() * (COIN_SPAWN_MAX_Z - COIN_SPAWN_MIN_Z);
          var laneIdx = Math.floor(Math.random() * AI_LANE_CENTERS.length);
          xc = laneX(laneIdx);
          if (!coinZOccupied(zc, coin) && !coinNearAI(zc, xc)) { placed = true; break; }
          tries++;
        }
        if (!placed) {
          d.respawnTimer = 0.5 + Math.random() * 0.8;
          coin.visible = false;
          continue;
        }
        d.active = true;
        coin.visible = true;
        d.xOffset = xc;
        d.zWorld = zc;
      } else {
        coin.visible = false;
        continue;
      }
    }

    // ── LIVE AI avoidance: if an active car is passing over this coin,
    //    move the coin to a different free lane at the same Z. ──
    var blockedLane = -1;
    for (var ai = 0; ai < G.aiCars.length; ai++) {
      var a = G.aiCars[ai];
      if (!a.userData.active) continue;
      if (Math.abs(a.userData.zWorld - d.zWorld) < 4.5 &&
          Math.abs(a.userData.lane - d.xOffset) < 2.8) {
        blockedLane = a.userData.laneIdx;
        break;
      }
    }
    if (blockedLane !== -1) {
      var moved = false;
      for (var l = 0; l < AI_LANE_CENTERS.length; l++) {
        if (l === blockedLane) continue;
        var lx = laneX(l);
        var laneClear = true;
        for (var ai2 = 0; ai2 < G.aiCars.length; ai2++) {
          var a2 = G.aiCars[ai2];
          if (!a2.userData.active) continue;
          if (Math.abs(a2.userData.zWorld - d.zWorld) < 4.5 && Math.abs(a2.userData.lane - lx) < 2.8) { laneClear = false; break; }
        }
        if (laneClear) { d.xOffset = lx; moved = true; break; }
      }
      if (!moved) {
        // no free lane -> recycle this coin ahead instead of overlapping
        d.active = false;
        coin.visible = false;
        d.respawnTimer = 0.8 + Math.random() * 1.2;
        continue;
      }
    }

    coin.rotation.y += dt * 2.2;
    placeCoinOnRoad(coin);

    coin.getWorldPosition(_tmpCoin);
    var dx = _tmpCoin.x - car.position.x;
    var dz = _tmpCoin.z - car.position.z;
    if (Math.abs(dx) < 2.4 && Math.abs(dz) < 2.6) {
      coin.visible = false;
      d.active = false;
      d.respawnTimer = 2.0 + Math.random() * 2.0;
      G.coins++;
      G.combo++;
      G.comboTimer = 2.0;
      var pts = Math.round(10 * Math.max(1, G.combo) * (typeof G._scoreMul === 'number' ? G._scoreMul : 1));
      G.score += pts;
      showPopup('💰 +' + pts + (G.combo > 1 ? ' x' + G.combo : ''));
      Sound.blip(1100 + G.combo * 60, 0.08);
      document.getElementById('coinVal').textContent = G.coins;
      continue;
    }

    if (d.zWorld < car.position.z - 30) {
      d.active = false;
      coin.visible = false;
      d.respawnTimer = 2.0 + Math.random() * 2.0;
    }
  }
  if (G.comboTimer > 0) {
    G.comboTimer -= dt;
    if (G.comboTimer <= 0) G.combo = 0;
  }
};
// ═══════════════════════════════════════════════════════════
// TRACK THEME SYSTEM — City / Jungle / Highway in one game
// Appended module. Overrides environment + roadside props per
// selected theme. Themed via G.track (string id).
// ═══════════════════════════════════════════════════════════
var TRACKS = {
  highway: {
    label: 'HIGHWAY',
    ground: 0x3f5a2c, hill: 0x2e4a24, fog: 0xa8c8e8, sky: 0xa8c8e8,
    curbA: 0xc0392b, curbB: 0xf0f0f0, grass: 0x4a6a38,
    prop: 'highway'
  },
  city: {
    label: 'CITY',
    ground: 0x2a2d34, hill: 0x1c1f26, fog: 0x8a93a6, sky: 0x9aa6bc,
    curbA: 0xffcc00, curbB: 0x2a2d34, grass: 0x33363d,
    prop: 'city'
  },
  jungle: {
    label: 'JUNGLE',
    ground: 0x2f4a1f, hill: 0x1f3414, fog: 0x6f8a4a, sky: 0x7fa05a,
    curbA: 0x8a6b1e, curbB: 0xd8d2b0, grass: 0x3c5a28,
    prop: 'jungle'
  }
};

G.track = 'highway';

function trackLabel() {
  var t = TRACKS[G.track] || TRACKS.highway;
  return t.label;
}

// Theme prop builders -------------------------------------------------------
function makeCityBuilding(side) {
  var g = new THREE.Group();
  var h = 6 + Math.random() * 22;
  var w = 4 + Math.random() * 4;
  var d = 4 + Math.random() * 4;
  var palette = [0x2a2f3a, 0x323845, 0x3a2f3a, 0x2f3a3f, 0x40474f];
  var col = palette[Math.floor(Math.random() * palette.length)];
  var bodyMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, metalness: 0.15 });
  var body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
  body.position.y = h / 2;
  g.add(body);
  // neon window strips
  var neonCols = [0x26c6b5, 0xff5a3c, 0xffd23b, 0x8a7bff];
  var ncol = neonCols[Math.floor(Math.random() * neonCols.length)];
  var winMat = new THREE.MeshStandardMaterial({ color: ncol, emissive: ncol, emissiveIntensity: 1.4, roughness: 0.4 });
  var rows = Math.max(2, Math.floor(h / 3));
  for (var r = 1; r < rows; r++) {
    var strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.18, 0.05), winMat);
    strip.position.set(0, r * (h / rows), d / 2 + 0.03);
    g.add(strip);
  }
  return g;
}

function makeJungleTree(side) {
  var g = new THREE.Group();
  var s = 0.9 + Math.random() * 1.1;
  var trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3218, roughness: 1 });
  var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.4 * s, 4 * s, 6), trunkMat);
  trunk.position.y = 2 * s;
  g.add(trunk);
  var leafCols = [0x1f6a1f, 0x2a7d2a, 0x145a14, 0x2f8a2f];
  var leafMat = new THREE.MeshStandardMaterial({ color: leafCols[Math.floor(Math.random() * leafCols.length)], roughness: 1 });
  for (var i = 0; i < 4; i++) {
    var cone = new THREE.Mesh(new THREE.ConeGeometry((2.2 - i * 0.4) * s, 2.4 * s, 7), leafMat);
    cone.position.y = (3.5 + i * 1.3) * s;
    g.add(cone);
  }
  return g;
}

function makeRock(side) {
  var g = new THREE.Group();
  var mat = new THREE.MeshStandardMaterial({ color: 0x555a50, roughness: 1 });
  var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + Math.random() * 1.5, 0), mat);
  rock.position.y = 0.6;
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  g.add(rock);
  return g;
}

// Override roadside props based on active theme ----------------------------
addRoadsideProps = function (seg) {
  var segLen = SEGMENT_LENGTH;
  var theme = TRACKS[G.track] || TRACKS.highway;
  var kind = theme.prop;

  if (kind === 'city') {
    // Dense buildings both sides
    if (seg.userData.index % 1 === 0) {
      for (var s = -1; s <= 1; s += 2) {
        var b = makeCityBuilding(s);
        b.position.set(s * (ROAD_WIDTH / 2 + 6 + Math.random() * 6), 0, -segLen * (0.25 + Math.random() * 0.6));
        seg.add(b);
      }
    }
    if (seg.userData.index % 2 === 0) {
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        var lamp = makeStreetLamp(s2);
        lamp.position.set(s2 * (ROAD_WIDTH / 2 + 2.5), 0, -segLen * Math.random());
        seg.add(lamp);
      }
    }
    if (seg.userData.index % 3 === 0) {
      for (var s3 = -1; s3 <= 1; s3 += 2) {
        var bar = makeBarrier();
        bar.position.set(s3 * (ROAD_WIDTH / 2 + 1.4), 0, -segLen / 2);
        seg.add(bar);
      }
    }
  } else if (kind === 'jungle') {
    // Thick foliage, trees + rocks, no lamps
    var treeCount = 3 + Math.floor(Math.random() * 3);
    for (var i = 0; i < treeCount; i++) {
      var side = Math.random() < 0.5 ? -1 : 1;
      var t = makeJungleTree(side);
      t.position.set(side * (ROAD_WIDTH / 2 + 6 + Math.random() * 14), 0, -segLen * Math.random());
      seg.add(t);
    }
    if (Math.random() < 0.7) {
      var side2 = Math.random() < 0.5 ? -1 : 1;
      var rk = makeRock(side2);
      rk.position.set(side2 * (ROAD_WIDTH / 2 + 3 + Math.random() * 5), 0, -segLen * Math.random());
      seg.add(rk);
    }
    if (seg.userData.index % 4 === 0) {
      for (var s4 = -1; s4 <= 1; s4 += 2) {
        var bar2 = makeBarrier();
        bar2.position.set(s4 * (ROAD_WIDTH / 2 + 1.2), 0, -segLen / 2);
        seg.add(bar2);
      }
    }
  } else {
    // Highway: original mix
    if (seg.userData.index % 2 === 0) {
      for (var sh = -1; sh <= 1; sh += 2) {
        var lamp2 = makeStreetLamp(sh);
        lamp2.position.set(sh * (ROAD_WIDTH / 2 + 3), 0, -segLen * Math.random());
        seg.add(lamp2);
      }
    }
    var tc = 1 + Math.floor(Math.random() * 2);
    for (var j = 0; j < tc; j++) {
      var sd = Math.random() < 0.5 ? -1 : 1;
      var tt = makeTree();
      tt.position.set(sd * (ROAD_WIDTH / 2 + 8 + Math.random() * 16), 0, -segLen * Math.random());
      tt.scale.setScalar(0.8 + Math.random() * 0.6);
      seg.add(tt);
    }
    if (seg.userData.index % 3 === 0) {
      for (var s5 = -1; s5 <= 1; s5 += 2) {
        var bar3 = makeBarrier();
        bar3.position.set(s5 * (ROAD_WIDTH / 2 + 1.6), 0, -segLen / 2);
        seg.add(bar3);
      }
    }
  }
};

// Apply theme colours to ground / hills / fog / curbs ----------------------
function applyTrackColors() {
  var theme = TRACKS[G.track] || TRACKS.highway;
  if (G.ground && G.ground.material) G.ground.material.color.setHex(theme.ground);
  for (var i = 0; i < G.hills.length; i++) {
    if (G.hills[i].material) G.hills[i].material.color.setHex(theme.hill);
  }
  // Curb & grass shared materials
  if (SHARED.curbA) SHARED.curbA.color.setHex(theme.curbA);
  if (SHARED.curbB) SHARED.curbB.color.setHex(theme.curbB);
  if (SHARED.grass) SHARED.grass.color.setHex(theme.grass);
  // Immediate fog/sky tint (day/night cycle still overrides gradually)
  if (scene && scene.fog) scene.fog.color.setHex(theme.fog);
  if (renderer) renderer.setClearColor(theme.fog, 1);
  if (skyMat) skyMat.color.setHex(theme.fog);
}

// Rebuild every existing road segment's props for the new theme ------------
function rebuildAllSegmentProps() {
  for (var i = 0; i < roadSegments.length; i++) {
    var seg = roadSegments[i];
    // remove only prop children (keep road/curb/grass). We tag road core meshes.
    for (var ci = seg.children.length - 1; ci >= 0; ci--) {
      var child = seg.children[ci];
      if (child.userData && child.userData.core) continue;
      if (child.isAICar || child.isCoin) continue;
      seg.remove(child);
    }
    addRoadsideProps(seg);
  }
}

// Tag core segment meshes so rebuild keeps them. Patch spawnRoadSegment once.
(function tagCores() {
  var _origSpawn = spawnRoadSegment;
  spawnRoadSegment = function (index) {
    var before = roadSegments.length;
    _origSpawn(index);
    var seg = roadSegments[roadSegments.length - 1];
    if (seg && roadSegments.length > before) {
      for (var ci = 0; ci < seg.children.length; ci++) {
        var c = seg.children[ci];
        // road/curb/grass are the first meshes added before props; mark the
        // first 1 + 10 + 2 meshes as core. Simpler: mark by geometry match.
        if (c.material === SHARED.road || c.material === SHARED.curbA || c.material === SHARED.curbB || c.material === SHARED.grass) {
          c.userData.core = true;
        }
      }
    }
  };
})();

function setTrack(id) {
  if (!TRACKS[id]) id = 'highway';
  G.track = id;
  try { localStorage.setItem('apexTrack', id); } catch (e) {}
  applyTrackColors();
  rebuildAllSegmentProps();
  var tag = document.getElementById('trackTag');
  if (tag) tag.textContent = 'APEX ' + TRACKS[id].label;
}

// Wire track-card UI + persistence -----------------------------------------
(function initTrackUI() {
  var saved = 'highway';
  try { saved = localStorage.getItem('apexTrack') || 'highway'; } catch (e) {}
  if (!TRACKS[saved]) saved = 'highway';
  G.track = saved;

  var grid = document.getElementById('trackGrid');
  if (grid) {
    var cards = grid.querySelectorAll('.track-card');
    function refresh() {
      for (var i = 0; i < cards.length; i++) {
        cards[i].classList.toggle('active', cards[i].getAttribute('data-track') === G.track);
      }
    }
    for (var i = 0; i < cards.length; i++) {
      cards[i].addEventListener('click', function () {
        setTrack(this.getAttribute('data-track'));
        refresh();
      });
    }
    refresh();
  }

  // Apply saved theme once at boot (after init already built default env)
  applyTrackColors();
  var tag = document.getElementById('trackTag');
  if (tag) tag.textContent = 'APEX ' + (TRACKS[G.track] ? TRACKS[G.track].label : 'HIGHWAY');
})();
// ─────────────────────────────────────────────────────────
// TRACK FIX: robust prop rebuild (preserves road/curb/grass
// by material reference, regardless of core tags) + safer
// setTrack that also re-tints after restart.
// ─────────────────────────────────────────────────────────
rebuildAllSegmentProps = function () {
  for (var i = 0; i < roadSegments.length; i++) {
    var seg = roadSegments[i];
    for (var ci = seg.children.length - 1; ci >= 0; ci--) {
      var child = seg.children[ci];
      if (!child || !child.material) continue;
      if (child.material === SHARED.road ||
          child.material === SHARED.curbA ||
          child.material === SHARED.curbB ||
          child.material === SHARED.grass) {
        continue; // keep road infrastructure
      }
      if (child.isAICar || child.isCoin) continue;
      seg.remove(child);
    }
    addRoadsideProps(seg);
  }
};

setTrack = function (id) {
  if (!TRACKS[id]) id = 'highway';
  G.track = id;
  try { localStorage.setItem('apexTrack', id); } catch (e) {}
  applyTrackColors();
  rebuildAllSegmentProps();
  var tag = document.getElementById('trackTag');
  if (tag) tag.textContent = 'APEX ' + TRACKS[id].label;
  var cards = document.querySelectorAll('.track-card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].classList.toggle('active', cards[i].getAttribute('data-track') === id);
  }
};
// ─────────────────────────────────────────────────────────
// TRACK FIX: ensure the selected track's props rebuild on
// every race start (initial segments were built with the
// default theme before the user picked one).
// ─────────────────────────────────────────────────────────
(function () {
  var _origStartGame = startGame;
  startGame = function () {
    try { rebuildAllSegmentProps(); } catch (e) {}
    try { applyTrackColors(); } catch (e) {}
    return _origStartGame.apply(this, arguments);
  };
  var _origRestart = (typeof restartGame === 'function') ? restartGame : null;
})();
// ─────────────────────────────────────────────────────────
// TRACK FIX: rebind start/restart buttons to the wrapped
// startGame (line 127 captured the original reference).
// ─────────────────────────────────────────────────────────
(function rebindStartButtons() {
  var sb = document.getElementById('startBtn');
  if (sb) sb.onclick = startGame;
  var rb = document.getElementById('restartBtn');
  if (rb) rb.onclick = restartGame;
})();
// ─────────────────────────────────────────────────────────
// TRACK FIX (final): after ALL scripts load, rebuild props
// for the persisted track so a saved selection renders its
// themed environment on reload (not just colours).
// ─────────────────────────────────────────────────────────
(function bootTrackRebuild() {
  function run() {
    try {
      if (typeof G !== 'undefined' && TRACKS[G.track]) {
        rebuildAllSegmentProps();
        applyTrackColors();
        var tag = document.getElementById('trackTag');
        if (tag) tag.textContent = 'APEX ' + TRACKS[G.track].label;
      }
    } catch (e) {}
  }
  if (document.readyState === 'complete') setTimeout(run, 60);
  else window.addEventListener('load', function () { setTimeout(run, 60); });
})();