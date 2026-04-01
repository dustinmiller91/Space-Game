#!/usr/bin/env python3
"""
generate_starfield.py — Generate tiled starfield background PNGs.

Produces layered starfield tiles for the Ships In The Night client.
Each layer has different dot sizes/densities for parallax depth.
Run once (or whenever you want to tweak the look), outputs to client/assets/.

All parameters are in LAYER_CONFIGS — adjust freely and re-run.
"""

import os
import random
from PIL import Image, ImageDraw

# ── Output ──────────────────────────────────────────────────

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "client", "assets")

# ── Global Settings ─────────────────────────────────────────

SEED = 42                # master seed for reproducibility
BACKGROUND = (0, 0, 0)   # tile background color (RGB)

# ── Star Color Palette ──────────────────────────────────────
# (R, G, B, weight) — weight controls how often this color appears.

STAR_COLORS = [
    ((255, 255, 255), 50),   # white (dominant)
    ((204, 216, 255), 15),   # blue-white (B/A type)
    ((155, 176, 255), 5),    # blue (O/B type)
    ((255, 244, 224), 12),   # warm white (G type)
    ((255, 210, 161), 10),   # gold (K type)
    ((255, 176, 112), 5),    # orange-gold
    ((255, 136, 102), 3),    # red-orange (M type)
]

# ── Layer Configurations ────────────────────────────────────

LAYER_CONFIGS = [
    {
        "name": "starfield_near",
        "size": 2048,
        "count": 300,
        "radius_min": .5,
        "radius_max": 1,
        "alpha_min": 100,
        "alpha_max": 200,
        "seed_offset": 0,
        "glow": True,
        "glow_scale": 4.0,
        "glow_alpha": 0.3,
    },
    {
        "name": "starfield_mid",
        "size": 2048,
        "count": 600,
        "radius_min": 0.25,
        "radius_max": 0.75,
        "alpha_min": 75,
        "alpha_max": 150,
        "seed_offset": 1000,
        "glow": False,
        "glow_scale": 3.0,
        "glow_alpha": 0.2,
    },
    {
        "name": "starfield_far",
        "size": 4096,
        "count": 4800,
        "radius_min": 0,
        "radius_max": .5,
        "alpha_min": 50,
        "alpha_max": 100,
        "seed_offset": 2000,
        "glow": False,
        "glow_scale": 2.0,
        "glow_alpha": 0.15,
    },
]

# ── Generation ──────────────────────────────────────────────

def pick_color(rng):
    """Weighted random color selection."""
    total = sum(w for _, w in STAR_COLORS)
    r = rng.random() * total
    acc = 0
    for color, weight in STAR_COLORS:
        acc += weight
        if r <= acc:
            return color
    return STAR_COLORS[0][0]


def draw_glow(draw, x, y, radius, color, alpha, glow_scale, glow_alpha):
    """Draw a radial glow halo using concentric circles with decreasing alpha."""
    glow_r = radius * glow_scale
    steps = max(8, int(glow_r * 2))
    for i in range(steps, 0, -1):
        t = i / steps  # 1.0 at edge, 0.0 at center
        r = glow_r * t
        # Quadratic falloff for smooth glow
        a = int(alpha * glow_alpha * (1 - t) * (1 - t))
        if a < 1:
            continue
        bbox = (x - r, y - r, x + r, y + r)
        draw.ellipse(bbox, fill=(*color, a))


def generate_layer(config):
    """Generate a single starfield tile PNG."""
    size = config["size"]
    rng = random.Random(SEED + config["seed_offset"])
    use_glow = config.get("glow", False)
    glow_scale = config.get("glow_scale", 4.0)
    glow_alpha = config.get("glow_alpha", 0.3)

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_ctx = ImageDraw.Draw(img)

    r_min = config["radius_min"]
    r_max = config["radius_max"]
    a_min = config["alpha_min"]
    a_max = config["alpha_max"]
    r_range = r_max - r_min

    for _ in range(config["count"]):
        x = rng.random() * size
        y = rng.random() * size

        # Random radius
        r = r_min + rng.random() * r_range

        # Alpha proportional to radius: bigger dots are brighter
        t = (r - r_min) / r_range if r_range > 0 else 0.5
        alpha = int(a_min + t * (a_max - a_min))

        color = pick_color(rng)

        # Optional glow (drawn first, behind the dot)
        if use_glow:
            draw_glow(draw_ctx, x, y, r, color, alpha, glow_scale, glow_alpha)

        # Core dot
        bbox = (x - r, y - r, x + r, y + r)
        draw_ctx.ellipse(bbox, fill=(*color, alpha))

    return img


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("Generating starfield tiles...")
    print(f"  Output: {os.path.abspath(OUTPUT_DIR)}")
    print(f"  Seed:   {SEED}")
    print()

    for config in LAYER_CONFIGS:
        img = generate_layer(config)
        path = os.path.join(OUTPUT_DIR, f"{config['name']}.png")
        img.save(path, "PNG")
        fsize = os.path.getsize(path) / 1024
        print(f"  [{config['name']}] {config['size']}x{config['size']}, "
              f"{config['count']} dots, r={config['radius_min']}-{config['radius_max']}px "
              f"→ {fsize:.0f} KB")

    print()
    print("[✓] Starfield tiles generated!")


if __name__ == "__main__":
    main()