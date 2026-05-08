// FPS Demo 联机客户端
class NetClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.playerId = null;
    this.roomId = null;
    this.isHost = false;
    this._inputInterval = null;

    // 回调（由 game.js 设置）
    this.onJoined = null;
    this.onPlayerJoined = null;
    this.onPlayerLeft = null;
    this.onGameStart = null;
    this.onGameState = null;
    this.onEnemyHit = null;
    this.onEnemyKilled = null;
    this.onWaveStart = null;
    this.onWaveComplete = null;
    this.onRewardChoices = null;
    this.onRewardApplied = null;
    this.onPlayerHurt = null;
    this.onPlayerKilled = null;
    this.onGameOver = null;
    this.onRoomList = null;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        reject(e);
        return;
      }
      this.ws.onopen = () => {
        this.connected = true;
        resolve();
      };
      this.ws.onerror = (e) => {
        reject(e);
      };
      this.ws.onclose = () => {
        this.connected = false;
        this.stopInputSync();
      };
      this.ws.onmessage = (e) => {
        this._handleMessage(JSON.parse(e.data));
      };
    });
  }

  disconnect() {
    this.stopInputSync();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.playerId = null;
    this.roomId = null;
  }

  join(name, roomId) {
    this._send({ type: 'join', name, roomId });
  }

  startGame(mapId) {
    this._send({ type: 'host_start', mapId });
  }

  sendShoot(ox, oy, oz, dx, dy, dz, weapon) {
    this._send({ type: 'shoot', ox, oy, oz, dx, dy, dz, weapon });
  }

  sendMelee(ox, oy, oz, dx, dy, dz, weapon) {
    this._send({ type: 'melee', ox, oy, oz, dx, dy, dz, weapon });
  }

  sendRewardPick(rewardId) {
    this._send({ type: 'reward_pick', rewardId });
  }

  startInputSync(getState) {
    this.stopInputSync();
    this._inputInterval = setInterval(() => {
      if (!this.connected) return;
      const s = getState();
      if (!s) return;
      this._send({
        type: 'player_input',
        x: s.x, y: s.y, z: s.z,
        yaw: s.yaw, pitch: s.pitch,
        moveState: s.moveState,
        weapon: s.weapon,
        muzzleFlash: s.muzzleFlash,
      });
    }, 50); // 20Hz
  }

  stopInputSync() {
    if (this._inputInterval) {
      clearInterval(this._inputInterval);
      this._inputInterval = null;
    }
  }

  _send(msg) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'joined':
        this.playerId = msg.playerId;
        this.roomId = msg.roomId;
        this.isHost = msg.isHost;
        if (this.onJoined) this.onJoined(msg);
        break;
      case 'player_joined':
        if (this.onPlayerJoined) this.onPlayerJoined(msg);
        break;
      case 'player_left':
        if (this.onPlayerLeft) this.onPlayerLeft(msg);
        break;
      case 'game_start':
        if (this.onGameStart) this.onGameStart(msg);
        break;
      case 'game_state':
        if (this.onGameState) this.onGameState(msg);
        break;
      case 'enemy_hit':
        if (this.onEnemyHit) this.onEnemyHit(msg);
        break;
      case 'enemy_killed':
        if (this.onEnemyKilled) this.onEnemyKilled(msg);
        break;
      case 'wave_start':
        if (this.onWaveStart) this.onWaveStart(msg);
        break;
      case 'wave_complete':
        if (this.onWaveComplete) this.onWaveComplete(msg);
        break;
      case 'reward_choices':
        if (this.onRewardChoices) this.onRewardChoices(msg);
        break;
      case 'reward_applied':
        if (this.onRewardApplied) this.onRewardApplied(msg);
        break;
      case 'player_hurt':
        if (this.onPlayerHurt) this.onPlayerHurt(msg);
        break;
      case 'player_killed':
        if (this.onPlayerKilled) this.onPlayerKilled(msg);
        break;
      case 'game_over':
        if (this.onGameOver) this.onGameOver(msg);
        break;
      case 'room_list':
        if (this.onRoomList) this.onRoomList(msg);
        break;
    }
  }
}

// 全局实例
window.netClient = new NetClient();
