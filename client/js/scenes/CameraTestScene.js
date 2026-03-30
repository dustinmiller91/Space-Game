/**
 * CameraTestScene.js — Diagnostic scene for camera coordinate system.
 *
 * Renders a grid of known reference points and a real-time overlay
 * showing camera state. Use to verify that scroll, zoom, and world
 * bounds behave correctly.
 *
 * To use: temporarily replace GalaxyScene in engine.js scene list
 * with CameraTestScene, or add it and start it manually.
 */
class CameraTestScene extends Phaser.Scene {
  constructor() { super('CameraTestScene'); }

  create() {
    this.cameras.main.setBackgroundColor('#0a0a1a');

    // Test world: 4000x4000, small enough to verify visually
    this._worldW = 4000;
    this._worldH = 4000;

    UI.initCameras(this);

    const W = (o) => UI.tagAsWorld(this, o);
    const g = this.add.graphics();
    W(g);

    // ── Draw world boundary (red rectangle) ──
    g.lineStyle(3, 0xff0000, 1);
    g.strokeRect(0, 0, 4000, 4000);

    // ── Draw grid lines every 500px (dark grey) ──
    g.lineStyle(1, 0x333333, 0.5);
    for (let x = 0; x <= 4000; x += 500) {
      g.lineBetween(x, 0, x, 4000);
    }
    for (let y = 0; y <= 4000; y += 500) {
      g.lineBetween(0, y, 4000, y);
    }

    // ── Draw corner markers with coordinates ──
    const corners = [
      { x: 0, y: 0, label: '(0,0) TOP-LEFT' },
      { x: 4000, y: 0, label: '(4000,0) TOP-RIGHT' },
      { x: 0, y: 4000, label: '(0,4000) BOT-LEFT' },
      { x: 4000, y: 4000, label: '(4000,4000) BOT-RIGHT' },
      { x: 2000, y: 2000, label: '(2000,2000) CENTER' },
    ];

    for (const c of corners) {
      // Marker dot
      g.fillStyle(0xffff00, 1);
      g.fillCircle(c.x, c.y, 12);
      // Label
      const t = this.add.text(c.x + 16, c.y - 8, c.label, {
        fontFamily: CONFIG.FONT, fontSize: '14px', color: '#ffff00',
      });
      W(t);
    }

    // ── Draw markers every 1000px along edges ──
    for (let i = 0; i <= 4000; i += 1000) {
      g.fillStyle(0x00ff00, 1);
      g.fillCircle(i, 0, 6);
      g.fillCircle(i, 4000, 6);
      g.fillCircle(0, i, 6);
      g.fillCircle(4000, i, 6);
      const tTop = this.add.text(i + 4, 8, `${i}`, {
        fontFamily: CONFIG.FONT, fontSize: '10px', color: '#00ff00',
      });
      const tLeft = this.add.text(8, i + 4, `${i}`, {
        fontFamily: CONFIG.FONT, fontSize: '10px', color: '#00ff00',
      });
      W(tTop);
      W(tLeft);
    }

    // ── Crosshair at world center ──
    g.lineStyle(2, 0x00aaff, 0.8);
    g.lineBetween(1900, 2000, 2100, 2000);
    g.lineBetween(2000, 1900, 2000, 2100);

    // ── Diagnostic overlay (screen-fixed) ──
    this._diagText = this.add.text(16, 16, '', {
      fontFamily: CONFIG.FONT, fontSize: '12px', color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: { x: 8, y: 6 },
    }).setScrollFactor(0).setDepth(1000);
    UI.tagAsUI(this, this._diagText);

    // ── Mouse world position (screen-fixed) ──
    this._mouseText = this.add.text(16, 160, '', {
      fontFamily: CONFIG.FONT, fontSize: '12px', color: '#aaffaa',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: { x: 8, y: 6 },
    }).setScrollFactor(0).setDepth(1000);
    UI.tagAsUI(this, this._mouseText);

    // Track mouse world position
    this._mouseWorld = { x: 0, y: 0 };
    this.input.on('pointermove', (ptr) => {
      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      this._mouseWorld.x = wp.x;
      this._mouseWorld.y = wp.y;
    });

    // ── Setup camera ──
    UI.setupCamera(this, {
      centerX: 2000,
      centerY: 2000,
    });

    // Instructions
    const inst = this.add.text(16, 280, [
      'CAMERA TEST SCENE',
      '─────────────────',
      'Red border = world bounds (0,0)-(4000,4000)',
      'Yellow dots = corners + center',
      'Green dots = 1000px markers',
      'Blue crosshair = world center',
      '',
      'Edge-scroll to pan, wheel to zoom.',
      'Verify:',
      '  - Camera starts centered on (2000,2000)',
      '  - Red border is visible at all edges when scrolled there',
      '  - No black gap between viewport edge and red border',
      '  - Zoom focuses toward mouse position',
      '  - Cannot scroll past red border',
    ].join('\n'), {
      fontFamily: CONFIG.FONT, fontSize: '11px', color: '#888888',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: { x: 8, y: 6 },
    }).setScrollFactor(0).setDepth(1000);
    UI.tagAsUI(this, inst);
  }

  update() {
    UI.updateCamera(this);

    // Update diagnostic overlay
    if (this._diagText) {
      const cam = this.cameras.main;
      const c = this._cam;
      const vw = cam.width / cam.zoom;
      const vh = cam.height / cam.zoom;
      const worldW = this._worldW;

      // Compute visible world edges
      // Phaser scroll with default origin: center of viewport is at
      // (scrollX + width/2, scrollY + height/2) in screen coords,
      // which maps to world via getWorldPoint
      const topLeft = cam.getWorldPoint(0, 0);
      const botRight = cam.getWorldPoint(cam.width, cam.height);

      this._diagText.setText([
        `cam.scrollX:  ${cam.scrollX.toFixed(1)}`,
        `cam.scrollY:  ${cam.scrollY.toFixed(1)}`,
        `cam.zoom:     ${cam.zoom.toFixed(4)}`,
        `viewport:     ${vw.toFixed(0)} x ${vh.toFixed(0)}`,
        `worldSize:    ${worldW} x ${worldW}`,
        `─── targets ───`,
        `targetScrollX: ${c?.targetScrollX?.toFixed(1) ?? 'N/A'}`,
        `targetScrollY: ${c?.targetScrollY?.toFixed(1) ?? 'N/A'}`,
        `targetZoom:    ${c?.targetZoom?.toFixed(4) ?? 'N/A'}`,
        `─── visible world ───`,
        `topLeft:  (${topLeft.x.toFixed(0)}, ${topLeft.y.toFixed(0)})`,
        `botRight: (${botRight.x.toFixed(0)}, ${botRight.y.toFixed(0)})`,
      ].join('\n'));
    }

    if (this._mouseText) {
      this._mouseText.setText(
        `mouse world: (${this._mouseWorld.x.toFixed(0)}, ${this._mouseWorld.y.toFixed(0)})`
      );
    }
  }
}