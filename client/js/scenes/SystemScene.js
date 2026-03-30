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
 *
 *   Star radii are in solar radii (R☉): 0.00001–15
 *   Planet radii are in display units: 5–32
 *   Moon radii are in display units: 1–6
 *   These are on different scales, so _displayRadius normalizes
 *   each body type into an appropriate pixel range.
 */

const ORBIT_SCALE = 5.0;  // multiplier on semi_major for display

class SystemScene extends Phaser.Scene {
  constructor() { super('SystemScene'); }

  init(data) {
    this.systemId = data.systemId;
    this.galaxyPos = data.galaxyPos || null;
    this._centerOnWorld = data.centerOnWorld || null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    // Temporary world size — updated dynamically in _renderSystem once data loads
    this._worldW = 8000;
    this._worldH = 8000;
    this.cx = 4000;
    this.cy = 4000;

    UI.initCameras(this);
    const starfieldLayers = Assets.drawStarfield(this, this._worldW, this._worldH);
    for (const layer of starfieldLayers) {
      UI.tagAsWorld(this, layer);
    }
    this.tooltip = UI.createTooltip(this);

    this.loadingText = this.add.text(
      this.cameras.main.width / 2, this.cameras.main.height / 2,
      'Loading system...', { fontFamily: CONFIG.FONT, fontSize: '14px', color: CONFIG.COLORS.hud_hint }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(998);
    UI.tagAsUI(this, this.loadingText);

    this._loadSystem();

    UI.addBackButton(this, 16, 40, 'Back to Galaxy', () =>
      this.scene.start('GalaxyScene', { centerOn: this.galaxyPos }));
    UI.setupCamera(this, {
      zoom: CONFIG.ZOOM_MIN,
      centerX: this._centerOnWorld?.x ?? this.cx,
      centerY: this._centerOnWorld?.y ?? this.cy,
    });
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
   *
   * Star radii are in R☉ (solar radii): range ~0.00001–15
   * Planet/moon radii are in display units: planets 5–32, moons 1–6
   *
   * Target pixel ranges:
   *   stars:   30-60px  (always the dominant objects)
   *   planets:  5-20px
   *   moons:    2-6px
   */
  _displayRadius(body) {
    const r = body.radius || 1;

    if (body.body_type === 'star') {
      // Star radii in R☉. Most main-sequence: 0.1–15.
      // Exotics (neutron stars, white dwarfs): 0.00001–0.02
      // Map to 50–100px. Stars should dominate the system view,
      // especially with wider orbit spacing.
      const clamped = Math.max(r, 0.01);
      // log10 range: log10(0.01)=-2, log10(15)=1.18 → span ~3.2
      const t = (Math.log10(clamped) + 2) / 3.2; // 0..1 normalized
      return 50 + Math.max(0, Math.min(1, t)) * 50;

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

    const root = bodies.find(b => b.body_type === 'star' && b.parent_id === null);
    const ordered = this._topoSort(bodies, root?.id);

    // ── Compute world size from tree structure ─────────────
    // Walk the body tree accumulating max apoapsis distance from root.
    // Only needs parent distances, not actual positions.
    const maxDist = {};
    if (root) maxDist[root.id] = 0;

    let maxExtent = 0;
    for (const b of ordered) {
      if (b.id === root?.id) continue;
      const parentDist = maxDist[b.parent_id] || 0;
      const ecc = b.eccentricity || 0;
      const apoapsis = (b.semi_major || 0) * (1 + ecc) * ORBIT_SCALE;
      maxDist[b.id] = parentDist + apoapsis;
      if (b.body_type !== 'moon') {
        maxExtent = Math.max(maxExtent, maxDist[b.id]);
      }
    }

    // Pad so outermost orbits aren't on the edge
    const worldSize = Math.max(4000, Math.ceil(maxExtent * 2.6));
    this._worldW = worldSize;
    this._worldH = worldSize;
    const cx = worldSize / 2;
    const cy = worldSize / 2;
    this.cx = cx;
    this.cy = cy;

    // Resize starfield layers to match actual world size
    if (this._starfieldSprites) {
      for (const layer of this._starfieldSprites) {
        layer.sprite.setPosition(cx, cy);
        layer.sprite.setSize(worldSize, worldSize);
      }
    }

    // ── Compute positions and draw ─────────────────────────
    const bodyPos = {};
    if (root) bodyPos[root.id] = { x: cx, y: cy };

    UI.addHUD(this, `[ SYSTEM VIEW ]  #${system.id}  "${system.name}"`, null);
    UI.addHintText(this, 66, 'Click any body to inspect  •  Edge-scroll to pan  •  Scroll-wheel to zoom');

    if (root) {
      this._drawStar(root, cx, cy, this._displayRadius(root), W);
    }

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
        const semiMinor = displayOrbit * Math.sqrt(1 - ecc * ecc);
        const fo = displayOrbit * ecc;
        const ellipse = new Phaser.Geom.Ellipse(parentPos.x + fo, parentPos.y, displayOrbit * 2, semiMinor * 2);
        ring.lineStyle(2, 0x1a3a5a, 0.03);
        ring.strokeEllipseShape(ellipse, 48);
        ring.lineStyle(0.7, 0x2a4a6a, 0.28);
        ring.strokeEllipseShape(ellipse, 48);
        W(ring);
        this._drawMoon(b, pos.x, pos.y, dr, W);
      }
    }

    // Set dynamic zoom floor so the full system is always viewable
    const cam = this.cameras.main;
    const minZoomW = cam.width / worldSize;
    const minZoomH = cam.height / worldSize;
    this._zoomMin = Math.min(minZoomW, minZoomH) * 0.9;

    // Set zoom target — spring will animate there smoothly
    if (this._cam) this._cam.targetZoom = this._zoomMin * 1.5;

    UI.centerCameraOn(this, this._centerOnWorld?.x ?? cx, this._centerOnWorld?.y ?? cy);
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

  update() { UI.updateCamera(this); Assets.updateStarfield(this); }
}