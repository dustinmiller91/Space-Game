/**
 * assets.js — Procedural asset rendering.
 *
 * Draws stars, planets, orbits, and backgrounds using Phaser Graphics.
 * Glow effects use canvas radial gradients (cached as textures).
 *
 * FUTURE: Replace circle-based placeholders with pixel-art generation.
 * The public API (draw*, set*, get*) will stay the same — only the
 * rendering internals will change.
 */
const Assets = {

  // ── Utilities ────────────────────────────────────────────

  /** Deterministic PRNG. Same seed → same sequence every time. */
  seededRandom(seed) {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  },

  /** "#RRGGBB" → 0xRRGGBB */
  hexToInt(hex) {
    return parseInt(hex.replace('#', ''), 16);
  },

  // ── Glow System ──────────────────────────────────────────
  //
  // Uses canvas radial gradients for smooth falloff (no banding).
  // Textures are keyed by parameters and cached automatically.
  // Hover states destroy the old image and create a new one at
  // the brighter/larger settings.

  drawGlow(scene, x, y, innerR, outerR, colorInt, peakAlpha) {
    const size = Math.ceil(outerR * 2);
    const key = `glow_${colorInt}_${size}_${Math.round(innerR)}_${Math.round(peakAlpha * 100)}`;

    if (!scene.textures.exists(key)) {
      const canvas = scene.textures.createCanvas(key, size, size);
      const ctx = canvas.context;
      const c = size / 2;
      const r = (colorInt >> 16) & 0xff;
      const g = (colorInt >> 8) & 0xff;
      const b = colorInt & 0xff;

      const grad = ctx.createRadialGradient(c, c, innerR, c, c, outerR);
      grad.addColorStop(0,   `rgba(${r},${g},${b},${peakAlpha})`);
      grad.addColorStop(0.3, `rgba(${r},${g},${b},${peakAlpha * 0.4})`);
      grad.addColorStop(0.7, `rgba(${r},${g},${b},${peakAlpha * 0.08})`);
      grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      canvas.refresh();
    }

    return scene.add.image(x, y, key);
  },

  /** Swap a glow image for one with different parameters. */
  replaceGlow(scene, oldImg, x, y, innerR, outerR, colorInt, peakAlpha) {
    if (oldImg) oldImg.destroy();
    return this.drawGlow(scene, x, y, innerR, outerR, colorInt, peakAlpha);
  },

  /**
   * Generic hover toggle for any glow container.
   * `container` is { img: <Phaser.Image> } — a mutable ref so the
   * caller's reference stays valid after the image is replaced.
   */
  _setGlow(scene, container, x, y, innerR, normalOuter, hoverOuter, normalAlpha, hoverAlpha, hovered) {
    container.img = this.replaceGlow(
      scene, container.img, x, y, innerR,
      hovered ? hoverOuter : normalOuter,
      container.color,
      hovered ? hoverAlpha : normalAlpha
    );
  },

  // ── Galaxy View ──────────────────────────────────────────

  drawGalaxyStar(scene, x, y, r, colorHex) {
    const color = this.hexToInt(colorHex);
    const glowImg = this.drawGlow(scene, x, y, r, r * 6, color, 0.25);

    const body = scene.add.graphics();
    body.fillStyle(color, 1);
    body.fillCircle(x, y, r);
    body.fillStyle(0xffffff, 0.5);
    body.fillCircle(x - r * 0.25, y - r * 0.25, r * 0.4);

    return { body, glow: { img: glowImg, color }, color };
  },

  setGalaxyStarGlow(scene, glow, x, y, r, hovered) {
    this._setGlow(scene, glow, x, y, r, r * 6, r * 8, 0.25, 0.4, hovered);
  },

  // ── System View ──────────────────────────────────────────

  drawSystemStar(scene, cx, cy, colorHex, r) {
    const color = this.hexToInt(colorHex);
    r = r || 24;
    const glowImg = this.drawGlow(scene, cx, cy, r, r * 8, color, 0.2);

    const body = scene.add.graphics();
    body.fillStyle(color, 1);
    body.fillCircle(cx, cy, r);
    body.fillStyle(0xffffff, 0.4);
    body.fillCircle(cx - r * 0.3, cy - r * 0.3, r * 0.35);

    return { body, glow: { img: glowImg, color }, color };
  },

  setSystemStarGlow(scene, glow, cx, cy, r, hovered) {
    this._setGlow(scene, glow, cx, cy, r, r * 8, r * 10, 0.2, 0.35, hovered);
  },

  drawSystemPlanet(scene, x, y, r, colorHex) {
    const color = this.hexToInt(colorHex);
    const glowImg = this.drawGlow(scene, x, y, r, r * 3, color, 0.2);

    const body = scene.add.graphics();
    body.fillStyle(color, 1);
    body.fillCircle(x, y, r);
    body.fillStyle(0xffffff, 0.2);
    body.fillCircle(x - r * 0.25, y - r * 0.25, r * 0.4);
    body.fillStyle(0x000000, 0.3);
    body.fillCircle(x + r * 0.3, y + r * 0.3, r * 0.6);

    return { body, glow: { img: glowImg, color }, color };
  },

  setPlanetGlow(scene, glow, x, y, r, hovered) {
    this._setGlow(scene, glow, x, y, r, r * 3, r * 4.5, 0.2, 0.35, hovered);
  },

  // ── Orbits ───────────────────────────────────────────────

  /** Draw an elliptical orbit ring. Star sits at one focus. */
  drawOrbit(scene, cx, cy, semiMajor, eccentricity) {
    const semiMinor = semiMajor * Math.sqrt(1 - eccentricity * eccentricity);
    const focusOffset = semiMajor * eccentricity;

    const ring = scene.add.graphics();
    ring.lineStyle(1, CONFIG.COLORS.orbit_ring, 0.4);
    ring.strokeEllipseShape(
      new Phaser.Geom.Ellipse(cx + focusOffset, cy, semiMajor * 2, semiMinor * 2),
      64
    );
    return ring;
  },

  /** Get world position on an elliptical orbit at a given angle. */
  orbitPosition(cx, cy, semiMajor, eccentricity, angle) {
    const semiMinor = semiMajor * Math.sqrt(1 - eccentricity * eccentricity);
    const focusOffset = semiMajor * eccentricity;
    return {
      x: cx + focusOffset + semiMajor * Math.cos(angle),
      y: cy + semiMinor * Math.sin(angle),
    };
  },

  // ── Details View ─────────────────────────────────────────

  drawDetailPlanet(scene, cx, cy, r, colorHex, seed) {
    const color = this.hexToInt(colorHex);
    const rng = this.seededRandom(seed);

    this.drawGlow(scene, cx, cy, r, r * 3, color, 0.15);

    const body = scene.add.graphics();
    body.fillStyle(color, 1);
    body.fillCircle(cx, cy, r);

    // Surface bands
    const bands = scene.add.graphics();
    for (let i = 0; i < 5; i++) {
      const bandY = cy - r + (r * 2 * (i + 1)) / 6;
      bands.fillStyle(0x000000, 0.08 + rng() * 0.12);
      bands.fillEllipse(cx, bandY, r * 1.6, 2 + rng() * 4);
    }

    // Specular + terminator
    body.fillStyle(0xffffff, 0.15);
    body.fillCircle(cx - r * 0.3, cy - r * 0.35, r * 0.45);
    body.fillStyle(0x000000, 0.25);
    body.fillCircle(cx + r * 0.35, cy + r * 0.3, r * 0.7);
  },

  drawDetailStar(scene, cx, cy, r, colorHex, seed) {
    const color = this.hexToInt(colorHex);
    const rng = this.seededRandom(seed);

    this.drawGlow(scene, cx, cy, r, r * 3.5, color, 0.2);

    const body = scene.add.graphics();
    body.fillStyle(color, 1);
    body.fillCircle(cx, cy, r);

    // Corona rays
    const rays = scene.add.graphics();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + rng() * 0.3;
      const len = r * (1.2 + rng() * 0.6);
      rays.lineStyle(1 + rng() * 2, color, 0.08 + rng() * 0.06);
      rays.lineBetween(
        cx + Math.cos(angle) * r * 0.9, cy + Math.sin(angle) * r * 0.9,
        cx + Math.cos(angle) * len,      cy + Math.sin(angle) * len
      );
    }

    body.fillStyle(0xffffff, 0.3);
    body.fillCircle(cx - r * 0.25, cy - r * 0.3, r * 0.4);
  },

  // ── Background ───────────────────────────────────────────

  /** Scatter tiny dots for a starfield backdrop. */
  drawStarfield(scene, count, w, h) {
    const g = scene.add.graphics();
    for (let i = 0; i < count; i++) {
      g.fillStyle(0xffffff, 0.08 + Math.random() * 0.25);
      g.fillCircle(Math.random() * w, Math.random() * h, 0.5 + Math.random() * 0.8);
    }
    return g;
  },
};