// 敌人 AI 系统（从 game.js:2082-2267 提取，多目标版本）
const { enemyCollides, hasLineOfSight, hasDirectPath } = require('./collision');

const CFG = {
  enemySpeed: 3.5,
  enemyDamage: 12,
  enemyFireRate: 1.0,
  enemyDetectRange: 40,
  enemyAttackRange: 20,
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// 找到最近的存活玩家
function findNearestPlayer(ex, ez, players) {
  let nearest = null, minDist = Infinity;
  for (const [id, p] of players) {
    if (!p.alive) continue;
    const dx = p.x - ex, dz = p.z - ez;
    const d = dx * dx + dz * dz;
    if (d < minDist) { minDist = d; nearest = p; }
  }
  return nearest ? { player: nearest, dist: Math.sqrt(minDist) } : null;
}

function updateEnemy(e, dt, players, timeStop) {
  if (!e.alive) {
    e.deathTimer -= dt;
    return;
  }

  // 时间冻结
  if (timeStop > 0) return;

  // 受击闪烁衰减
  if (e.hitFlash > 0) e.hitFlash -= dt;

  // 枪口闪光衰减
  if (e.muzzleTimer > 0) e.muzzleTimer -= dt;

  // 找最近玩家
  const nearest = findNearestPlayer(e.x, e.z, players);
  if (!nearest) {
    e.state = 'patrol';
    return;
  }

  const { player: target, dist } = nearest;
  const toPlayerX = target.x - e.x;
  const toPlayerZ = target.z - e.z;

  // AI 状态机
  const los = dist < CFG.enemyDetectRange && hasLineOfSight(e.x, e.z, target.x, target.z);

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

  let moveDirX = 0, moveDirZ = 0;

  switch (e.state) {
    case 'patrol': {
      e.pathTimer -= dt;
      if (e.pathTimer <= 0) {
        e.pathTimer = 2 + Math.random() * 3;
        e.targetX = clamp(e.x + (Math.random() - 0.5) * 20, -55, 55);
        e.targetZ = clamp(e.z + (Math.random() - 0.5) * 20, -55, 55);
      }
      const dx = e.targetX - e.x, dz = e.targetZ - e.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.1) {
        moveDirX = dx / d;
        moveDirZ = dz / d;
      }
      const step = CFG.enemySpeed * 0.5 * dt;
      const nx = e.x + moveDirX * step;
      const nz = e.z + moveDirZ * step;
      if (!enemyCollides({ x: nx, z: nz })) {
        e.x = nx; e.z = nz;
      } else if (!enemyCollides({ x: nx, z: e.z })) {
        e.x = nx;
      } else if (!enemyCollides({ x: e.x, z: nz })) {
        e.z = nz;
      } else {
        e.pathTimer = 0;
      }
      break;
    }
    case 'chase': {
      const step = CFG.enemySpeed * dt;
      if (hasDirectPath(e.x, e.z, target.x, target.z)) {
        const d = Math.sqrt(toPlayerX * toPlayerX + toPlayerZ * toPlayerZ);
        if (d > 0.1) {
          moveDirX = toPlayerX / d;
          moveDirZ = toPlayerZ / d;
        }
        const cx = e.x + moveDirX * step;
        const cz = e.z + moveDirZ * step;
        if (!enemyCollides({ x: cx, z: cz })) {
          e.x = cx; e.z = cz;
        } else if (!enemyCollides({ x: cx, z: e.z })) {
          e.x = cx;
        } else if (!enemyCollides({ x: e.x, z: cz })) {
          e.z = cz;
        }
        e.wallFollowTimer = 0;
      } else {
        // 绕墙行走
        e.wallFollowTimer -= dt;
        if (e.wallFollowTimer <= 0) {
          const base = Math.atan2(toPlayerX, toPlayerZ);
          const leftX = e.x + Math.sin(base + 1.2) * step * 3;
          const leftZ = e.z + Math.cos(base + 1.2) * step * 3;
          const rightX = e.x + Math.sin(base - 1.2) * step * 3;
          const rightZ = e.z + Math.cos(base - 1.2) * step * 3;
          const leftBlocked = enemyCollides({ x: leftX, z: leftZ });
          const rightBlocked = enemyCollides({ x: rightX, z: rightZ });
          if (!leftBlocked && rightBlocked) {
            e.wallFollowDir = base + 1.2;
          } else if (!rightBlocked && leftBlocked) {
            e.wallFollowDir = base - 1.2;
          } else if (!leftBlocked && !rightBlocked) {
            const dl = Math.hypot(leftX - target.x, leftZ - target.z);
            const dr = Math.hypot(rightX - target.x, rightZ - target.z);
            e.wallFollowDir = dl < dr ? base + 1.2 : base - 1.2;
          } else {
            e.wallFollowDir = base + Math.PI;
          }
          e.wallFollowTimer = 0.6;
        }
        moveDirX = Math.sin(e.wallFollowDir);
        moveDirZ = Math.cos(e.wallFollowDir);
        const wx = e.x + moveDirX * step;
        const wz = e.z + moveDirZ * step;
        if (!enemyCollides({ x: wx, z: wz })) {
          e.x = wx; e.z = wz;
        } else if (!enemyCollides({ x: wx, z: e.z })) {
          e.x = wx;
        } else if (!enemyCollides({ x: e.x, z: wz })) {
          e.z = wz;
        } else {
          e.wallFollowTimer = 0;
        }
      }
      break;
    }
    case 'attack': {
      // 面向玩家
      const d = Math.sqrt(toPlayerX * toPlayerX + toPlayerZ * toPlayerZ);
      if (d > 0.1) {
        moveDirX = toPlayerX / d;
        moveDirZ = toPlayerZ / d;
      }
      // 小幅横移
      const strafeAmt = Math.sin(Date.now() * 0.003) * CFG.enemySpeed * 0.3 * dt;
      const sx = e.x + moveDirZ * strafeAmt;
      const sz = e.z - moveDirX * strafeAmt;
      if (!enemyCollides({ x: sx, z: sz })) {
        e.x = sx; e.z = sz;
      }

      // 开火
      if (e.fireCooldown <= 0) {
        e.fireCooldown = CFG.enemyFireRate + Math.random() * 0.5;
        e.muzzleTimer = 0.08;
        const hitChance = Math.max(0.2, 1 - dist / CFG.enemyAttackRange);
        if (Math.random() < hitChance) {
          return { hit: true, targetId: target.id, damage: CFG.enemyDamage };
        }
      }
      break;
    }
  }

  // 面向移动方向
  if (e.state !== 'attack') {
    if (moveDirX !== 0 || moveDirZ !== 0) {
      const angle = Math.atan2(moveDirX, moveDirZ) + Math.PI;
      e.rotationY = lerp(e.rotationY, angle, dt * 5);
    }
  } else {
    const angle = Math.atan2(toPlayerX, toPlayerZ) + Math.PI;
    e.rotationY = lerp(e.rotationY, angle, dt * 8);
  }

  // 限制在地图边界
  e.x = clamp(e.x, -58, 58);
  e.z = clamp(e.z, -58, 58);

  return null;
}

module.exports = { updateEnemy, findNearestPlayer, CFG };
