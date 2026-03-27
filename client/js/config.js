/**
 * config.js — Shared constants.
 *
 * Single source of truth for world dimensions, camera behavior,
 * and the color palette. All magic numbers live here.
 */
const CONFIG = {
  // World (default — scenes can override with scene._worldW/_worldH)
  WORLD_W: 8000,
  WORLD_H: 8000,

  // Galaxy view world (larger to spread systems apart)
  GALAXY_W: 12000,
  GALAXY_H: 12000,

  // System view world (scales to fit the largest systems)
  SYSTEM_W: 10000,
  SYSTEM_H: 10000,

  // Camera
  EDGE_ZONE: 80,       // pixels from screen edge that trigger panning
  SCROLL_SPEED: 18,    // base pan speed (scaled by 1/zoom)
  ZOOM_MIN: 0.15,
  ZOOM_MAX: 2.5,
  ZOOM_STEP: 0.08,     // zoom delta per scroll tick
  PAN_LERP: 0.15,      // pan acceleration smoothing (0 = instant, 1 = frozen)
  ZOOM_LERP: 0.12,     // zoom animation smoothing

  // Typography
  FONT: '"Share Tech Mono", monospace',

  // Color palette
  COLORS: {
    hud_title:    '#5a7a9a',
    hud_hint:     '#3a5060',
    tooltip_text: '#c8e6ff',
    tooltip_bg:   'rgba(10,18,36,0.92)',
    btn_normal:   '#4a90c2',
    btn_hover:    '#8ac4ff',
    panel_bg:     0x0a1220,
    panel_border: 0x1a3050,
    orbit_ring:   0x1a2a3a,
    text_primary: '#7a9ab8',
    text_label:   '#4a6a8a',
    text_heading: '#c8e6ff',
    text_section: '#5a8aaa',
    res_minerals: '#c89b6a',
    res_biomass:  '#6abf5e',
    res_gas:      '#8a7ec8',
    res_energy:   '#d4c44a',
  },
};