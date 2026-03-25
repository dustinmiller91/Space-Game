/**
 * ui.js — Reusable UI elements for Phaser scenes.
 *
 * Tooltips, HUD labels, back buttons, info panels,
 * edge-scroll camera controller, smooth pointer-centered zoom.
 *
 * ZOOM ARCHITECTURE:
 *   - cameras.main renders world objects and is the one that zooms
 *   - A second "UI camera" renders only HUD/tooltip/button objects at 1x zoom
 *   - World objects are tagged so the UI camera ignores them
 *   - UI objects are tagged so the main camera ignores them
 *   - tagAsUI() and tagAsWorld() can be called at any time
 */
const UI = {

  // ── Tooltip ─────────────────────────────────────────────

  createTooltip(scene) {
    const tt = scene.add.text(0, 0, '', {
      fontFamily: CONFIG.FONT,
      fontSize: '13px',
      color: CONFIG.COLORS.tooltip_text,
      backgroundColor: CONFIG.COLORS.tooltip_bg,
      padding: { x: 10, y: 6 },
      resolution: 2,
    }).setDepth(1000).setVisible(false).setScrollFactor(0);
    this.tagAsUI(scene, tt);
    return tt;
  },

  showTooltip(tooltip, pointer, text) {
    tooltip.setText(text);
    tooltip.setPosition(pointer.x + 16, pointer.y - 10);
    tooltip.setVisible(true);
  },

  moveTooltip(tooltip, pointer) {
    tooltip.setPosition(pointer.x + 16, pointer.y - 10);
  },

  hideTooltip(tooltip) {
    tooltip.setVisible(false);
  },

  // ── HUD ─────────────────────────────────────────────────

  addHUD(scene, title, hint) {
    const t = scene.add.text(16, 16, title, {
      fontFamily: CONFIG.FONT,
      fontSize: '14px',
      color: CONFIG.COLORS.hud_title,
    }).setScrollFactor(0).setDepth(999);
    this.tagAsUI(scene, t);

    if (hint) {
      const h = scene.add.text(16, 40, hint, {
        fontFamily: CONFIG.FONT,
        fontSize: '11px',
        color: CONFIG.COLORS.hud_hint,
      }).setScrollFactor(0).setDepth(999);
      this.tagAsUI(scene, h);
    }
  },

  // ── Back Button ─────────────────────────────────────────

  addBackButton(scene, x, y, label, onClick) {
    const btn = scene.add.text(x, y, `← ${label}`, {
      fontFamily: CONFIG.FONT,
      fontSize: '12px',
      color: CONFIG.COLORS.btn_normal,
      backgroundColor: 'rgba(10,18,36,0.8)',
      padding: { x: 8, y: 4 },
    }).setScrollFactor(0).setDepth(999).setInteractive({ useHandCursor: true });
    this.tagAsUI(scene, btn);

    btn.on('pointerover', () => btn.setColor(CONFIG.COLORS.btn_hover));
    btn.on('pointerout', () => btn.setColor(CONFIG.COLORS.btn_normal));
    btn.on('pointerdown', onClick);

    return btn;
  },

  // ── Info Panel (Details view) ───────────────────────────

  drawInfoPanel(scene, panelW, panelH, heading, subheadings, sections) {
    const x0 = 16;
    const y0 = 16;
    const padX = 20;

    const bg = scene.add.graphics();
    bg.fillStyle(CONFIG.COLORS.panel_bg, 0.9);
    bg.fillRoundedRect(x0, y0, panelW, panelH, 4);
    bg.lineStyle(1, CONFIG.COLORS.panel_border, 1);
    bg.strokeRoundedRect(x0, y0, panelW, panelH, 4);

    let yPos = y0 + padX;

    scene.add.text(x0 + padX, yPos, heading, {
      fontFamily: CONFIG.FONT,
      fontSize: '16px',
      color: CONFIG.COLORS.text_heading,
    });
    yPos += 32;

    subheadings.forEach(text => {
      scene.add.text(x0 + padX, yPos, text, {
        fontFamily: CONFIG.FONT,
        fontSize: '11px',
        color: CONFIG.COLORS.text_label,
      });
      yPos += 20;
    });
    yPos += 12;

    sections.forEach(section => {
      const div = scene.add.graphics();
      div.lineStyle(1, CONFIG.COLORS.panel_border, 1);
      div.lineBetween(x0 + padX, yPos, x0 + panelW - padX, yPos);
      yPos += 16;

      scene.add.text(x0 + padX, yPos, section.title, {
        fontFamily: CONFIG.FONT,
        fontSize: '11px',
        color: CONFIG.COLORS.text_section,
      });
      yPos += 22;

      section.rows.forEach(row => {
        scene.add.text(x0 + padX, yPos, `${row.label}:`, {
          fontFamily: CONFIG.FONT,
          fontSize: '13px',
          color: '#5a7a9a',
        });
        scene.add.text(x0 + 120, yPos, row.value, {
          fontFamily: CONFIG.FONT,
          fontSize: '13px',
          color: row.color || CONFIG.COLORS.text_primary,
        });
        yPos += 22;
      });
      yPos += 14;
    });
  },

  // ── Camera System ───────────────────────────────────────

  /**
   * Initialize the dual-camera system for a scene.
   * Call this ONCE at the top of create(), before adding any objects.
   */
  initCameras(scene) {
    const cam = scene.cameras.main;

    // UI camera: fixed, no zoom, no scroll, renders UI-tagged objects only
    scene._uiCam = scene.cameras.add(0, 0, cam.width, cam.height);
    scene._uiCam.setScroll(0, 0);
    scene._uiCam.transparent = true;
    scene._uiCam.setName('ui');

    // Track tagged objects
    scene._uiObjects = new Set();
    scene._worldObjects = new Set();
  },

  /**
   * Tag a display object as UI — rendered by UI camera only (no zoom).
   */
  tagAsUI(scene, obj) {
    if (!scene._uiObjects) scene._uiObjects = new Set();
    scene._uiObjects.add(obj);
    // Only split cameras if the dual-camera system is active
    if (scene._uiCam) {
      scene.cameras.main.ignore(obj);
    }
    return obj;
  },

  /**
   * Tag a display object as world — rendered by main camera only (zooms).
   * Only needed for objects created AFTER initCameras.
   */
  tagAsWorld(scene, obj) {
    if (!scene._worldObjects) scene._worldObjects = new Set();
    scene._worldObjects.add(obj);
    // UI camera should not render this
    if (scene._uiCam) {
      scene._uiCam.ignore(obj);
    }
    return obj;
  },

  // ── Edge Scroll ─────────────────────────────────────────

  setupEdgeScroll(scene) {
    // Target velocity (set by pointer position)
    scene._edgeTargetDx = 0;
    scene._edgeTargetDy = 0;
    // Current velocity (lerped toward target for smooth accel/decel)
    scene._edgeVelX = 0;
    scene._edgeVelY = 0;

    scene.input.on('pointermove', (pointer) => {
      const cam = scene.cameras.main;
      let dx = 0, dy = 0;

      // Gradient: closer to the edge = faster scroll (0 to 1)
      if (pointer.x < CONFIG.EDGE_ZONE) {
        dx = -(1 - pointer.x / CONFIG.EDGE_ZONE);
      } else if (pointer.x > cam.width - CONFIG.EDGE_ZONE) {
        dx = (pointer.x - (cam.width - CONFIG.EDGE_ZONE)) / CONFIG.EDGE_ZONE;
      }

      if (pointer.y < CONFIG.EDGE_ZONE) {
        dy = -(1 - pointer.y / CONFIG.EDGE_ZONE);
      } else if (pointer.y > cam.height - CONFIG.EDGE_ZONE) {
        dy = (pointer.y - (cam.height - CONFIG.EDGE_ZONE)) / CONFIG.EDGE_ZONE;
      }

      // Clamp to [-1, 1]
      scene._edgeTargetDx = Phaser.Math.Clamp(dx, -1, 1);
      scene._edgeTargetDy = Phaser.Math.Clamp(dy, -1, 1);
    });
  },

  updateEdgeScroll(scene) {
    const cam = scene.cameras.main;
    const lerpSpeed = 0.15;

    // Smoothly ramp velocity toward target
    scene._edgeVelX = Phaser.Math.Linear(scene._edgeVelX, scene._edgeTargetDx, lerpSpeed);
    scene._edgeVelY = Phaser.Math.Linear(scene._edgeVelY, scene._edgeTargetDy, lerpSpeed);

    // Kill tiny residual drift
    if (Math.abs(scene._edgeVelX) < 0.001) scene._edgeVelX = 0;
    if (Math.abs(scene._edgeVelY) < 0.001) scene._edgeVelY = 0;

    const speed = CONFIG.SCROLL_SPEED / cam.zoom;
    cam.scrollX += scene._edgeVelX * speed;
    cam.scrollY += scene._edgeVelY * speed;

    // Clamp unless mid-zoom-anchor
    if (!scene._zoomFocusActive) {
      const viewW = cam.width / cam.zoom;
      const viewH = cam.height / cam.zoom;
      cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, Math.max(0, CONFIG.WORLD_W - viewW));
      cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, Math.max(0, CONFIG.WORLD_H - viewH));
    }
  },

  // ── Smooth Zoom ─────────────────────────────────────────

  setupZoom(scene) {
    scene._zoomTarget = scene.cameras.main.zoom;
    scene._zoomFocusActive = false;

    scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      const cam = scene.cameras.main;
      const oldTarget = scene._zoomTarget;
      const direction = deltaY > 0 ? -1 : 1;

      scene._zoomTarget = Phaser.Math.Clamp(
        scene._zoomTarget + direction * CONFIG.ZOOM_STEP,
        CONFIG.ZOOM_MIN,
        CONFIG.ZOOM_MAX
      );

      if (scene._zoomTarget !== oldTarget) {
        // Use Phaser's getWorldPoint for correct screen → world conversion
        const wp = cam.getWorldPoint(pointer.x, pointer.y);
        scene._zoomFocusScreenX = pointer.x;
        scene._zoomFocusScreenY = pointer.y;
        scene._zoomFocusWorldX = wp.x;
        scene._zoomFocusWorldY = wp.y;
        scene._zoomFocusActive = true;
      }
    });
  },

  updateZoom(scene) {
    if (scene._zoomTarget === undefined) return;

    const cam = scene.cameras.main;
    const prevZoom = cam.zoom;
    const lerpSpeed = 0.12;

    cam.zoom = Phaser.Math.Linear(cam.zoom, scene._zoomTarget, lerpSpeed);

    // Anchor: keep the world point under the pointer fixed.
    //
    // Phaser's getWorldPoint does:
    //   worldX = scrollX + (screenX - width * 0.5) / zoom + width * 0.5
    //
    // Solving for scrollX:
    //   scrollX = worldX - (screenX - width * 0.5) / zoom - width * 0.5
    if (scene._zoomFocusActive && Math.abs(cam.zoom - prevZoom) > 0.0001) {
      const hw = cam.width * 0.5;
      const hh = cam.height * 0.5;
      cam.scrollX = scene._zoomFocusWorldX - (scene._zoomFocusScreenX - hw) / cam.zoom - hw;
      cam.scrollY = scene._zoomFocusWorldY - (scene._zoomFocusScreenY - hh) / cam.zoom - hh;
    }

    if (Math.abs(cam.zoom - scene._zoomTarget) < 0.001) {
      cam.zoom = scene._zoomTarget;
      scene._zoomFocusActive = false;
    }

    if (scene._uiCam) {
      scene._uiCam.setSize(cam.width, cam.height);
    }
  },

  // ── Camera Helpers ──────────────────────────────────────

  /**
   * Center the camera on a world coordinate.
   * Uses the inverse of Phaser's getWorldPoint with screenX = width/2, screenY = height/2.
   * That simplifies to: scrollX = worldX - width/2, scrollY = worldY - height/2
   */
  centerCameraOn(scene, worldX, worldY) {
    const cam = scene.cameras.main;
    cam.scrollX = worldX - cam.width * 0.5;
    cam.scrollY = worldY - cam.height * 0.5;
  },

  // ── Interactive zone helper ─────────────────────────────

  addInteractiveZone(scene, x, y, size, tooltip, tooltipText, callbacks) {
    const zone = scene.add.zone(x, y, size, size)
      .setInteractive({ useHandCursor: true });

    zone.on('pointerover', (pointer) => {
      this.showTooltip(tooltip, pointer, tooltipText);
      if (callbacks.onOver) callbacks.onOver(pointer);
    });
    zone.on('pointermove', (pointer) => {
      this.moveTooltip(tooltip, pointer);
    });
    zone.on('pointerout', () => {
      this.hideTooltip(tooltip);
      if (callbacks.onOut) callbacks.onOut();
    });
    zone.on('pointerdown', () => {
      if (callbacks.onClick) callbacks.onClick();
    });

    return zone;
  },
};