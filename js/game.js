// ═══════════════════════════════════════════
//  常量 & 配置
// ═══════════════════════════════════════════
const CFG = {
  moveSpeed: 9,
  sprintMult: 1.6,
  jumpForce: 12,
  gravity: 30,
  mouseSens: 0.002,
  playerHeight: 1.7,
  playerRadius: 0.35,

  // 武器
  fireRate: 0.1,       // 秒/发
  reloadTime: 2.2,
  magSize: 30,
  reserveAmmo: 90,
  damage: 28,
  spread: 0.015,
  recoil: 0.02,

  // 敌人
  enemyCount: 8,
  enemyHP: 100,
  enemySpeed: 3.5,
  enemyDamage: 12,
  enemyFireRate: 1.0,
  enemyDetectRange: 40,
  enemyAttackRange: 20,
};

// ═══════════════════════════════════════════
//  全局状态
// ═══════════════════════════════════════════
const state = {
  playing: false,
  playerName: 'Player1',
  hp: 100,
  maxHp: 100,
  ammo: CFG.magSize,
  reserve: CFG.reserveAmmo,
  maxReserve: CFG.reserveAmmo,
  reloading: false,
  reloadTimer: 0,
  fireCooldown: 0,
  score: 0,
  velocity: new THREE.Vector3(),
  onGround: true,
  sprinting: false,
  yaw: 0,
  pitch: 0,
  keys: {},
  enemies: [],
  bullets: [],
  muzzleFlash: null,
  muzzleTimer: 0,
  // 波次系统
  wave: 0,
  waveActive: false,
  waveAnnouncing: false,
  waveAnnounceTimer: 0,
  waveAnnounceQueue: [],
  hitMarkerTimer: 0,
  damageTimer: 0,
  // 奖励系统（波次类，每波重置）
  waveDamageMult: 1,
  waveHpPickupMult: 1,
  waveAmmoPickupMult: 1,
  waveTimeStop: 0,
  waveNuke: false,
  waveSpeedMult: 1,
  waveJumpMult: 1,
  waveOneShot: false,
  waveMelee: null,
  waveLifeSteal: 0,
  waveFireRateMult: 1,
  shield: 0,
  rewardPhase: false,
};

// ═══════════════════════════════════════════
//  音效系统 (Web Audio API)
// ═══════════════════════════════════════════
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;
function ensureAudio() { if (!audioCtx) audioCtx = new AudioCtx(); }

// 本地音效文件
const sfxReload = new Audio('audio/reload.mp3');
sfxReload.volume = 0.6;
const sfxFootstep = new Audio('audio/footstep.mp3');
sfxFootstep.volume = 0.6;
const sfxEnemyFootstep = new Audio('audio/footstep.mp3');
sfxEnemyFootstep.volume = 0.12;
const sfxEnemyDead = new Audio('audio/enemydead.mp3');
sfxEnemyDead.volume = 0.4;
const sfxGameOver = new Audio('audio/gameover.mp3');
sfxGameOver.volume = 0.5;
const sfxGunshot = new Audio('audio/gunshot.mp3');
sfxGunshot.volume = 0.5;
const sfxWaveStart = new Audio('audio/wavestarthorn.mp3');
sfxWaveStart.volume = 0.6;
const sfxPickup = new Audio('audio/pickupitem.mp3');
sfxPickup.volume = 0.5;

// 预生成噪声缓冲
function makeNoiseBuf(dur) {
  const sr = audioCtx.sampleRate;
  const len = Math.floor(sr * dur);
  const buf = audioCtx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function playNoise(dur, vol, hiCut, loCut, attack, decay) {
  const t = audioCtx.currentTime;
  const src = audioCtx.createBufferSource();
  src.buffer = makeNoiseBuf(dur);
  const g = audioCtx.createGain();
  const filt = audioCtx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = hiCut;
  filt.Q.value = loCut;
  src.connect(filt); filt.connect(g); g.connect(audioCtx.destination);
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + attack + decay);
  src.start(t); src.stop(t + attack + decay);
}

// 脚步声计时器
let footstepTimer = 0;
const FOOTSTEP_INTERVAL = 0.42;

function playFootstep() {
  try { sfxFootstep.currentTime = 0; sfxFootstep.play(); } catch (_) {}
}

function playEnemyFootstep() {
  try { sfxEnemyFootstep.currentTime = 0; sfxEnemyFootstep.play(); } catch (_) {}
}

function playSound(type) {
  ensureAudio();
  const t = audioCtx.currentTime;

  switch (type) {
    case 'shoot': {
      try { sfxGunshot.currentTime = 0; sfxGunshot.play(); } catch (_) {}
      break;
    }
    case 'hit':
      playNoise(0.06, 0.2, 3000, 1, 0.001, 0.05);
      break;
    case 'kill': {
      try { sfxEnemyDead.currentTime = 0; sfxEnemyDead.play(); } catch (_) {}
      break;
    }
    case 'hurt': {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.2);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start(t); osc.stop(t + 0.25);
      break;
    }
    case 'reload': {
      try { sfxReload.currentTime = 0; sfxReload.play(); } catch (_) {}
      break;
    }
    case 'empty': {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, t);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start(t); osc.stop(t + 0.05);
      break;
    }
  }
}

// ═══════════════════════════════════════════
//  Three.js 初始化
// ═══════════════════════════════════════════
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 50, 120);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(15, CFG.playerHeight, 15);

const listener = new THREE.AudioListener();
camera.add(listener);

// ═══════════════════════════════════════════
//  灯光
// ═══════════════════════════════════════════
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffeedd, 1.2);
sunLight.position.set(30, 50, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 120;
sunLight.shadow.camera.left = -60;
sunLight.shadow.camera.right = 60;
sunLight.shadow.camera.top = 60;
sunLight.shadow.camera.bottom = -60;
scene.add(sunLight);

const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x556633, 0.4);
scene.add(hemiLight);

// ═══════════════════════════════════════════
//  材质
// ═══════════════════════════════════════════
function makeMat(color, roughness = 0.8) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.1 });
}

const matFloor   = makeMat(0x555555);
const matWall    = makeMat(0x8B7355);
const matCrate   = makeMat(0xB8860B);
const matConcrete = makeMat(0x999999);
const matMetal   = makeMat(0x666677, 0.3);
const matRed     = makeMat(0xCC3333);
const matSky     = makeMat(0x87CEEB);

// 生成木箱纹理 (程序化)
function createCrateTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#B8860B';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 120, 120);
  ctx.strokeRect(12, 12, 104, 104);
  ctx.beginPath();
  ctx.moveTo(4, 4); ctx.lineTo(124, 124);
  ctx.moveTo(124, 4); ctx.lineTo(4, 124);
  ctx.stroke();
  // 噪声
  for (let i = 0; i < 2000; i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
    ctx.fillRect(x, y, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const crateTex = createCrateTexture();
matCrate.map = crateTex;

// 地板纹理
function createFloorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#555555';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
    ctx.fillStyle = x % 2 === y % 2 ? '#505050' : '#5a5a5a';
    ctx.fillRect(x * 64, y * 64, 64, 64);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(x * 64, y * 64, 64, 64);
  }
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  return tex;
}
matFloor.map = createFloorTexture();

// 墙壁纹理
function createWallTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8B7355';
  ctx.fillRect(0, 0, 128, 128);
  // 砖缝
  for (let row = 0; row < 4; row++) {
    const y = row * 32;
    const off = row % 2 === 0 ? 0 : 32;
    for (let col = -1; col < 3; col++) {
      ctx.strokeStyle = '#6B5335';
      ctx.lineWidth = 2;
      ctx.strokeRect(col * 64 + off, y, 64, 32);
    }
  }
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}
matWall.map = createWallTexture();

// 敌人身体纹理 — 战术背心
function createEnemyBodyTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, 256, 256);
  // 背心区域
  ctx.fillStyle = '#5a2020';
  ctx.fillRect(40, 30, 176, 200);
  // 背心网格缝线
  ctx.strokeStyle = '#4a1818';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath(); ctx.moveTo(40, 30 + i * 28); ctx.lineTo(216, 30 + i * 28); ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    ctx.beginPath(); ctx.moveTo(40 + i * 32, 30); ctx.lineTo(40 + i * 32, 230); ctx.stroke();
  }
  // 口袋轮廓
  ctx.strokeStyle = '#3a1010';
  ctx.lineWidth = 2;
  ctx.strokeRect(55, 100, 50, 40);
  ctx.strokeRect(150, 100, 50, 40);
  ctx.strokeRect(100, 160, 55, 45);
  // 肩带
  ctx.fillStyle = '#333';
  ctx.fillRect(60, 0, 30, 40);
  ctx.fillRect(166, 0, 30, 40);
  // 噪声
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// 敌人头部纹理 — 头盔 + 面部
function createEnemyHeadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  // 皮肤底色
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(0, 0, 128, 128);
  // 头盔区域（上半部分）
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, 128, 50);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(5, 5, 118, 40);
  // 护目镜
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(15, 35, 40, 15);
  ctx.fillRect(73, 35, 40, 15);
  // 面罩下半
  ctx.fillStyle = '#444';
  ctx.fillRect(0, 90, 128, 38);
  // 眼部阴影
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.arc(42, 62, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(86, 62, 8, 0, Math.PI * 2); ctx.fill();
  // 噪声
  for (let i = 0; i < 2000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// 敌人裤子纹理 — 迷彩
function createEnemyLegTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a3a2a';
  ctx.fillRect(0, 0, 128, 128);
  // 迷彩斑块
  const camo = ['#4a4a30', '#2d2d1a', '#555540', '#3a3a25'];
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = camo[Math.floor(Math.random() * camo.length)];
    const x = Math.random() * 128, y = Math.random() * 128;
    ctx.beginPath(); ctx.ellipse(x, y, 8 + Math.random() * 15, 6 + Math.random() * 10, Math.random() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  // 噪声
  for (let i = 0; i < 2000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// 金属纹理 — 枪身/刀刃
function createGunMetalTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, 128, 128);
  // 水平机加工条纹
  for (let y = 0; y < 128; y += 2) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.03})`;
    ctx.fillRect(0, y, 128, 1);
  }
  // 划痕
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * 128, Math.random() * 128);
    ctx.lineTo(Math.random() * 128, Math.random() * 128);
    ctx.stroke();
  }
  // 边缘暗角
  const grad = ctx.createRadialGradient(64, 64, 30, 64, 64, 90);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  // 噪声
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// 木纹纹理 — 枪托/刀柄/锤柄
function createWoodTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6B4226';
  ctx.fillRect(0, 0, 128, 128);
  // 木纹波浪线
  for (let i = 0; i < 20; i++) {
    const y = i * 6.4;
    ctx.strokeStyle = i % 2 === 0 ? '#5a3520' : '#7a5030';
    ctx.lineWidth = 2 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < 128; x += 8) {
      ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 3);
    }
    ctx.stroke();
  }
  // 节疤
  ctx.fillStyle = '#4a2a10';
  ctx.beginPath(); ctx.ellipse(90, 80, 8, 5, 0.3, 0, Math.PI * 2); ctx.fill();
  // 噪声
  for (let i = 0; i < 2000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// 创建共享贴图材质
const enemyBodyTex = createEnemyBodyTexture();
const enemyHeadTex = createEnemyHeadTexture();
const enemyLegTex = createEnemyLegTexture();
const gunMetalTex = createGunMetalTexture();
const woodTex = createWoodTexture();

const matGunMetal = new THREE.MeshStandardMaterial({ map: gunMetalTex, roughness: 0.3, metalness: 0.7 });
const matGunMetalDark = new THREE.MeshStandardMaterial({ map: gunMetalTex, roughness: 0.2, metalness: 0.8 });
const matWood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8, metalness: 0.05 });
const matBelt = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.1 });

// ═══════════════════════════════════════════
//  地图构建
// ═══════════════════════════════════════════
const colliders = []; // AABB 列表

function addBox(x, y, z, w, h, d, mat, castShadow = true, receiveShadow = true) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  scene.add(mesh);
  // 碰撞体
  colliders.push(new THREE.Box3(
    new THREE.Vector3(x - w/2, y - h/2, z - d/2),
    new THREE.Vector3(x + w/2, y + h/2, z + d/2),
  ));
  return mesh;
}

function buildMap() {
  // 地板
  const floorGeo = new THREE.PlaneGeometry(120, 120);
  const floor = new THREE.Mesh(floorGeo, matFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // 天空盒 (简单半球)
  const skyGeo = new THREE.SphereGeometry(150, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide }));
  scene.add(sky);

  // ── 外围墙 ──
  const wallH = 5, wallT = 0.5;
  // 北
  addBox(0, wallH/2, -60, 120, wallH, wallT, matWall);
  // 南
  addBox(0, wallH/2, 60, 120, wallH, wallT, matWall);
  // 西
  addBox(-60, wallH/2, 0, wallT, wallH, 120, matWall);
  // 东
  addBox(60, wallH/2, 0, wallT, wallH, 120, matWall);

  // ── 中央建筑 ──
  // 中央大箱子
  addBox(0, 1.5, 0, 6, 3, 6, matConcrete);
  // 中央通道墙
  addBox(-8, 1.5, 0, 0.4, 3, 8, matWall);
  addBox(8, 1.5, 0, 0.4, 3, 8, matWall);

  // ── A 区 ──
  addBox(-30, 1.5, -25, 8, 3, 0.4, matWall);
  addBox(-30, 1.5, -35, 8, 3, 0.4, matWall);
  addBox(-34, 1.5, -30, 0.4, 3, 10, matWall);
  // A区箱子堆
  addBox(-28, 0.75, -28, 2, 1.5, 2, matCrate);
  addBox(-28, 2.25, -28, 1.5, 1.5, 1.5, matCrate);
  addBox(-32, 0.75, -32, 2, 1.5, 2, matCrate);

  // ── B 区 ──
  addBox(30, 1.5, 25, 8, 3, 0.4, matWall);
  addBox(30, 1.5, 35, 8, 3, 0.4, matWall);
  addBox(34, 1.5, 30, 0.4, 3, 10, matWall);
  // B区箱子
  addBox(28, 0.75, 28, 2, 1.5, 2, matCrate);
  addBox(32, 0.75, 32, 2, 1.5, 2, matCrate);
  addBox(32, 2.25, 32, 1.5, 1.5, 1.5, matCrate);

  // ── 通道 & 掩体 ──
  // 长通道
  addBox(-15, 1.5, -20, 12, 3, 0.4, matWall);
  addBox(15, 1.5, 20, 12, 3, 0.4, matWall);

  // 散布掩体
  addBox(-18, 0.75, 10, 2, 1.5, 2, matCrate);
  addBox(18, 0.75, -10, 2, 1.5, 2, matCrate);
  addBox(-10, 0.75, 18, 3, 1.5, 1.5, matCrate);
  addBox(10, 0.75, -18, 3, 1.5, 1.5, matCrate);
  addBox(22, 0.75, 5, 2, 1.5, 2, matCrate);
  addBox(-22, 0.75, -5, 2, 1.5, 2, matCrate);

  // 高台
  addBox(-40, 0.75, 0, 6, 1.5, 6, matConcrete);
  addBox(-40, 0.75, 0, 5.5, 1.4, 5.5, matMetal); // 金属台面
  addBox(40, 0.75, 0, 6, 1.5, 6, matConcrete);
  addBox(40, 0.75, 0, 5.5, 1.4, 5.5, matMetal);

  // 红色标记柱
  addBox(-30, 2, -30, 0.3, 4, 0.3, matRed, false);
  addBox(30, 2, 30, 0.3, 4, 0.3, matRed, false);

  // 一些随机小箱子
  const rng = mulberry32(42);
  for (let i = 0; i < 15; i++) {
    const sx = (rng() - 0.5) * 90;
    const sz = (rng() - 0.5) * 90;
    // 避免生成在玩家出生点附近
    if (Math.abs(sx) < 5 && Math.abs(sz) < 5) continue;
    const size = 1 + rng() * 1.5;
    addBox(sx, size / 2, sz, size, size, size, matCrate);
  }
}

// 确定性随机
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════════════════
//  武器模型 (第一人称)
// ═══════════════════════════════════════════
let weaponGroup, weaponRecoil = 0;
let meleeSwing = 0, meleeSwingDir = 1; // 近战挥动进度 0→1

function clearWeapon() {
  if (weaponGroup) {
    camera.remove(weaponGroup);
    weaponGroup = null;
    state.muzzleFlash = null;
  }
}

function buildWeapon(type) {
  clearWeapon();
  weaponGroup = new THREE.Group();

  if (type === 'machete') {
    // ─── 砍刀 ───
    // 刀柄
    const handleGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.18, 8);
    const handle = new THREE.Mesh(handleGeo, matWood);
    handle.rotation.x = -0.3;
    weaponGroup.add(handle);
    // 刀柄缠绕
    for (let i = 0; i < 5; i++) {
      const wrapGeo = new THREE.TorusGeometry(0.022, 0.004, 4, 8);
      const wrap = new THREE.Mesh(wrapGeo, matBelt);
      wrap.position.set(0, -0.06 + i * 0.03, -0.01 - i * 0.008);
      wrap.rotation.x = -0.3;
      weaponGroup.add(wrap);
    }
    // 铃头（柄端）
    const pommelGeo = new THREE.SphereGeometry(0.02, 6, 6);
    const pommel = new THREE.Mesh(pommelGeo, matGunMetal);
    pommel.position.set(0, -0.1, 0.02);
    weaponGroup.add(pommel);
    // 护手
    const guardGeo = new THREE.BoxGeometry(0.08, 0.02, 0.03);
    const guard = new THREE.Mesh(guardGeo, matGunMetal);
    guard.position.set(0, 0.02, -0.06);
    weaponGroup.add(guard);
    // 刀刃（渐窄 Shape + Extrude）
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.02, 0);
    bladeShape.lineTo(0.02, 0);
    bladeShape.lineTo(0.005, -0.38);
    bladeShape.lineTo(0, -0.42);
    bladeShape.lineTo(-0.005, -0.38);
    bladeShape.closePath();
    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 });
    const blade = new THREE.Mesh(bladeGeo, matGunMetalDark);
    blade.position.set(0, 0.03, -0.05);
    blade.rotation.x = Math.PI / 2;
    weaponGroup.add(blade);
    // 血槽（刀刃中线凹槽）
    const fullerGeo = new THREE.BoxGeometry(0.008, 0.003, 0.25);
    const fullerMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.7 });
    const fuller = new THREE.Mesh(fullerGeo, fullerMat);
    fuller.position.set(0, 0.038, -0.22);
    weaponGroup.add(fuller);
    weaponGroup.position.set(0.3, -0.25, -0.35);
  } else if (type === 'hammer') {
    // ─── 战锤 ───
    // 锤柄
    const shaftGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.5, 8);
    const shaft = new THREE.Mesh(shaftGeo, matWood);
    shaft.rotation.x = -0.2;
    weaponGroup.add(shaft);
    // 握把缠绕
    for (let i = 0; i < 6; i++) {
      const wrapGeo = new THREE.TorusGeometry(0.02, 0.004, 4, 8);
      const wrap = new THREE.Mesh(wrapGeo, matBelt);
      wrap.position.set(0, 0.04 + i * 0.025, 0.02 + i * 0.005);
      wrap.rotation.x = -0.2;
      weaponGroup.add(wrap);
    }
    // 柄箍（langet，金属薄片夹住锤头）
    const langetGeo = new THREE.BoxGeometry(0.008, 0.12, 0.04);
    const langetL = new THREE.Mesh(langetGeo, matGunMetal);
    langetL.position.set(-0.025, 0.01, -0.28);
    langetL.rotation.x = -0.2;
    weaponGroup.add(langetL);
    const langetR = new THREE.Mesh(langetGeo, matGunMetal);
    langetR.position.set(0.025, 0.01, -0.28);
    langetR.rotation.x = -0.2;
    weaponGroup.add(langetR);
    // 锤头主体
    const headGeo = new THREE.BoxGeometry(0.1, 0.08, 0.08);
    const head = new THREE.Mesh(headGeo, matGunMetalDark);
    head.position.set(0, 0.02, -0.3);
    weaponGroup.add(head);
    // 锤面（扁圆柱）
    const faceGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8);
    const face1 = new THREE.Mesh(faceGeo, matGunMetal);
    face1.rotation.x = Math.PI / 2;
    face1.position.set(0, 0.02, -0.35);
    weaponGroup.add(face1);
    // 锤尖（背面锥形）
    const spikeGeo = new THREE.ConeGeometry(0.025, 0.08, 6);
    const spike = new THREE.Mesh(spikeGeo, matGunMetalDark);
    spike.rotation.x = Math.PI / 2;
    spike.position.set(0, 0.02, -0.22);
    weaponGroup.add(spike);
    weaponGroup.position.set(0.25, -0.2, -0.3);
  } else {
    // ─── AK-47（精细版） ───
    // 下机匣
    const lowerGeo = new THREE.BoxGeometry(0.065, 0.04, 0.35);
    const lower = new THREE.Mesh(lowerGeo, matGunMetal);
    lower.position.set(0, -0.01, 0.05);
    weaponGroup.add(lower);
    // 上机匣
    const upperGeo = new THREE.BoxGeometry(0.06, 0.035, 0.4);
    const upper = new THREE.Mesh(upperGeo, matGunMetalDark);
    upper.position.set(0, 0.02, 0.02);
    weaponGroup.add(upper);
    // 枪机盖（dust cover）
    const coverGeo = new THREE.BoxGeometry(0.058, 0.008, 0.38);
    const cover = new THREE.Mesh(coverGeo, matGunMetalDark);
    cover.position.set(0, 0.042, 0.02);
    weaponGroup.add(cover);
    // 枪管
    const barrelGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.4, 8);
    const barrel = new THREE.Mesh(barrelGeo, matGunMetalDark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.38);
    weaponGroup.add(barrel);
    // 导气管（gas tube）
    const gasTubeGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6);
    const gasTube = new THREE.Mesh(gasTubeGeo, matGunMetalDark);
    gasTube.rotation.x = Math.PI / 2;
    gasTube.position.set(0, 0.04, -0.3);
    weaponGroup.add(gasTube);
    // 枪口制退器
    const brakeGeo = new THREE.CylinderGeometry(0.022, 0.018, 0.06, 6);
    const brake = new THREE.Mesh(brakeGeo, matGunMetalDark);
    brake.rotation.x = Math.PI / 2;
    brake.position.set(0, 0.02, -0.6);
    weaponGroup.add(brake);
    // 准星柱
    const fsPostGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.04, 4);
    const fsPost = new THREE.Mesh(fsPostGeo, matGunMetalDark);
    fsPost.position.set(0, 0.06, -0.52);
    weaponGroup.add(fsPost);
    // 准星底座
    const fsBaseGeo = new THREE.BoxGeometry(0.03, 0.015, 0.02);
    const fsBase = new THREE.Mesh(fsBaseGeo, matGunMetalDark);
    fsBase.position.set(0, 0.04, -0.52);
    weaponGroup.add(fsBase);
    // 后准星（缺口式）
    const rsBladeGeo = new THREE.BoxGeometry(0.008, 0.025, 0.008);
    const rsBladeL = new THREE.Mesh(rsBladeGeo, matGunMetalDark);
    rsBladeL.position.set(-0.015, 0.055, -0.05);
    weaponGroup.add(rsBladeL);
    const rsBladeR = new THREE.Mesh(rsBladeGeo, matGunMetalDark);
    rsBladeR.position.set(0.015, 0.055, -0.05);
    weaponGroup.add(rsBladeR);
    const rsBaseGeo = new THREE.BoxGeometry(0.04, 0.01, 0.015);
    const rsBase = new THREE.Mesh(rsBaseGeo, matGunMetalDark);
    rsBase.position.set(0, 0.04, -0.05);
    weaponGroup.add(rsBase);
    // 弹匣（AK 标志性弯弹匣）
    const magShape = new THREE.Shape();
    magShape.moveTo(-0.02, 0);
    magShape.lineTo(0.02, 0);
    magShape.lineTo(0.018, -0.14);
    magShape.quadraticCurveTo(0.015, -0.18, 0.005, -0.18);
    magShape.lineTo(-0.005, -0.18);
    magShape.quadraticCurveTo(-0.015, -0.18, -0.018, -0.14);
    magShape.closePath();
    const magGeo = new THREE.ExtrudeGeometry(magShape, { depth: 0.03, bevelEnabled: false });
    const mag = new THREE.Mesh(magGeo, matGunMetal);
    mag.position.set(0, -0.03, 0.06);
    mag.rotation.x = 0.12;
    weaponGroup.add(mag);
    // 握把
    const gripGeo = new THREE.BoxGeometry(0.035, 0.1, 0.04);
    const grip = new THREE.Mesh(gripGeo, matGunMetal);
    grip.position.set(0, -0.07, 0.17);
    grip.rotation.x = -0.25;
    weaponGroup.add(grip);
    // 护木（左右两片）
    const hgGeo = new THREE.BoxGeometry(0.025, 0.04, 0.18);
    const hgL = new THREE.Mesh(hgGeo, matWood);
    hgL.position.set(-0.032, 0.02, -0.18);
    weaponGroup.add(hgL);
    const hgR = new THREE.Mesh(hgGeo, matWood);
    hgR.position.set(0.032, 0.02, -0.18);
    weaponGroup.add(hgR);
    // 扳机护圈
    const tgGeo = new THREE.TorusGeometry(0.018, 0.003, 4, 8, Math.PI);
    const triggerGuard = new THREE.Mesh(tgGeo, matGunMetal);
    triggerGuard.position.set(0, -0.03, 0.12);
    triggerGuard.rotation.y = Math.PI / 2;
    weaponGroup.add(triggerGuard);
    // 枪托
    const stockGeo = new THREE.BoxGeometry(0.05, 0.08, 0.22);
    const stock = new THREE.Mesh(stockGeo, matWood);
    stock.position.set(0, 0, 0.35);
    stock.rotation.x = -0.05;
    weaponGroup.add(stock);
    // 枪托底板
    const buttGeo = new THREE.BoxGeometry(0.05, 0.09, 0.015);
    const butt = new THREE.Mesh(buttGeo, matGunMetal);
    butt.position.set(0, -0.005, 0.46);
    weaponGroup.add(butt);
    // 枪口闪光
    const flashGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 });
    state.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    state.muzzleFlash.position.set(0, 0.02, -0.64);
    weaponGroup.add(state.muzzleFlash);
    weaponGroup.position.set(0.25, -0.22, -0.45);
  }

  camera.add(weaponGroup);
  scene.add(camera);
}

function swapWeapon(type) {
  buildWeapon(type);
  document.getElementById('weapon-name').textContent =
    type === 'machete' ? '战术砍刀' : type === 'hammer' ? '战锤' : 'AK-47';
}

// ═══════════════════════════════════════════
//  敌人系统
// ═══════════════════════════════════════════
const enemyMat = new THREE.MeshStandardMaterial({ map: enemyBodyTex, roughness: 0.7, metalness: 0.1 });
const enemyDarkMat = new THREE.MeshStandardMaterial({ map: enemyLegTex, roughness: 0.8, metalness: 0.05 });
const enemyHeadMat = new THREE.MeshStandardMaterial({ map: enemyHeadTex, roughness: 0.6, metalness: 0.05 });
const hitFlashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

function createEnemy() {
  const group = new THREE.Group();
  const matVisor = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.8 });
  const matSkin = enemyHeadMat;
  const matBoot = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.05 });
  const matBackpack = new THREE.MeshStandardMaterial({ color: 0x3a3a2a, roughness: 0.8, metalness: 0.05 });

  // ─── 头部 ───
  // 头盔主体（半球 Lathe）
  const helmetPts = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 0.55;
    helmetPts.push(new THREE.Vector2(Math.sin(a) * 0.2, Math.cos(a) * 0.2));
  }
  const helmetGeo = new THREE.LatheGeometry(helmetPts, 8);
  const helmet = new THREE.Mesh(helmetGeo, enemyHeadMat);
  helmet.position.y = 1.62;
  helmet.castShadow = true;
  helmet.userData.isHead = true;
  group.add(helmet);
  // 头盔护耳（左右）
  const earGeo = new THREE.BoxGeometry(0.06, 0.12, 0.14);
  const earL = new THREE.Mesh(earGeo, enemyHeadMat);
  earL.position.set(-0.2, 1.52, 0);
  earL.userData.isHead = true;
  group.add(earL);
  const earR = new THREE.Mesh(earGeo, enemyHeadMat);
  earR.position.set(0.2, 1.52, 0);
  earR.userData.isHead = true;
  group.add(earR);
  // 面罩/护目镜
  const visorGeo = new THREE.BoxGeometry(0.3, 0.06, 0.08);
  const visor = new THREE.Mesh(visorGeo, matVisor);
  visor.position.set(0, 1.58, -0.14);
  visor.userData.isHead = true;
  group.add(visor);
  // 面部（下巴区域）
  const faceGeo = new THREE.BoxGeometry(0.2, 0.1, 0.12);
  const face = new THREE.Mesh(faceGeo, matSkin);
  face.position.set(0, 1.48, -0.1);
  face.userData.isHead = true;
  group.add(face);
  // 颈部
  const neckGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.1, 6);
  const neck = new THREE.Mesh(neckGeo, matSkin);
  neck.position.y = 1.4;
  group.add(neck);

  // ─── 躯干 ───
  // 上躯干（梯形 Extrude）
  const torsoShape = new THREE.Shape();
  torsoShape.moveTo(-0.32, 0);
  torsoShape.lineTo(0.32, 0);
  torsoShape.lineTo(0.25, 0.55);
  torsoShape.lineTo(-0.25, 0.55);
  torsoShape.closePath();
  const torsoGeo = new THREE.ExtrudeGeometry(torsoShape, { depth: 0.3, bevelEnabled: false });
  const torso = new THREE.Mesh(torsoGeo, enemyMat);
  torso.position.set(0, 0.85, -0.15);
  torso.castShadow = true;
  group.add(torso);
  // 战术背心（覆盖在躯干上，略大）
  const vestShape = new THREE.Shape();
  vestShape.moveTo(-0.34, 0);
  vestShape.lineTo(0.34, 0);
  vestShape.lineTo(0.27, 0.55);
  vestShape.lineTo(-0.27, 0.55);
  vestShape.closePath();
  const vestGeo = new THREE.ExtrudeGeometry(vestShape, { depth: 0.34, bevelEnabled: false });
  const vestMat = new THREE.MeshStandardMaterial({ color: 0x5a2020, roughness: 0.7, metalness: 0.1 });
  const vest = new THREE.Mesh(vestGeo, vestMat);
  vest.position.set(0, 0.85, -0.17);
  group.add(vest);
  // 背心口袋
  const pouchGeo = new THREE.BoxGeometry(0.12, 0.08, 0.04);
  const pouchMat = new THREE.MeshStandardMaterial({ color: 0x4a1818, roughness: 0.8 });
  const pouch1 = new THREE.Mesh(pouchGeo, pouchMat);
  pouch1.position.set(-0.14, 1.1, -0.18);
  group.add(pouch1);
  const pouch2 = new THREE.Mesh(pouchGeo, pouchMat);
  pouch2.position.set(0.14, 1.1, -0.18);
  group.add(pouch2);
  const pouch3Geo = new THREE.BoxGeometry(0.14, 0.1, 0.04);
  const pouch3 = new THREE.Mesh(pouch3Geo, pouchMat);
  pouch3.position.set(0, 0.95, -0.18);
  group.add(pouch3);
  // 肩带
  const strapGeo = new THREE.BoxGeometry(0.06, 0.55, 0.06);
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
  const strapL = new THREE.Mesh(strapGeo, strapMat);
  strapL.position.set(-0.28, 1.1, 0);
  group.add(strapL);
  const strapR = new THREE.Mesh(strapGeo, strapMat);
  strapR.position.set(0.28, 1.1, 0);
  group.add(strapR);
  // 腰带
  const beltGeo = new THREE.TorusGeometry(0.3, 0.025, 4, 12, Math.PI * 2);
  const belt = new THREE.Mesh(beltGeo, matBelt);
  belt.position.set(0, 0.87, 0);
  belt.rotation.x = Math.PI / 2;
  group.add(belt);
  // 背包
  const bpGeo = new THREE.BoxGeometry(0.35, 0.3, 0.15);
  const backpack = new THREE.Mesh(bpGeo, matBackpack);
  backpack.position.set(0, 1.1, 0.22);
  group.add(backpack);

  // ─── 手臂 ───
  const upperArmGeo = new THREE.CylinderGeometry(0.055, 0.05, 0.3, 6);
  const forearmGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.3, 6);
  const jointGeo = new THREE.SphereGeometry(0.055, 6, 6);
  const handGeo = new THREE.BoxGeometry(0.07, 0.05, 0.1);
  // 右臂（持枪手臂，伸向前方）
  const shoulderR = new THREE.Mesh(jointGeo, enemyMat);
  shoulderR.position.set(0.38, 1.32, -0.05);
  group.add(shoulderR);
  const upperArmR = new THREE.Mesh(upperArmGeo, enemyMat);
  upperArmR.position.set(0.38, 1.15, -0.12);
  upperArmR.rotation.x = -0.6;
  group.add(upperArmR);
  const elbowR = new THREE.Mesh(jointGeo, enemyMat);
  elbowR.position.set(0.38, 1.0, -0.22);
  group.add(elbowR);
  const forearmR = new THREE.Mesh(forearmGeo, enemyMat);
  forearmR.position.set(0.38, 0.92, -0.38);
  forearmR.rotation.x = -1.2;
  group.add(forearmR);
  const handR = new THREE.Mesh(handGeo, matSkin);
  handR.position.set(0.38, 0.88, -0.5);
  group.add(handR);
  // 左臂（自然下垂，略前）
  const shoulderL = new THREE.Mesh(jointGeo, enemyMat);
  shoulderL.position.set(-0.38, 1.32, -0.05);
  group.add(shoulderL);
  const upperArmL = new THREE.Mesh(upperArmGeo, enemyMat);
  upperArmL.position.set(-0.38, 1.15, 0);
  upperArmL.rotation.x = 0.15;
  group.add(upperArmL);
  const elbowL = new THREE.Mesh(jointGeo, enemyMat);
  elbowL.position.set(-0.38, 1.0, 0.02);
  group.add(elbowL);
  const forearmL = new THREE.Mesh(forearmGeo, enemyMat);
  forearmL.position.set(-0.38, 0.88, -0.08);
  forearmL.rotation.x = -0.4;
  group.add(forearmL);
  const handL = new THREE.Mesh(handGeo, matSkin);
  handL.position.set(-0.38, 0.8, -0.12);
  group.add(handL);

  // ─── 腿部 ───
  const thighGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.35, 6);
  const calfGeo = new THREE.CylinderGeometry(0.06, 0.055, 0.35, 6);
  const kneeGeo = new THREE.SphereGeometry(0.06, 6, 6);
  const bootGeo = new THREE.BoxGeometry(0.1, 0.12, 0.16);
  // 左腿
  const hipL = new THREE.Mesh(kneeGeo, enemyDarkMat);
  hipL.position.set(-0.14, 0.8, 0);
  group.add(hipL);
  const thighL = new THREE.Mesh(thighGeo, enemyDarkMat);
  thighL.position.set(-0.14, 0.6, 0);
  group.add(thighL);
  const kneeL = new THREE.Mesh(kneeGeo, enemyDarkMat);
  kneeL.position.set(-0.14, 0.42, 0);
  group.add(kneeL);
  const calfL = new THREE.Mesh(calfGeo, enemyDarkMat);
  calfL.position.set(-0.14, 0.24, 0);
  group.add(calfL);
  const bootL = new THREE.Mesh(bootGeo, matBoot);
  bootL.position.set(-0.14, 0.06, -0.02);
  group.add(bootL);
  // 右腿
  const hipR = new THREE.Mesh(kneeGeo, enemyDarkMat);
  hipR.position.set(0.14, 0.8, 0);
  group.add(hipR);
  const thighR = new THREE.Mesh(thighGeo, enemyDarkMat);
  thighR.position.set(0.14, 0.6, 0);
  group.add(thighR);
  const kneeR = new THREE.Mesh(kneeGeo, enemyDarkMat);
  kneeR.position.set(0.14, 0.42, 0);
  group.add(kneeR);
  const calfR = new THREE.Mesh(calfGeo, enemyDarkMat);
  calfR.position.set(0.14, 0.24, 0);
  group.add(calfR);
  const bootR = new THREE.Mesh(bootGeo, matBoot);
  bootR.position.set(0.14, 0.06, -0.02);
  group.add(bootR);

  // ─── 敌人持枪（右手握枪朝前方） ───
  const eGunBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.55), matGunMetal);
  eGunBody.position.set(0.38, 0.9, -0.6);
  eGunBody.castShadow = true;
  group.add(eGunBody);
  const eGunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.2, 6), matGunMetalDark);
  eGunBarrel.rotation.x = Math.PI / 2;
  eGunBarrel.position.set(0.38, 0.91, -0.95);
  group.add(eGunBarrel);
  const eGunMag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.13, 0.04), matGunMetal);
  eGunMag.position.set(0.38, 0.8, -0.5);
  eGunMag.rotation.x = 0.15;
  group.add(eGunMag);
  const eGunStock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.14), matWood);
  eGunStock.position.set(0.38, 0.9, -0.28);
  group.add(eGunStock);
  // 枪口闪光
  const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 });
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), muzzleMat);
  muzzle.position.set(0.38, 0.91, -1.07);
  group.add(muzzle);

  // body 指向躯干 mesh（受击闪烁用）
  const body = torso;

  scene.add(group);

  return {
    group,
    body,
    muzzle,
    muzzleTimer: 0,
    hp: CFG.enemyHP,
    alive: true,
    fireCooldown: 0,
    state: 'patrol',
    target: new THREE.Vector3(),
    pathTimer: 0,
    deathTimer: 0,
    hitFlash: 0,
    wallFollowDir: 0,     // 绕墙方向角度
    wallFollowTimer: 0,   // 绕墙持续时间
  };
}

function spawnEnemies() {
  // 初始时生成足够多的敌人对象（池），但不全部激活
  const maxEnemies = 20;
  for (let i = state.enemies.length; i < maxEnemies; i++) {
    const e = createEnemy();
    e.alive = false;
    e.group.visible = false;
    state.enemies.push(e);
  }
}

function resetEnemy(e) {
  e.hp = CFG.enemyHP;
  e.alive = true;
  e.deathTimer = 0;
  e.hitFlash = 0;
  e.muzzleTimer = 0;
  if (e.muzzle) { e.muzzle.material.opacity = 0; e.muzzle.scale.setScalar(1); }
  e.group.visible = true;
  e.group.rotation.x = 0;
  e.group.position.y = 0;
  e.body.material = enemyMat;
  e.wallFollowDir = 0;
  e.wallFollowTimer = 0;
  // 随机复活点
  const angle = Math.random() * Math.PI * 2;
  const dist = 25 + Math.random() * 25;
  e.group.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
  e.target.copy(e.group.position);
}

// ═══════════════════════════════════════════
//  波次系统
// ═══════════════════════════════════════════
function getWaveEnemyCount(wave) {
  return Math.min(3 + (wave - 1) * 2, 15);
}

function resetWaveRewards() {
  state.waveDamageMult = 1;
  state.waveHpPickupMult = 1;
  state.waveAmmoPickupMult = 1;
  state.waveTimeStop = 0;
  state.waveNuke = false;
  state.waveSpeedMult = 1;
  state.waveJumpMult = 1;
  state.waveOneShot = false;
  if (state.waveMelee) swapWeapon(null); // 近战结束，恢复枪械
  state.waveMelee = null;
  state.waveLifeSteal = 0;
  state.waveFireRateMult = 1;
  state.shield = 0;
  updateShieldUI();
}

function startWave(waveNum) {
  resetWaveRewards();
  // 应用上一波选择的奖励
  if (pendingReward) {
    applyReward(pendingReward);
    pendingReward = null;
  }
  state.wave = waveNum;
  state.waveActive = false;
  state.waveAnnouncing = true;
  // 构建公告队列
  state.waveAnnounceQueue = [
    { text: '第 ' + waveNum + ' 波次敌人即将袭来！', duration: 1500, cls: '' },
    { text: '3', duration: 800, cls: 'countdown' },
    { text: '2', duration: 800, cls: 'countdown' },
    { text: '1', duration: 800, cls: 'countdown' },
    { text: '开始！', duration: 600, cls: 'go' },
  ];
  state.waveAnnounceTimer = 0;
  showNextAnnouncement();
  document.getElementById('wave-num').textContent = waveNum;
}

function showNextAnnouncement() {
  if (state.waveAnnounceQueue.length === 0) {
    // 公告结束，开始战斗
    state.waveAnnouncing = false;
    state.waveActive = true;
    spawnWaveEnemies();
    document.getElementById('wave-overlay').classList.add('hidden');
    return;
  }
  const item = state.waveAnnounceQueue.shift();
  const overlay = document.getElementById('wave-overlay');
  const text = document.getElementById('wave-text');
  overlay.classList.remove('hidden');
  text.textContent = item.text;
  if (item.text === '3') { try { sfxWaveStart.currentTime = 0; sfxWaveStart.play(); } catch (_) {} }
  text.className = item.cls || '';
  // 强制重新触发动画
  text.style.animation = 'none';
  text.offsetHeight;
  text.style.animation = '';
  state.waveAnnounceTimer = item.duration;
}

function spawnWaveEnemies() {
  const count = getWaveEnemyCount(state.wave);
  const positions = [
    [-30, 0, -30], [30, 0, 30], [-20, 0, 20], [20, 0, -20],
    [-40, 0, 10], [40, 0, -10], [0, 0, -40], [0, 0, 40],
    [-45, 0, -20], [45, 0, 20], [-15, 0, 45], [15, 0, -45],
  ];
  for (let i = 0; i < count; i++) {
    let e = state.enemies.find(en => !en.alive);
    if (!e) {
      e = createEnemy();
      state.enemies.push(e);
    }
    const p = positions[i % positions.length];
    e.group.position.set(p[0] + (Math.random() - 0.5) * 8, 0, p[2] + (Math.random() - 0.5) * 8);
    e.group.rotation.set(0, 0, 0);
    e.hp = CFG.enemyHP + (state.wave - 1) * 10; // 每波增加血量
    e.alive = true;
    e.deathTimer = 0;
    e.hitFlash = 0;
    e.muzzleTimer = 0;
    if (e.muzzle) { e.muzzle.material.opacity = 0; }
    e.group.visible = true;
    e.group.rotation.x = 0;
    e.group.position.y = 0;
    e.body.material = enemyMat;
    e.target.copy(e.group.position);
  }
  // 集体自毁
  if (state.waveNuke) {
    setTimeout(() => {
      for (const e of state.enemies) {
        if (e.alive) {
          e.alive = false;
          e.deathTimer = 3;
          e.group.rotation.x = Math.PI / 2;
          e.group.position.y = -0.5;
          state.score++;
        }
      }
      addKillFeed();
      document.getElementById('score').textContent = state.score;
    }, 1000);
  }
  // 刷新道具
  spawnPickups();
}

function checkWaveComplete() {
  if (!state.waveActive) return;
  const allDead = state.enemies.every(e => !e.alive);
  if (allDead) {
    state.waveActive = false;
    setTimeout(() => {
      if (state.playing) showRewardPhase();
    }, 1500);
  }
}

// ═══════════════════════════════════════════
//  奖励系统
// ═══════════════════════════════════════════
const REWARDS = [
  { id: 'hp_up',        name: '生命强化',  desc: '永久增加10点最大生命值，回满血',     icon: '❤️',  type: 'persist' },
  { id: 'ammo_up',      name: '弹药扩容',  desc: '永久增加20发备弹上限，补满弹药',     icon: '🎒',  type: 'persist' },
  { id: 'dmg_boost',    name: '穿甲弹药',  desc: '本波次枪械伤害×2',                 icon: '💥',  type: 'wave' },
  { id: 'hp_double',    name: '医疗支援',  desc: '本波次血包数量翻倍',               icon: '💊',  type: 'wave' },
  { id: 'ammo_double',  name: '后勤补给',  desc: '本波次弹药包数量翻倍',             icon: '📦',  type: 'wave' },
  { id: 'time_stop',    name: '时间冻结',  desc: '敌人出现后静止7秒',                icon: '⏸️',  type: 'wave' },
  { id: 'nuke',         name: '集体自毁',  desc: '敌人出现后立即全灭',               icon: '☢️',  type: 'wave' },
  { id: 'super_speed',  name: '疾风步',    desc: '本波次奔跑速度翻倍',               icon: '💨',  type: 'wave' },
  { id: 'super_jump',   name: '弹跳靴',    desc: '本波次跳跃高度翻倍',               icon: '🦘',  type: 'wave' },
  { id: 'one_shot',     name: '致命一击',  desc: '本波次一枪毙命',                   icon: '🎯',  type: 'wave' },
  { id: 'melee_machete',name: '战术砍刀',  desc: '获得近战砍刀（快速横斩）',         icon: '🔪',  type: 'wave' },
  { id: 'melee_hammer', name: '战锤',      desc: '获得重型战锤（双手下砸）',         icon: '🔨',  type: 'wave' },
  { id: 'life_steal',   name: '嗜血本能',  desc: '击杀敌人回复20HP',                icon: '🧛',  type: 'wave' },
  { id: 'shield',       name: '能量护盾',  desc: '本波次获得100点护盾',              icon: '🛡️',  type: 'wave' },
  { id: 'rapid_fire',   name: '急速射击',  desc: '本波次射速翻倍',                   icon: '⚡',  type: 'wave' },
];

let rewardChoices = []; // 当前展示的3个奖励
let pendingReward = null; // 待应用的奖励（在startWave重置后应用）

function showRewardPhase() {
  state.rewardPhase = true;
  state.playing = false;
  document.exitPointerLock();

  // Fisher-Yates 洗牌后取前3个，保证均匀分布
  const pool = [...REWARDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  rewardChoices = pool.slice(0, 3);

  // 渲染宝箱
  const chests = document.querySelectorAll('.reward-chest');
  chests.forEach((el, i) => {
    const reward = rewardChoices[i];
    if (!reward) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.classList.remove('opened', 'chosen', 'disabled');
    el.querySelector('.chest-icon').textContent = reward.icon;
    el.querySelector('.chest-name').textContent = reward.name;
    el.querySelector('.chest-desc').textContent = reward.desc;
  });

  document.getElementById('reward-skip').style.display = '';
  document.getElementById('reward-overlay').classList.remove('hidden');
}

function applyReward(reward) {
  switch (reward.id) {
    case 'hp_up':
      state.maxHp += 10;
      state.hp = state.maxHp;
      updateHealthUI();
      break;
    case 'ammo_up':
      state.maxReserve += 20;
      state.reserve = state.maxReserve;
      updateAmmoUI();
      break;
    case 'dmg_boost':    state.waveDamageMult = 2; break;
    case 'hp_double':    state.waveHpPickupMult = 2; break;
    case 'ammo_double':  state.waveAmmoPickupMult = 2; break;
    case 'time_stop':    state.waveTimeStop = 7; break;
    case 'nuke':         state.waveNuke = true; break;
    case 'super_speed':  state.waveSpeedMult = 2; break;
    case 'super_jump':   state.waveJumpMult = 2; break;
    case 'one_shot':     state.waveOneShot = true; break;
    case 'melee_machete':state.waveMelee = 'machete'; swapWeapon('machete'); break;
    case 'melee_hammer': state.waveMelee = 'hammer'; swapWeapon('hammer'); break;
    case 'life_steal':   state.waveLifeSteal = 20; break;
    case 'shield':       state.shield = 100; updateShieldUI(); break;
    case 'rapid_fire':   state.waveFireRateMult = 0.5; break;
  }
}

function hideRewardPhase() {
  document.getElementById('reward-overlay').classList.add('hidden');
  state.rewardPhase = false;
  state.playing = true;
  renderer.domElement.requestPointerLock();
  startWave(state.wave + 1);
}

function initRewardHandlers() {
  const chests = document.querySelectorAll('.reward-chest');
  chests.forEach((el) => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      const reward = rewardChoices[idx];
      if (!reward || el.classList.contains('disabled')) return;

      el.classList.add('chosen');
      // 禁用其他宝箱
      chests.forEach(c => { if (c !== el) c.classList.add('disabled'); });
      document.getElementById('reward-skip').style.display = 'none';

      pendingReward = reward;
      setTimeout(hideRewardPhase, 800);
    });
  });

  document.getElementById('reward-skip').addEventListener('click', () => {
    if (!state.rewardPhase) return;
    hideRewardPhase();
  });
}

// ═══════════════════════════════════════════
//  道具系统
// ═══════════════════════════════════════════
const PICKUP_RADIUS = 1.8;
const PICKUP_COUNT = 4; // 每种各 4 个
state.pickups = [];

// 弹药道具材质
const matAmmo = new THREE.MeshStandardMaterial({ color: 0xD4A017, roughness: 0.5, metalness: 0.3, emissive: 0xD4A017, emissiveIntensity: 0.15 });
// 血包道具材质
const matHealth = new THREE.MeshStandardMaterial({ color: 0x22CC44, roughness: 0.6, emissive: 0x22CC44, emissiveIntensity: 0.15 });

function createPickup(type) {
  const group = new THREE.Group();

  if (type === 'ammo') {
    // 弹药箱 — 小木箱 + 子弹标志
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), matAmmo);
    box.castShadow = true;
    group.add(box);
    // 标记条
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.08, 0.62),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })
    );
    strip.position.y = 0.12;
    group.add(strip);
    // 子弹图标 (竖条)
    const bullet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.25, 6),
      new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.6, roughness: 0.3 })
    );
    bullet.position.set(0, 0.32, 0);
    group.add(bullet);
    // 弹头
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.08, 6),
      new THREE.MeshStandardMaterial({ color: 0xCC8800, metalness: 0.5 })
    );
    tip.position.set(0, 0.48, 0);
    group.add(tip);
  } else {
    // 血包 — 绿色十字箱
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), matHealth);
    box.castShadow = true;
    group.add(box);
    // 白色十字
    const crossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.06, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
    );
    crossH.position.y = 0.2;
    group.add(crossH);
    const crossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.06, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
    );
    crossV.position.y = 0.2;
    group.add(crossV);
  }

  // 底部光圈
  const ringGeo = new THREE.RingGeometry(0.4, 0.55, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: type === 'ammo' ? 0xD4A017 : 0x22CC44,
    transparent: true, opacity: 0.3, side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);

  scene.add(group);

  return {
    group,
    type,
    active: true,
    bobOffset: Math.random() * Math.PI * 2,
  };
}

function spawnPickups() {
  // 清理旧道具
  for (const p of state.pickups) {
    scene.remove(p.group);
  }
  state.pickups = [];

  const rng = mulberry32(Date.now() & 0xFFFFFFFF);
  const ammoCount = Math.round(PICKUP_COUNT * state.waveAmmoPickupMult);
  const hpCount = Math.round(PICKUP_COUNT * state.waveHpPickupMult);
  for (let i = 0; i < ammoCount + hpCount; i++) {
    const type = i < ammoCount ? 'ammo' : 'health';
    const p = createPickup(type);
    // 随机位置，避开中央建筑和出生点
    let x, z, tries = 0;
    do {
      x = (rng() - 0.5) * 100;
      z = (rng() - 0.5) * 100;
      tries++;
    } while ((Math.abs(x) < 6 && Math.abs(z) < 6 || Math.abs(x) < 4 && Math.abs(z) < 4) && tries < 30);
    p.group.position.set(x, 0.3, z);
    state.pickups.push(p);
  }
}

function updatePickups(dt) {
  const px = camera.position.x;
  const pz = camera.position.z;
  let allCollected = true;

  for (const p of state.pickups) {
    if (!p.active) continue;
    allCollected = false;

    // 浮动动画
    const t = Date.now() * 0.003 + p.bobOffset;
    p.group.position.y = 0.3 + Math.sin(t) * 0.12;
    p.group.rotation.y += dt * 1.5;

    // 拾取检测
    const dx = px - p.group.position.x;
    const dz = pz - p.group.position.z;
    if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
      p.active = false;
      p.group.visible = false;
      try { sfxPickup.currentTime = 0; sfxPickup.play(); } catch (_) {}

      if (p.type === 'ammo') {
        state.reserve = state.maxReserve;
        addPickupMessage('弹药补满');
      } else {
        state.hp = Math.min(state.maxHp, state.hp + 40);
        updateHealthUI();
        addPickupMessage('生命 +40');
      }
    }
  }

  // 全部拾取完 → 重新生成
  if (allCollected && state.pickups.length > 0) {
    spawnPickups();
  }
}

function addPickupMessage(text) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;top:40%;left:50%;transform:translate(-50%,0);color:#fff;font-size:22px;font-weight:700;text-shadow:0 0 10px rgba(0,0,0,.8);pointer-events:none;animation:fadeOut 1.5s forwards;z-index:20';
  el.textContent = text;
  document.getElementById('hud').appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// ═══════════════════════════════════════════
//  碰撞检测
// ═══════════════════════════════════════════
const _playerBox = new THREE.Box3();
const _tempVec = new THREE.Vector3();

function collidesWithMap(pos, radius = CFG.playerRadius, height = CFG.playerHeight) {
  _playerBox.min.set(pos.x - radius, pos.y, pos.z - radius);
  _playerBox.max.set(pos.x + radius, pos.y + height, pos.z + radius);
  for (const b of colliders) {
    if (_playerBox.intersectsBox(b)) return true;
  }
  return false;
}

// 推离碰撞体（嵌入修正）
function pushOut(pos, radius = CFG.playerRadius, height = CFG.playerHeight) {
  for (let iter = 0; iter < 4; iter++) {
    _playerBox.min.set(pos.x - radius, pos.y, pos.z - radius);
    _playerBox.max.set(pos.x + radius, pos.y + height, pos.z + radius);
    let pushed = false;
    for (const b of colliders) {
      if (!_playerBox.intersectsBox(b)) continue;
      // 计算各轴穿透深度
      const dx1 = b.max.x - (pos.x - radius);
      const dx2 = (pos.x + radius) - b.min.x;
      const dz1 = b.max.z - (pos.z - radius);
      const dz2 = (pos.z + radius) - b.min.z;
      const minDx = dx1 < dx2 ? -dx1 : dx2;
      const minDz = dz1 < dz2 ? -dz1 : dz2;
      if (Math.abs(minDx) < Math.abs(minDz)) {
        pos.x += minDx;
      } else {
        pos.z += minDz;
      }
      pushed = true;
    }
    if (!pushed) break;
  }
}

// 敌人碰撞检测（简化版）
function enemyCollides(pos) {
  const r = 0.35, h = 1.8;
  _playerBox.min.set(pos.x - r, 0, pos.z - r);
  _playerBox.max.set(pos.x + r, h, pos.z + r);
  for (const b of colliders) {
    if (_playerBox.intersectsBox(b)) return true;
  }
  return false;
}

// ─── 射线-AABB 相交测试 ───
const _rayInvDir = new THREE.Vector3();
function rayIntersectsBox(origin, dir, box, maxDist) {
  _rayInvDir.set(
    dir.x !== 0 ? 1 / dir.x : Infinity,
    dir.y !== 0 ? 1 / dir.y : Infinity,
    dir.z !== 0 ? 1 / dir.z : Infinity
  );
  const t1 = (box.min.x - origin.x) * _rayInvDir.x;
  const t2 = (box.max.x - origin.x) * _rayInvDir.x;
  const t3 = (box.min.y - origin.y) * _rayInvDir.y;
  const t4 = (box.max.y - origin.y) * _rayInvDir.y;
  const t5 = (box.min.z - origin.z) * _rayInvDir.z;
  const t6 = (box.max.z - origin.z) * _rayInvDir.z;
  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));
  return tmax >= Math.max(tmin, 0) && tmin < maxDist;
}

// ─── 视线检测（两点之间是否有墙阻挡） ───
const _losOrigin = new THREE.Vector3();
const _losDir = new THREE.Vector3();
function hasLineOfSight(fromX, fromZ, toX, toZ) {
  _losOrigin.set(fromX, 1.0, fromZ);
  _losDir.set(toX - fromX, 0, toZ - fromZ);
  const dist = _losDir.length();
  if (dist < 0.1) return true;
  _losDir.divideScalar(dist);
  for (const b of colliders) {
    if (rayIntersectsBox(_losOrigin, _losDir, b, dist)) return false;
  }
  return true;
}

// ─── 可达性检测（能否直线走到目标，无墙阻挡） ───
function hasDirectPath(ex, ez, px, pz) {
  const dx = px - ex, dz = pz - ez;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return true;
  const nx = dx / dist, nz = dz / dist;
  const steps = Math.ceil(dist / 0.3);
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * dist;
    if (enemyCollides({ x: ex + nx * t, z: ez + nz * t })) return false;
  }
  return true;
}

// 带滑墙的移动（子步进防止穿模）
function moveWithCollision(pos, vel, dt) {
  const maxStep = 0.15; // 每子步最大位移
  const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
  const steps = Math.max(1, Math.ceil(speed * dt / maxStep));
  const subDt = dt / steps;

  for (let i = 0; i < steps; i++) {
    // X
    _tempVec.copy(pos);
    _tempVec.x += vel.x * subDt;
    if (!collidesWithMap(_tempVec)) {
      pos.x = _tempVec.x;
    } else {
      vel.x = 0;
    }
    // Z
    _tempVec.copy(pos);
    _tempVec.z += vel.z * subDt;
    if (!collidesWithMap(_tempVec)) {
      pos.z = _tempVec.z;
    } else {
      vel.z = 0;
    }
  }
  // Y
  _tempVec.copy(pos);
  _tempVec.y += vel.y * dt;
  if (!collidesWithMap(_tempVec)) {
    pos.y = _tempVec.y;
    state.onGround = false;
  } else {
    if (vel.y < 0) state.onGround = true;
    vel.y = 0;
  }
  // 嵌入修正
  pushOut(pos);
}

// ═══════════════════════════════════════════
//  射击系统
// ═══════════════════════════════════════════
const raycaster = new THREE.Raycaster();
const shootOrigin = new THREE.Vector3();
const shootDir = new THREE.Vector3();

function shoot() {
  if (state.fireCooldown > 0) return;

  // 近战攻击
  if (state.waveMelee) {
    const meleeRange = state.waveMelee === 'hammer' ? 4 : 3;
    state.fireCooldown = state.waveMelee === 'hammer' ? 0.8 : 0.35;
    meleeSwing = 0; // 从起点开始挥动
    meleeSwingDir = 1;
    playSound('hit');

    camera.getWorldPosition(shootOrigin);
    camera.getWorldDirection(shootDir);
    shootDir.y = 0; shootDir.normalize();
    raycaster.set(shootOrigin, shootDir);

    for (const e of state.enemies) {
      if (!e.alive) continue;
      const hits = raycaster.intersectObject(e.group, true);
      if (hits.length > 0 && hits[0].distance < meleeRange) {
        e.hp = 0; // 一击必杀
        e.hitFlash = 0.15;
        if (e.hp <= 0) {
          e.alive = false;
          e.deathTimer = 3;
          state.score++;
          playSound('kill');
          addKillFeed();
          document.getElementById('score').textContent = state.score;
          if (state.waveLifeSteal > 0) {
            state.hp = Math.min(state.maxHp, state.hp + state.waveLifeSteal);
            updateHealthUI();
          }
        }
        const hm = document.getElementById('hit-marker');
        hm.classList.remove('hidden'); hm.classList.add('show');
        state.hitMarkerTimer = 0.2;
        break;
      }
    }
    return;
  }

  if (state.reloading) return;
  if (state.ammo <= 0) {
    playSound('empty');
    if (state.reserve > 0) startReload();
    return;
  }

  state.ammo--;
  state.fireCooldown = CFG.fireRate * state.waveFireRateMult;
  playSound('shoot');

  // 后坐力
  weaponRecoil = 0.06;
  state.pitch += CFG.recoil * (0.8 + Math.random() * 0.4);

  // 枪口闪光
  if (state.muzzleFlash) {
    state.muzzleFlash.material.opacity = 1;
    state.muzzleFlash.scale.setScalar(1 + Math.random() * 0.5);
    state.muzzleTimer = 0.05;
  }

  // 射线
  camera.getWorldPosition(shootOrigin);
  camera.getWorldDirection(shootDir);
  // 散布
  shootDir.x += (Math.random() - 0.5) * CFG.spread;
  shootDir.y += (Math.random() - 0.5) * CFG.spread;
  shootDir.z += (Math.random() - 0.5) * CFG.spread;
  shootDir.normalize();

  raycaster.set(shootOrigin, shootDir);

  // 检测敌人
  let closestDist = Infinity;
  let closestEnemy = null;
  let isHeadshot = false;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const hits = raycaster.intersectObject(e.group, true);
    if (hits.length > 0 && hits[0].distance < closestDist) {
      closestDist = hits[0].distance;
      closestEnemy = e;
      isHeadshot = hits[0].object.userData.isHead === true;
    }
  }

  // 检测墙壁 (距离限制射击)
  const wallHits = raycaster.intersectObjects(
    scene.children.filter(c => c.isMesh && !c.parent?.userData?.isEnemy),
    false
  );
  const wallDist = wallHits.length > 0 ? wallHits[0].distance : 200;

  if (closestEnemy && closestDist < wallDist) {
    // 命中敌人
    const baseDmg = state.waveOneShot ? 9999 : CFG.damage * state.waveDamageMult;
    const dmg = isHeadshot ? baseDmg * 2.5 : baseDmg;
    closestEnemy.hp -= dmg;
    closestEnemy.hitFlash = 0.15;
    playSound('hit');

    // 命中标记（爆头用不同样式）
    const hm = document.getElementById('hit-marker');
    hm.classList.remove('hidden');
    hm.classList.add('show');
    hm.style.color = isHeadshot ? '#ff0' : '#f44';
    hm.textContent = isHeadshot ? '✕' : 'X';
    state.hitMarkerTimer = 0.2;

    if (closestEnemy.hp <= 0) {
      closestEnemy.alive = false;
      closestEnemy.deathTimer = 3;
      state.score++;
      playSound('kill');
      addKillFeed();
      document.getElementById('score').textContent = state.score;
      // 嗜血本能
      if (state.waveLifeSteal > 0) {
        state.hp = Math.min(state.maxHp, state.hp + state.waveLifeSteal);
        updateHealthUI();
      }
    }
  }
}

function startReload() {
  if (state.reloading || state.ammo === CFG.magSize || state.reserve <= 0) return;
  state.reloading = true;
  state.reloadTimer = CFG.reloadTime;
  playSound('reload');
  document.getElementById('reload-indicator').classList.remove('hidden');
}

// ═══════════════════════════════════════════
//  敌人 AI
// ═══════════════════════════════════════════
const _enemyDir = new THREE.Vector3();
const _toPlayer = new THREE.Vector3();

function updateEnemy(e, dt) {
  if (!e.alive) {
    e.deathTimer -= dt;
    // 倒地效果
    e.group.rotation.x = Math.min(e.group.rotation.x + dt * 3, Math.PI / 2);
    e.group.position.y = Math.max(e.group.position.y - dt * 2, -0.5);
    // 倒地动画结束后隐藏（不再自动复活，由波次系统控制）
    if (e.deathTimer <= 0) {
      e.group.visible = false;
    }
    return;
  }

  // 时间冻结
  if (state.waveTimeStop > 0) {
    return; // 冻结期间不移动不攻击
  }

  // 受击闪烁
  if (e.hitFlash > 0) {
    e.hitFlash -= dt;
    e.body.material = e.hitFlash > 0 ? hitFlashMat : enemyMat;
  }

  // 枪口闪光衰减
  if (e.muzzleTimer > 0) {
    e.muzzleTimer -= dt;
    if (e.muzzleTimer <= 0 && e.muzzle) {
      e.muzzle.material.opacity = 0;
      e.muzzle.scale.setScalar(1);
    }
  }

  const ePos = e.group.position;
  const pPos = camera.position;
  _toPlayer.subVectors(pPos, ePos);
  _toPlayer.y = 0;
  const dist = _toPlayer.length();

  // ─── AI 状态机（带视线检测） ───
  const los = dist < CFG.enemyDetectRange && hasLineOfSight(ePos.x, ePos.z, pPos.x, pPos.z);

  if (los && dist < CFG.enemyAttackRange) {
    e.state = 'attack';
    e.wallFollowTimer = 0;
  } else if (dist < CFG.enemyDetectRange) {
    e.state = 'chase';
  } else {
    e.state = 'patrol';
    e.wallFollowTimer = 0;
  }

  e.fireCooldown -= dt;

  switch (e.state) {
    case 'patrol': {
      e.pathTimer -= dt;
      if (e.pathTimer <= 0) {
        e.pathTimer = 2 + Math.random() * 3;
        e.target.set(
          ePos.x + (Math.random() - 0.5) * 20,
          0,
          ePos.z + (Math.random() - 0.5) * 20,
        );
        e.target.x = THREE.MathUtils.clamp(e.target.x, -55, 55);
        e.target.z = THREE.MathUtils.clamp(e.target.z, -55, 55);
      }
      _enemyDir.subVectors(e.target, ePos).normalize();
      const patrolStep = CFG.enemySpeed * 0.5 * dt;
      const nx = ePos.x + _enemyDir.x * patrolStep;
      const nz = ePos.z + _enemyDir.z * patrolStep;
      if (!enemyCollides({ x: nx, z: nz })) {
        ePos.x = nx; ePos.z = nz;
      } else if (!enemyCollides({ x: nx, z: ePos.z })) {
        ePos.x = nx;
      } else if (!enemyCollides({ x: ePos.x, z: nz })) {
        ePos.z = nz;
      } else {
        e.pathTimer = 0;
      }
      e.footstepTimer = (e.footstepTimer || 0) - dt;
      if (e.footstepTimer <= 0) { playEnemyFootstep(); e.footstepTimer = 0.5; }
      break;
    }
    case 'chase': {
      const chaseStep = CFG.enemySpeed * dt;
      // 有直接通路 → 直线追击
      if (hasDirectPath(ePos.x, ePos.z, pPos.x, pPos.z)) {
        _enemyDir.copy(_toPlayer).normalize();
        const cx = ePos.x + _enemyDir.x * chaseStep;
        const cz = ePos.z + _enemyDir.z * chaseStep;
        if (!enemyCollides({ x: cx, z: cz })) {
          ePos.x = cx; ePos.z = cz;
        } else if (!enemyCollides({ x: cx, z: ePos.z })) {
          ePos.x = cx;
        } else if (!enemyCollides({ x: ePos.x, z: cz })) {
          ePos.z = cz;
        }
        e.wallFollowTimer = 0;
      } else {
        // 被墙挡住 → 绕墙行走寻找玩家
        e.wallFollowTimer -= dt;
        if (e.wallFollowTimer <= 0) {
          // 选择绕墙方向：优先选择离玩家更近的一侧
          const base = Math.atan2(_toPlayer.x, _toPlayer.z);
          const leftX = ePos.x + Math.sin(base + 1.2) * chaseStep * 3;
          const leftZ = ePos.z + Math.cos(base + 1.2) * chaseStep * 3;
          const rightX = ePos.x + Math.sin(base - 1.2) * chaseStep * 3;
          const rightZ = ePos.z + Math.cos(base - 1.2) * chaseStep * 3;
          const leftBlocked = enemyCollides({ x: leftX, z: leftZ });
          const rightBlocked = enemyCollides({ x: rightX, z: rightZ });
          if (!leftBlocked && rightBlocked) {
            e.wallFollowDir = base + 1.2;
          } else if (!rightBlocked && leftBlocked) {
            e.wallFollowDir = base - 1.2;
          } else if (!leftBlocked && !rightBlocked) {
            // 都通，选离玩家更近的
            const dl = Math.hypot(leftX - pPos.x, leftZ - pPos.z);
            const dr = Math.hypot(rightX - pPos.x, rightZ - pPos.z);
            e.wallFollowDir = dl < dr ? base + 1.2 : base - 1.2;
          } else {
            // 都堵，尝试正后方
            e.wallFollowDir = base + Math.PI;
          }
          e.wallFollowTimer = 0.6;
        }
        // 沿绕墙方向移动
        _enemyDir.set(Math.sin(e.wallFollowDir), 0, Math.cos(e.wallFollowDir));
        const wx = ePos.x + _enemyDir.x * chaseStep;
        const wz = ePos.z + _enemyDir.z * chaseStep;
        if (!enemyCollides({ x: wx, z: wz })) {
          ePos.x = wx; ePos.z = wz;
        } else if (!enemyCollides({ x: wx, z: ePos.z })) {
          ePos.x = wx;
        } else if (!enemyCollides({ x: ePos.x, z: wz })) {
          ePos.z = wz;
        } else {
          // 完全被堵，立即重新选方向
          e.wallFollowTimer = 0;
        }
      }
      e.footstepTimer = (e.footstepTimer || 0) - dt;
      if (e.footstepTimer <= 0) { playEnemyFootstep(); e.footstepTimer = 0.4; }
      break;
    }
    case 'attack': {
      // 面向玩家
      _enemyDir.copy(_toPlayer).normalize();
      // 小幅随机移动
      const strafeAmt = Math.sin(Date.now() * 0.003) * CFG.enemySpeed * 0.3 * dt;
      const sx = ePos.x + _enemyDir.z * strafeAmt;
      const sz = ePos.z - _enemyDir.x * strafeAmt;
      if (!enemyCollides({ x: sx, z: sz })) {
        ePos.x = sx; ePos.z = sz;
      }

      // 开火（已有视线保证）
      if (e.fireCooldown <= 0) {
        e.fireCooldown = CFG.enemyFireRate + Math.random() * 0.5;
        if (e.muzzle) {
          e.muzzle.material.opacity = 1;
          e.muzzle.scale.setScalar(1.5);
          e.muzzleTimer = 0.08;
        }
        const hitChance = Math.max(0.2, 1 - dist / CFG.enemyAttackRange);
        if (Math.random() < hitChance) {
          damagePlayer(CFG.enemyDamage);
        }
      }
      break;
    }
  }

  // 面向移动方向 (加 π 让正面/枪口朝向目标)
  if (e.state !== 'attack') {
    const angle = Math.atan2(_enemyDir.x, _enemyDir.z) + Math.PI;
    e.group.rotation.y = THREE.MathUtils.lerp(e.group.rotation.y, angle, dt * 5);
  } else {
    const angle = Math.atan2(_toPlayer.x, _toPlayer.z) + Math.PI;
    e.group.rotation.y = THREE.MathUtils.lerp(e.group.rotation.y, angle, dt * 8);
  }

  // 限制在地图边界
  ePos.x = THREE.MathUtils.clamp(ePos.x, -58, 58);
  ePos.z = THREE.MathUtils.clamp(ePos.z, -58, 58);
}

// ═══════════════════════════════════════════
//  玩家受伤
// ═══════════════════════════════════════════
function damagePlayer(dmg) {
  // 护盾吸收
  if (state.shield > 0) {
    const absorbed = Math.min(state.shield, dmg);
    state.shield -= absorbed;
    dmg -= absorbed;
    updateShieldUI();
  }
  if (dmg <= 0) return;
  state.hp -= dmg;
  playSound('hurt');
  state.damageTimer = 0.3;
  const overlay = document.getElementById('damage-overlay');
  overlay.classList.remove('hidden');
  overlay.classList.add('show');
  updateHealthUI();

  if (state.hp <= 0) {
    state.hp = 0;
    gameOver();
  }
}

function updateHealthUI() {
  const pct = Math.max(0, (state.hp / state.maxHp) * 100);
  document.getElementById('health-text').textContent = Math.ceil(state.hp);
  const bar = document.getElementById('health-bar-inner');
  bar.style.width = pct + '%';
  bar.style.background = pct > 50 ? 'linear-gradient(90deg,#4f4,#0a0)' :
    pct > 25 ? 'linear-gradient(90deg,#fa0,#a50)' : 'linear-gradient(90deg,#f33,#a00)';
}

function updateAmmoUI() {
  document.getElementById('ammo-current').textContent = state.ammo;
  document.getElementById('ammo-reserve').textContent = state.reserve;
}

function updateShieldUI() {
  const bar = document.getElementById('shield-bar');
  if (state.shield > 0) {
    bar.classList.remove('hidden');
    document.getElementById('shield-text').textContent = Math.ceil(state.shield);
    document.getElementById('shield-bar-inner').style.width = state.shield + '%';
  } else {
    bar.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════
//  排行榜系统
// ═══════════════════════════════════════════
function loadRank() {
  try { return JSON.parse(localStorage.getItem('fps_rank') || '[]'); }
  catch { return []; }
}

function saveRank(list) {
  localStorage.setItem('fps_rank', JSON.stringify(list));
}

function addRankRecord(name, kills, wave) {
  const list = loadRank();
  list.push({ name, kills, wave, time: Date.now() });
  // 按波次降序，波次相同按击杀降序
  list.sort((a, b) => b.wave - a.wave || b.kills - a.kills);
  // 只保留前 20 名
  if (list.length > 20) list.length = 20;
  saveRank(list);
}

function renderRank() {
  const list = loadRank();
  const el = document.getElementById('rank-list');
  if (list.length === 0) {
    el.innerHTML = '<div class="rank-empty">暂无记录</div>';
    return;
  }
  el.innerHTML = '<div class="rank-header"><span>#</span><span>玩家</span><span>波次</span><span>击杀</span></div>' +
    list.map((r, i) =>
      `<div class="rank-row"><span class="rank-num">${i + 1}</span><span class="rank-name">${r.name}</span><span class="rank-wave">第${r.wave}波</span><span class="rank-kills">${r.kills}杀</span></div>`
    ).join('');
}

window.__showRank = function() {
  renderRank();
  document.getElementById('rank-overlay').classList.remove('hidden');
};

function gameOver() {
  state.playing = false;
  try { sfxGameOver.currentTime = 0; sfxGameOver.play(); } catch (_) {}
  document.exitPointerLock();

  // 记录排行榜
  if (state.playerName) {
    addRankRecord(state.playerName, state.score, state.wave);
  }

  const blocker = document.getElementById('blocker');
  blocker.style.display = 'flex';
  document.getElementById('menu').innerHTML = `
    <h1>GAME OVER</h1>
    <p style="font-size:18px;color:#f0c040;margin-bottom:8px">${state.playerName || 'Player1'}</p>
    <p>击杀数: ${state.score} | 到达第 ${state.wave} 波</p>
    <button id="playBtn">再来一局</button>
    <button id="rankBtn2" style="margin-top:12px;padding:10px 36px;font-size:16px;font-weight:600;background:0 0;color:#aaa;border:1px solid #555;cursor:pointer;letter-spacing:2px">排行榜</button>
  `;
  document.getElementById('playBtn').addEventListener('click', () => {
    blocker.style.display = 'none';
    document.getElementById('name-overlay').classList.remove('hidden');
    document.getElementById('name-input').value = state.playerName || 'Player1';
    document.getElementById('name-input').focus();
    document.getElementById('name-input').select();
  });
  document.getElementById('rankBtn2').addEventListener('click', () => {
    window.__showRank();
  });
}

// ═══════════════════════════════════════════
//  击杀信息
// ═══════════════════════════════════════════
function addKillFeed() {
  const feed = document.getElementById('kill-feed');
  const entry = document.createElement('div');
  entry.className = 'kill-entry';
  entry.textContent = `击杀敌人 #${state.score}`;
  feed.prepend(entry);
  // 清理旧条目
  while (feed.children.length > 5) feed.removeChild(feed.lastChild);
  setTimeout(() => entry.remove(), 3000);
}

// ═══════════════════════════════════════════
//  输入处理
// ═══════════════════════════════════════════
const GAME_KEYS = new Set(['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight','KeyR']);
document.addEventListener('keydown', e => {
  state.keys[e.code] = true;
  if (state.playing && GAME_KEYS.has(e.code)) e.preventDefault();
  if (e.code === 'KeyR' && state.playing) startReload();
});
document.addEventListener('keyup', e => { state.keys[e.code] = false; });

document.addEventListener('mousemove', e => {
  if (!state.playing || !document.pointerLockElement) return;
  state.yaw -= e.movementX * CFG.mouseSens;
  state.pitch -= e.movementY * CFG.mouseSens;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
});

document.addEventListener('mousedown', e => {
  if (e.button === 0 && state.playing && document.pointerLockElement) shoot();
});

// 持续射击 (按住)
let mouseHeld = false;
document.addEventListener('mousedown', e => { if (e.button === 0) mouseHeld = true; });
document.addEventListener('mouseup', e => { if (e.button === 0) mouseHeld = false; });

// ── pointer lock 管理 ──
// 锁定请求期间为 true，收到锁定成功事件或超时后重置为 false
let lockRequested = false;

function tryLockPointer() {
  lockRequested = true;
  try { document.body.requestPointerLock(); } catch (_) {}
  // 兜底：1 秒后如果没有收到锁定成功事件，认为请求结束
  setTimeout(() => { lockRequested = false; }, 1000);
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) {
    // 锁定成功
    lockRequested = false;
    document.body.classList.add('pointer-locked');
  } else {
    // 锁定丢失
    document.body.classList.remove('pointer-locked');
    // 如果是我们主动请求导致的（锁定失败/被拒），忽略
    if (lockRequested) {
      lockRequested = false;
      return;
    }
    // 用户按 ESC 主动解锁 → 暂停
    if (state.playing) {
      state.playing = false;
      document.getElementById('blocker').style.display = 'flex';
      document.getElementById('menu').innerHTML = `
        <h1>暂停</h1>
        <p>点击继续</p>
        <button id="playBtn">继续游戏</button>
      `;
      document.getElementById('playBtn').addEventListener('click', () => {
        window.__startGame();
      });
    }
  }
});

// 启动游戏 — 暴露给全局，供内联脚本调用
window.__startGame = function(name) {
  ensureAudio();
  state.playerName = name || 'Player1';
  startGame();
  tryLockPointer();
};

// 点击 canvas 也可以锁定鼠标 / 继续游戏
renderer.domElement.addEventListener('click', () => {
  if (!state.playing) {
    startGame();
  }
  tryLockPointer();
});

function startGame() {
  const isNewGame = state.hp <= 0;
  state.playing = true;
  state.reloading = false;
  document.getElementById('blocker').style.display = 'none';
  document.getElementById('reload-indicator').classList.add('hidden');
  document.getElementById('player-name-display').textContent = state.playerName;

  if (isNewGame) {
    state.maxHp = 100;
    state.maxReserve = CFG.reserveAmmo;
    state.hp = state.maxHp;
    state.ammo = CFG.magSize;
    state.reserve = state.maxReserve;
    state.score = 0;
    state.fireCooldown = 0;
    camera.position.set(15, CFG.playerHeight, 15);
    // 隐藏所有敌人
    for (const e of state.enemies) {
      e.alive = false;
      e.group.visible = false;
    }
    spawnPickups();
    updateHealthUI();
    document.getElementById('score').textContent = '0';
  }

  // 首次开始或死亡重开 → 启动第一波
  if (isNewGame || state.wave === 0) {
    startWave(1);
  }
}

// ═══════════════════════════════════════════
//  游戏循环
// ═══════════════════════════════════════════
const clock = new THREE.Clock();

function update(dt) {
  if (!state.playing) return;

  // ── 玩家移动 ──
  const speed = CFG.moveSpeed * (state.keys['ShiftLeft'] ? CFG.sprintMult : 1) * state.waveSpeedMult;
  const forward = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);

  const moveDir = new THREE.Vector3();
  if (state.keys['KeyW']) moveDir.add(forward);
  if (state.keys['KeyS']) moveDir.sub(forward);
  if (state.keys['KeyA']) moveDir.sub(right);
  if (state.keys['KeyD']) moveDir.add(right);
  if (moveDir.length() > 0) moveDir.normalize();

  state.velocity.x = moveDir.x * speed;
  state.velocity.z = moveDir.z * speed;

  // 重力 & 跳跃
  state.velocity.y -= CFG.gravity * dt;
  if (state.keys['Space'] && state.onGround) {
    state.velocity.y = CFG.jumpForce * state.waveJumpMult;
    state.onGround = false;
  }

  moveWithCollision(camera.position, state.velocity, dt);

  // 脚步声
  if (moveDir.length() > 0 && state.onGround && state.playing) {
    footstepTimer -= dt;
    if (footstepTimer <= 0) {
      playFootstep();
      footstepTimer = state.sprinting ? FOOTSTEP_INTERVAL * 0.6 : FOOTSTEP_INTERVAL;
    }
  } else {
    footstepTimer = 0;
  }

  // 地面限制
  if (camera.position.y < CFG.playerHeight) {
    camera.position.y = CFG.playerHeight;
    state.velocity.y = 0;
    state.onGround = true;
  }

  // 旋转
  camera.rotation.order = 'YXZ';
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;

  // ── 武器动画 ──
  weaponRecoil = THREE.MathUtils.lerp(weaponRecoil, 0, dt * 15);
  const walkBob = moveDir.length() > 0 ? Math.sin(Date.now() * 0.008) * 0.008 : 0;
  const breathe = Math.sin(Date.now() * 0.002) * 0.002;
  if (weaponGroup) {
    weaponGroup.position.y = -0.22 + walkBob + breathe;
    weaponGroup.position.x = 0.25 + Math.sin(Date.now() * 0.006) * 0.003;
    if (state.waveMelee) {
      if (meleeSwing < 1) {
        meleeSwing = Math.min(1, meleeSwing + dt * 5);
        const t = Math.sin(meleeSwing * Math.PI);
        if (state.waveMelee === 'machete') {
          // 砍刀：左右大幅度横挥
          const swingAngle = t * 1.2;
          weaponGroup.rotation.z = swingAngle;
          weaponGroup.rotation.x = -0.2;
          weaponGroup.position.x += swingAngle * 0.15;
        } else {
          // 战锤：上下大幅度下砸
          const swingAngle = t * 1.4;
          weaponGroup.rotation.x = swingAngle;
          weaponGroup.rotation.z = 0;
          weaponGroup.position.y -= swingAngle * 0.12;
        }
      } else {
        weaponGroup.rotation.z = 0;
        weaponGroup.rotation.x = 0;
      }
    } else {
      // 枪械：后坐力上下
      weaponGroup.rotation.x = -weaponRecoil * 3;
      weaponGroup.rotation.z = 0;
    }
  }

  // 枪口闪光
  if (state.muzzleTimer > 0) {
    state.muzzleTimer -= dt;
    if (state.muzzleTimer <= 0 && state.muzzleFlash) {
      state.muzzleFlash.material.opacity = 0;
    }
  }

  // ── 冷却 & 换弹 ──
  state.fireCooldown = Math.max(0, state.fireCooldown - dt);

  if (state.reloading) {
    state.reloadTimer -= dt;
    if (state.reloadTimer <= 0) {
      const need = CFG.magSize - state.ammo;
      const load = Math.min(need, state.reserve);
      state.ammo += load;
      state.reserve -= load;
      state.reloading = false;
      document.getElementById('reload-indicator').classList.add('hidden');
    }
  }

  // 持续射击
  if (mouseHeld && !state.reloading) shoot();

  // ── HUD 更新 ──
  document.getElementById('ammo-current').textContent = state.ammo;
  document.getElementById('ammo-reserve').textContent = state.reserve;

  // 命中标记
  if (state.hitMarkerTimer > 0) {
    state.hitMarkerTimer -= dt;
    if (state.hitMarkerTimer <= 0) {
      document.getElementById('hit-marker').classList.remove('show');
      document.getElementById('hit-marker').classList.add('hidden');
    }
  }

  // 受伤遮罩
  if (state.damageTimer > 0) {
    state.damageTimer -= dt;
    if (state.damageTimer <= 0) {
      document.getElementById('damage-overlay').classList.remove('show');
      document.getElementById('damage-overlay').classList.add('hidden');
    }
  }

  // ── 时间冻结递减（仅在敌人存活时）──
  if (state.waveTimeStop > 0 && state.waveActive) state.waveTimeStop -= dt;

  // ── 敌人更新 ──
  for (const e of state.enemies) updateEnemy(e, dt);

  // ── 波次 HUD 更新 ──
  const aliveCount = state.enemies.filter(e => e.alive).length;
  document.getElementById('wave-enemies').textContent = aliveCount;

  // ── 护盾 HUD ──
  if (state.shield > 0) updateShieldUI();

  // ── 道具更新 ──
  updatePickups(dt);

  // ── 波次公告计时 ──
  if (state.waveAnnouncing) {
    state.waveAnnounceTimer -= dt * 1000;
    if (state.waveAnnounceTimer <= 0) {
      showNextAnnouncement();
    }
  }

  // ── 波次完成检测 ──
  checkWaveComplete();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); // 限制 dt 防止穿透
  update(dt);
  renderer.render(scene, camera);
}

// ═══════════════════════════════════════════
//  窗口调整
// ═══════════════════════════════════════════
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ═══════════════════════════════════════════
//  启动
// ═══════════════════════════════════════════
try {
  buildMap();
  buildWeapon();
  spawnEnemies(); // 预创建敌人池
  spawnPickups();
  updateHealthUI();
  initRewardHandlers();
  animate();

  // 如果用户在模块加载前就点了按钮，自动启动
  if (window.__gameStartPending) {
    window.__startGame(window.__pendingName);
  }
} catch (err) {
  console.error('游戏初始化失败:', err);
  var blocker = document.getElementById('blocker');
  if (blocker) {
    blocker.innerHTML = '<div style="text-align:center;color:#fff;padding:40px">' +
      '<h2 style="color:#f44">加载失败</h2>' +
      '<p>Three.js 模块加载出错，请检查网络后刷新页面。</p>' +
      '<p style="color:#888;font-size:13px;margin-top:12px">' + err.message + '</p>' +
      '<button onclick="location.reload()" style="margin-top:20px;padding:10px 30px;font-size:16px;cursor:pointer">刷新</button>' +
      '</div>';
  }
}
