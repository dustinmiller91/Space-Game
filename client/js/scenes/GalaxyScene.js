/**
 * GalaxyScene.js — Top-level galaxy map.
 */
class GalaxyScene extends Phaser.Scene {
  constructor() {
    super('GalaxyScene');
  }

  init(data) {
    this._centerOn = data && data.centerOn ? data.centerOn : null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');

    // Initialize dual-camera system FIRST
    UI.initCameras(this);

    // Background dust (world objects)
    Assets.drawStarfield(this, 400, CONFIG.WORLD_W, CONFIG.WORLD_H);
    // Tag all existing children as world (starfield particles)
    this.children.list.forEach(obj => {
      if (!this._uiObjects || !this._uiObjects.has(obj)) {
        UI.tagAsWorld(this, obj);
      }
    });

    // Tooltip (auto-tagged as UI)
    this.tooltip = UI.createTooltip(this);

    // Load galaxy data from server
    this._loadGalaxy();

    // HUD (auto-tagged as UI)
    UI.addHUD(
      this,
      '[ GALAXY VIEW ]',
      'Edge-scroll to pan  •  Scroll-wheel to zoom  •  Click a star to enter system'
    );

    // Edge scroll + zoom
    UI.setupEdgeScroll(this);
    UI.setupZoom(this);

    // Default camera position
    if (this._centerOn) {
      UI.centerCameraOn(this, this._centerOn.x, this._centerOn.y);
    } else {
      UI.centerCameraOn(this, 2000, 2000);
    }
  }

  async _loadGalaxy() {
    try {
      const systems = await Network.fetchGalaxy();
      this._renderStars(systems);
    } catch (err) {
      console.error('[galaxy] Failed to load:', err);
      this.add.text(400, 300, 'Failed to connect to server.\nMake sure server.py is running.', {
        fontFamily: CONFIG.FONT,
        fontSize: '14px',
        color: '#ff6666',
        align: 'center',
      }).setScrollFactor(0).setDepth(999);
    }
  }

  _renderStars(systems) {
    systems.forEach((sys) => {
      const displayRadius = 2 + Math.min(parseFloat(sys.star_mass) || 1, 10) * 0.4;

      const { body, glowImg, color } = Assets.drawGalaxyStar(
        this, sys.galaxy_x, sys.galaxy_y, displayRadius, sys.color_hex
      );

      // Tag drawn objects as world
      UI.tagAsWorld(this, body);
      UI.tagAsWorld(this, glowImg);

      const glowContainer = { img: glowImg };
      const tooltipText = `System #${sys.id}  [${sys.spectral_class}-type]  "${sys.name}"`;

      const zone = UI.addInteractiveZone(
        this,
        sys.galaxy_x, sys.galaxy_y,
        displayRadius * 6,
        this.tooltip,
        tooltipText,
        {
          onOver: () => {
            Assets.setStarGlow(this, glowContainer, sys.galaxy_x, sys.galaxy_y, displayRadius, color, true);
            UI.tagAsWorld(this, glowContainer.img);
          },
          onOut: () => {
            Assets.setStarGlow(this, glowContainer, sys.galaxy_x, sys.galaxy_y, displayRadius, color, false);
            UI.tagAsWorld(this, glowContainer.img);
          },
          onClick: () => this.scene.start('SystemScene', {
            systemId: sys.id,
            galaxyPos: { x: sys.galaxy_x, y: sys.galaxy_y },
          }),
        }
      );
      UI.tagAsWorld(this, zone);
    });
  }

  update() {
    UI.updateEdgeScroll(this);
    UI.updateZoom(this);
  }
}