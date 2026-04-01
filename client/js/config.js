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

  // Galaxy view object scaling
  GALAXY_STAR_SCALE: 1.5,   // multiplier on star body radius in galaxy view
  GALAXY_ZONE_SCALE: 2.0,   // multiplier on interaction zone size in galaxy view
  GALAXY_GLOW: { normal: 12, hover: 16 },  // glow outer radius as multiple of star radius
 
  // System view glow
  SYSTEM_STAR_GLOW: { normal: 12, hover: 15 },  // glow outer radius as multiple of star radius

  // System view orbit display (log scale)
  //
  // Real orbital distances span orders of magnitude (moons at 0.001 AU,
  // outer planets at 30+ AU, companion stars at 50+ AU). Linear scaling
  // can't show all of these at once. Log scaling compresses the range:
  //
  //   displayDist = ORBIT_DISPLAY_BASE * ln(1 + semi_major_AU / ORBIT_LOG_REF)
  //
  // ORBIT_LOG_REF: the "knee" of the curve. Orbits much smaller than this
  //   get stretched (moons become visible); orbits much larger get compressed.
  //   Set to roughly the smallest planet orbit (~0.2 AU) so the planet zone
  //   gets good spread while moons and rings still resolve.
  //
  // ORBIT_DISPLAY_BASE: overall pixel scaling factor.
  ORBIT_DISPLAY_BASE: 800,
  // ORBIT_LOG_REF: 0.2,
  ORBIT_LOG_REF: .055,

 
  // Camera
  EDGE_ZONE: 80,          // pixels from screen edge that trigger panning
  SCROLL_SPEED: 18,       // base pan speed (scaled by 1/zoom)
  ZOOM_MIN: 0.15,         // global minimum zoom (scenes can override via _zoomMin)
  ZOOM_MAX: 2.5,
  ZOOM_STEP: 0.12,        // proportional zoom per scroll tick (0.12 = 12%)
  CAM_SPRING_OMEGA: 6.0,  // spring frequency — higher = snappier, lower = more sweeping


  // Starfield background layers (preloaded PNGs)
  //   key:          texture key (matches PNG filename without extension)
  //   scroll:       scrollFactor for parallax (1.0 = locked to world, lower = lags behind)
  //   vis_min:      zoom level below which the layer is invisible
  //   full_vis_min: zoom level where the layer becomes fully visible
  //   full_vis_max: zoom level where the layer starts to fade out
  //   vis_max:      zoom level above which the layer is invisible
  //
  // Zoom range: 0.15 (fully out) to 2.5 (fully in)
  STARFIELD_LAYERS: [
    { key: 'starfield_near', scroll: .85,   vis_min: .1, full_vis_min: .35,   full_vis_max: 999, vis_max: 999 },
    { key: 'starfield_mid',  scroll: 0.725, vis_min: .35, full_vis_min:  1,  full_vis_max: 999, vis_max: 999 },
    { key: 'starfield_far',  scroll: 0.6,   vis_min: .5, full_vis_min: 1.5, full_vis_max: 999, vis_max: 999 },
  ],

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