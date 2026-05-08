// 消息协议常量

const MSG = {
  // Client -> Server
  JOIN: 'join',
  ROOM_LIST_REQ: 'room_list_req',
  HOST_START: 'host_start',
  PLAYER_INPUT: 'player_input',
  SHOOT: 'shoot',
  MELEE: 'melee',
  RELOAD: 'reload',
  REWARD_PICK: 'reward_pick',
  PICKUP_COLLECT: 'pickup_collect',

  // Server -> Client
  JOINED: 'joined',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  GAME_START: 'game_start',
  GAME_STATE: 'game_state',
  PLAYER_HURT: 'player_hurt',
  PLAYER_KILLED: 'player_killed',
  ENEMY_HIT: 'enemy_hit',
  ENEMY_KILLED: 'enemy_killed',
  WAVE_START: 'wave_start',
  WAVE_COMPLETE: 'wave_complete',
  REWARD_CHOICES: 'reward_choices',
  REWARD_APPLIED: 'reward_applied',
  PICKUP_COLLECTED: 'pickup_collected',
  GAME_OVER: 'game_over',
  ROOM_LIST: 'room_list',
};

module.exports = { MSG };
