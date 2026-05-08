// 房间管理 + 地图碰撞体构建
const { addCollider, clearColliders } = require('./collision');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 地图1 碰撞体（与 game.js buildMap1 完全一致的 addBox 调用，只生成碰撞数据）
function buildMap1Colliders() {
  const wallH = 5, wallT = 0.5;
  // 外围墙
  addCollider(0, wallH / 2, -60, 120, wallH, wallT);
  addCollider(0, wallH / 2, 60, 120, wallH, wallT);
  addCollider(-60, wallH / 2, 0, wallT, wallH, 120);
  addCollider(60, wallH / 2, 0, wallT, wallH, 120);
  // 中央建筑
  addCollider(0, 1.5, 0, 6, 3, 6);
  addCollider(-8, 1.5, 0, 0.4, 3, 8);
  addCollider(8, 1.5, 0, 0.4, 3, 8);
  // A 区
  addCollider(-30, 1.5, -25, 8, 3, 0.4);
  addCollider(-30, 1.5, -35, 8, 3, 0.4);
  addCollider(-34, 1.5, -30, 0.4, 3, 10);
  addCollider(-28, 0.75, -28, 2, 1.5, 2);
  addCollider(-28, 2.25, -28, 1.5, 1.5, 1.5);
  addCollider(-32, 0.75, -32, 2, 1.5, 2);
  // B 区
  addCollider(30, 1.5, 25, 8, 3, 0.4);
  addCollider(30, 1.5, 35, 8, 3, 0.4);
  addCollider(34, 1.5, 30, 0.4, 3, 10);
  addCollider(28, 0.75, 28, 2, 1.5, 2);
  addCollider(32, 0.75, 32, 2, 1.5, 2);
  addCollider(32, 2.25, 32, 1.5, 1.5, 1.5);
  // 通道 & 掩体
  addCollider(-15, 1.5, -20, 12, 3, 0.4);
  addCollider(15, 1.5, 20, 12, 3, 0.4);
  addCollider(-18, 0.75, 10, 2, 1.5, 2);
  addCollider(18, 0.75, -10, 2, 1.5, 2);
  addCollider(-10, 0.75, 18, 3, 1.5, 1.5);
  addCollider(10, 0.75, -18, 3, 1.5, 1.5);
  addCollider(22, 0.75, 5, 2, 1.5, 2);
  addCollider(-22, 0.75, -5, 2, 1.5, 2);
  // 高台
  addCollider(-40, 0.75, 0, 6, 1.5, 6);
  addCollider(-40, 0.75, 0, 5.5, 1.4, 5.5);
  addCollider(40, 0.75, 0, 6, 1.5, 6);
  addCollider(40, 0.75, 0, 5.5, 1.4, 5.5);
  // 标记柱
  addCollider(-30, 2, -30, 0.3, 4, 0.3);
  addCollider(30, 2, 30, 0.3, 4, 0.3);
  // 随机小箱子
  const rng = mulberry32(42);
  for (let i = 0; i < 15; i++) {
    const sx = (rng() - 0.5) * 90;
    const sz = (rng() - 0.5) * 90;
    if (Math.abs(sx) < 5 && Math.abs(sz) < 5) continue;
    const size = 1 + rng() * 1.5;
    addCollider(sx, size / 2, sz, size, size, size);
  }
}

// 地图2 碰撞体
function buildMap2Colliders() {
  const wH = 5, wT = 0.5;
  // 外围墙
  addCollider(0, wH / 2, -60, 120, wH, wT);
  addCollider(0, wH / 2, 60, 120, wH, wT);
  addCollider(-60, wH / 2, 0, wT, wH, 120);
  addCollider(60, wH / 2, 0, wT, wH, 120);
  // A 点
  addCollider(38, 2, -38, 10, 4, 0.5);
  addCollider(38, 2, -44, 10, 4, 0.5);
  addCollider(43, 2, -41, 0.5, 4, 6);
  addCollider(33, 2, -41, 0.5, 4, 6);
  addCollider(38, 4.2, -41, 11, 0.4, 7);
  addCollider(35, 0.75, -35, 2, 1.5, 2);
  addCollider(35, 2.25, -35, 1.5, 1.5, 1.5);
  addCollider(42, 0.75, -35, 1.5, 1.5, 1.5);
  addCollider(38, 1, -28, 14, 2, 0.5);
  addCollider(28, 1, -38, 0.5, 2, 14);
  // B 点
  addCollider(-38, 1.5, -35, 14, 3, 0.5);
  addCollider(-38, 1.5, -44, 14, 3, 0.5);
  addCollider(-45, 1.5, -39.5, 0.5, 3, 9);
  addCollider(-31, 1.5, -42, 0.5, 3, 4);
  addCollider(-31, 1.5, -37, 0.5, 3, 4);
  addCollider(-40, 0.75, -40, 2, 1.5, 2);
  addCollider(-35, 0.75, -37, 2, 1.5, 2);
  addCollider(-42, 2.25, -40, 1.5, 1.5, 1.5);
  addCollider(-28, 0.75, -39, 2, 1.5, 2);
  // 东侧集市
  addCollider(46, 1.5, -8, 0.5, 3, 16);
  addCollider(46, 1.5, -30, 0.5, 3, 12);
  addCollider(53, 1.5, -15, 0.5, 3, 30);
  addCollider(49, 0.75, -5, 2, 1.5, 2);
  addCollider(49, 0.75, -22, 2, 1.5, 2);
  addCollider(46, 2, -16, 0.8, 4, 0.8);
  addCollider(46, 2, -2, 0.8, 4, 0.8);
  // 西侧巷道
  addCollider(-15, 1.5, 15, 28, 3, 0.5);
  addCollider(-15, 1.5, 23, 28, 3, 0.5);
  addCollider(-5, 0.75, 19, 2, 1.5, 2);
  addCollider(-22, 0.75, 19, 1.5, 1.5, 1.5);
  addCollider(-12, 1.5, 19, 0.5, 3, 4);
  // 清真寺
  addCollider(0, 2, -5, 6, 4, 0.5);
  addCollider(0, 2, 5, 6, 4, 0.5);
  addCollider(-3, 2, 0, 0.5, 4, 10);
  addCollider(3, 2, 0, 0.5, 4, 10);
  addCollider(0, 2, 0, 1.2, 4, 1.2);
  for (const [tx, tz] of [[-4.5, -6], [4.5, -6], [-4.5, 6], [4.5, 6]]) {
    addCollider(tx, 2.5, tz, 1, 5, 1);
    addCollider(tx, 5.2, tz, 1.3, 0.4, 1.3);
  }
  addCollider(-6, 0.75, 0, 1.5, 1.5, 1.5);
  addCollider(6, 0.75, 0, 1.5, 1.5, 1.5);
  addCollider(0, 0.75, -9, 2, 1.5, 2);
  addCollider(0, 0.75, 9, 2, 1.5, 2);
  // 隧道
  addCollider(15, 1.5, -10, 0.5, 3, 12);
  addCollider(22, 1.5, -10, 0.5, 3, 12);
  addCollider(18.5, 1.5, -16, 7, 3, 0.5);
  addCollider(18, 0.75, -8, 1.5, 1.5, 1.5);
  // 通道墙
  addCollider(-10, 1.5, 5, 0.5, 3, 10);
  addCollider(-18, 1.5, 0, 12, 3, 0.5);
  // 散布掩体
  addCollider(20, 0.5, 15, 3, 1, 2);
  addCollider(-20, 0.5, -15, 3, 1, 2);
  addCollider(25, 0.5, 5, 2, 1, 3);
  addCollider(-25, 0.5, -5, 2, 1, 3);
  addCollider(10, 0.75, 25, 2, 1.5, 2);
  addCollider(-10, 0.75, -25, 2, 1.5, 2);
  addCollider(5, 0.75, -30, 2, 1.5, 2);
  addCollider(-5, 0.75, 30, 2, 1.5, 2);
  addCollider(30, 0.4, 20, 2, 0.8, 1.5);
  addCollider(-30, 0.4, -20, 2, 0.8, 1.5);
  // 标记柱
  addCollider(38, 2, -28, 0.3, 4, 0.3);
  addCollider(-31, 2, -35, 0.3, 4, 0.3);
  addCollider(0, 5, 0, 0.2, 2, 0.2);
  // 随机小箱子
  const rng = mulberry32(77);
  for (let i = 0; i < 10; i++) {
    const sx = (rng() - 0.5) * 90;
    const sz = (rng() - 0.5) * 90;
    if (Math.abs(sx) < 5 && Math.abs(sz) < 5) continue;
    const size = 1 + rng() * 1.5;
    addCollider(sx, size / 2, sz, size, size, size);
  }
}

function buildServerMap(mapId) {
  clearColliders();
  if (mapId === 2) buildMap2Colliders();
  else buildMap1Colliders();
}

// ─── 房间类 ───
let nextPlayerId = 1;

class Room {
  constructor(id, hostWs) {
    this.id = id;
    this.hostId = null;
    this.players = new Map(); // playerId -> {id, name, ws, ...}
    this.mapId = 1;
    this.gameState = 'lobby'; // lobby | playing | reward | gameover
    this.wave = 0;
    this.waveActive = false;
    this.enemies = [];
    this.pickups = [];
    this.rewardChoices = [];
    this.pendingRewards = new Map(); // playerId -> rewardId
    this.shootQueue = [];
    this.tickInterval = null;
    this.gameTime = 0;

    // 添加房主
    const pid = 'p' + (nextPlayerId++);
    this.hostId = pid;
    this.players.set(pid, {
      id: pid,
      name: '',
      ws: hostWs,
      x: 0, y: 1.7, z: 0,
      yaw: 0, pitch: 0,
      hp: 100, maxHp: 100,
      score: 0, alive: true,
      moveState: 'idle',
      weapon: 'ak47',
      muzzleFlash: false,
      waveDamageMult: 1, waveHpPickupMult: 1, waveAmmoPickupMult: 1,
      waveSpeedMult: 1, waveJumpMult: 1, waveOneShot: false,
      waveMelee: null, waveLifeSteal: 0, waveFireRateMult: 1,
      shield: 0,
    });
    hostWs._playerId = pid;
    hostWs._roomId = this.id;
  }

  addPlayer(ws, name) {
    const pid = 'p' + (nextPlayerId++);
    this.players.set(pid, {
      id: pid,
      name,
      ws,
      x: 0, y: 1.7, z: 0,
      yaw: 0, pitch: 0,
      hp: 100, maxHp: 100,
      score: 0, alive: true,
      moveState: 'idle',
      weapon: 'ak47',
      muzzleFlash: false,
      waveDamageMult: 1, waveHpPickupMult: 1, waveAmmoPickupMult: 1,
      waveSpeedMult: 1, waveJumpMult: 1, waveOneShot: false,
      waveMelee: null, waveLifeSteal: 0, waveFireRateMult: 1,
      shield: 0,
    });
    ws._playerId = pid;
    ws._roomId = this.id;
    return pid;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    if (playerId === this.hostId && this.players.size > 0) {
      // 转移房主
      this.hostId = this.players.keys().next().value;
    }
  }

  getPlayerList() {
    const list = [];
    for (const [id, p] of this.players) {
      list.push({ id, name: p.name, hp: p.hp, score: p.score, alive: p.alive, isHost: id === this.hostId });
    }
    return list;
  }

  broadcast(msg, excludeId) {
    const data = JSON.stringify(msg);
    for (const [id, p] of this.players) {
      if (id === excludeId) continue;
      if (p.ws.readyState === 1) p.ws.send(data);
    }
  }

  sendTo(playerId, msg) {
    const p = this.players.get(playerId);
    if (p && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
  }
}

module.exports = { Room, buildServerMap };
