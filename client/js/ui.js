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

  // ── Camera System ─────────────────────────────────────────

  _springDamp(current, target, velocity, omega, dt) {
    const diff = current - target;
    const exp = Math.exp(-omega * dt);
    const newVal = target + (diff + (velocity + omega * diff) * dt) * exp;
    const newVel = (velocity - omega * (velocity + omega * diff) * dt) * exp;
    return { value: newVal, velocity: newVel };
  },

  _clampScroll(scroll, camSize, zoom, worldSize) {
    const vw = camSize / zoom;
    if (vw >= worldSize) {
      return worldSize / 2 - camSize / 2;
    }
    const min = vw / 2 - camSize / 2;
    const max = worldSize - vw / 2 - camSize / 2;
    return Phaser.Math.Clamp(scroll, min, Math.max(min, max));
  },

  setupCamera(scene, opts = {}) {
    const cam = scene.cameras.main;
    const startZoom = opts.zoom || 1;

    scene._cam = {
      targetZoom: startZoom,
      targetScrollX: 0,
      targetScrollY: 0,
      velZoom: 0,
      velScrollX: 0,
      velScrollY: 0,
      edgePanX: 0,
      edgePanY: 0,
    };

    cam.setZoom(startZoom);

    if (opts.centerX !== undefined && opts.centerY !== undefined) {
      const worldW = scene._worldW || CONFIG.WORLD_W;
      const worldH = scene._worldH || CONFIG.WORLD_H;
      const sx = opts.centerX - cam.width * 0.5;
      const sy = opts.centerY - cam.height * 0.5;
      scene._cam.targetScrollX = this._clampScroll(sx, cam.width, startZoom, worldW);
      scene._cam.targetScrollY = this._clampScroll(sy, cam.height, startZoom, worldH);
      cam.scrollX = scene._cam.targetScrollX;
      cam.scrollY = scene._cam.targetScrollY;
    }

    scene.input.on('pointermove', (ptr) => {
      const c = scene._cam;
      const w = cam.width, h = cam.height;
      const ez = CONFIG.EDGE_ZONE;

      c.edgePanX = 0;
      c.edgePanY = 0;

      if (ptr.x < ez)          c.edgePanX = -(1 - ptr.x / ez);
      else if (ptr.x > w - ez) c.edgePanX = (ptr.x - (w - ez)) / ez;

      if (ptr.y < ez)          c.edgePanY = -(1 - ptr.y / ez);
      else if (ptr.y > h - ez) c.edgePanY = (ptr.y - (h - ez)) / ez;
    });

    scene.input.on('wheel', (ptr, go, dx, dy) => {
      const c = scene._cam;
      const zoomMin = scene._zoomMin || CONFIG.ZOOM_MIN;
      const prevZoom = c.targetZoom;

      c.targetZoom = Phaser.Math.Clamp(
        prevZoom * (dy > 0 ? (1 - CONFIG.ZOOM_STEP) : (1 + CONFIG.ZOOM_STEP)),
        zoomMin, CONFIG.ZOOM_MAX
      );

      if (c.targetZoom !== prevZoom) {
        const worldW = scene._worldW || CONFIG.WORLD_W;
        const worldH = scene._worldH || CONFIG.WORLD_H;
        const hw = cam.width * 0.5, hh = cam.height * 0.5;

        const wp = cam.getWorldPoint(ptr.x, ptr.y);

        const rawX = wp.x - (ptr.x - hw) / c.targetZoom - hw;
        const rawY = wp.y - (ptr.y - hh) / c.targetZoom - hh;

        c.targetScrollX = this._clampScroll(rawX, cam.width, c.targetZoom, worldW);
        c.targetScrollY = this._clampScroll(rawY, cam.height, c.targetZoom, worldH);
      }
    });
  },

  updateCamera(scene) {
    if (!scene._cam) return;
    const cam = scene.cameras.main;
    const c = scene._cam;
    const worldW = scene._worldW || CONFIG.WORLD_W;
    const worldH = scene._worldH || CONFIG.WORLD_H;
    const omega = CONFIG.CAM_SPRING_OMEGA;
    const dt = 1 / 60;

    if (c.edgePanX || c.edgePanY) {
      const speed = CONFIG.SCROLL_SPEED / c.targetZoom;
      c.targetScrollX += c.edgePanX * speed;
      c.targetScrollY += c.edgePanY * speed;
    }

    c.targetScrollX = this._clampScroll(c.targetScrollX, cam.width, c.targetZoom, worldW);
    c.targetScrollY = this._clampScroll(c.targetScrollY, cam.height, c.targetZoom, worldH);

    const z = this._springDamp(cam.zoom, c.targetZoom, c.velZoom, omega, dt);
    const sx = this._springDamp(cam.scrollX, c.targetScrollX, c.velScrollX, omega, dt);
    const sy = this._springDamp(cam.scrollY, c.targetScrollY, c.velScrollY, omega, dt);

    cam.zoom = z.value;
    cam.scrollX = sx.value;
    cam.scrollY = sy.value;
    c.velZoom = z.velocity;
    c.velScrollX = sx.velocity;
    c.velScrollY = sy.velocity;

    if (scene._uiCam) scene._uiCam.setSize(cam.width, cam.height);
  },

  centerCameraOn(scene, wx, wy) {
    if (scene._cam) {
      const cam = scene.cameras.main;
      const worldW = scene._worldW || CONFIG.WORLD_W;
      const worldH = scene._worldH || CONFIG.WORLD_H;
      const zoom = scene._cam.targetZoom;
      const rawX = wx - cam.width * 0.5;
      const rawY = wy - cam.height * 0.5;
      scene._cam.targetScrollX = this._clampScroll(rawX, cam.width, zoom, worldW);
      scene._cam.targetScrollY = this._clampScroll(rawY, cam.height, zoom, worldH);
      cam.scrollX = scene._cam.targetScrollX;
      cam.scrollY = scene._cam.targetScrollY;
    } else {
      const cam = scene.cameras.main;
      cam.scrollX = wx - cam.width * 0.5;
      cam.scrollY = wy - cam.height * 0.5;
    }
  },
};