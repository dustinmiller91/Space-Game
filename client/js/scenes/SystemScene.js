/**
 * SystemScene.js — Solar system view.
 */
class SystemScene extends Phaser.Scene {
  constructor() {
    super('SystemScene');
  }

  init(data) {
    this.systemId = data.systemId;
    this.galaxyPos = data.galaxyPos || null;
    this._centerOnWorld = data.centerOnWorld || null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this.cx = CONFIG.WORLD_W / 2;
    this.cy = CONFIG.WORLD_H / 2;

    // Initialize dual-camera system FIRST
    UI.initCameras(this);

    // Background dust
    Assets.drawStarfield(this, 300, CONFIG.WORLD_W, CONFIG.WORLD_H);
    this.children.list.forEach(obj => {
      if (!this._uiObjects || !this._uiObjects.has(obj)) {
        UI.tagAsWorld(this, obj);
      }
    });

    // Tooltip (auto-tagged UI)
    this.tooltip = UI.createTooltip(this);

    // Loading text (UI)
    this.loadingText = this.add.text(
      this.cameras.main.width / 2, this.cameras.main.height / 2,
      'Loading system...', {
        fontFamily: CONFIG.FONT,
        fontSize: '14px',
        color: CONFIG.COLORS.hud_hint,
      }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(998);
    UI.tagAsUI(this, this.loadingText);

    // Fetch data
    this._loadSystem();

    // Back button (auto-tagged UI)
    UI.addBackButton(this, 16, 40, 'Back to Galaxy', () => {
      this.scene.start('GalaxyScene', {
        centerOn: this.galaxyPos,
      });
    });

    // Edge scroll + zoom
    UI.setupEdgeScroll(this);
    UI.setupZoom(this);

    // Initial camera position
    if (this._centerOnWorld) {
      UI.centerCameraOn(this, this._centerOnWorld.x, this._centerOnWorld.y);
    } else {
      UI.centerCameraOn(this, this.cx, this.cy);
    }
  }

  async _loadSystem() {
    try {
      const data = await Network.fetchSystem(this.systemId);
      this.loadingText.destroy();
      this._renderSystem(data);
    } catch (err) {
      console.error('[system] Failed to load:', err);
      this.loadingText.setText('Failed to load system data.');
    }
  }

  _renderSystem(data) {
    const { system, stars, planets } = data;
    const primaryStar = stars[0];
    const cx = this.cx;
    const cy = this.cy;

    // HUD title (auto-tagged UI)
    UI.addHUD(
      this,
      `[ SYSTEM VIEW ]  #${system.id}  —  ${primaryStar.spectral_class}-type  "${system.name}"`,
      null
    );
    const hintText = this.add.text(16, 66, 'Click star or planet to inspect  •  Edge-scroll to pan  •  Scroll-wheel to zoom', {
      fontFamily: CONFIG.FONT,
      fontSize: '11px',
      color: CONFIG.COLORS.hud_hint,
    }).setScrollFactor(0).setDepth(999);
    UI.tagAsUI(this, hintText);

    // ── Central star (clickable, world object) ──
    const starR = 24;
    const { body: starBody, glowImg: starGlowImg, color: starColor } =
      Assets.drawSystemStar(this, cx, cy, primaryStar.color_hex, starR);
    UI.tagAsWorld(this, starBody);
    UI.tagAsWorld(this, starGlowImg);

    const starGlowContainer = { img: starGlowImg };
    const starTooltip = `Star #${primaryStar.id}  [${primaryStar.spectral_class}-type]  "${primaryStar.name}"`;

    const starZone = UI.addInteractiveZone(
      this, cx, cy, starR * 5,
      this.tooltip, starTooltip,
      {
        onOver: () => {
          Assets.setSystemStarGlow(this, starGlowContainer, cx, cy, starR, starColor, true);
          UI.tagAsWorld(this, starGlowContainer.img);
        },
        onOut: () => {
          Assets.setSystemStarGlow(this, starGlowContainer, cx, cy, starR, starColor, false);
          UI.tagAsWorld(this, starGlowContainer.img);
        },
        onClick: () => this.scene.start('DetailsScene', {
          type: 'star',
          starId: primaryStar.id,
          systemId: this.systemId,
          galaxyPos: this.galaxyPos,
          worldPos: { x: cx, y: cy },
        }),
      }
    );
    UI.tagAsWorld(this, starZone);

    // ── Elliptical orbit rings + planets ──
    planets.forEach((p) => {
      const ecc = p.eccentricity || 0;

      // Orbit ellipse
      const { ring } = Assets.drawEllipticalOrbit(this, cx, cy, p.orbit_radius, ecc);
      UI.tagAsWorld(this, ring);

      // Planet position
      const pos = Assets.getEllipsePosition(cx, cy, p.orbit_radius, ecc, p.orbit_angle);

      const { body, glowImg, color } = Assets.drawSystemPlanet(
        this, pos.x, pos.y, p.planet_radius, p.color_hex
      );
      UI.tagAsWorld(this, body);
      UI.tagAsWorld(this, glowImg);

      const glowContainer = { img: glowImg };
      const tooltipText = `Planet #${p.id}  [${p.planet_type}]  "${p.name}"`;

      const zone = UI.addInteractiveZone(
        this, pos.x, pos.y, p.planet_radius * 4,
        this.tooltip, tooltipText,
        {
          onOver: () => {
            Assets.setPlanetGlow(this, glowContainer, pos.x, pos.y, p.planet_radius, color, true);
            UI.tagAsWorld(this, glowContainer.img);
          },
          onOut: () => {
            Assets.setPlanetGlow(this, glowContainer, pos.x, pos.y, p.planet_radius, color, false);
            UI.tagAsWorld(this, glowContainer.img);
          },
          onClick: () => this.scene.start('DetailsScene', {
            type: 'planet',
            planetId: p.id,
            systemId: this.systemId,
            galaxyPos: this.galaxyPos,
            worldPos: { x: pos.x, y: pos.y },
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