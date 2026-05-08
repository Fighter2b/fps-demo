// 波次 & 奖励系统（从 game.js 提取）

const REWARDS = [
  { id: 'hp_up', name: '生命强化', desc: '永久增加10点最大生命值，回满血', icon: '❤️', type: 'persist' },
  { id: 'ammo_up', name: '弹药扩容', desc: '永久增加20发备弹上限，补满弹药', icon: '🎒', type: 'persist' },
  { id: 'dmg_boost', name: '穿甲弹药', desc: '本波次枪械伤害×2', icon: '💥', type: 'wave' },
  { id: 'hp_double', name: '医疗支援', desc: '本波次血包数量翻倍', icon: '💊', type: 'wave' },
  { id: 'ammo_double', name: '后勤补给', desc: '本波次弹药包数量翻倍', icon: '📦', type: 'wave' },
  { id: 'time_stop', name: '时间冻结', desc: '敌人出现后静止7秒', icon: '⏸️', type: 'wave' },
  { id: 'nuke', name: '集体自毁', desc: '敌人出现后立即全灭', icon: '☢️', type: 'wave' },
  { id: 'super_speed', name: '疾风步', desc: '本波次奔跑速度翻倍', icon: '💨', type: 'wave' },
  { id: 'super_jump', name: '弹跳靴', desc: '本波次跳跃高度翻倍', icon: '🦘', type: 'wave' },
  { id: 'one_shot', name: '致命一击', desc: '本波次一枪毙命', icon: '🎯', type: 'wave' },
  { id: 'melee_machete', name: '战术砍刀', desc: '获得近战砍刀（快速横斩）', icon: '🔪', type: 'wave' },
  { id: 'melee_hammer', name: '战锤', desc: '获得重型战锤（双手下砸）', icon: '🔨', type: 'wave' },
  { id: 'life_steal', name: '嗜血本能', desc: '击杀敌人回复20HP', icon: '🧛', type: 'wave' },
  { id: 'shield', name: '能量护盾', desc: '本波次获得100点护盾', icon: '🛡️', type: 'wave' },
  { id: 'rapid_fire', name: '急速射击', desc: '本波次射速翻倍', icon: '⚡', type: 'wave' },
];

const ENEMY_HP_BASE = 100;
const ENEMY_HP_PER_WAVE = 10;

function getWaveEnemyCount(wave) {
  return Math.min(3 + (wave - 1) * 2, 15);
}

// 出生点
const SPAWN_POSITIONS = [
  [-30, 0, -30], [30, 0, 30], [-20, 0, 20], [20, 0, -20],
  [-40, 0, 10], [40, 0, -10], [0, 0, -40], [0, 0, 40],
  [-45, 0, -20], [45, 0, 20], [-15, 0, 45], [15, 0, -45],
];

function spawnWaveEnemies(room) {
  const count = getWaveEnemyCount(room.wave);
  const enemies = [];

  for (let i = 0; i < count; i++) {
    const p = SPAWN_POSITIONS[i % SPAWN_POSITIONS.length];
    enemies.push({
      id: i,
      x: p[0] + (Math.random() - 0.5) * 8,
      y: 0,
      z: p[2] + (Math.random() - 0.5) * 8,
      rotationY: 0,
      hp: ENEMY_HP_BASE + (room.wave - 1) * ENEMY_HP_PER_WAVE,
      alive: true,
      state: 'patrol',
      targetX: p[0] + (Math.random() - 0.5) * 8,
      targetZ: p[2] + (Math.random() - 0.5) * 8,
      pathTimer: 0,
      fireCooldown: 0,
      wallFollowDir: 0,
      wallFollowTimer: 0,
      hitFlash: 0,
      muzzleTimer: 0,
      deathTimer: 0,
    });
  }

  room.enemies = enemies;

  // 集体自毁奖励
  if (room._nukeWave === room.wave) {
    setTimeout(() => {
      for (const e of room.enemies) {
        if (e.alive) {
          e.alive = false;
          e.deathTimer = 3;
        }
      }
      room._nukeWave = 0;
    }, 1000);
  }
}

function checkWaveComplete(room) {
  if (!room.waveActive) return false;
  return room.enemies.every(e => !e.alive);
}

function generateRewardChoices() {
  const pool = [...REWARDS];
  // Fisher-Yates 洗牌
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

function applyReward(player, rewardId) {
  switch (rewardId) {
    case 'hp_up':
      player.maxHp += 10;
      player.hp = player.maxHp;
      break;
    case 'ammo_up':
      // 客户端处理
      break;
    case 'dmg_boost': player.waveDamageMult = 2; break;
    case 'hp_double': player.waveHpPickupMult = 2; break;
    case 'ammo_double': player.waveAmmoPickupMult = 2; break;
    case 'time_stop': player.waveTimeStop = 7; break;
    case 'nuke': player._nukeWave = player._currentWave; break;
    case 'super_speed': player.waveSpeedMult = 2; break;
    case 'super_jump': player.waveJumpMult = 2; break;
    case 'one_shot': player.waveOneShot = true; break;
    case 'melee_machete': player.waveMelee = 'machete'; break;
    case 'melee_hammer': player.waveMelee = 'hammer'; break;
    case 'life_steal': player.waveLifeSteal = 20; break;
    case 'shield': player.shield = 100; break;
    case 'rapid_fire': player.waveFireRateMult = 0.5; break;
  }
}

function resetWaveRewards(player) {
  player.waveDamageMult = 1;
  player.waveHpPickupMult = 1;
  player.waveAmmoPickupMult = 1;
  player.waveTimeStop = 0;
  player.waveSpeedMult = 1;
  player.waveJumpMult = 1;
  player.waveOneShot = false;
  player.waveMelee = null;
  player.waveLifeSteal = 0;
  player.waveFireRateMult = 1;
  // shield 和 persist 类不重置
}

module.exports = {
  REWARDS, getWaveEnemyCount, spawnWaveEnemies,
  checkWaveComplete, generateRewardChoices,
  applyReward, resetWaveRewards,
};
