/**
 * SystemScene.js — Solar system view.
 *
 * Renders the body tree from /api/system/:id.
 *
 * DISPLAY SCALING:
 *   Orbit distances are multiplied by ORBIT_SCALE for visual spread.
 *   Body sizes use logarithmic scaling so gas giants are visibly larger
 *   than moons but don't dominate the screen. The actual data values
 *   are unchanged — this is purely a rendering transform.
 */

const ORBIT_SCALE = 2.5;  // multiplier on semi_major for display

class SystemScene extends Phaser.Scene {
  constructor() { super('SystemScene'); }

  init(data) {
    this.systemId = data.systemId;
    this.galaxyPos = data.galaxyPos || null;
    this._centerOnWorld = data.centerOnWorld || null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this._worldW = CONFIG.SYSTEM_W;
    this._worldH = CONFIG.SYSTEM_H;
    this.cx = CONFIG.SYSTEM_W / 2;
    this.cy = CONFIG.SYSTEM_H / 2;

    UI.initCameras(this);
    UI.tagAsWorld(this, Assets.drawStarfield(this, 400, CONFIG.SYSTEM_W, CONFIG.SYSTEM_H));
    this.tooltip = UI.createTooltip(this);

    this.loadingText = this.add.text(
      this.cameras.main.width / 2, this.cameras.main.height / 2,
      'Loading system...', { fontFamily: CONFIG.FONT, fontSize: '14px', color: CONFIG.COLORS.hud_hint }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(998);
    UI.tagAsUI(this, this.loadingText);

    this._loadSystem();

    UI.addBackButton(this, 16, 40, 'Back to Galaxy', () =>
      this.scene.start('GalaxyScene', { centerOn: this.galaxyPos }));
    UI.setupEdgeScroll(this);
    UI.setupZoom(this);
    UI.centerCameraOn(this, this._centerOnWorld?.x ?? this.cx, this._centerOnWorld?.y ?? this.cy);
  }

  async _loadSystem() {
    try {
      const data = await Network.fetchSystem(this.systemId);
      this.loadingText.destroy();
      this._renderSystem(data);
    } catch (e) {
      console.error('[system]', e);
      this.loadingText.setText('Failed to load system.');
    }
  }

  /**
   * Logarithmic display radius for bodies.
   * Maps the data radius (1-60+) to a visible screen size.
   *   stars:   20-30px
   *   planets: 5-20px
   *   moons:   2-6px
   */
  _displayRadius(body) {
    const r = body.radius || 1;
    if (body.body_type === 'star') {
      // Stars: compact objects get small display, giants get large
      return 12 + Math.log2(Math.max(r, 0.01) + 1) * 5;
    } else if (body.body_type === 'moon') {
      return 2 + Math.log2(r + 1) * 1.5;
    } else {
      // Planets: log scale from ~5 to ~20
      return 4 + Math.log2(r + 1) * 3;
    }
  }

  _renderSystem(data) {
    const { system, bodies } = data;
    const W = (o) => UI.tagAsWorld(this, o);
    const cx = this.cx, cy = this.cy;
    const bodyPos = {};

    const root = bodies.find(b => b.body_type === 'star' && b.parent_id === null);

    UI.addHUD(this, `[ SYSTEM VIEW ]  #${system.id}  "${system.name}"`, null);
    UI.addHintText(this, 66, 'Click any body to inspect  •  Edge-scroll to pan  •  Scroll-wheel to zoom');

    // ── Root star at center ────────────────────────────────
    if (root) {
      bodyPos[root.id] = { x: cx, y: cy };
      this._drawStar(root, cx, cy, this._displayRadius(root), W);
    }

    // ── All other bodies, parents before children ──────────
    const ordered = this._topoSort(bodies, root?.id);

    for (const b of ordered) {
      if (b.id === root?.id) continue;
      const parentPos = bodyPos[b.parent_id] || { x: cx, y: cy };
      const ecc = b.eccentricity || 0;
      const displayOrbit = b.semi_major * ORBIT_SCALE;
      const pos = Assets.orbitPosition(parentPos.x, parentPos.y, displayOrbit, ecc, b.orbit_angle);
      bodyPos[b.id] = pos;
      const dr = this._displayRadius(b);

      if (b.body_type === 'star') {
        W(Assets.drawOrbit(this, parentPos.x, parentPos.y, displayOrbit, ecc));
        this._drawStar(b, pos.x, pos.y, dr, W);

      } else if (b.body_type === 'planet') {
        W(Assets.drawOrbit(this, parentPos.x, parentPos.y, displayOrbit, ecc));
        this._drawPlanet(b, pos.x, pos.y, dr, W);

      } else if (b.body_type === 'moon') {
        const ring = this.add.graphics();
        ring.lineStyle(0.5, CONFIG.COLORS.orbit_ring, 0.2);
        const semiMinor = displayOrbit * Math.sqrt(1 - ecc * ecc);
        const fo = displayOrbit * ecc;
        ring.strokeEllipseShape(
          new Phaser.Geom.Ellipse(parentPos.x + fo, parentPos.y, displayOrbit * 2, semiMinor * 2), 48);
        W(ring);
        this._drawMoon(b, pos.x, pos.y, dr, W);
      }
    }
  }

  _topoSort(bodies, rootId) {
    const byParent = {};
    for (const b of bodies) {
      const pid = b.parent_id ?? '__root__';
      (byParent[pid] = byParent[pid] || []).push(b);
    }
    const result = [];
    const visit = (id) => {
      for (const child of (byParent[id] || [])) {
        result.push(child);
        visit(child.id);
      }
    };
    if (rootId) {
      result.push(bodies.find(b => b.id === rootId));
      visit(rootId);
    }
    visit('__root__');
    return result;
  }

  _drawStar(b, x, y, r, W) {
    const s = Assets.drawSystemStar(this, x, y, b.color_hex, r);
    W(s.body); W(s.glow.img);
    const label = `${b.spectral_class}-type Star  "${b.name}"`;
    const zone = UI.addInteractiveZone(this, x, y, r * 4, this.tooltip, label, {
      onOver: () => { Assets.setSystemStarGlow(this, s.glow, x, y, r, true);  W(s.glow.img); },
      onOut:  () => { Assets.setSystemStarGlow(this, s.glow, x, y, r, false); W(s.glow.img); },
      onClick: () => this._goToDetails(b, x, y),
    });
    W(zone);
  }

  _drawPlanet(b, x, y, r, W) {
    const p = Assets.drawSystemPlanet(this, x, y, r, b.color_hex);
    W(p.body); W(p.glow.img);
    const label = `${b.planet_type}  "${b.name}"`;
    const zone = UI.addInteractiveZone(this, x, y, Math.max(r * 4, 16), this.tooltip, label, {
      onOver: () => { Assets.setPlanetGlow(this, p.glow, x, y, r, true);  W(p.glow.img); },
      onOut:  () => { Assets.setPlanetGlow(this, p.glow, x, y, r, false); W(p.glow.img); },
      onClick: () => this._goToDetails(b, x, y),
    });
    W(zone);
  }

  _drawMoon(b, x, y, r, W) {
    const color = Assets.hexToInt(b.color_hex);
    const body = this.add.graphics();
    body.fillStyle(color, 1);
    body.fillCircle(x, y, r);
    body.fillStyle(0xffffff, 0.15);
    body.fillCircle(x - r * 0.2, y - r * 0.2, r * 0.35);
    W(body);
    const zone = UI.addInteractiveZone(this, x, y, Math.max(r * 5, 14), this.tooltip,
      `${b.planet_type}  "${b.name}"`, {
        onClick: () => this._goToDetails(b, x, y),
      });
    W(zone);
  }

  _goToDetails(body, wx, wy) {
    this.scene.start('DetailsScene', {
      bodyId: body.id, systemId: this.systemId,
      galaxyPos: this.galaxyPos, worldPos: { x: wx, y: wy },
    });
  }

  update() { UI.updateEdgeScroll(this); UI.updateZoom(this); }
}