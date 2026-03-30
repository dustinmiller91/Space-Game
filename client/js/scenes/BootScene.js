/**
 * BootScene.js — Asset preloader.
 *
 * Loads static assets (starfield tiles, etc.) before any game scene runs.
 * Shows a minimal loading indicator, then hands off to GalaxyScene.
 */
class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    // Loading text
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;
    this.add.text(cx, cy, 'Loading...', {
      fontFamily: CONFIG.FONT, fontSize: '14px', color: CONFIG.COLORS.hud_hint,
    }).setOrigin(0.5);

    // Starfield tiles
    for (const layer of CONFIG.STARFIELD_LAYERS) {
      this.load.image(layer.key, `/assets/${layer.key}.png`);
    }
  }

  create() {
    this.scene.start('GalaxyScene');
  }
}