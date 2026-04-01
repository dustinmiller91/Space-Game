/**
 * SystemScene.js — Solar system view.
 *
 * Renders the body tree from /api/system/:id.
 *
 * DISPLAY SCALING:
 *   Orbit distances use logarithmic scaling to compress the huge
 *   dynamic range of real AU distances (moons at 0.001 AU, outer
 *   planets at 30 AU, companions at 50+ AU) into a visually
 *   navigable pixel space. See _displayOrbit().
 *
 *   Body sizes use logarithmic scaling so gas giants are visibly
 *   larger than moons but don't dominate the screen.
 */

class SystemScene extends Phaser.Scene {
  constructor() { super('SystemScene'); }

  init(data) {
    this.systemId = data.systemId;
    this.galaxyPos = data.galaxyPos || null;
    this._centerOnWorld = data.centerOnWorld || null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
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
   * Convert a real orbital distance (AU) to display pixels.
   *
   * Uses logarithmic scaling to compress the huge dynamic range:
   *   displayDist = BASE * ln(1 + au / REF)
   *
   * This gives good separation at all scales:
   *   - Moon at 0.002 AU  →  ~8 px from planet
   *   - Moon at 0.01 AU   →  ~39 px
   *   - Planet at 1 AU    →  ~1400 px from star
   *   - Planet at 5 AU    →  ~2600 px
   *   - Planet at 30 AU   →  ~3900 px
   *   - Companion at 50 AU→  ~4400 px
   *
   * Ordering is always preserved. Ratios are compressed but
   * relative spacing still reads correctly.
   */
  _displayOrbit(au) {
    if (!au || au <= 0) return 0;
    return CONFIG.ORBIT_DISPLAY_BASE * Math.log(1 + au / CONFIG.ORBIT_LOG_REF);
  }

  /**
   * Logarithmic display radius for bodies.
   */
  _displayRadius(body) {
    const r = body.radius || 1;

    if (body.body_type === 'star') {
      const clamped = Math.max(r, 0.01);
      const t = (Math.log10(clamped) + 2) / 3.2;
      return 50 + Math.max(0, Math.min(1, t)) * 50;

    } else if (body.body_type === 'moon') {
      return 2 + Math.log2(r + 1) * 1.5;

    } else {
      return 4 + Math.log2(r + 1) * 3;
    }
  }

  /**
   * Per-planet axial tilt from seed, for ring rendering.
   * All rings around the same planet share this tilt.
   */
  _planetTilt(seed) {
    const rng = Assets.seededRandom(seed);
    const raw = rng();
    return raw * raw * 0.35;
  }

  _renderSystem(data) {
    const { system, bodies } = data;
    const W = (o) => UI.tagAsWorld(this, o);

    const root = bodies.find(b => b.body_type === 'star' && b.parent_id === null);
    const ordered = this._topoSort(bodies, root?.id);

    // ── Compute world size from tree structure ─────────────
    // Walk the body tree accumulating max display distance from root.
    const maxDist = {};
    if (root) maxDist[root.id] = 0;

    let maxExtent = 0;
    for (const b of ordered) {
      if (b.id === root?.id) continue;
      const parentDist = maxDist[b.parent_id] || 0;
      const ecc = b.eccentricity || 0;
      const apoapsis_au = (b.semi_major || 0) * (1 + ecc);
      const displayDist = this._displayOrbit(apoapsis_au);
      maxDist[b.id] = parentDist + displayDist;
      if (b.body_type !== 'moon' && b.body_type !== 'ring') {
        maxExtent = Math.max(maxExtent, maxDist[b.id]);
      }
    }

    const worldSize = Math.max(4000, Math.ceil(maxExtent * 2.6));
    this._worldW = worldSize;
    this._worldH = worldSize;
    const cx = worldSize / 2;
    const cy = worldSize / 2;
    this.cx = cx;
    this.cy = cy;

    if (this._starfieldSprites) {
      for (const layer of this._starfieldSprites) {
        layer.sprite.setPosition(cx, cy);
        layer.sprite.setSize(worldSize, worldSize);
      }
    }

    // ── Precompute per-planet tilt for ring rendering ──────
    const planetTilts = {};
    for (const b of bodies) {
      if (b.body_type === 'planet') {
        planetTilts[b.id] = this._planetTilt(b.seed);
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
      const displayOrbit = this._displayOrbit(b.semi_major);

      if (b.body_type === 'ring') {
        bodyPos[b.id] = parentPos;
        const tilt = planetTilts[b.parent_id] || 0;
        this._drawRing(b, parentPos.x, parentPos.y, displayOrbit, tilt, W);

      } else {
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
    }

    // Set dynamic zoom floor so the full system is always viewable
    const cam = this.cameras.main;
    const minZoomW = cam.width / worldSize;
    const minZoomH = cam.height / worldSize;
    this._zoomMin = Math.min(minZoomW, minZoomH) * 0.9;

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

  /**
   * Draw a ring body as a near-circular band around its parent planet.
   * Circular ring projected at the parent planet's axial tilt.
   */
  _drawRing(b, parentX, parentY, orbitR, tilt, W) {
    const rng = Assets.seededRandom(b.seed);
    const color = Assets.hexToInt(b.color_hex);
    const g = this.add.graphics();

    const cosI = 1.0 - tilt;

    const width = Math.max(3, b.radius * 2.5);
    const innerR = orbitR - width * 0.5;
    const outerR = orbitR + width * 0.5;

    const strokes = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < strokes; i++) {
      const t = i / strokes;
      const r = innerR + t * (outerR - innerR);
      const alpha = 0.15 + rng() * 0.2;

      const bright = 0.7 + rng() * 0.6;
      const c = Phaser.Display.Color.IntegerToColor(color);
      const tinted = Phaser.Display.Color.GetColor(
        Math.min(255, Math.floor(c.red * bright)),
        Math.min(255, Math.floor(c.green * bright)),
        Math.min(255, Math.floor(c.blue * bright)),
      );

      const ellipse = new Phaser.Geom.Ellipse(parentX, parentY, r * 2, r * cosI * 2);
      g.lineStyle(1.2 + rng() * 1.2, tinted, alpha);
      g.strokeEllipseShape(ellipse, 64);
    }

    W(g);

    const zoneY = parentY - orbitR * cosI;
    const label = `${b.planet_type}  "${b.name}"`;
    const zone = UI.addInteractiveZone(this, parentX, zoneY, Math.max(width * 3, 14),
      this.tooltip, label, {
        onClick: () => this._goToDetails(b, parentX, zoneY),
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