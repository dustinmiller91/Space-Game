/**
 * DetailsScene.js — Object inspection view.
 *
 * Shows either a planet or star rendered large and centered,
 * with an info panel on the left. Supports returning to system
 * view centered on the object we came from.
 */
class DetailsScene extends Phaser.Scene {
  constructor() {
    super('DetailsScene');
  }

  init(data) {
    this.objectType = data.type || 'planet'; // 'planet' or 'star'
    this.planetId = data.planetId;
    this.starId = data.starId;
    this.systemId = data.systemId;
    this.galaxyPos = data.galaxyPos || null;
    // World position to center on when returning to system view
    this.worldPos = data.worldPos || null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#050a12');
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    Assets.drawStarfield(this, 120, W, H);

    this.loadingText = this.add.text(W / 2, H / 2, 'Loading...', {
      fontFamily: CONFIG.FONT,
      fontSize: '14px',
      color: CONFIG.COLORS.hud_hint,
    }).setOrigin(0.5).setDepth(998);

    // Back button
    UI.addBackButton(this, 310, 24, 'Back to System', () => {
      this.scene.start('SystemScene', {
        systemId: this.systemId,
        galaxyPos: this.galaxyPos,
        centerOnWorld: this.worldPos,
      });
    });

    // Fetch appropriate data
    if (this.objectType === 'star') {
      this._loadStar(W, H);
    } else {
      this._loadPlanet(W, H);
    }
  }

  // ── Planet Details ──────────────────────────────────────

  async _loadPlanet(W, H) {
    try {
      const data = await Network.fetchPlanet(this.planetId);
      this.loadingText.destroy();
      this._renderPlanetDetails(data, W, H);
    } catch (err) {
      console.error('[details] Failed to load planet:', err);
      this.loadingText.setText('Failed to load planet data.');
    }
  }

  _renderPlanetDetails(data, W, H) {
    const { planet, star, resources } = data;
    if (!planet) return;

    const panelW = 280;

    UI.drawInfoPanel(this, panelW, H - 32,
      `PLANET #${planet.id}`,
      [
        `System: #${planet.system_id}  "${star ? star.name : ''}"`,
        `Star Class: ${star ? star.spectral_class + '-type' : 'Unknown'}`,
      ],
      [
        {
          title: 'CLASSIFICATION',
          rows: [
            { label: 'Type',   value: planet.planet_type },
            { label: 'Radius', value: `${planet.planet_radius} units` },
            { label: 'Orbit',  value: `${planet.orbit_radius} AU` },
            { label: 'Ecc.',   value: `${planet.eccentricity}` },
          ],
        },
        {
          title: 'DEMOGRAPHICS',
          rows: [
            { label: 'Population', value: planet.population.toLocaleString() },
          ],
        },
        {
          title: 'RESOURCE RATES',
          rows: [
            { label: 'Minerals', value: `${planet.minerals_rate}/tick`, color: CONFIG.COLORS.res_minerals },
            { label: 'Biomass',  value: `${planet.biomass_rate}/tick`,  color: CONFIG.COLORS.res_biomass },
            { label: 'Gas',      value: `${planet.gas_rate}/tick`,      color: CONFIG.COLORS.res_gas },
            { label: 'Energy',   value: `${planet.energy_rate}/tick`,   color: CONFIG.COLORS.res_energy },
          ],
        },
        {
          title: 'SYSTEM STOCKPILE',
          rows: resources ? [
            { label: 'Minerals', value: Math.floor(resources.minerals).toLocaleString(),  color: CONFIG.COLORS.res_minerals },
            { label: 'Biomass',  value: Math.floor(resources.biomass).toLocaleString(),   color: CONFIG.COLORS.res_biomass },
            { label: 'Gas',      value: Math.floor(resources.gas).toLocaleString(),       color: CONFIG.COLORS.res_gas },
            { label: 'Energy',   value: Math.floor(resources.energy).toLocaleString(),    color: CONFIG.COLORS.res_energy },
          ] : [
            { label: 'Status', value: 'No data' },
          ],
        },
      ]
    );

    // Planet rendering
    const centerX = panelW + 16 + (W - panelW - 16) / 2;
    const centerY = H / 2;
    const displayR = Math.max(60, planet.planet_radius * 5);

    Assets.drawDetailPlanet(this, centerX, centerY, displayR, planet.color_hex, planet.seed);

    this.add.text(centerX, centerY + displayR + 30, planet.planet_type, {
      fontFamily: CONFIG.FONT, fontSize: '14px', color: CONFIG.COLORS.hud_title,
    }).setOrigin(0.5);

    this.add.text(centerX, centerY + displayR + 50, `"${planet.name}"`, {
      fontFamily: CONFIG.FONT, fontSize: '12px', color: CONFIG.COLORS.hud_hint,
    }).setOrigin(0.5);
  }

  // ── Star Details ────────────────────────────────────────

  async _loadStar(W, H) {
    try {
      const data = await Network.fetchStar(this.starId);
      this.loadingText.destroy();
      this._renderStarDetails(data, W, H);
    } catch (err) {
      console.error('[details] Failed to load star:', err);
      this.loadingText.setText('Failed to load star data.');
    }
  }

  _renderStarDetails(data, W, H) {
    const { star, system, resources, planet_count } = data;
    if (!star) return;

    const panelW = 280;

    UI.drawInfoPanel(this, panelW, H - 32,
      `STAR #${star.id}`,
      [
        `System: #${star.system_id}  "${system ? system.name : ''}"`,
      ],
      [
        {
          title: 'STELLAR CLASSIFICATION',
          rows: [
            { label: 'Class',    value: `${star.spectral_class}-type` },
            { label: 'Mass',     value: `${star.mass} M☉` },
            { label: 'Lumin.',   value: `${star.luminosity} L☉` },
            { label: 'Temp.',    value: `${star.temperature} K` },
            { label: 'Radius',   value: `${star.radius} R☉` },
          ],
        },
        {
          title: 'SYSTEM INFO',
          rows: [
            { label: 'Planets', value: `${planet_count}` },
          ],
        },
        {
          title: 'SYSTEM STOCKPILE',
          rows: resources ? [
            { label: 'Minerals', value: Math.floor(resources.minerals).toLocaleString(),  color: CONFIG.COLORS.res_minerals },
            { label: 'Biomass',  value: Math.floor(resources.biomass).toLocaleString(),   color: CONFIG.COLORS.res_biomass },
            { label: 'Gas',      value: Math.floor(resources.gas).toLocaleString(),       color: CONFIG.COLORS.res_gas },
            { label: 'Energy',   value: Math.floor(resources.energy).toLocaleString(),    color: CONFIG.COLORS.res_energy },
          ] : [
            { label: 'Status', value: 'No data' },
          ],
        },
      ]
    );

    // Star rendering
    const centerX = panelW + 16 + (W - panelW - 16) / 2;
    const centerY = H / 2;
    const displayR = 80;

    Assets.drawDetailStar(this, centerX, centerY, displayR, star.color_hex, star.seed);

    this.add.text(centerX, centerY + displayR + 30, `${star.spectral_class}-type Star`, {
      fontFamily: CONFIG.FONT, fontSize: '14px', color: CONFIG.COLORS.hud_title,
    }).setOrigin(0.5);

    this.add.text(centerX, centerY + displayR + 50, `"${star.name}"`, {
      fontFamily: CONFIG.FONT, fontSize: '12px', color: CONFIG.COLORS.hud_hint,
    }).setOrigin(0.5);
  }
}