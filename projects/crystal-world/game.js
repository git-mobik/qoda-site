import * as THREE from './node_modules/three/build/three.module.js';

const $ = id => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfe0d4');
scene.fog = new THREE.Fog('#cfe0d4', 48, 125);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .1, 220);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({antialias: true});
} catch {
  $('error').hidden = false;
  $('error').textContent = 'This game needs WebGL. Please open it in Chrome or Edge with hardware acceleration enabled.';
  throw new Error('WebGL unavailable');
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
$('scene').appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight('#eefbdc', '#477b71', 2.6));
const sun = new THREE.DirectionalLight('#fff0c4', 3.2);
sun.position.set(-18, 35, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left:-38, right:38, top:38, bottom:-38, near:1, far:95});
sun.shadow.bias = -.0005;
sun.shadow.normalBias = .025;
scene.add(sun);

/* ---------- Visual upgrade: gradient sky, sun glow, crystal reflections ---------- */
function makeSkyTexture() {
  const canvas=document.createElement('canvas');canvas.width=2;canvas.height=256;
  const ctx=canvas.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,0,256);
  gradient.addColorStop(0,'#4b93bd');
  gradient.addColorStop(.45,'#8ec4c6');
  gradient.addColorStop(1,'#eef3dc');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,2,256);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
function makeGlowTexture() {
  const size=128,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');
  const gradient=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  gradient.addColorStop(0,'rgba(255,255,255,1)');
  gradient.addColorStop(.35,'rgba(255,255,255,.45)');
  gradient.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,size,size);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
const skyTexture=makeSkyTexture(),glowTexture=makeGlowTexture();
const skyDome=new THREE.Mesh(new THREE.SphereGeometry(190,32,16),new THREE.MeshBasicMaterial({map:skyTexture,side:THREE.BackSide,fog:false,depthWrite:false}));
skyDome.renderOrder=-1;skyDome.castShadow=skyDome.receiveShadow=false;scene.add(skyDome);
const sunDir=new THREE.Vector3(-18,35,12).normalize();
const sunSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color:'#fff3c8',transparent:true,opacity:.7,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
sunSprite.position.copy(sunDir).multiplyScalar(150);sunSprite.scale.setScalar(60);scene.add(sunSprite);
const environment=(()=>{
  try {
    const pmrem=new THREE.PMREMGenerator(renderer);
    const envScene=new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50,32,16),new THREE.MeshBasicMaterial({map:skyTexture,side:THREE.BackSide})));
    const envSun=new THREE.Mesh(new THREE.SphereGeometry(6,16,16),new THREE.MeshBasicMaterial({color:'#fff6da'}));
    envSun.position.copy(sunDir).multiplyScalar(38);envScene.add(envSun);
    const target=pmrem.fromScene(envScene,.04);
    pmrem.dispose();
    return target.texture;
  } catch { return null; }
})();

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness:.85, ...extra});
const palette = {grass:mat('#82ac60'), stone:mat('#728e7c'), cliff:mat('#59776a'), trunk:mat('#82674a'), leaf:mat('#467a53'), leafLight:mat('#6d9959'), path:mat('#c9be90'), gold:mat('#e7bc6a'), cream:mat('#f4e8c8'), dark:mat('#244a45'), crystal:mat('#b1fff1', {emissive:'#4fddc5', emissiveIntensity:.75, metalness:.35, roughness:.12, envMap:environment, envMapIntensity:1.1})};
const world = new THREE.Group(); scene.add(world);
let buildTarget = scene;
function mesh(geometry, material, x=0, y=0, z=0, parent=buildTarget) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x,y,z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
function sphere(radius, material, x,y,z, parent=buildTarget, detail=1) {
  return mesh(new THREE.IcosahedronGeometry(radius, detail), material,x,y,z,parent);
}
const params=new URLSearchParams(location.search);
const seedParam=params.get('seed');
let baseSeed = seedParam!==null && seedParam!=='' ? (Number(seedParam)>>>0) : (Math.random()*4294967296)>>>0;
const LEVEL_CONFIG=[
  {name:'First Light', crystals:6, enemies:3, enemySpeed:1.8, bossHp:3},
  {name:'Warden Ridge', crystals:7, enemies:4, enemySpeed:2.1, bossHp:4},
  {name:'Skyfall Reach', crystals:8, enemies:5, enemySpeed:2.4, bossHp:5},
  {name:'Storm Crown', crystals:8, enemies:6, enemySpeed:2.8, bossHp:6},
  {name:'Aether Core', crystals:8, enemies:7, enemySpeed:3.2, bossHp:7}
];
let levelConfig=LEVEL_CONFIG[0];
let seed=baseSeed;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
const colliders=[];
const crystalPositions = [[-8,5],[7,5],[-17,-1],[16,-3],[-12,-13],[10,-14],[-3,-21],[20,10]];
function clearSpot(x,z) {
  return Math.hypot(x,z-15)<5 || Math.abs(x)<4 && z<15 || crystalPositions.some(([cx,cz])=>Math.hypot(x-cx,z-cz)<3.2) || Math.hypot(x,z+14)<5;
}
let motes, pollen, guide;
function buildWorld(level=1) {
  world.traverse(object=>{ if(object.geometry) object.geometry.dispose(); });
  while(world.children.length) world.remove(world.children[0]);
  colliders.length=0;
  seed=(baseSeed + level*1013904223) >>> 0;
  buildTarget=world;
  const island = mesh(new THREE.CylinderGeometry(29, 27, 2, 64), palette.grass,0,-1,0);
  mesh(new THREE.CylinderGeometry(27.1,19,7,16),palette.cliff,0,-5.5,0);
  mesh(new THREE.ConeGeometry(19,13,12),palette.stone,0,-15.5,0).rotation.z=Math.PI;
  for(let i=0;i<54;i++) {
    const x=(random()-.5)*54,z=(random()-.5)*54;
    if(Math.hypot(x,z)>26 || clearSpot(x,z)) continue;
    const height=2.4+random()*2.4;
    const tree=new THREE.Group();tree.position.set(x,0,z);world.add(tree);
    mesh(new THREE.CylinderGeometry(.18,.3,height,7),palette.trunk,0,height/2,0,tree);
    const canopy=sphere(1.8,palette.leaf,0,height+.7,0,tree);canopy.scale.set(1,1.2,1);
    sphere(1.4,palette.leafLight,.6,height+1.3,.2,tree);
    colliders.push({x,z,radius:.7});
  }
  for(let i=0;i<35;i++) {
    const a=random()*Math.PI*2,r=9+random()*17,x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(clearSpot(x,z)) continue;
    const size=.45+random()*.9;
    const rock=sphere(size,palette.stone,x,size*.4,z);rock.scale.set(1.2,.7,1);
    colliders.push({x,z,radius:size+.2});
  }
  const grassMaterial=mat('#629551');
  const flowerMaterials=[mat('#ffe5a0'),mat('#eee9d4'),mat('#dab8c3')];
  for(let i=0;i<400;i++) {
    const x=(random()-.5)*55,z=(random()-.5)*55;
    if(Math.hypot(x,z)>27 || Math.abs(x)<2 && z<16) continue;
    if(i%4===0) {
      const flower=mesh(new THREE.ConeGeometry(.12,.5,3),grassMaterial,x,.25,z);
      sphere(.14,flowerMaterials[i%3],x,.52,z,world,0);
      flower.rotation.y=random()*6;
    } else {
      const tuft=mesh(new THREE.ConeGeometry(.18,.4+random()*.3,3),grassMaterial,x,.22,z);
      tuft.rotation.y=random()*6;tuft.castShadow=false;
    }
  }
  for(let z=14;z>-15;z-=2) {
    const stone=mesh(new THREE.CylinderGeometry(.85,.9,.08,6),palette.path,Math.sin(z)*.35,.045,z);
    stone.scale.z=.7;stone.rotation.y=z;
  }
  for(let i=0;i<24;i++) {
    const angle=i/24*Math.PI*2;
    const cloud=new THREE.Group();cloud.position.set(Math.cos(angle)*(40+random()*25),-8-random()*8,Math.sin(angle)*(40+random()*25));world.add(cloud);
    const cloudMat=mat('#eff4dc');
    for(let j=0;j<4;j++) {
      const puff=sphere(2+random()*3,cloudMat,j*3,random(),random()*2,cloud);puff.scale.y=.4;puff.castShadow=false;
    }
  }
  for(let i=0;i<7;i++) {
    const a=i*Math.PI*2/7;
    mesh(new THREE.CylinderGeometry(5,3,2,7),palette.grass,Math.cos(a)*65,-3,Math.sin(a)*65);
    const bottom=mesh(new THREE.ConeGeometry(4,11,6),palette.cliff,Math.cos(a)*65,-9,Math.sin(a)*65);bottom.rotation.z=Math.PI;
  }

  const lanternMaterial=mat('#ffdea0',{emissive:'#ffb95e',emissiveIntensity:1.8});
  for(const [x,z] of [[-4,13],[4,13],[-4,-10],[4,-10]]) {
    mesh(new THREE.CylinderGeometry(.12,.18,1.8,8),palette.trunk,x,.9,z);
    mesh(new THREE.BoxGeometry(.45,.6,.45),lanternMaterial,x,1.9,z);
    mesh(new THREE.ConeGeometry(.42,.3,4),palette.dark,x,2.35,z).rotation.y=Math.PI/4;
  }
  for(const [x,z] of [[-20,9],[19,-12]]) {
    const ruin=new THREE.Group();ruin.position.set(x,0,z);world.add(ruin);
    for(const offset of [-1.3,1.3]) {
      mesh(new THREE.CylinderGeometry(.55,.7,.25,8),palette.path,offset,.125,0,ruin);
      mesh(new THREE.CylinderGeometry(.32,.4,2.6,8),palette.stone,offset,1.55,0,ruin);
      colliders.push({x:x+offset,z,radius:.5});
    }
    mesh(new THREE.BoxGeometry(3.6,.5,.9),palette.path,0,3.05,0,ruin).rotation.z=.08;
  }
  for(let i=0;i<36;i++) {
    const angle=i*Math.PI*2/36;
    mesh(new THREE.BoxGeometry(.45,.5,.8),palette.path,Math.cos(angle)*28.1,.25,Math.sin(angle)*28.1).rotation.y=-angle;
  }
  const motesGeometry=new THREE.BufferGeometry();
  const motePositions=new Float32Array(90*3);
  for(let i=0;i<90;i++) {
    const angle=random()*Math.PI*2,radius=random()*26;
    motePositions.set([Math.cos(angle)*radius,.8+random()*4,Math.sin(angle)*radius],i*3);
  }
  motesGeometry.setAttribute('position',new THREE.BufferAttribute(motePositions,3));
  motes=new THREE.Points(motesGeometry,new THREE.PointsMaterial({color:'#fff3b5',size:.09,transparent:true,opacity:.7,depthWrite:false}));world.add(motes);
  const pollenPositions=new Float32Array(140*3);
  for(let i=0;i<140;i++) {
    const angle=random()*Math.PI*2,radius=4+random()*26;
    pollenPositions.set([Math.cos(angle)*radius,.6+random()*5.5,Math.sin(angle)*radius],i*3);
  }
  const pollenGeometry=new THREE.BufferGeometry();
  pollenGeometry.setAttribute('position',new THREE.BufferAttribute(pollenPositions,3));
  pollen=new THREE.Points(pollenGeometry,new THREE.PointsMaterial({map:glowTexture,color:'#fff0b0',size:.5,transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:true}));
  world.add(pollen);
  guide=mesh(new THREE.CylinderGeometry(.16,.16,10,8),new THREE.MeshBasicMaterial({color:'#baffdc',transparent:true,opacity:.2,depthWrite:false}),0,5,0);
  guide.castShadow=guide.receiveShadow=false;
  buildTarget=scene;
}
buildWorld();

const portal=new THREE.Group();portal.position.set(0,0,-14);scene.add(portal);
mesh(new THREE.CylinderGeometry(3.4,3.8,.5,12),palette.path,0,.25,0,portal);
for(const x of [-2.3,2.3]) {
  mesh(new THREE.BoxGeometry(.85,4.8,.85),palette.stone,x,2.65,0,portal);
  mesh(new THREE.BoxGeometry(1.05,.22,1.05),palette.gold,x,4.8,0,portal);
}
mesh(new THREE.BoxGeometry(5.5,.8,1),palette.stone,0,5.35,0,portal);
const portalRing=mesh(new THREE.TorusGeometry(1.9,.12,8,48),palette.gold,0,2.8,.1,portal);
const portalSurface=mesh(new THREE.CircleGeometry(1.75,48),new THREE.MeshBasicMaterial({color:'#77f2dc',transparent:true,opacity:.15,side:THREE.DoubleSide}),0,2.8,.12,portal);
const portalLight=new THREE.PointLight('#7af3e6',0,12);portalLight.position.set(0,2,-14);scene.add(portalLight);
let crystals=[];
function buildCrystals() {
  for(const crystal of crystals) {crystal.group.traverse(object=>{ if(object.geometry) object.geometry.dispose(); });scene.remove(crystal.group);}
  crystals=crystalPositions.slice(0,Math.min(levelConfig.crystals,crystalPositions.length)).map(([x,z],index)=>{
    const group=new THREE.Group();group.position.set(x,0,z);scene.add(group);
    mesh(new THREE.CylinderGeometry(.75,.95,.3,6),palette.stone,0,.15,0,group);
    const gem=mesh(new THREE.OctahedronGeometry(.58),palette.crystal,0,1.35,0,group);gem.scale.y=1.5;
    const ring=mesh(new THREE.TorusGeometry(.75,.035,5,32),palette.gold,0,.7,0,group);ring.rotation.x=Math.PI/2;
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color:'#8ffbe4',transparent:true,opacity:.45,depthWrite:false,blending:THREE.AdditiveBlending}));
    glow.position.set(0,1.35,0);glow.scale.setScalar(2.6);group.add(glow);
    return {group,gem,ring,glow,x,z,collected:false,index};
  });
}
buildCrystals();
const crystalLight=new THREE.PointLight('#7ff3dd',0,9);crystalLight.position.set(0,1.6,15);scene.add(crystalLight);
const avatar=new THREE.Group();scene.add(avatar);
const coat=mat('#e9aa57'), pants=mat('#274e49'), skin=mat('#f0d2a4');
mesh(new THREE.CapsuleGeometry(.32,.45,4,8),coat,0,.95,0,avatar);
const head=sphere(.28,skin,0,1.62,0,avatar);
mesh(new THREE.CylinderGeometry(.36,.36,.15,12),palette.cream,0,1.85,0,avatar);
mesh(new THREE.CylinderGeometry(.48,.48,.045,16),palette.cream,0,1.78,0,avatar);
mesh(new THREE.BoxGeometry(.45,.5,.25),pants,0,1,-.32,avatar);
const limbs=[];
for(const side of [-1,1]) {
  const leg=mesh(new THREE.CapsuleGeometry(.11,.32,3,6),pants,side*.17,.35,0,avatar);
  const arm=mesh(new THREE.CapsuleGeometry(.1,.3,3,6),coat,side*.42,1,0,avatar);
  limbs.push(leg,arm);
}
for(const x of [-.1,.1]) sphere(.035,palette.dark,x,1.63,.255,avatar,0);
const playerShadow=mesh(new THREE.CircleGeometry(.58,24),new THREE.MeshBasicMaterial({color:'#274c3c',transparent:true,opacity:.2,depthWrite:false}),0,.012,15);playerShadow.rotation.x=-Math.PI/2;playerShadow.castShadow=false;
let enemies=[];
const enemySpawns=[[-8,-6],[12,0],[4,-19],[-16,8],[20,-4],[-6,-22],[14,16],[-20,-14]];
function buildEnemies() {
  for(const enemy of enemies) {enemy.group.traverse(object=>{ if(object.geometry) object.geometry.dispose(); });scene.remove(enemy.group);}
  enemies=enemySpawns.slice(0,Math.min(levelConfig.enemies,enemySpawns.length)).map(([x,z],index)=>{
    const group=new THREE.Group();scene.add(group);
    sphere(.68,mat('#9b7068'),0,.85,0,group);
    const eye=mesh(new THREE.BoxGeometry(.65,.12,.13),mat('#ff947a',{emissive:'#ff6345',emissiveIntensity:1}),0,.95,.6,group);
    const halo=mesh(new THREE.TorusGeometry(.85,.045,5,24),palette.gold,0,.7,0,group);halo.rotation.x=Math.PI/2;
    const warning=mesh(new THREE.RingGeometry(1.1,1.2,32),new THREE.MeshBasicMaterial({color:'#ffad8b',transparent:true,opacity:.5,side:THREE.DoubleSide}),0,.02,0,group);
    warning.rotation.x=-Math.PI/2;warning.visible=false;warning.castShadow=false;
    group.position.set(x+Math.cos(index*2)*2.2,.15,z+Math.sin(index*2)*2.2);
    return {group,x,z,index,eye,warning,chasing:false,stunned:0,speed:levelConfig.enemySpeed};
  });
}
buildEnemies();
const particles=[];
const particleGeometry=new THREE.IcosahedronGeometry(.08,0);
function burst(x,y,z,color) {
  const material=new THREE.MeshBasicMaterial({color});
  for(let i=0;i<18;i++) {
    const object=mesh(particleGeometry,material,x,y,z);
    particles.push({object,velocity:new THREE.Vector3((random()-.5)*5,random()*4+1,(random()-.5)*5),life:.9});
  }
}

export const game={state:'menu',x:0,y:0,z:15,vy:0,health:100,collected:0,elapsed:0,lastHit:0,invulnerable:3,yaw:0,moving:false,dashTime:0,dashCooldown:0,dashX:0,dashZ:-1,threats:0,pulseCooldown:0,pulseTime:0,shieldTime:0,speedTime:0,magnetTime:0,bossHp:0,bossActive:false,bossDefeated:false,level:1,crystalTotal:6,totalTime:0};
const keys=new Set();
let jumpQueued=false,dashQueued=false,pulseQueued=false,toastUntil=0,audio=null,sound=false,dragging=false,lastMouse=0,spawnTimer=8,bossState=null;
const powerups=[];
const pulseRings=[];
const powerupDefs={
  shield:{color:'#8fd0ff',emissive:'#4aa8ff',duration:5,label:'SHIELD'},
  speed:{color:'#ffe08a',emissive:'#ffb14a',duration:6,label:'SPEED'},
  magnet:{color:'#ff9ce0',emissive:'#ff5ec4',duration:6,label:'MAGNET'}
};
function spawnPowerup() {
  const types=Object.keys(powerupDefs),type=types[Math.floor(random()*types.length)],def=powerupDefs[type];
  let x=0,z=0,tries=0;
  do {x=(random()-.5)*42;z=(random()-.5)*42;tries++;}
  while(tries<40 && (Math.hypot(x,z)>25 || clearSpot(x,z)));
  const group=new THREE.Group();group.position.set(x,0,z);scene.add(group);
  const core=mesh(new THREE.IcosahedronGeometry(.5,0),mat(def.color,{emissive:def.emissive,emissiveIntensity:1.1,roughness:.25}),0,1.15,0,group);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color:def.color,transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending}));
  glow.position.y=1.15;glow.scale.setScalar(2.4);group.add(glow);
  powerups.push({group,core,glow,type,x,z,age:0});
}
function clearPowerups() {
  for(const powerup of powerups) scene.remove(powerup.group);
  powerups.length=0;
}
function activatePowerup(powerup) {
  const def=powerupDefs[powerup.type];
  if(powerup.type==='shield') game.shieldTime=def.duration;
  else if(powerup.type==='speed') game.speedTime=def.duration;
  else game.magnetTime=def.duration;
  burst(powerup.x,1.15,powerup.z,def.color);tone(700,.16);
  toast(`${def.label} activated!`);
}
function clearPulseRings() {
  for(const pulse of pulseRings) scene.remove(pulse.ring);
  pulseRings.length=0;
}
function spawnPulseRing(x,y,z) {
  const ring=mesh(new THREE.RingGeometry(.6,.85,48),new THREE.MeshBasicMaterial({color:'#a9fff0',transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false}),x,y,z);
  ring.rotation.x=-Math.PI/2;ring.castShadow=ring.receiveShadow=false;
  pulseRings.push({ring,life:.55,max:.55});
}
function spawnBoss() {
  const group=new THREE.Group();group.position.set(0,0,-6);scene.add(group);
  const core=sphere(1.5,mat('#7a5a52',{emissive:'#3a1f1a',emissiveIntensity:.4}),0,1.8,0,group);
  const eye=mesh(new THREE.BoxGeometry(1.5,.32,.3),mat('#ff6a4a',{emissive:'#ff3b1a',emissiveIntensity:1.4}),0,2,.2,group);
  const halo=mesh(new THREE.TorusGeometry(1.9,.09,6,32),palette.gold,0,1.4,0,group);halo.rotation.x=Math.PI/2;
  const warning=mesh(new THREE.RingGeometry(2.2,2.4,40),new THREE.MeshBasicMaterial({color:'#ffad8b',transparent:true,opacity:.5,side:THREE.DoubleSide}),0,.02,0,group);
  warning.rotation.x=-Math.PI/2;warning.visible=false;warning.castShadow=false;
  bossState={group,core,eye,warning,hp:levelConfig.bossHp,maxHp:levelConfig.bossHp,stunned:0,time:0};
  game.bossHp=levelConfig.bossHp;game.bossActive=true;game.bossDefeated=false;
  $('boss').classList.add('visible');
  tone(120,.6);
  toast('The Island Guardian awakens! Press R to pulse its ward away.');
}
function defeatBoss() {
  const position=bossState.group.position;
  burst(position.x,2,position.z,'#ffe6a0');tone(880,.5);
  scene.remove(bossState.group);
  bossState=null;game.bossActive=false;game.bossDefeated=true;game.bossHp=0;
  $('boss').classList.remove('visible');
  toast('Guardian defeated! The gateway is open. Return to the portal.');
}
function removeBoss() {
  if(!bossState) return;
  scene.remove(bossState.group);
  bossState=null;game.bossActive=false;game.bossHp=0;
  $('boss').classList.remove('visible');
}
function tone(frequency,duration=.12) {
  if(!sound || !audio) return;
  const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=frequency;
  gain.gain.setValueAtTime(.07,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
  osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);
}
function toast(text) {$('toast').textContent=text;$('toast').classList.add('visible');toastUntil=performance.now()+2600;}
function showOverlay(title,description,button) {
  $('overlay').style.display='flex';document.body.classList.add('menu');
  document.querySelector('.intro h1').innerHTML=title;
  document.querySelector('.intro p').textContent=description;
  $('play').innerHTML=`${button} <span>↗</span>`;
}
export function startLevel(n) {
  game.level=Math.max(1,Math.min(n,LEVEL_CONFIG.length));
  levelConfig=LEVEL_CONFIG[game.level-1];
  buildWorld(game.level);
  buildCrystals();
  buildEnemies();
  clearPowerups();clearPulseRings();removeBoss();
  spawnTimer=8;
  Object.assign(game,{state:'playing',x:0,y:0,z:15,vy:0,health:100,collected:0,elapsed:0,lastHit:0,invulnerable:3,yaw:0,moving:false,dashTime:0,dashCooldown:0,dashX:0,dashZ:-1,threats:0,pulseCooldown:0,pulseTime:0,shieldTime:0,speedTime:0,magnetTime:0,bossHp:0,bossActive:false,bossDefeated:false,crystalTotal:crystals.length,totalTime:game.level===1?0:(game.totalTime||0)});
  for(const crystal of crystals) {crystal.collected=false;crystal.gem.visible=crystal.ring.visible=crystal.glow.visible=true;}
  for(const enemy of enemies) {
    enemy.chasing=false;enemy.warning.visible=false;enemy.stunned=0;
    enemy.group.position.set(enemy.x+Math.cos(enemy.index*2)*2.2,.15,enemy.z+Math.sin(enemy.index*2)*2.2);
  }
  for(const particle of particles) scene.remove(particle.object);
  particles.length=0;keys.clear();jumpQueued=dashQueued=pulseQueued=false;
  avatar.visible=true;avatar.rotation.set(0,Math.PI,0);camera.position.set(0,11,30);
  $('overlay').style.display='none';document.body.classList.remove('menu');
  toast(`Level ${game.level} - ${levelConfig.name}: collect the glowing crystals. Watch out for sentinels!`);updateHud();
}
export function reset() {startLevel(game.level);}
export function nextLevel() {startLevel(game.level+1);}
function advanceLevel() {
  game.state='won';tone(880,.5);burst(0,3,-14,'#e5ffc1');
  game.totalTime=(game.totalTime||0)+game.elapsed;
  if(game.level<LEVEL_CONFIG.length) {
    showOverlay('Level cleared!<br><em>Onward.</em>',`${levelConfig.name} restored in ${Math.floor(game.elapsed/60)}m ${Math.floor(game.elapsed%60)}s. A new island awaits - press for level ${game.level+1}.`,'Next level');
  } else {
    showOverlay('You found<br><em>your way.</em>',`All ${LEVEL_CONFIG.length} islands restored in ${Math.floor(game.totalTime/60)}m ${Math.floor(game.totalTime%60)}s. Thank you, explorer.`,'Play again');
  }
}
function primaryAction() {
  if(game.state==='paused') {pause();return;}
  if(game.state==='won' && game.level<LEVEL_CONFIG.length) {nextLevel();return;}
  if(game.state==='won') {startLevel(1);return;}
  reset();
}
function updateHud() {
  $('count').textContent=game.collected;$('count-total').textContent=game.crystalTotal;$('level').textContent=game.level;$('progress').style.width=`${game.collected/game.crystalTotal*100}%`;
  $('health-value').textContent=`${Math.ceil(game.health)} / 100`;
  $('health-fill').style.width=`${game.health}%`;
  $('health-bar').setAttribute('aria-valuenow',String(Math.ceil(game.health)));
  $('health-bar').dataset.level=game.health<=25?'low':game.health<=50?'medium':'high';
  const seconds=Math.floor(game.elapsed);$('time').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  $('status').textContent=game.bossActive?'Guardian! Press R to pulse it away.':game.threats>0?'Sentinel approaching! F to dash.':game.health<=25?'Low health! Find a crystal to heal.':game.collected===game.crystalTotal&&game.bossDefeated?'Gateway ready. Follow the glow!':game.collected===game.crystalTotal?'A guardian guards the gateway...':game.health<100&&game.elapsed-game.lastHit>=6?'Recovering health...':'Crystals heal +15 HP.';
  $('dash-fill').style.width=`${(1-game.dashCooldown/3)*100}%`;
  $('dash-state').textContent=game.dashCooldown>0?`${game.dashCooldown.toFixed(1)}s`:'READY';
  $('ability').classList.toggle('ready',game.dashCooldown===0);
  $('pulse-fill').style.width=`${(1-game.pulseCooldown/8)*100}%`;
  $('pulse-state').textContent=game.pulseCooldown>0?`${game.pulseCooldown.toFixed(1)}s`:'READY';
  $('ability2').classList.toggle('ready',game.pulseCooldown===0);
  for(const type of ['shield','speed','magnet']) {
    const remaining=type==='shield'?game.shieldTime:type==='speed'?game.speedTime:game.magnetTime;
    const badge=$('buff-'+type);
    badge.classList.toggle('active',remaining>0);
    badge.querySelector('b').textContent=remaining>0?Math.ceil(remaining)+'s':'';
  }
  if(game.bossActive && bossState) {
    $('boss-fill').style.width=`${Math.max(0,game.bossHp)/bossState.maxHp*100}%`;
    $('boss-name').textContent=`WARD - ${Math.max(0,game.bossHp)} HIT${game.bossHp===1?'':'S'}`;
  }
}
export function pause() {
  if(game.state==='playing') {
    game.state='paused';keys.clear();jumpQueued=dashQueued=pulseQueued=false;showOverlay('Take a<br><em>breather.</em>','Your adventure is waiting. Resume when you are ready.','Resume adventure');
  } else if(game.state==='paused') {
    game.state='playing';$('overlay').style.display='none';document.body.classList.remove('menu');
  }
}
function damage(fall=false) {
  if(game.invulnerable>0 && !fall) return;
  if(game.shieldTime>0 && !fall) {game.shieldTime=0;burst(game.x,game.y+1,game.z,'#8fd0ff');tone(520,.2);toast('Shield absorbed the hit!');updateHud();return;}
  game.health=Math.max(0,game.health-(fall?20:12));game.lastHit=game.elapsed;game.invulnerable=4;burst(game.x,game.y+1,game.z,'#ffc79a');tone(150,.25);
  if(game.health<=0) {
    game.health=0;game.state='lost';showOverlay('A brave<br><em>little run.</em>',`You found ${game.collected} of ${game.crystalTotal} crystals on level ${game.level}. The island has another adventure for you.`,'Try again');
  } else {
    toast(fall?'Fall: -20 HP. Back on solid ground!':'Sentinel hit: -12 HP. Protected for 4 seconds!');
    if(fall) {game.x=0;game.z=15;game.y=0;game.vy=0;game.dashTime=0;}
  }
  updateHud();
}
function collect() {
  for(const crystal of crystals) {
    if(!crystal.collected && Math.hypot(game.x-crystal.x,game.z-crystal.z)<1.25 && game.y<2.2) {
      crystal.collected=true;crystal.gem.visible=crystal.ring.visible=crystal.glow.visible=false;game.collected++;
      game.health=Math.min(100,game.health+15);
      burst(crystal.x,1.4,crystal.z,'#bcffe4');tone(440+game.collected*75);
      toast(game.collected===game.crystalTotal?'All crystals found! Return to the glowing gateway.':`Crystal recovered · ${game.collected} / ${game.crystalTotal} · +15 HP`);
    }
  }
  if(game.collected===game.crystalTotal && game.bossDefeated && Math.hypot(game.x,game.z+14)<2.4 && game.y<1) {
    advanceLevel();
  }
}
export function update(dt,time) {
  if(game.state==='playing') {
    game.elapsed+=dt;game.invulnerable=Math.max(0,game.invulnerable-dt);
    game.dashCooldown=Math.max(0,game.dashCooldown-dt);
    game.pulseCooldown=Math.max(0,game.pulseCooldown-dt);
    game.shieldTime=Math.max(0,game.shieldTime-dt);
    game.speedTime=Math.max(0,game.speedTime-dt);
    game.magnetTime=Math.max(0,game.magnetTime-dt);
    if(keys.has('KeyQ')) game.yaw+=dt*1.6;
    if(keys.has('KeyE')) game.yaw-=dt*1.6;
    let mx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    let mz=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
    const length=Math.hypot(mx,mz);
    if(length) {mx/=length;mz/=length;}
    let dx=mx*Math.cos(game.yaw)+mz*Math.sin(game.yaw),dz=-mx*Math.sin(game.yaw)+mz*Math.cos(game.yaw);
    if(dashQueued && game.dashCooldown===0 && game.y>=0) {
      game.dashTime=.24;game.dashCooldown=3;
      game.dashX=length?dx:Math.sin(avatar.rotation.y);game.dashZ=length?dz:Math.cos(avatar.rotation.y);
      game.invulnerable=Math.max(game.invulnerable,.3);
      burst(game.x,game.y+.8,game.z,'#aaffed');tone(650,.18);
    }
    dashQueued=false;
    if(pulseQueued && game.pulseCooldown===0 && game.y>=0) {
      game.pulseTime=.4;game.pulseCooldown=8;game.invulnerable=Math.max(game.invulnerable,.8);
      burst(game.x,game.y+.8,game.z,'#a9fff0');spawnPulseRing(game.x,.3,game.z);tone(320,.3);tone(520,.2);
      for(const enemy of enemies) {
        const position=enemy.group.position,distance=Math.hypot(game.x-position.x,game.z-position.z);
        if(distance<6.5) {enemy.stunned=2.5;if(distance>.01){const push=6.5-distance+1;position.x+=(position.x-game.x)/distance*push;position.z+=(position.z-game.z)/distance*push;}}
      }
      if(bossState) {
        const position=bossState.group.position,distance=Math.hypot(game.x-position.x,game.z-position.z);
        if(distance<8.5) {bossState.hp--;bossState.stunned=1.5;burst(position.x,2,position.z,'#ffd27a');tone(180,.3);}
      }
    }
    pulseQueued=false;
    const dashStep=Math.min(dt,game.dashTime);
    game.moving=!!length || dashStep>0;
    if(game.moving) {
      if(dashStep>0) {dx=game.dashX;dz=game.dashZ;}
      const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?8:5)*(game.speedTime>0?1.5:1);
      const distance=dashStep>0?18*dashStep+(length?speed*(dt-dashStep):0):speed*dt;
      const move=(x,z)=>!colliders.some(c=>Math.hypot(x-c.x,z-c.z)<c.radius+.35 && game.y<1.5);
      const steps=Math.max(1,Math.ceil(distance/.15));
      for(let i=0;i<steps;i++) {
        const nx=game.x+dx*distance/steps,nz=game.z+dz*distance/steps;
        if(move(nx,game.z)) game.x=nx;
        if(move(game.x,nz)) game.z=nz;
      }
      const desired=Math.atan2(dx,dz);
      avatar.rotation.y+=Math.atan2(Math.sin(desired-avatar.rotation.y),Math.cos(desired-avatar.rotation.y))*Math.min(1,dt*12);
    }
    game.dashTime=Math.max(0,game.dashTime-dt);
    game.threats=0;
    for(const enemy of enemies) {
      const position=enemy.group.position;
      if(enemy.stunned>0) {
        enemy.stunned=Math.max(0,enemy.stunned-dt);enemy.chasing=false;enemy.warning.visible=false;
        position.y=.15+Math.sin(time*2+enemy.index)*.18;continue;
      }
      const distance=Math.hypot(game.x-position.x,game.z-position.z);
      enemy.chasing=distance<(enemy.chasing?7:4.5) && Math.hypot(game.x-enemy.x,game.z-enemy.z)<9 && game.y>=0 && game.invulnerable<=0;
      enemy.warning.visible=enemy.chasing;
      if(enemy.chasing) {
        game.threats++;
        const step=Math.min(enemy.speed*dt,Math.max(0,distance-.8));
        if(distance>0) {position.x+=(game.x-position.x)/distance*step;position.z+=(game.z-position.z)/distance*step;}
        enemy.group.rotation.y=Math.atan2(game.x-position.x,game.z-position.z);
      } else {
        const angle=game.elapsed*.5+enemy.index*2;
        const targetX=enemy.x+Math.cos(angle)*2.2,targetZ=enemy.z+Math.sin(angle)*2.2;
        const returnDistance=Math.hypot(targetX-position.x,targetZ-position.z);
        const step=Math.min(2*dt,returnDistance);
        if(returnDistance>0) {position.x+=(targetX-position.x)/returnDistance*step;position.z+=(targetZ-position.z)/returnDistance*step;}
        enemy.group.rotation.y=-angle;
      }
      position.y=.15+Math.sin(time*2+enemy.index)*.18;
    }
    spawnTimer-=dt;
    if(spawnTimer<=0 && powerups.length<2) {spawnPowerup();spawnTimer=12;}
    for(let i=powerups.length-1;i>=0;i--) {
      const powerup=powerups[i];
      if(Math.hypot(game.x-powerup.x,game.z-powerup.z)<1.3 && game.y<2) {activatePowerup(powerup);scene.remove(powerup.group);powerups.splice(i,1);}
    }
    if(game.magnetTime>0) for(const crystal of crystals) {
      if(crystal.collected) continue;
      const distance=Math.hypot(game.x-crystal.x,game.z-crystal.z);
      if(distance<8 && distance>.01) {
        const pull=Math.min(5*dt,distance);
        crystal.x+=(game.x-crystal.x)/distance*pull;crystal.z+=(game.z-crystal.z)/distance*pull;
        crystal.group.position.set(crystal.x,0,crystal.z);
      }
    }
    if(game.collected===game.crystalTotal && !bossState && !game.bossDefeated) spawnBoss();
    if(bossState) {
      bossState.time+=dt;
      const position=bossState.group.position,distance=Math.hypot(game.x-position.x,game.z-position.z);
      if(bossState.stunned>0) {bossState.stunned=Math.max(0,bossState.stunned-dt);bossState.warning.visible=false;}
      else {
        bossState.warning.visible=distance<10;
        if(distance>.01) {const step=Math.min(2.4*dt,Math.max(0,distance-1.6));position.x+=(game.x-position.x)/distance*step;position.z+=(game.z-position.z)/distance*step;}
        bossState.group.rotation.y=Math.atan2(game.x-position.x,game.z-position.z);
        if(distance<2 && game.y<2) {game.threats++;damage();}
      }
      position.y=1+Math.sin(bossState.time*2)*.25;
      bossState.core.rotation.y+=dt*1.5;
      if(bossState.hp<=0) defeatBoss();
    }
    const grounded=Math.hypot(game.x,game.z)<28.7;
    if(jumpQueued && game.y===0 && grounded) {game.vy=7;tone(260,.08);}
    jumpQueued=false;game.vy-=18*dt;game.y+=game.vy*dt;
    if(grounded && game.y<=0 && game.vy<0) {game.y=0;game.vy=0;}
    if(game.y<-5) damage(true);
    if(game.state==='playing') {
      collect();
      if(game.state==='playing') for(const enemy of enemies) {
        if(Math.hypot(game.x-enemy.group.position.x,game.z-enemy.group.position.z)<1.25 && game.y<1.25) {
          damage();
          if(game.state!=='playing') break;
        }
      }
    }
    if(game.state==='playing' && game.threats===0 && game.y===0) {
      const recoveryTime=Math.min(dt,Math.max(0,game.elapsed-game.lastHit-6));
      game.health=Math.min(100,game.health+3*recoveryTime);
    }
    updateHud();
  }
  avatar.position.set(game.x,game.y,game.z);
  avatar.visible=game.invulnerable<=0 || Math.floor(time*12)%2===0;
  limbs.forEach((limb,index)=>limb.rotation.x=game.moving&&game.state==='playing'?Math.sin(time*12+(index===0||index===3?0:Math.PI))*.55:0);
  playerShadow.position.set(game.x,.016,game.z);playerShadow.visible=Math.hypot(game.x,game.z)<28.7;
  playerShadow.scale.setScalar(Math.max(.4,1-game.y*.1));
  for(const crystal of crystals) {
    crystal.gem.rotation.y=time*.9+crystal.index;
    crystal.gem.position.y=1.35+Math.sin(time*2+crystal.index)*.16;
    crystal.ring.rotation.z=time*.5;
    const pulse=Math.sin(time*2.4+crystal.index*1.7);
    crystal.glow.material.opacity=crystal.collected?0:.4+pulse*.16;
    crystal.glow.scale.setScalar(2.5+pulse*.35);
  }
  motes.rotation.y=Math.sin(time*.08)*.1;
  motes.position.y=Math.sin(time*.6)*.2;
  pollen.rotation.y=time*.03;
  pollen.position.y=Math.sin(time*.4)*.3;
  pollen.material.opacity=.24+Math.sin(time*1.3)*.09;
  for(const powerup of powerups) {
    powerup.age+=dt;powerup.core.rotation.y+=dt*1.6;powerup.core.rotation.x+=dt*.9;
    powerup.core.position.y=1.15+Math.sin(time*2+powerup.age)*.18;
    powerup.glow.scale.setScalar(2.2+Math.sin(time*3+powerup.age)*.3);
  }
  for(let i=pulseRings.length-1;i>=0;i--) {
    const pulse=pulseRings[i];pulse.life-=dt;
    const progress=1-Math.max(0,pulse.life)/pulse.max;
    pulse.ring.scale.setScalar(1+progress*9);pulse.ring.material.opacity=.75*(1-progress);
    if(pulse.life<=0) {scene.remove(pulse.ring);pulseRings.splice(i,1);}
  }
  const remaining=crystals.filter(crystal=>!crystal.collected);
  const nearest=remaining.reduce((best,crystal)=>!best || Math.hypot(game.x-crystal.x,game.z-crystal.z)<Math.hypot(game.x-best.x,game.z-best.z)?crystal:best,null);
  guide.position.set(nearest?nearest.x:0,5,nearest?nearest.z:-14);
  guide.material.opacity=.12+Math.sin(time*2)*.05;
  if(nearest) {crystalLight.position.set(nearest.x,1.6,nearest.z);crystalLight.intensity=1.4+Math.sin(time*3)*.6;}
  else crystalLight.intensity=0;
  const active=game.collected===game.crystalTotal && game.bossDefeated;
  portalSurface.material.opacity=active?.55+Math.sin(time*3)*.1:.12;
  portalRing.material=active?palette.crystal:palette.gold;portalLight.intensity=active?12:0;
  for(let i=particles.length-1;i>=0;i--) {
    const particle=particles[i];particle.life-=dt;particle.velocity.y-=dt*5;particle.object.position.addScaledVector(particle.velocity,dt);particle.object.scale.setScalar(Math.max(0,particle.life));
    if(particle.life<=0) {scene.remove(particle.object);particles.splice(i,1);}
  }
  const target=new THREE.Vector3(game.x,Math.max(0,game.y)+1,game.z);
  if(game.state==='menu') {
    camera.position.set(25,22,34);camera.lookAt(-2,0,-4);
  } else {
    const offset=new THREE.Vector3(Math.sin(game.yaw)*13,10.5,Math.cos(game.yaw)*13);
    camera.position.lerp(target.clone().add(offset),1-Math.exp(-dt*7));camera.lookAt(target);
  }
  if(performance.now()>toastUntil) $('toast').classList.remove('visible');
  drawMap();
}
const map=$('map').getContext('2d');
function drawMap() {
  map.clearRect(0,0,150,150);map.fillStyle='#638858';map.beginPath();map.arc(75,75,65,0,Math.PI*2);map.fill();
  map.strokeStyle='#bdd3ac44';map.lineWidth=1;
  for(const r of [22,44,65]) {map.beginPath();map.arc(75,75,r,0,Math.PI*2);map.stroke();}
  const point=(x,z,color,r)=>{map.fillStyle=color;map.beginPath();map.arc(75+x*2.2,75+z*2.2,r,0,Math.PI*2);map.fill();};
  for(const crystal of crystals) if(!crystal.collected) point(crystal.x,crystal.z,'#b8fff0',3);
  for(const enemy of enemies) point(enemy.group.position.x,enemy.group.position.z,'#ffad8b',3);
  for(const powerup of powerups) point(powerup.x,powerup.z,'#ff9ce0',3);
  if(bossState) point(bossState.group.position.x,bossState.group.position.z,'#ff6a4a',5);
  point(0,-14,game.collected===game.crystalTotal&&game.bossDefeated?'#e6ff9f':'#a0bcb0',4);
  point(game.x,game.z,'#fff3c7',4);
  map.save();map.translate(75+game.x*2.2,75+game.z*2.2);map.rotate(-game.yaw);map.fillStyle='#fff3c7';map.beginPath();map.moveTo(0,-9);map.lineTo(-3,-5);map.lineTo(3,-5);map.fill();map.restore();
}
$('play').addEventListener('click',primaryAction);
$('pause').addEventListener('click',pause);
$('sound').addEventListener('click',()=>{
  if(!audio) audio=new AudioContext();audio.resume();sound=!sound;$('sound').textContent=sound?'SOUND ON':'SOUND OFF';tone(500);
});
addEventListener('keydown',event=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) event.preventDefault();
  if(event.code==='Escape' && !event.repeat) {pause();return;}
  if(event.code==='Enter' && game.state!=='playing') {primaryAction();return;}
  if(game.state!=='playing') return;
  keys.add(event.code);
  if(event.code==='Space' && !event.repeat) jumpQueued=true;
  if(event.code==='KeyF' && !event.repeat) dashQueued=true;
  if(event.code==='KeyR' && !event.repeat) pulseQueued=true;
});
addEventListener('keyup',event=>keys.delete(event.code));
addEventListener('blur',()=>{keys.clear();if(game.state==='playing') pause();});
renderer.domElement.addEventListener('pointerdown',event=>{dragging=true;lastMouse=event.clientX;renderer.domElement.setPointerCapture(event.pointerId);});
renderer.domElement.addEventListener('pointermove',event=>{if(dragging&&game.state==='playing') {game.yaw-=(event.clientX-lastMouse)*.007;lastMouse=event.clientX;}});
renderer.domElement.addEventListener('pointerup',()=>dragging=false);
renderer.domElement.addEventListener('pointercancel',()=>dragging=false);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
document.body.classList.add('menu');
let lastFrame=performance.now(),worldTime=0;
function animate() {
  requestAnimationFrame(animate);
  const now=performance.now();
  const dt=Math.min((now-lastFrame)/1000,.05);
  lastFrame=now;
  if(game.state!=='paused') worldTime+=dt;
  update(game.state==='paused'?0:dt,worldTime);renderer.render(scene,camera);
}
animate();
