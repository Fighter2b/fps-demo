// 碰撞检测系统（从 game.js 提取，纯数学，无 Three.js 依赖）

const CFG = {
  playerHeight: 1.7,
  playerRadius: 0.35,
};

const colliders = []; // {min:{x,y,z}, max:{x,y,z}}

function addCollider(x, y, z, w, h, d) {
  colliders.push({
    min: { x: x - w / 2, y: y - h / 2, z: z - d / 2 },
    max: { x: x + w / 2, y: y + h / 2, z: z + d / 2 },
  });
}

function clearColliders() {
  colliders.length = 0;
}

// AABB 碰撞检测
function collidesWithMap(pos, radius = CFG.playerRadius, height = CFG.playerHeight) {
  const pMin = { x: pos.x - radius, y: pos.y, z: pos.z - radius };
  const pMax = { x: pos.x + radius, y: pos.y + height, z: pos.z + radius };
  for (const b of colliders) {
    if (pMin.x < b.max.x && pMax.x > b.min.x &&
        pMin.y < b.max.y && pMax.y > b.min.y &&
        pMin.z < b.max.z && pMax.z > b.min.z) {
      return true;
    }
  }
  return false;
}

// 推离碰撞体（嵌入修正）
function pushOut(pos, radius = CFG.playerRadius, height = CFG.playerHeight) {
  for (let iter = 0; iter < 4; iter++) {
    const pMin = { x: pos.x - radius, y: pos.y, z: pos.z - radius };
    const pMax = { x: pos.x + radius, y: pos.y + height, z: pos.z + radius };
    let pushed = false;
    for (const b of colliders) {
      if (!(pMin.x < b.max.x && pMax.x > b.min.x &&
            pMin.y < b.max.y && pMax.y > b.min.y &&
            pMin.z < b.max.z && pMax.z > b.min.z)) continue;
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
  const pMin = { x: pos.x - r, y: 0, z: pos.z - r };
  const pMax = { x: pos.x + r, y: h, z: pos.z + r };
  for (const b of colliders) {
    if (pMin.x < b.max.x && pMax.x > b.min.x &&
        pMin.y < b.max.y && pMax.y > b.min.y &&
        pMin.z < b.max.z && pMax.z > b.min.z) {
      return true;
    }
  }
  return false;
}

// 射线-AABB 相交测试
function rayIntersectsBox(origin, dir, box, maxDist) {
  const invX = dir.x !== 0 ? 1 / dir.x : Infinity;
  const invY = dir.y !== 0 ? 1 / dir.y : Infinity;
  const invZ = dir.z !== 0 ? 1 / dir.z : Infinity;
  const t1 = (box.min.x - origin.x) * invX;
  const t2 = (box.max.x - origin.x) * invX;
  const t3 = (box.min.y - origin.y) * invY;
  const t4 = (box.max.y - origin.y) * invY;
  const t5 = (box.min.z - origin.z) * invZ;
  const t6 = (box.max.z - origin.z) * invZ;
  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));
  if (tmax >= Math.max(tmin, 0) && tmin < maxDist) return tmin;
  return false;
}

// 视线检测
function hasLineOfSight(fromX, fromZ, toX, toZ) {
  const dx = toX - fromX, dz = toZ - fromZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return true;
  const nx = dx / dist, nz = dz / dist;
  const origin = { x: fromX, y: 1.0, z: fromZ };
  const dir = { x: nx, y: 0, z: nz };
  for (const b of colliders) {
    if (rayIntersectsBox(origin, dir, b, dist)) return false;
  }
  return true;
}

// 可达性检测
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

// 带滑墙的移动
function moveWithCollision(pos, vel, dt) {
  const maxStep = 0.15;
  const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
  const steps = Math.max(1, Math.ceil(speed * dt / maxStep));
  const subDt = dt / steps;
  const temp = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < steps; i++) {
    // X
    temp.x = pos.x + vel.x * subDt;
    temp.y = pos.y;
    temp.z = pos.z;
    if (!collidesWithMap(temp)) {
      pos.x = temp.x;
    } else {
      vel.x = 0;
    }
    // Z
    temp.x = pos.x;
    temp.z = pos.z + vel.z * subDt;
    if (!collidesWithMap(temp)) {
      pos.z = temp.z;
    } else {
      vel.z = 0;
    }
  }
  // Y
  temp.x = pos.x;
  temp.y = pos.y + vel.y * dt;
  temp.z = pos.z;
  if (!collidesWithMap(temp)) {
    pos.y = temp.y;
  } else {
    if (vel.y < 0) pos._onGround = true;
    vel.y = 0;
  }
  pushOut(pos);
}

// 射线-球体相交测试（用于敌人头部命中判定）
function rayIntersectsSphere(origin, dir, center, radius) {
  const ocx = origin.x - center.x;
  const ocy = origin.y - center.y;
  const ocz = origin.z - center.z;
  const a = dir.x * dir.x + dir.y * dir.y + dir.z * dir.z;
  const b = 2 * (ocx * dir.x + ocy * dir.y + ocz * dir.z);
  const c = ocx * ocx + ocy * ocy + ocz * ocz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const sqrtDisc = Math.sqrt(disc);
  const t = (-b - sqrtDisc) / (2 * a);
  if (t > 0) return t;
  const t2 = (-b + sqrtDisc) / (2 * a);
  return t2 > 0 ? t2 : false;
}

// 敌人命中检测（简化碰撞箱：身体圆柱 + 头部球体）
function rayHitsEnemy(origin, dir, enemy) {
  const ex = enemy.x, ez = enemy.z;
  // 头部球体
  const headCenter = { x: ex, y: 1.55, z: ez };
  const headHit = rayIntersectsSphere(origin, dir, headCenter, 0.25);
  // 身体 AABB
  const bodyBox = {
    min: { x: ex - 0.4, y: 0, z: ez - 0.4 },
    max: { x: ex + 0.4, y: 1.4, z: ez + 0.4 },
  };
  const bodyDist = rayIntersectsBox(origin, dir, bodyBox, 200);

  if (headHit !== false && (bodyDist === false || headHit < bodyDist)) {
    return { dist: headHit, headshot: true };
  }
  if (bodyDist !== false) {
    return { dist: bodyDist, headshot: false };
  }
  return null;
}

module.exports = {
  colliders, addCollider, clearColliders,
  collidesWithMap, pushOut, enemyCollides,
  rayIntersectsBox, hasLineOfSight, hasDirectPath,
  moveWithCollision, rayHitsEnemy, rayIntersectsSphere,
};
