// 服务器游戏主循环（20Hz）
const { MSG } = require('./protocol');
const { rayHitsEnemy } = require('./collision');
const { updateEnemy } = require('./enemyAI');
const {
  getWaveEnemyCount, spawnWaveEnemies,
  checkWaveComplete, generateRewardChoices,
  applyReward, resetWaveRewards,
} = require('./wave');

const TICK_RATE = 20; // Hz
const TICK_MS = 1000 / TICK_RATE;
const CFG_DAMAGE = 28;
const CFG_SPREAD = 0.015;

const tickIntervals = new Map(); // room.id -> intervalId

function startGameLoop(room) {
  if (tickIntervals.has(room.id)) return;

  // 初始化第一波
  room.wave = 0;
  room.waveActive = false;
  room._waveAnnounceTime = 0;
  room._waveAnnouncePhase = 0; // 0=等待, 1=公告中, 2=战斗中
  room._rewardPending = false;
  room._pendingRewards = new Map();
  room._nukeWave = 0;
  room.gameTime = 0;

  // 给所有玩家设置出生点
  const spawns = [[0, 1.7, 5], [3, 1.7, 5], [-3, 1.7, 5], [0, 1.7, 8]];
  let si = 0;
  for (const [id, p] of room.players) {
    const sp = spawns[si % spawns.length];
    p.x = sp[0]; p.y = sp[1]; p.z = sp[2];
    p.hp = 100; p.maxHp = 100; p.score = 0; p.alive = true;
    p.shield = 0;
    resetWaveRewards(p);
    si++;
  }

  // 开始第一波
  startNextWave(room);

  const interval = setInterval(() => tick(room), TICK_MS);
  tickIntervals.set(room.id, interval);
}

function stopGameLoop(room) {
  const interval = tickIntervals.get(room.id);
  if (interval) {
    clearInterval(interval);
    tickIntervals.delete(room.id);
  }
}

function startNextWave(room) {
  room.wave++;
  room.waveActive = false;
  room._waveAnnouncePhase = 1;
  room._waveAnnounceTime = 0;
  room._rewardPending = false;
  room._pendingRewards = new Map();

  // 重置所有存活玩家的波次奖励
  for (const [id, p] of room.players) {
    if (p.alive) {
      resetWaveRewards(p);
    }
  }

  // 通知客户端波次开始
  room.broadcast({ type: MSG.WAVE_START, waveNum: room.wave });

  // 公告结束后生成敌人（公告时间约 4.5 秒）
  setTimeout(() => {
    if (room.gameState !== 'playing') return;
    spawnWaveEnemies(room);
    room.waveActive = true;
    room._waveAnnouncePhase = 2;
  }, 4500);
}

function tick(room) {
  const dt = 1 / TICK_RATE;
  room.gameTime += dt;

  // 计算所有玩家中最大的时间冻结值
  let maxTimeStop = 0;
  for (const [id, p] of room.players) {
    if (p.waveTimeStop > maxTimeStop) maxTimeStop = p.waveTimeStop;
  }

  // 更新敌人 AI
  if (room.waveActive && room._waveAnnouncePhase === 2) {
    for (const e of room.enemies) {
      const result = updateEnemy(e, dt, room.players, maxTimeStop);
      if (result && result.hit) {
        // 敌人命中玩家
        const target = room.players.get(result.targetId);
        if (target && target.alive) {
          damagePlayer(room, target, result.damage);
        }
      }
    }

    // 时间冻结递减
    for (const [id, p] of room.players) {
      if (p.waveTimeStop > 0) p.waveTimeStop -= dt;
    }
  }

  // 处理射击队列
  while (room.shootQueue.length > 0) {
    const shot = room.shootQueue.shift();
    handleShot(room, shot);
  }

  // 检查波次完成
  if (room.waveActive && room._waveAnnouncePhase === 2) {
    if (checkWaveComplete(room)) {
      room.waveActive = false;
      room._waveAnnouncePhase = 0;
      room.broadcast({ type: MSG.WAVE_COMPLETE });

      // 延迟后进入奖励阶段
      setTimeout(() => {
        if (room.gameState !== 'playing') return;
        startRewardPhase(room);
      }, 1500);
    }
  }

  // 检查奖励阶段完成（所有玩家都选了）
  if (room._rewardPending) {
    let allPicked = true;
    for (const [id, p] of room.players) {
      if (p.alive && !room._pendingRewards.has(id)) {
        allPicked = false;
        break;
      }
    }
    if (allPicked) {
      // 应用奖励
      for (const [pid, rewardId] of room._pendingRewards) {
        const player = room.players.get(pid);
        if (player) {
          applyReward(player, rewardId);
          room.broadcast({ type: MSG.REWARD_APPLIED, playerId: pid, rewardId });
        }
      }
      room._rewardPending = false;
      startNextWave(room);
    }
  }

  // 检查游戏结束（所有玩家死亡）
  if (room.waveActive || room._waveAnnouncePhase === 2) {
    const allDead = [...room.players.values()].every(p => !p.alive);
    if (allDead) {
      room.gameState = 'gameover';
      const scores = [];
      for (const [id, p] of room.players) {
        scores.push({ id, name: p.name, score: p.score, wave: room.wave });
      }
      room.broadcast({ type: MSG.GAME_OVER, scores, wave: room.wave });
      stopGameLoop(room);
      return;
    }
  }

  // 广播游戏状态
  broadcastGameState(room);
}

function handleShot(room, shot) {
  const player = room.players.get(shot.playerId);
  if (!player || !player.alive) return;

  const origin = { x: shot.ox, y: shot.oy, z: shot.oz };
  const dir = { x: shot.dx, y: shot.dy, z: shot.dz };

  if (shot.isMelee) {
    // 近战：检查近距离敌人
    for (const e of room.enemies) {
      if (!e.alive) continue;
      const dx = e.x - origin.x, dz = e.z - origin.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const range = shot.weapon === 'hammer' ? 4 : 3;
      if (dist < range) {
        e.hp = 0;
        e.alive = false;
        e.deathTimer = 3;
        player.score++;
        room.broadcast({
          type: MSG.ENEMY_KILLED,
          enemyId: e.id, killerId: player.id,
          killerName: player.name, killerScore: player.score,
        });
      }
    }
    return;
  }

  // 枪械射击
  // 添加散布
  const shootDir = {
    x: dir.x + (Math.random() - 0.5) * CFG_SPREAD,
    y: dir.y + (Math.random() - 0.5) * CFG_SPREAD,
    z: dir.z + (Math.random() - 0.5) * CFG_SPREAD,
  };
  const len = Math.sqrt(shootDir.x * shootDir.x + shootDir.y * shootDir.y + shootDir.z * shootDir.z);
  shootDir.x /= len; shootDir.y /= len; shootDir.z /= len;

  // 检测敌人命中
  let closestDist = Infinity;
  let closestEnemy = null;
  let isHeadshot = false;

  for (const e of room.enemies) {
    if (!e.alive) continue;
    const hit = rayHitsEnemy(origin, shootDir, e);
    if (hit && hit.dist < closestDist) {
      closestDist = hit.dist;
      closestEnemy = e;
      isHeadshot = hit.headshot;
    }
  }

  if (closestEnemy) {
    const baseDmg = CFG_DAMAGE * player.waveDamageMult;
    const dmg = isHeadshot ? baseDmg * 2.5 : baseDmg;
    closestEnemy.hp -= dmg;
    closestEnemy.hitFlash = 0.15;

    room.broadcast({
      type: MSG.ENEMY_HIT,
      enemyId: closestEnemy.id, damage: dmg,
      isHeadshot, shooterId: player.id,
    });

    if (closestEnemy.hp <= 0) {
      closestEnemy.alive = false;
      closestEnemy.deathTimer = 3;
      player.score++;

      // 嗜血奖励
      if (player.waveLifeSteal > 0) {
        player.hp = Math.min(player.maxHp, player.hp + player.waveLifeSteal);
      }

      room.broadcast({
        type: MSG.ENEMY_KILLED,
        enemyId: closestEnemy.id, killerId: player.id,
        killerName: player.name, killerScore: player.score,
      });
    }
  }
}

function damagePlayer(room, player, dmg) {
  if (!player.alive) return;

  // 护盾吸收
  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, dmg);
    player.shield -= absorbed;
    dmg -= absorbed;
  }
  if (dmg <= 0) return;

  player.hp -= dmg;
  room.sendTo(player.id, { type: MSG.PLAYER_HURT, playerId: player.id, damage: dmg, hp: player.hp });
  room.broadcast({ type: MSG.PLAYER_HURT, playerId: player.id, damage: dmg, hp: player.hp }, player.id);

  if (player.hp <= 0) {
    player.hp = 0;
    player.alive = false;
    room.broadcast({ type: MSG.PLAYER_KILLED, playerId: player.id });
  }
}

function startRewardPhase(room) {
  room._rewardPending = true;
  room._pendingRewards = new Map();

  const choices = generateRewardChoices();
  room.rewardChoices = choices;
  room.broadcast({ type: MSG.REWARD_CHOICES, choices });

  // 设置超时：30秒后自动跳过
  setTimeout(() => {
    if (room._rewardPending) {
      // 给未选择的玩家应用空奖励
      for (const [id, p] of room.players) {
        if (p.alive && !room._pendingRewards.has(id)) {
          room._pendingRewards.set(id, null);
        }
      }
    }
  }, 30000);
}

function broadcastGameState(room) {
  const enemies = room.enemies.map(e => ({
    id: e.id, x: e.x, y: e.y, z: e.z,
    ry: e.rotationY, hp: e.hp, alive: e.alive,
    st: e.state, hf: e.hitFlash, mt: e.muzzleTimer, dt: e.deathTimer,
  }));

  const players = {};
  for (const [id, p] of room.players) {
    players[id] = {
      x: p.x, y: p.y, z: p.z,
      yaw: p.yaw, pitch: p.pitch,
      hp: p.hp, score: p.score, alive: p.alive,
      ms: p.moveState, w: p.weapon, mf: p.muzzleFlash,
      name: p.name,
    };
  }

  room.broadcast({
    type: MSG.GAME_STATE,
    enemies,
    players,
    wave: room.wave,
    wa: room.waveActive,
    gt: room.gameTime,
  });
}

module.exports = { startGameLoop, stopGameLoop };
