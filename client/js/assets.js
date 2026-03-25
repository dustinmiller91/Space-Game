/**
 * assets.js — Procedural asset generation.
 *
 * Currently uses Phaser Graphics with radial gradient glows.
 * Will be replaced with pixel-art procedural generation later.
 */
const Assets = {

  /**
   * Seeded PRNG (deterministic).
   */
  seededRandom(seed) {
    let s = seed;
    return function () {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  },

  /**
   * Parse "#RRGGBB" to 0xRRGGBB integer.
   */
  hexToInt(hex) {
    return parseInt(hex.replace('#', ''), 16);
  },

  /**
   * Draw a smooth radial glow using a canvas-based radial gradient.
   * Creates a temporary texture and renders it as an image — no banding.
   */
  drawRadialGlow(scene, x, y, innerR, outerR, colorInt, peakAlpha) {
    const size = Math.ceil(outerR * 2);
    const key = `glow_${colorInt}_${size}_${Math.round(innerR)}_${Math.round(peakAlpha * 100)}`;

    // Create the texture once and cache it
    if (!scene.textures.exists(key)) {
      const canvas = scene.textures.createCanvas(key, size, size);
      const ctx = canvas.context;
      const cx = size / 2;
      const cy = size / 2;

      const r = (colorInt >> 16) & 0xff;
      const g = (colorInt >> 8) & 0xff;
      const b = colorInt & 0xff;

      const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
      grad.addColorStop(0, `rgba(${r},${g},${b},${peakAlpha})`);
      grad.addColorStop(0.3, `rgba(${r},${g},${b},${peakAlpha * 0.4})`);
      grad.addColorStop(0.7, `rgba(${r},${g},${b},${peakAlpha * 0.08})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      canvas.refresh();
    }

    const img = scene.add.image(x, y, key);
    return img;
  },

  /**
   * Destroy an old glow image and draw a new one (for hover state changes).
   */
  replaceGlow(scene, oldImg, x, y, innerR, outerR, colorInt, peakAlpha) {
    if (oldImg) oldImg.destroy();
    return this.drawRadialGlow(scene, x, y, innerR, outerR, colorInt, peakAlpha);
  },

  // ── Galaxy View ──────────────────────────────────────────

  drawGalaxyStar(scene, x, y, displayRadius, colorHex) {
    const color = this.hexToInt(colorHex);

    const glowImg = this.drawRadialGlow(scene, x, y, displayRadius, displayRadius * 6, color, 0.25);

    const body = scene.add.graphics();
    body.fillStyle(color, 1);
    body.fillCircle(x, y, displayRadius);
    body.fillStyle(0xffffff, 0.5);
    body.fillCircle(x - displayRadius * 0.25, y - displayRadius * 0.25, displayRadius * 0.4);

    return { body, glowImg, color };
  },

  setStarGlow(scene, glowContainer, x, y, radius, colorInt, hovered) {
    const outerR = radius * (hovered ? 8 : 6);
    const peak = hovered ? 0.4 : 0.25;
    const newImg = this.replaceGlow(scene, glowContainer.img, x, y, radius, outerR, colorInt, peak);
    glowContainer.img = newImg;
  },

  // ── System View ──────────────────────────────────────────

  drawSystemStar(scene, cx, cy, colorHex, starRadius) {
    const color = this.hexToInt(colorHex);
    const r = starRadius || 24;

    const glowImg = this.drawRadialGlow(scene, cx, cy, r, r * 8, color, 0.2);

    const body = scene.add.graphics();
    body.fillStyle(color, 1);
    body.fillCircle(cx, cy, r);
    body.fillStyle(0xffffff, 0.4);
    body.fillCircle(cx - r * 0.3, cy - r * 0.3, r * 0.35);

    return { body, glowImg, color };
  },

  setSystemStarGlow(scene, glowContainer, cx, cy, r, colorInt, hovered) {
    const outerR = r * (hovered ? 10 : 8);
    const peak = hovered ? 0.35 : 0.2;
    const newImg = this.replaceGlow(scene, glowContainer.img, cx, cy, r, outerR, colorInt, peak);
    glowContainer.img = newImg;
  },

  /**
   * Draw an elliptical orbit ring.
   * semiMajor = orbit_radius, eccentricity determines the minor axis.
   */
  drawEllipticalOrbit(scene, cx, cy, semiMajor, eccentricity) {
    const semiMinor = semiMajor * Math.sqrt(1 - eccentricity * eccentricity);
    const focusOffset = semiMajor * eccentricity;

    const ring = scene.add.graphics();
    ring.lineStyle(1, CONFIG.COLORS.orbit_ring, 0.4);

    const ellipse = new Phaser.Geom.Ellipse(
      cx + focusOffset, cy,
      semiMajor * 2,
      semiMinor * 2
    );
    ring.strokeEllipseShape(ellipse, 64);

    return { ring, semiMajor, semiMinor, focusOffset };
  },

  /**
   * Get x,y position on an elliptical orbit for a given angle.
   * Star sits at one focus (cx, cy).
   */
  getEllipsePosition(cx, cy, semiMajor, eccentricity, angle) {
    const semiMinor = semiMajor * Math.sqrt(1 - eccentricity * eccentricity);
    const focusOffset = semiMajor * eccentricity;
    const ex = cx + focusOffset + semiMajor * Math.cos(angle);
    const ey = cy + semiMinor * Math.sin(angle);
    return { x: ex, y: ey };
  },

  drawSystemPlanet(scene, x, y, radius, colorHex) {
    const color = this.hexToInt(colorHex);

    const glowImg = this.drawRadialGlow(scene, x, y, radius, radius * 3, color, 0.2);

    const body = scene.add.graphics();
    body.fillStyle(color, 1);
    body.fillCircle(x, y, radius);
    body.fillStyle(0xffffff, 0.2);
    body.fillCircle(x - radius * 0.25, y - radius * 0.25, radius * 0.4);
    body.fillStyle(0x000000, 0.3);
    body.fillCircle(x + radius * 0.3, y + radius * 0.3, radius * 0.6);

    return { body, glowImg, color };
  },

  setPlanetGlow(scene, glowContainer, x, y, radius, colorInt, hovered) {
    const outerR = radius * (hovered ? 4.5 : 3);
    const peak = hovered ? 0.35 : 0.2;
    const newImg = this.replaceGlow(scene, glowContainer.img, x, y, radius, outerR, colorInt, peak);
    glowContainer.img = newImg;
  },

  // ── Details View ─────────────────────────────────────────

  drawDetailPlanet(scene, cx, cy, radius, colorHex, seed) {
    const color = this.hexToInt(colorHex);
    const rng = this.seededRandom(seed);

    const glowImg = this.drawRadialGlow(scene, cx, cy, radius, radius * 3, color, 0.15);

    const body = scene.add.graphics();
    body.fillStyle(color, 1);
    body.fillCircle(cx, cy, radius);

    const bands = scene.add.graphics();
    for (let i = 0; i < 5; i++) {
      const bandY = cy - radius + (radius * 2 * (i + 1)) / 6;
      const bandH = 2 + rng() * 4;
      bands.fillStyle(0x000000, 0.08 + rng() * 0.12);
      bands.fillEllipse(cx, bandY, radius * 1.6, bandH);
    }

    body.fillStyle(0xffffff, 0.15);
    body.fillCircle(cx - radius * 0.3, cy - radius * 0.35, radius * 0.45);
    body.fillStyle(0x000000, 0.25);
    body.fillCircle(cx + radius * 0.35, cy + radius * 0.3, radius * 0.7);

    return { body, glowImg, bands };
  },

  drawDetailStar(scene, cx, cy, radius, colorHex, seed) {
    const color = this.hexToInt(colorHex);

    const glowImg = this.drawRadialGlow(scene, cx, cy, radius, radius * 3.5, color, 0.2);

    const body = scene.add.graphics();
    body.fillStyle(color, 1);
    body.fillCircle(cx, cy, radius);

    // Corona rays
    const rays = scene.add.graphics();
    const rng = this.seededRandom(seed);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + rng() * 0.3;
      const len = radius * (1.2 + rng() * 0.6);
      rays.lineStyle(1 + rng() * 2, color, 0.08 + rng() * 0.06);
      rays.lineBetween(
        cx + Math.cos(angle) * radius * 0.9,
        cy + Math.sin(angle) * radius * 0.9,
        cx + Math.cos(angle) * len,
        cy + Math.sin(angle) * len
      );
    }

    body.fillStyle(0xffffff, 0.3);
    body.fillCircle(cx - radius * 0.25, cy - radius * 0.3, radius * 0.4);

    return { body, glowImg, rays };
  },

  // ── Background ───────────────────────────────────────────

  drawStarfield(scene, count, width, height) {
    for (let i = 0; i < count; i++) {
      const g = scene.add.graphics();
      g.fillStyle(0xffffff, 0.08 + Math.random() * 0.25);
      g.fillCircle(Math.random() * width, Math.random() * height, 0.5 + Math.random() * 0.8);
    }
  },
};