/**
 * ui.js — Reusable UI components and camera controls.
 *
 * DUAL-CAMERA SYSTEM (for scenes with zoom):
 *   Scenes that zoom call UI.initCameras() at the top of create().
 *   This creates a second camera for HUD elements so they stay at 1x.
 *   - UI.tagAsWorld(scene, obj)  → object zooms with the world
 *   - UI.tagAsUI(scene, obj)     → object stays fixed on screen
 *   HUD helpers (createTooltip, addHUD, addBackButton) auto-tag as UI.
 *   Scenes without zoom (DetailsScene) skip initCameras entirely.
 */
const UI = {

  // ── Tooltips ─────────────────────────────────────────────

  createTooltip(scene) {
    const tt = scene.add.text(0, 0, '', {
      fontFamily: CONFIG.FONT, fontSize: '13px',
      color: CONFIG.COLORS.tooltip_text,
      backgroundColor: CONFIG.COLORS.tooltip_bg,
      padding: { x: 10, y: 6 }, resolution: 2,
    }).setDepth(1000).setVisible(false).setScrollFactor(0);
    this.tagAsUI(scene, tt);
    return tt;
  },

  showTooltip(tt, ptr, text) { tt.setText(text).setPosition(ptr.x + 16, ptr.y - 10).setVisible(true); },
  moveTooltip(tt, ptr)       { tt.setPosition(ptr.x + 16, ptr.y - 10); },
  hideTooltip(tt)            { tt.setVisible(false); },

  // ── HUD Text ─────────────────────────────────────────────

  addHUD(scene, title, hint) {
    this.tagAsUI(scene, scene.add.text(16, 16, title, {
      fontFamily: CONFIG.FONT, fontSize: '14px', color: CONFIG.COLORS.hud_title,
    }).setScrollFactor(0).setDepth(999));

    if (hint) {
      this.tagAsUI(scene, scene.add.text(16, 40, hint, {
        fontFamily: CONFIG.FONT, fontSize: '11px', color: CONFIG.COLORS.hud_hint,
      }).setScrollFactor(0).setDepth(999));
    }
  },

  addHintText(scene, y, text) {
    const t = scene.add.text(16, y, text, {
      fontFamily: CONFIG.FONT, fontSize: '11px', color: CONFIG.COLORS.hud_hint,
    }).setScrollFactor(0).setDepth(999);
    this.tagAsUI(scene, t);
    return t;
  },

  // ── Back Button ──────────────────────────────────────────

  addBackButton(scene, x, y, label, onClick) {
    const btn = scene.add.text(x, y, `← ${label}`, {
      fontFamily: CONFIG.FONT, fontSize: '12px',
      color: CONFIG.COLORS.btn_normal,
      backgroundColor: 'rgba(10,18,36,0.8)',
      padding: { x: 8, y: 4 },
    }).setScrollFactor(0).setDepth(999).setInteractive({ useHandCursor: true });
    this.tagAsUI(scene, btn);
    btn.on('pointerover', () => btn.setColor(CONFIG.COLORS.btn_hover));
    btn.on('pointerout',  () => btn.setColor(CONFIG.COLORS.btn_normal));
    btn.on('pointerdown', onClick);
    return btn;
  },

  // ── Info Panel (Details view) ────────────────────────────

  drawInfoPanel(scene, panelW, panelH, heading, subheadings, sections) {
    const x0 = 16, y0 = 16, pad = 20;

    const bg = scene.add.graphics();
    bg.fillStyle(CONFIG.COLORS.panel_bg, 0.9).fillRoundedRect(x0, y0, panelW, panelH, 4);
    bg.lineStyle(1, CONFIG.COLORS.panel_border, 1).strokeRoundedRect(x0, y0, panelW, panelH, 4);

    let y = y0 + pad;

    scene.add.text(x0 + pad, y, heading, {
      fontFamily: CONFIG.FONT, fontSize: '16px', color: CONFIG.COLORS.text_heading,
    });
    y += 32;

    for (const text of subheadings) {
      scene.add.text(x0 + pad, y, text, { fontFamily: CONFIG.FONT, fontSize: '11px', color: CONFIG.COLORS.text_label });
      y += 20;
    }
    y += 12;

    for (const section of sections) {
      const div = scene.add.graphics();
      div.lineStyle(1, CONFIG.COLORS.panel_border, 1).lineBetween(x0 + pad, y, x0 + panelW - pad, y);
      y += 16;

      scene.add.text(x0 + pad, y, section.title, { fontFamily: CONFIG.FONT, fontSize: '11px', color: CONFIG.COLORS.text_section });
      y += 22;

      for (const row of section.rows) {
        scene.add.text(x0 + pad, y, `${row.label}:`, { fontFamily: CONFIG.FONT, fontSize: '13px', color: '#5a7a9a' });
        scene.add.text(x0 + 120, y, row.value, { fontFamily: CONFIG.FONT, fontSize: '13px', color: row.color || CONFIG.COLORS.text_primary });
        y += 22;
      }
      y += 14;
    }
  },

  // ── Interactive Zone ─────────────────────────────────────

  addInteractiveZone(scene, x, y, size, tooltip, text, cbs) {
    const zone = scene.add.zone(x, y, size, size).setInteractive({ useHandCursor: true });
    zone.on('pointerover',  (p) => { this.showTooltip(tooltip, p, text); cbs.onOver?.(p); });
    zone.on('pointermove',  (p) => this.moveTooltip(tooltip, p));
    zone.on('pointerout',   ()  => { this.hideTooltip(tooltip); cbs.onOut?.(); });
    zone.on('pointerdown',  ()  => cbs.onClick?.());
    return zone;
  },

  // ── Dual-Camera System ───────────────────────────────────

  /** Create a UI camera. Call once at the top of create(). */
  initCameras(scene) {
    const cam = scene.cameras.main;
    scene._uiCam = scene.cameras.add(0, 0, cam.width, cam.height);
    scene._uiCam.setScroll(0, 0).transparent = true;
    scene._uiObjects = new Set();
  },

  /** Object zooms with the world (hidden from UI camera). */
  tagAsWorld(scene, obj) {
    if (scene._uiCam) scene._uiCam.ignore(obj);
  },

  /** Object stays fixed on screen (hidden from main camera). */
  tagAsUI(scene, obj) {
    if (!scene._uiObjects) scene._uiObjects = new Set();
    scene._uiObjects.add(obj);
    if (scene._uiCam) scene.cameras.main.ignore(obj);
  },

  // ── Edge Scroll (smooth gradient panning) ────────────────

  setupEdgeScroll(scene) {
    scene._panTarget = { x: 0, y: 0 };
    scene._panVel    = { x: 0, y: 0 };

    scene.input.on('pointermove', (ptr) => {
      const cam = scene.cameras.main;
      let dx = 0, dy = 0;

      if (ptr.x < CONFIG.EDGE_ZONE)                    dx = -(1 - ptr.x / CONFIG.EDGE_ZONE);
      else if (ptr.x > cam.width - CONFIG.EDGE_ZONE)   dx = (ptr.x - (cam.width - CONFIG.EDGE_ZONE)) / CONFIG.EDGE_ZONE;

      if (ptr.y < CONFIG.EDGE_ZONE)                    dy = -(1 - ptr.y / CONFIG.EDGE_ZONE);
      else if (ptr.y > cam.height - CONFIG.EDGE_ZONE)  dy = (ptr.y - (cam.height - CONFIG.EDGE_ZONE)) / CONFIG.EDGE_ZONE;

      scene._panTarget.x = Phaser.Math.Clamp(dx, -1, 1);
      scene._panTarget.y = Phaser.Math.Clamp(dy, -1, 1);
    });
  },

  updateEdgeScroll(scene) {
    const cam = scene.cameras.main;
    const v = scene._panVel;
    const t = scene._panTarget;

    v.x = Phaser.Math.Linear(v.x, t.x, CONFIG.PAN_LERP);
    v.y = Phaser.Math.Linear(v.y, t.y, CONFIG.PAN_LERP);
    if (Math.abs(v.x) < 0.001) v.x = 0;
    if (Math.abs(v.y) < 0.001) v.y = 0;

    const speed = CONFIG.SCROLL_SPEED / cam.zoom;
    cam.scrollX += v.x * speed;
    cam.scrollY += v.y * speed;

    // Clamp to world bounds, centering when viewport exceeds world
    if (!scene._zoomFocusActive) {
      this._clampCamera(scene);
    }
  },

  /** Clamp camera scroll to world bounds. If the viewport is larger
   *  than the world (zoomed way out), center the world in the viewport. */
  _clampCamera(scene) {
    const cam = scene.cameras.main;
    const worldW = scene._worldW || CONFIG.WORLD_W;
    const worldH = scene._worldH || CONFIG.WORLD_H;
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;

    if (vw >= worldW) {
      // Viewport wider than world → center horizontally
      cam.scrollX = (worldW - vw) / 2;
    } else {
      cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, worldW - vw);
    }

    if (vh >= worldH) {
      cam.scrollY = (worldH - vh) / 2;
    } else {
      cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, worldH - vh);
    }
  },

  // ── Smooth Zoom (pointer-centered) ──────────────────────
  //
  // Phaser's camera.getWorldPoint does:
  //   worldX = scrollX + (screenX - width/2) / zoom + width/2
  //
  // We invert this to anchor the world point under the pointer:
  //   scrollX = worldX - (screenX - width/2) / zoom - width/2

  setupZoom(scene) {
    scene._zoomTarget = scene.cameras.main.zoom;
    scene._zoomFocusActive = false;

    scene.input.on('wheel', (ptr, go, dx, dy) => {
      const cam = scene.cameras.main;
      const prev = scene._zoomTarget;
      scene._zoomTarget = Phaser.Math.Clamp(
        prev + (dy > 0 ? -1 : 1) * CONFIG.ZOOM_STEP,
        CONFIG.ZOOM_MIN, CONFIG.ZOOM_MAX
      );
      if (scene._zoomTarget !== prev) {
        const wp = cam.getWorldPoint(ptr.x, ptr.y);
        scene._zoomFocus = { sx: ptr.x, sy: ptr.y, wx: wp.x, wy: wp.y };
        scene._zoomFocusActive = true;
      }
    });
  },

  updateZoom(scene) {
    if (scene._zoomTarget === undefined) return;
    const cam = scene.cameras.main;
    const prev = cam.zoom;

    cam.zoom = Phaser.Math.Linear(cam.zoom, scene._zoomTarget, CONFIG.ZOOM_LERP);

    // Anchor world point under pointer
    if (scene._zoomFocusActive && Math.abs(cam.zoom - prev) > 0.0001) {
      const f = scene._zoomFocus;
      const hw = cam.width * 0.5, hh = cam.height * 0.5;
      cam.scrollX = f.wx - (f.sx - hw) / cam.zoom - hw;
      cam.scrollY = f.wy - (f.sy - hh) / cam.zoom - hh;
      // Apply centering when viewport exceeds world
      this._clampCamera(scene);
    }

    // Snap when close
    if (Math.abs(cam.zoom - scene._zoomTarget) < 0.001) {
      cam.zoom = scene._zoomTarget;
      scene._zoomFocusActive = false;
      this._clampCamera(scene);
    }

    if (scene._uiCam) scene._uiCam.setSize(cam.width, cam.height);
  },

  // ── Camera Helpers ───────────────────────────────────────

  /** scrollX/scrollY = top-left when zoom=1; this centers at any zoom. */
  centerCameraOn(scene, wx, wy) {
    const cam = scene.cameras.main;
    cam.scrollX = wx - cam.width * 0.5;
    cam.scrollY = wy - cam.height * 0.5;
  },
};