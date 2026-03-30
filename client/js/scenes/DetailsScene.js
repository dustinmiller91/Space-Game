/**
 * DetailsScene.js — Body inspection view.
 *
 * Shows any body type (star, planet, moon) with info panel on the left.
 * Uses the unified /api/body/:id endpoint which returns the body,
 * its parent, children, and system resources.
 */
class DetailsScene extends Phaser.Scene {
  constructor() { super('DetailsScene'); }

  init(data) {
    this.bodyId    = data.bodyId;
    this.systemId  = data.systemId;
    this.galaxyPos = data.galaxyPos || null;
    this.worldPos  = data.worldPos || null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#050a12');
    const W = this.cameras.main.width, H = this.cameras.main.height;
    Assets.drawStarfield(this, W, H);

    this.loadingText = this.add.text(W / 2, H / 2, 'Loading...', {
      fontFamily: CONFIG.FONT, fontSize: '14px', color: CONFIG.COLORS.hud_hint,
    }).setOrigin(0.5).setDepth(998);

    UI.addBackButton(this, 310, 24, 'Back to System', () =>
      this.scene.start('SystemScene', {
        systemId: this.systemId, galaxyPos: this.galaxyPos,
        centerOnWorld: this.worldPos,
      }));

    this._load(W, H);
  }

  async _load(W, H) {
    try {
      const data = await Network.fetchBody(this.bodyId);
      this.loadingText.destroy();
      this._render(data, W, H);
    } catch (e) {
      this.loadingText.setText('Failed to load.');
    }
  }

  _render(data, W, H) {
    const { body, parent, children, resources } = data;
    if (!body) return;

    const panelW = 280;
    const cx = panelW + 16 + (W - panelW - 16) / 2;
    const cy = H / 2;

    // ── Info panel (adapts to body type) ───────────────────
    const sections = [];

    if (body.body_type === 'star') {
      sections.push({
        title: 'STELLAR CLASSIFICATION', rows: [
          { label: 'Class',  value: `${body.spectral_class}-type` },
          { label: 'Mass',   value: `${body.mass} M☉` },
          { label: 'Lumin.', value: `${body.luminosity} L☉` },
          { label: 'Temp.',  value: `${body.temperature} K` },
          { label: 'Radius', value: `${body.radius} R☉` },
        ]
      });
      const planets = children.filter(c => c.body_type === 'planet').length;
      const companions = children.filter(c => c.body_type === 'star').length;
      const sysRows = [{ label: 'Planets', value: `${planets}` }];
      if (companions) sysRows.push({ label: 'Companions', value: `${companions}` });
      sections.push({ title: 'SYSTEM INFO', rows: sysRows });
    } else {
      sections.push({
        title: body.body_type === 'moon' ? 'MOON CLASSIFICATION' : 'CLASSIFICATION',
        rows: [
          { label: 'Type',  value: body.planet_type || 'Unknown' },
          { label: 'Radius', value: `${body.radius} units` },
          ...(body.semi_major ? [{ label: 'Orbit', value: `${body.semi_major} AU` }] : []),
          ...(body.eccentricity ? [{ label: 'Ecc.', value: `${body.eccentricity}` }] : []),
        ]
      });
      if (body.population > 0) {
        sections.push({ title: 'DEMOGRAPHICS', rows: [
          { label: 'Population', value: body.population.toLocaleString() },
        ]});
      }
      if (body.minerals_rate || body.biomass_rate || body.gas_rate || body.energy_rate) {
        sections.push({ title: 'RESOURCE RATES', rows: [
          { label: 'Minerals', value: `${body.minerals_rate}/tick`, color: CONFIG.COLORS.res_minerals },
          { label: 'Biomass',  value: `${body.biomass_rate}/tick`,  color: CONFIG.COLORS.res_biomass },
          { label: 'Gas',      value: `${body.gas_rate}/tick`,      color: CONFIG.COLORS.res_gas },
          { label: 'Energy',   value: `${body.energy_rate}/tick`,   color: CONFIG.COLORS.res_energy },
        ]});
      }
      // Show moons if this is a planet
      const moons = children.filter(c => c.body_type === 'moon');
      if (moons.length > 0) {
        sections.push({ title: 'MOONS', rows: moons.map(m => ({
          label: m.name, value: m.planet_type,
        }))});
      }
    }

    sections.push(this._stockpile(resources));

    // Subheadings
    const subs = [];
    if (parent) subs.push(`Orbits: ${parent.name} (${parent.body_type})`);
    subs.push(`System: #${body.system_id}`);

    UI.drawInfoPanel(this, panelW, H - 32,
      `${body.body_type.toUpperCase()} — ${body.name}`, subs, sections);

    // ── Body rendering ─────────────────────────────────────
    if (body.body_type === 'star') {
      Assets.drawDetailStar(this, cx, cy, 80, body.color_hex, body.seed);
      this._label(cx, cy + 110, `${body.spectral_class}-type Star`);
    } else {
      const r = Math.max(40, body.radius * (body.body_type === 'moon' ? 8 : 5));
      Assets.drawDetailPlanet(this, cx, cy, r, body.color_hex, body.seed);
      this._label(cx, cy + r + 30, body.planet_type || body.body_type);
    }
    this._label(cx, cy + (body.body_type === 'star' ? 130 : Math.max(40, body.radius * 5) + 50),
      `"${body.name}"`, CONFIG.COLORS.hud_hint);
  }

  _stockpile(res) {
    if (!res) return { title: 'SYSTEM STOCKPILE', rows: [{ label: 'Status', value: 'No data' }] };
    return { title: 'SYSTEM STOCKPILE', rows: [
      { label: 'Minerals', value: Math.floor(res.minerals).toLocaleString(), color: CONFIG.COLORS.res_minerals },
      { label: 'Biomass',  value: Math.floor(res.biomass).toLocaleString(),  color: CONFIG.COLORS.res_biomass },
      { label: 'Gas',      value: Math.floor(res.gas).toLocaleString(),      color: CONFIG.COLORS.res_gas },
      { label: 'Energy',   value: Math.floor(res.energy).toLocaleString(),   color: CONFIG.COLORS.res_energy },
    ]};
  }

  _label(x, y, text, color) {
    this.add.text(x, y, text, {
      fontFamily: CONFIG.FONT, fontSize: '14px', color: color || CONFIG.COLORS.hud_title,
    }).setOrigin(0.5);
  }
}