/**
 * engine.js — Game engine initialization.
 *
 * Boots Phaser with all scenes registered.
 * Connects to the game server WebSocket.
 * This file must be loaded LAST.
 */

// ── Phaser Configuration ───────────────────────────────────
const gameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#000000',
  scene: [GalaxyScene, SystemScene, DetailsScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  banner: false,
};

// ── Boot ───────────────────────────────────────────────────
const game = new Phaser.Game(gameConfig);

// Connect WebSocket (for future real-time updates)
Network.connect(1);

console.log('[engine] Star Strategy started');
