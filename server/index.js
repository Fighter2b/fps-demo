// FPS Demo 局域网联机服务器
const WebSocket = require('ws');
const { MSG } = require('./protocol');
const { Room, buildServerMap } = require('./room');
const { startGameLoop, stopGameLoop } = require('./gameLoop');

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });
const rooms = new Map(); // roomId -> Room

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id;
  do {
    id = '';
    for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(id));
  return id;
}

console.log(`[服务器] FPS Demo 联机服务器已启动，端口 ${PORT}`);

function getRoomList() {
  const list = [];
  for (const [id, room] of rooms) {
    list.push({
      id,
      playerCount: room.players.size,
      gameState: room.gameState,
    });
  }
  return list;
}

function broadcastRoomList() {
  const msg = JSON.stringify({ type: MSG.ROOM_LIST, rooms: getRoomList() });
  wss.clients.forEach((ws) => {
    if (!ws._roomId && ws.readyState === 1) {
      ws.send(msg);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('[服务器] 新连接');

  // 发送当前房间列表
  ws.send(JSON.stringify({ type: MSG.ROOM_LIST, rooms: getRoomList() }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case MSG.JOIN: handleJoin(ws, msg); break;
      case MSG.ROOM_LIST_REQ: ws.send(JSON.stringify({ type: MSG.ROOM_LIST, rooms: getRoomList() })); break;
      case MSG.HOST_START: handleHostStart(ws, msg); break;
      case MSG.PLAYER_INPUT: handlePlayerInput(ws, msg); break;
      case MSG.SHOOT: handleShoot(ws, msg); break;
      case MSG.MELEE: handleMelee(ws, msg); break;
      case MSG.REWARD_PICK: handleRewardPick(ws, msg); break;
      case MSG.PICKUP_COLLECT: handlePickupCollect(ws, msg); break;
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });
});

function handleJoin(ws, msg) {
  const { name, roomId } = msg;

  if (roomId && rooms.has(roomId)) {
    // 加入已有房间
    const room = rooms.get(roomId);
    if (room.gameState !== 'lobby') {
      ws.send(JSON.stringify({ type: MSG.JOINED, error: '游戏已开始' }));
      return;
    }
    const pid = room.addPlayer(ws, name || 'Player');
    ws.send(JSON.stringify({
      type: MSG.JOINED,
      playerId: pid,
      roomId: room.id,
      players: room.getPlayerList(),
      isHost: false,
    }));
    // 通知其他玩家
    room.broadcast({ type: MSG.PLAYER_JOINED, id: pid, name: name || 'Player' }, pid);
    console.log(`[服务器] ${name} 加入房间 ${room.id}`);
    broadcastRoomList();
  } else {
    // 创建新房间
    const rid = generateRoomId();
    const room = new Room(rid, ws);
    rooms.set(rid, room);
    // 设置房主名字
    const hostPlayer = room.players.get(ws._playerId);
    if (hostPlayer) hostPlayer.name = name || 'Player';
    ws.send(JSON.stringify({
      type: MSG.JOINED,
      playerId: ws._playerId,
      roomId: rid,
      players: room.getPlayerList(),
      isHost: true,
    }));
    console.log(`[服务器] ${name} 创建房间 ${rid}`);
    broadcastRoomList();
  }
}

function handleHostStart(ws, msg) {
  const room = rooms.get(ws._roomId);
  if (!room || ws._playerId !== room.hostId) return;
  if (room.gameState !== 'lobby') return;

  room.mapId = msg.mapId || 1;
  room.gameState = 'playing';
  room.wave = 0;

  // 构建地图碰撞体
  buildServerMap(room.mapId);

  // 通知所有玩家游戏开始
  room.broadcast({
    type: MSG.GAME_START,
    mapId: room.mapId,
    wave: 0,
  });

  // 启动游戏循环
  startGameLoop(room);
  console.log(`[服务器] 房间 ${room.id} 开始游戏，地图 ${room.mapId}`);
}

function handlePlayerInput(ws, msg) {
  const room = rooms.get(ws._roomId);
  if (!room) return;
  const player = room.players.get(ws._playerId);
  if (!player) return;

  player.x = msg.x;
  player.y = msg.y;
  player.z = msg.z;
  player.yaw = msg.yaw;
  player.pitch = msg.pitch;
  player.moveState = msg.moveState;
  player.weapon = msg.weapon;
  player.muzzleFlash = msg.muzzleFlash;
}

function handleShoot(ws, msg) {
  const room = rooms.get(ws._roomId);
  if (!room) return;
  room.shootQueue.push({
    playerId: ws._playerId,
    ox: msg.ox, oy: msg.oy, oz: msg.oz,
    dx: msg.dx, dy: msg.dy, dz: msg.dz,
    weapon: msg.weapon,
  });
}

function handleMelee(ws, msg) {
  const room = rooms.get(ws._roomId);
  if (!room) return;
  room.shootQueue.push({
    playerId: ws._playerId,
    ox: msg.ox, oy: msg.oy, oz: msg.oz,
    dx: msg.dx, dy: msg.dy, dz: msg.dz,
    weapon: msg.weapon,
    isMelee: true,
  });
}

function handleRewardPick(ws, msg) {
  const room = rooms.get(ws._roomId);
  if (!room || room.gameState !== 'reward') return;
  room.pendingRewards.set(ws._playerId, msg.rewardId);
}

function handlePickupCollect(ws, msg) {
  const room = rooms.get(ws._roomId);
  if (!room) return;
  // TODO: 验证并广播拾取
}

function handleDisconnect(ws) {
  const roomId = ws._roomId;
  const playerId = ws._playerId;
  if (!roomId || !playerId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  room.removePlayer(playerId);
  room.broadcast({ type: MSG.PLAYER_LEFT, id: playerId });
  console.log(`[服务器] 玩家 ${playerId} 断开连接`);

  if (room.players.size === 0) {
    stopGameLoop(room);
    rooms.delete(roomId);
    console.log(`[服务器] 房间 ${roomId} 已销毁`);
  }
  broadcastRoomList();
}

// 定期清理空房间
setInterval(() => {
  for (const [id, room] of rooms) {
    if (room.players.size === 0) {
      stopGameLoop(room);
      rooms.delete(id);
    }
  }
}, 30000);
