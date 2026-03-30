/**
 * GalaxyScene.js — Top-level galaxy map.
 *
 * Multi-star systems are shown as small clusters of dots.
 * Tooltips show multiplicity (Binary, Trinary, etc.).
 */

const MULTIPLICITY_NAMES = ['', 'Single', 'Binary', 'Trinary', 'Quaternary', 'Quintuple', 'Sextuple'];

class GalaxyScene extends Phaser.Scene {
  constructor() { super('GalaxyScene'); }

  init(data) { this._centerOn = data?.centerOn || null; }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this._worldW = CONFIG.GALAXY_W;
    this._worldH = CONFIG.GALAXY_H;

    UI.initCameras(this);
    for (const layer of Assets.drawStarfield(this, CONFIG.GALAXY_W, CONFIG.GALAXY_H)) {
      UI.tagAsWorld(this, layer);
    }

    this.tooltip = UI.createTooltip(this);
    this._loadGalaxy();

    UI.addHUD(this, '[ GALAXY VIEW ]',
      'Edge-scroll to pan  •  Scroll-wheel to zoom  •  Click a star to enter system');
    UI.setupCamera(this, {
      centerX: this._centerOn?.x ?? CONFIG.GALAXY_W / 2,
      centerY: this._centerOn?.y ?? CONFIG.GALAXY_H / 2,
    });

    // DEBUG: diagnostic overlay
    this._diagText = this.add.text(16, 80, '', {
      fontFamily: CONFIG.FONT, fontSize: '12px', color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: { x: 8, y: 6 },
    }).setScrollFactor(0).setDepth(1000);
    UI.tagAsUI(this, this._diagText);
  }

  async _loadGalaxy() {
    try { this._renderStars(await Network.fetchGalaxy()); }
    catch (e) { console.error('[galaxy]', e); }
  }

  _renderStars(systems) {
    const W = (o) => UI.tagAsWorld(this, o);

    for (const sys of systems) {
      const starCount = sys.star_count || 1;
      const baseR = 2 + Math.min(parseFloat(sys.star_mass) || 1, 10) * 0.4;
      const primaryR = baseR * CONFIG.GALAXY_STAR_SCALE;
      const cx = sys.galaxy_x, cy = sys.galaxy_y;

      // ── Draw stars as a cluster ──────────────────────────
      // Seeded RNG per system so layout is unique but deterministic
      const rng = Assets.seededRandom(sys.seed);
      const allGlows = [];

      // Primary star at center
      const { body, glow } = Assets.drawGalaxyStar(this, cx, cy, primaryR, sys.color_hex);
      W(body); W(glow.img);
      allGlows.push(glow);

      // Companions: each gets a seeded angle, distance, and size
      // For 1 companion: simple pair at a random angle
      // For 2+: first orbits close, rest spread at varied distances
      // This loosely mirrors the mobile tree (primary → companions)
      const companions = sys.companions || [];
      const baseAngle = rng() * Math.PI * 2;  // random orientation per system

      for (let i = 0; i < companions.length; i++) {
        const comp = companions[i];

        // Each companion gets its own angle offset and distance jitter
        const angleSpread = companions.length === 1
          ? 0  // binary: one companion at baseAngle
          : (i / companions.length) * Math.PI * 2;  // spread evenly from baseAngle
        const angle = baseAngle + angleSpread + (rng() - 0.5) * 0.6;

        // Vary distance: wider spacing so stars don't overlap
        const distBase = primaryR * 3.5 + 4;
        const distJitter = 2 + rng() * primaryR * 1.2;
        const offset = distBase + distJitter + i * (primaryR * 0.8);

        const compR = Math.max(1.5, primaryR * (0.4 + rng() * 0.3));
        const compX = cx + Math.cos(angle) * offset;
        const compY = cy + Math.sin(angle) * offset;

        const c = Assets.drawGalaxyStar(this, compX, compY, compR, comp.color_hex);
        W(c.body); W(c.glow.img);
        allGlows.push(c.glow);
      }

      // ── Tooltip with multiplicity ────────────────────────
      const multName = MULTIPLICITY_NAMES[starCount] || `${starCount}-star`;
      const tooltip = `${sys.name}  •  ${multName} [${sys.spectral_class}]`;

      // ── Interaction zone covers the whole cluster ────────
      const clusterSize = Math.max(primaryR * 8, primaryR * 3 + companions.length * 6) * CONFIG.GALAXY_ZONE_SCALE;

      const zone = UI.addInteractiveZone(this, cx, cy, clusterSize, this.tooltip, tooltip, {
        onOver: () => {
          for (const g of allGlows) {
            Assets.setGalaxyStarGlow(this, g, g.img.x, g.img.y, g.r, true);
            W(g.img);
          }
        },
        onOut: () => {
          for (const g of allGlows) {
            Assets.setGalaxyStarGlow(this, g, g.img.x, g.img.y, g.r, false);
            W(g.img);
          }
        },
        onClick: () => this.scene.start('SystemScene', {
          systemId: sys.id, galaxyPos: { x: cx, y: cy },
        }),
      });
      W(zone);
    }
  }

  update() {
    UI.updateCamera(this);
    Assets.updateStarfield(this);

    if (this._diagText) {
      const cam = this.cameras.main;
      const tl = cam.getWorldPoint(0, 0);
      const br = cam.getWorldPoint(cam.width, cam.height);
      this._diagText.setText([
        `scroll: (${cam.scrollX.toFixed(0)}, ${cam.scrollY.toFixed(0)})`,
        `zoom: ${cam.zoom.toFixed(4)}`,
        `viewport: ${(cam.width/cam.zoom).toFixed(0)} x ${(cam.height/cam.zoom).toFixed(0)}`,
        `world: ${this._worldW} x ${this._worldH}`,
        `topLeft: (${tl.x.toFixed(0)}, ${tl.y.toFixed(0)})`,
        `botRight: (${br.x.toFixed(0)}, ${br.y.toFixed(0)})`,
      ].join('\n'));
    }
  }

  
}