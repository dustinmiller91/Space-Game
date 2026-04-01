"""
universe_generation.py — Ships In The Night galaxy initialization.

Builds a tree of orbital bodies (mobile diagram) for each star system.

PHYSICS MODEL (plausible approximation):
  - All masses in solar masses (M☉). Earth ≈ 3.003e-6 M☉.
  - Orbital spacing enforced via mutual Hill radii: adjacent bodies
    must be separated by at least HILL_SPACING_FACTOR mutual Hill radii.
  - Orbital period via Kepler's third law: P = √(a³/M_parent) years.
  - Orbital velocity: v = 2πa / P  (AU/year)

ORBIT CONSTRAINTS (applied uniformly at every level of the tree):
  A child's maximum orbital distance is the minimum of:
    1. A fraction of the parent's Hill sphere relative to the grandparent
    2. Half the gap to the nearest sibling of the parent
    3. An absolute physical cap based on the parent's body type
  This prevents moons crossing planet orbits, planets crossing star
  orbits, etc. — and works for any depth of hierarchy.

TREE STRUCTURE:
    Primary Star (root, no orbit)
      ├─ Secondary Star (wide orbit around primary)
      │    └─ Planet (capped to companion Hill sphere)
      ├─ Planet
      │    ├─ Ring
      │    ├─ Moon
      │    └─ Moon
      └─ Planet
"""

import math
import os
import random
import psycopg2
from psycopg2.extras import execute_values

# ── Configuration ───────────────────────────────────────────

GALAXY_SEED = 42
NUM_SYSTEMS = 120
GALAXY_EXTENT = 10000.0
GALAXY_OFFSET = 1000.0

DB_CONFIG = {
    "dbname": "spacegame",
    "user": "postgres",
    "password": "postgres",
    "host": "localhost",
    "port": 5432,
}

# ── Physics Constants ───────────────────────────────────────

M_EARTH = 3.003e-6    # Earth mass in solar masses
M_JUPITER = 9.545e-4  # Jupiter mass in solar masses

# Minimum separation between adjacent orbits, in mutual Hill radii.
HILL_SPACING_FACTOR = 8.0

# Fraction of parent's Hill sphere usable by children.
# ~1/3 is the long-term stability limit for prograde orbits.
HILL_STABILITY_FRAC = 0.33

# ── Absolute Orbit Caps ────────────────────────────────────
#
# Maximum orbital distance (AU) for children of each parent type.
# These are sanity bounds based on real physics — the Hill sphere
# and sibling gap constraints will usually be tighter, but these
# prevent absurd values when the Hill math produces large numbers.

MAX_CHILD_ORBIT_AU = {
    # Stars: no absolute cap (Hill sphere + sibling gap sufficient)
    "star":    None,
    # Gas giants: ~3x Callisto orbit (0.013 AU)
    "Gas Giant":   0.05,
    # Ice giants: ~2x Oberon orbit (0.004 AU)
    "Ice Giant":   0.03,
    # Small bodies: ~3x Luna orbit (0.0026 AU)
    "Terrestrial": 0.005,
    "Rocky":       0.005,
    "Ocean World": 0.005,
    "Volcanic":    0.005,
}

# Maximum Roche zone outer edge (AU) for rings.
# Saturn's rings extend to ~0.0008 AU. We allow 2x that.
MAX_ROCHE_ZONE_AU = 0.002

# ── Ring Configuration ──────────────────────────────────────

ROCHE_RING_CHANCE = {
    "Gas Giant":   0.50,
    "Ice Giant":   0.40,
    "Rocky":       0.02,
    "Terrestrial": 0.01,
    "Ocean World": 0.02,
    "Volcanic":    0.03,
}

ROCHE_RING_COUNT = {
    "Gas Giant":   (2, 5),
    "Ice Giant":   (1, 4),
    "Rocky":       (1, 2),
    "Terrestrial": (1, 1),
    "Ocean World": (1, 2),
    "Volcanic":    (1, 2),
}

MOON_TO_RING_CHANCE = 0.05

RING_TYPES = [
    {"type": "Ice Ring",      "color": "#C8D8E8", "weight": 35},
    {"type": "Rocky Ring",    "color": "#8A7A6A", "weight": 30},
    {"type": "Dust Ring",     "color": "#6A5A4A", "weight": 20},
    {"type": "Metallic Ring", "color": "#A0A8B0", "weight": 10},
    {"type": "Debris Ring",   "color": "#7A6A5A", "weight": 5},
]

# ── Stellar Data ────────────────────────────────────────────

MAIN_SEQUENCE = [
    {"class": "O", "color": "#9BB0FF", "temp": (30000, 50000), "mass": (16, 60),     "lum": (30000, 500000), "radius": (6.6, 15),   "weight": 1},
    {"class": "B", "color": "#AABFFF", "temp": (10000, 30000), "mass": (2.1, 16),    "lum": (25, 30000),     "radius": (1.8, 6.6),  "weight": 3},
    {"class": "A", "color": "#CAD7FF", "temp": (7500, 10000),  "mass": (1.4, 2.1),   "lum": (5, 25),         "radius": (1.4, 1.8),  "weight": 6},
    {"class": "F", "color": "#F8F7FF", "temp": (6000, 7500),   "mass": (1.04, 1.4),  "lum": (1.5, 5),        "radius": (1.15, 1.4), "weight": 10},
    {"class": "G", "color": "#FFF4E0", "temp": (5200, 6000),   "mass": (0.8, 1.04),  "lum": (0.6, 1.5),      "radius": (0.96, 1.15),"weight": 15},
    {"class": "K", "color": "#FFD2A1", "temp": (3700, 5200),   "mass": (0.45, 0.8),  "lum": (0.08, 0.6),     "radius": (0.7, 0.96), "weight": 25},
    {"class": "M", "color": "#FF6347", "temp": (2400, 3700),   "mass": (0.08, 0.45), "lum": (0.001, 0.08),    "radius": (0.1, 0.7), "weight": 40},
]

EXOTIC_TYPES = {
    "brown_dwarf":  {"class": "L/T", "color": "#8B4513", "temp": (500, 2400),  "mass": (0.013, 0.08), "lum": (0.00001, 0.001), "radius": (0.08, 0.12)},
    "white_dwarf":  {"class": "WD",  "color": "#E8E8FF", "temp": (4000, 40000),"mass": (0.5, 1.4),    "lum": (0.0001, 0.01),   "radius": (0.008, 0.02)},
    "neutron_star": {"class": "NS",  "color": "#C0C0FF", "temp": (500000, 1000000), "mass": (1.1, 2.3),"lum": (0.00001, 0.1),   "radius": (0.00001, 0.00002)},
    "black_hole":   {"class": "BH",  "color": "#1A0A2E", "temp": (0, 0),       "mass": (3, 50),       "lum": (0, 0),            "radius": (0.00001, 0.00005)},
}

MULTIPLICITY = [
    (0, 0.55),
    (1, 0.88),
    (2, 0.96),
    (3, 0.99),
    (4, 0.998),
    (5, 1.0),
]

PLANET_TYPES = [
    {"type": "Gas Giant",   "color": "#D4A574", "r": (18, 32), "mass_earth": (50, 4000)},
    {"type": "Ice Giant",   "color": "#7EC8E3", "r": (14, 22), "mass_earth": (10, 80)},
    {"type": "Terrestrial", "color": "#6B8E23", "r": (6, 12),  "mass_earth": (0.5, 5)},
    {"type": "Rocky",       "color": "#A0522D", "r": (5, 10),  "mass_earth": (0.01, 2)},
    {"type": "Ocean World", "color": "#4682B4", "r": (8, 14),  "mass_earth": (0.5, 8)},
    {"type": "Volcanic",    "color": "#CC4400", "r": (5, 9),   "mass_earth": (0.1, 3)},
]

MOON_TYPES = [
    {"type": "Rocky Moon",  "color": "#888888", "r": (2, 5),  "mass_earth": (0.0001, 0.02)},
    {"type": "Ice Moon",    "color": "#B0D0E8", "r": (2, 6),  "mass_earth": (0.0001, 0.025)},
    {"type": "Barren Moon", "color": "#666050", "r": (1, 4),  "mass_earth": (0.00005, 0.01)},
    {"type": "Volcanic Moon","color": "#AA5522", "r": (2, 4), "mass_earth": (0.0001, 0.015)},
]

# ── Helpers ─────────────────────────────────────────────────

def rand(rng, lo, hi):
    return lo + rng.random() * (hi - lo)

def weighted_choice(rng, items):
    total = sum(it["weight"] for it in items)
    r = rng.random() * total
    acc = 0
    for it in items:
        acc += it["weight"]
        if r <= acc:
            return it
    return items[-1]

def hill_radius(a, m_body, m_parent):
    """Hill sphere radius: a * (m_body / (3 * m_parent))^(1/3)."""
    if m_body <= 0 or m_parent <= 0 or a <= 0:
        return 0
    return a * (m_body / (3.0 * m_parent)) ** (1.0 / 3.0)

def kepler_period(a, m_parent):
    """Orbital period in years. P = sqrt(a³ / M_parent)."""
    if a <= 0 or m_parent <= 0:
        return 0
    return math.sqrt(a ** 3 / m_parent)

def kepler_velocity(a, period):
    """Orbital velocity in AU/year. v = 2πa / P."""
    if period <= 0 or a <= 0:
        return 0
    return 2 * math.pi * a / period

def compute_orbit(body, m_parent):
    """Compute and store orbital_period and orbital_velocity on a body dict."""
    a = body.get("semi_major")
    if a and a > 0 and m_parent > 0:
        p = kepler_period(a, m_parent)
        body["orbital_period"] = round(p, 6)
        body["orbital_velocity"] = round(kepler_velocity(a, p), 6)
    else:
        body["orbital_period"] = None
        body["orbital_velocity"] = None

def assign_eccentricities(rng, bodies, max_ecc=0.35):
    """Assign eccentricities so no adjacent orbits cross."""
    n = len(bodies)
    radii = [b["semi_major"] for b in bodies]

    for i in range(n):
        desired = rng.random() * max_ecc
        a = radii[i]

        if i < n - 1:
            max_out = (radii[i + 1] * 0.9 / a) - 1
        else:
            max_out = max_ecc

        if i > 0:
            prev_apo = radii[i - 1] * (1 + bodies[i - 1]["eccentricity"])
            max_in = 1 - (prev_apo * 1.1 / a)
        else:
            max_in = max_ecc

        bodies[i]["eccentricity"] = round(max(0, min(desired, max_out, max_in)), 4)


# ── Universal Orbit Constraint ──────────────────────────────

def max_child_orbit(parent_body, parent_siblings, parent_sib_index,
                    m_grandparent):
    """Compute the maximum orbital distance for any child of parent_body.

    This is the universal constraint applied at every level of the tree.
    Returns the maximum semi_major (AU) that a child may have.

    The limit is the minimum of three constraints:
      1. HILL_STABILITY_FRAC of the parent's Hill sphere relative to
         the grandparent (gravitational stability). Skipped for root
         bodies that have no grandparent.
      2. Half the gap to the nearest sibling orbit (prevents children
         from crossing sibling orbits). Skipped if no siblings.
      3. An absolute physical cap based on the parent's type.
    """
    candidates = []

    # ── Constraint 1: Hill sphere fraction ──────────────────
    a_parent = parent_body.get("semi_major")
    m_parent = parent_body["mass"]
    if a_parent and a_parent > 0 and m_grandparent and m_grandparent > 0:
        rh = hill_radius(a_parent, m_parent, m_grandparent)
        candidates.append(rh * HILL_STABILITY_FRAC)

    # ── Constraint 2: half gap to nearest sibling ───────────
    if parent_siblings and parent_sib_index is not None:
        ecc = parent_body.get("eccentricity", 0)
        a = parent_body.get("semi_major", 0)
        periapsis = a * (1 - ecc) if a else 0
        apoapsis = a * (1 + ecc) if a else 0

        # Gap inward (to previous sibling's apoapsis)
        if parent_sib_index > 0:
            prev = parent_siblings[parent_sib_index - 1]
            prev_apo = prev["semi_major"] * (1 + prev.get("eccentricity", 0))
            gap_in = periapsis - prev_apo
            if gap_in > 0:
                candidates.append(gap_in * 0.45)

        # Gap outward (to next sibling's periapsis)
        if parent_sib_index < len(parent_siblings) - 1:
            nxt = parent_siblings[parent_sib_index + 1]
            nxt_peri = nxt["semi_major"] * (1 - nxt.get("eccentricity", 0))
            gap_out = nxt_peri - apoapsis
            if gap_out > 0:
                candidates.append(gap_out * 0.45)

    # ── Constraint 3: absolute physical cap ─────────────────
    # Look up by planet_type first (more specific), fall back to body_type
    ptype = parent_body.get("planet_type")
    btype = parent_body.get("body_type")
    cap = MAX_CHILD_ORBIT_AU.get(ptype) or MAX_CHILD_ORBIT_AU.get(btype)
    if cap is not None:
        candidates.append(cap)

    if not candidates:
        return None  # no constraint (root star with no siblings)

    return max(min(candidates), 1e-8)  # floor to avoid zero


# ── Body Generators ─────────────────────────────────────────

def _star_body(rng, system_id, spec):
    return {
        "system_id": system_id,
        "body_type": "star",
        "spectral_class": spec["class"],
        "mass": round(rand(rng, *spec["mass"]), 4),
        "luminosity": round(rand(rng, *spec["lum"]), 4),
        "temperature": int(rand(rng, *spec["temp"])) if spec["temp"][1] > 0 else 0,
        "radius": round(rand(rng, *spec["radius"]), 6),
        "color_hex": spec["color"],
        "seed": rng.randint(0, 2**31 - 1),
        "planet_type": None,
        "population": 0,
        "minerals_rate": 0, "biomass_rate": 0, "gas_rate": 0, "energy_rate": 0,
    }

def make_star(rng, system_id):
    return _star_body(rng, system_id, weighted_choice(rng, MAIN_SEQUENCE))

def make_exotic_star(rng, system_id, kind):
    return _star_body(rng, system_id, EXOTIC_TYPES[kind])

def make_companion(rng, system_id):
    roll = rng.random()
    if roll < 0.70:
        return make_star(rng, system_id)
    elif roll < 0.85:
        return make_exotic_star(rng, system_id, "white_dwarf")
    elif roll < 0.95:
        return make_exotic_star(rng, system_id, "brown_dwarf")
    elif roll < 0.99:
        return make_exotic_star(rng, system_id, "neutron_star")
    else:
        return make_exotic_star(rng, system_id, "black_hole")

def make_planet(rng, system_id, star_luminosity, orbit_radius):
    hz_in = math.sqrt(max(star_luminosity, 0.001)) * 0.85
    hz_out = math.sqrt(max(star_luminosity, 0.001)) * 1.5

    if orbit_radius < hz_in:
        weights = [2, 1, 3, 8, 1, 10]
    elif orbit_radius <= hz_out:
        weights = [2, 2, 10, 3, 8, 1]
    else:
        weights = [10, 8, 2, 3, 2, 1]

    pt = PLANET_TYPES[rng.choices(range(len(PLANET_TYPES)), weights=weights, k=1)[0]]

    mass_earth = rand(rng, *pt["mass_earth"])
    mass_solar = mass_earth * M_EARTH

    if pt["type"] in ("Terrestrial", "Ocean World"):
        pop = rng.randint(500, 15000)
    elif pt["type"] == "Rocky":
        pop = rng.randint(0, 2000)
    else:
        pop = rng.randint(0, 500)

    ring_prob = ROCHE_RING_CHANCE.get(pt["type"], 0)
    has_roche_rings = rng.random() < ring_prob

    return {
        "system_id": system_id,
        "body_type": "planet",
        "planet_type": pt["type"],
        "radius": round(rand(rng, *pt["r"]), 2),
        "color_hex": pt["color"],
        "mass": round(mass_solar, 10),
        "seed": rng.randint(0, 2**31 - 1),
        "spectral_class": None, "luminosity": None, "temperature": None,
        "_has_roche_rings": has_roche_rings,
        "population": pop,
        "minerals_rate": round(rng.random() * 5, 2),
        "biomass_rate": round(rng.random() * 3, 2),
        "gas_rate": round(rng.random() * 4, 2),
        "energy_rate": round(rng.random() * 6, 2),
    }

def make_moon(rng, system_id):
    mt = rng.choice(MOON_TYPES)
    mass_earth = rand(rng, *mt["mass_earth"])
    return {
        "system_id": system_id,
        "body_type": "moon",
        "planet_type": mt["type"],
        "radius": round(rand(rng, *mt["r"]), 2),
        "color_hex": mt["color"],
        "mass": round(mass_earth * M_EARTH, 12),
        "seed": rng.randint(0, 2**31 - 1),
        "spectral_class": None, "luminosity": None, "temperature": None,
        "population": rng.randint(0, 500) if rng.random() < 0.3 else 0,
        "minerals_rate": round(rng.random() * 2, 2),
        "biomass_rate": round(rng.random() * 1, 2),
        "gas_rate": round(rng.random() * 0.5, 2),
        "energy_rate": round(rng.random() * 1.5, 2),
    }

def make_ring(rng, system_id):
    rt = weighted_choice(rng, RING_TYPES)
    return {
        "system_id": system_id,
        "body_type": "ring",
        "planet_type": rt["type"],
        "radius": round(rand(rng, 1.0, 4.0), 2),
        "color_hex": rt["color"],
        "mass": round(rng.random() * 1e-10, 12),
        "seed": rng.randint(0, 2**31 - 1),
        "spectral_class": None, "luminosity": None, "temperature": None,
        "population": 0,
        "minerals_rate": round(rng.random() * 3, 2),
        "biomass_rate": round(rng.random() * 0.5, 2),
        "gas_rate": round(rng.random() * 2, 2),
        "energy_rate": round(rng.random() * 0.5, 2),
    }


# ── Planet Placement (Hill-sphere aware) ────────────────────

def place_planets(rng, system_id, star, num_planets, m_parent, max_orbit=None):
    """Place planets with Hill-sphere-aware spacing."""
    if num_planets == 0:
        return []

    lum = star.get("luminosity") or 0.001
    inner_edge = max(0.1, 0.1 * math.sqrt(max(lum, 0.001)))
    orbit = inner_edge + rand(rng, 0.1, 0.5)

    planets = []
    for pi in range(num_planets):
        if max_orbit and orbit > max_orbit:
            break

        planet = make_planet(rng, system_id, lum, orbit)
        r_hill = hill_radius(orbit, planet["mass"], m_parent)
        min_gap = max(r_hill * HILL_SPACING_FACTOR, 0.05)
        padding = min_gap * rand(rng, 0.5, 2.0)

        planet["semi_major"] = round(orbit, 6)
        planet["eccentricity"] = 0
        planet["orbit_angle"] = round(rng.random() * math.pi * 2, 4)
        planets.append(planet)

        orbit = orbit + min_gap + padding

    return planets


# ── Rings & Moons (uses universal orbit constraint) ─────────

def _generate_rings_and_moons(rng, system_id, planet, planet_idx,
                               planet_siblings, sib_index, bodies,
                               m_grandparent):
    """Generate rings and moons for a planet, using the universal
    max_child_orbit constraint to cap all child distances."""
    ptype = planet.get("planet_type", "")
    m_planet = planet["mass"]

    # ── Compute max child orbit using universal constraint ──
    max_orbit = max_child_orbit(planet, planet_siblings, sib_index,
                                m_grandparent)
    if max_orbit is None or max_orbit < 1e-8:
        return

    # Roche zone: inner portion of the available space, capped absolutely
    roche_outer = min(max_orbit * 0.10, MAX_ROCHE_ZONE_AU)
    roche_inner = roche_outer * 0.4
    moon_inner = roche_outer

    # ── Roche zone rings ────────────────────────────────────
    ring_entries = []
    if planet.get("_has_roche_rings") and roche_outer > roche_inner + 1e-8:
        ring_count_range = ROCHE_RING_COUNT.get(ptype, (1, 2))
        num_rings = rng.randint(*ring_count_range)
        roche_zone = roche_outer - roche_inner

        for ri in range(num_rings):
            t = (ri + 0.2 + rng.random() * 0.6) / num_rings
            slot = roche_inner + roche_zone * t

            ring = make_ring(rng, system_id)
            ring["name"] = f"R{system_id}-{planet_idx}.{ri}"
            ring["parent_index"] = planet_idx
            ring["semi_major"] = round(slot, 10)
            ring["eccentricity"] = 0
            ring["orbit_angle"] = 0
            compute_orbit(ring, m_planet)
            ring_entries.append(ring)

    # ── Moon generation ─────────────────────────────────────
    if "Gas Giant" in ptype:
        num_moons = rng.choices([1, 2, 3, 4, 5, 6, 7, 8],
                                weights=[5, 10, 15, 20, 20, 15, 10, 5], k=1)[0]
    elif "Ice Giant" in ptype:
        num_moons = rng.choices([0, 1, 2, 3, 4, 5],
                                weights=[5, 10, 20, 25, 25, 15], k=1)[0]
    elif ptype in ("Terrestrial", "Ocean World"):
        num_moons = rng.choices([0, 1, 2, 3], weights=[30, 40, 20, 10], k=1)[0]
    elif ptype == "Rocky":
        num_moons = rng.choices([0, 1, 2], weights=[50, 35, 15], k=1)[0]
    else:
        num_moons = rng.choices([0, 1], weights=[70, 30], k=1)[0]

    moon_zone_size = max_orbit - moon_inner
    moon_entries = []
    if num_moons > 0 and moon_zone_size > 1e-8:
        for mi in range(num_moons):
            t = (mi + 0.3 + rng.random() * 0.4) / num_moons
            slot = moon_inner + moon_zone_size * t
            if slot > max_orbit:
                break

            if rng.random() < MOON_TO_RING_CHANCE:
                ring = make_ring(rng, system_id)
                ring["name"] = f"R{system_id}-{planet_idx}.{len(ring_entries)}"
                ring["parent_index"] = planet_idx
                ring["semi_major"] = round(slot, 10)
                ring["eccentricity"] = 0
                ring["orbit_angle"] = 0
                compute_orbit(ring, m_planet)
                ring_entries.append(ring)
            else:
                moon = make_moon(rng, system_id)
                moon["name"] = f"M{system_id}-{planet_idx}.{mi}"
                moon["parent_index"] = planet_idx
                moon["semi_major"] = round(slot, 10)
                moon["eccentricity"] = 0
                moon["orbit_angle"] = round(rng.random() * math.pi * 2, 4)
                moon_entries.append(moon)

    if moon_entries:
        assign_eccentricities(rng, moon_entries, max_ecc=0.1)
        for moon in moon_entries:
            compute_orbit(moon, m_planet)

    bodies.extend(ring_entries)
    bodies.extend(moon_entries)


# ── System Builder ──────────────────────────────────────────

def generate_system_bodies(rng, system_id):
    """Build the full mobile tree for one star system."""
    bodies = []

    # ── Primary star ────────────────────────────────────────
    roll = rng.random()
    if roll < 0.03:
        primary = make_exotic_star(rng, system_id, "white_dwarf")
    elif roll < 0.045:
        primary = make_exotic_star(rng, system_id, "neutron_star")
    elif roll < 0.05:
        primary = make_exotic_star(rng, system_id, "black_hole")
    else:
        primary = make_star(rng, system_id)

    primary["name"] = f"S{system_id}-0"
    primary["parent_index"] = None
    primary["semi_major"] = None
    primary["eccentricity"] = 0
    primary["orbit_angle"] = 0
    compute_orbit(primary, 0)
    bodies.append(primary)
    primary_idx = 0
    m_primary = primary["mass"]

    # ── Companion stars ─────────────────────────────────────
    mult_roll = rng.random()
    num_companions = 0
    for n, threshold in MULTIPLICITY:
        if mult_roll < threshold:
            num_companions = n
            break

    companion_orbit_base = rand(rng, 20, 80)
    companion_stars = []
    for ci in range(num_companions):
        comp = make_companion(rng, system_id)
        comp["name"] = f"S{system_id}-{ci + 1}"
        comp["parent_index"] = primary_idx
        orbit = companion_orbit_base + rand(rng, 5, 40)
        comp["semi_major"] = round(orbit, 4)
        comp["eccentricity"] = 0
        comp["orbit_angle"] = round(rng.random() * math.pi * 2, 4)
        companion_stars.append(comp)
        comp_hill = hill_radius(orbit, comp["mass"], m_primary)
        companion_orbit_base = orbit + max(comp_hill * 4, 10)

    if companion_stars:
        assign_eccentricities(rng, companion_stars, max_ecc=0.25)

    # ── No brown-dwarf-only systems ─────────────────────────
    all_stars = [primary] + companion_stars
    if all(s["spectral_class"] == "L/T" for s in all_stars):
        spec = weighted_choice(rng, MAIN_SEQUENCE)
        primary["spectral_class"] = spec["class"]
        primary["mass"] = round(rand(rng, *spec["mass"]), 4)
        primary["luminosity"] = round(rand(rng, *spec["lum"]), 4)
        primary["temperature"] = int(rand(rng, *spec["temp"]))
        primary["radius"] = round(rand(rng, *spec["radius"]), 4)
        primary["color_hex"] = spec["color"]
        m_primary = primary["mass"]

    # ── Planets per star ────────────────────────────────────
    # Build the list of all direct children of the primary (companions + planets)
    # so we can compute sibling gaps for the universal constraint.

    stars_with_indices = [(primary, primary_idx)]
    for comp in companion_stars:
        compute_orbit(comp, m_primary)
        bodies.append(comp)
        stars_with_indices.append((comp, len(bodies) - 1))

    for star, star_idx in stars_with_indices:
        lum = star.get("luminosity") or 0
        sc = star.get("spectral_class", "")
        m_star = star["mass"]

        if sc in ("BH", "NS"):
            num_planets = rng.choices([0, 1, 2], weights=[70, 20, 10], k=1)[0]
        elif sc == "WD":
            num_planets = rng.choices([0, 1, 2, 3], weights=[40, 30, 20, 10], k=1)[0]
        elif sc == "L/T":
            num_planets = rng.choices([0, 1, 2], weights=[50, 35, 15], k=1)[0]
        elif star_idx == primary_idx:
            num_planets = rng.randint(3, 8)
        else:
            num_planets = rng.randint(0, 3)

        # For companion stars, cap planet orbits using the universal constraint.
        # The companion's "grandparent" is the primary star's mass.
        # The companion's "siblings" are the other companions.
        max_orbit = None
        if star_idx != primary_idx:
            max_orbit = max_child_orbit(
                star, companion_stars,
                companion_stars.index(star) if star in companion_stars else None,
                m_primary
            )

        planet_entries = place_planets(rng, system_id, star,
                                       num_planets, m_star, max_orbit)

        for pi, planet in enumerate(planet_entries):
            planet["name"] = f"P{system_id}-{star_idx}.{pi}"
            planet["parent_index"] = star_idx

        if planet_entries:
            assign_eccentricities(rng, planet_entries)

        for pi, planet in enumerate(planet_entries):
            compute_orbit(planet, m_star)
            bodies.append(planet)
            planet_idx = len(bodies) - 1

            # m_grandparent for moons = mass of the star the planet orbits
            _generate_rings_and_moons(rng, system_id, planet, planet_idx,
                                      planet_entries, pi, bodies,
                                      m_grandparent=m_star)

    return bodies


# ── Galaxy Generator ────────────────────────────────────────

def generate_universe(galaxy_seed=GALAXY_SEED):
    master = random.Random(galaxy_seed)
    systems = []
    all_bodies = []

    for i in range(NUM_SYSTEMS):
        sys_seed = master.randint(0, 2**31 - 1)
        sys_rng = random.Random(sys_seed)

        system = {
            "id": i + 1,
            "name": f"System-{i + 1}",
            "galaxy_x": round(GALAXY_OFFSET + master.random() * GALAXY_EXTENT, 2),
            "galaxy_y": round(GALAXY_OFFSET + master.random() * GALAXY_EXTENT, 2),
            "seed": sys_seed,
        }
        systems.append(system)

        body_list = generate_system_bodies(sys_rng, system["id"])
        base_offset = len(all_bodies)
        for b in body_list:
            b["_offset"] = base_offset
        all_bodies.extend(body_list)

    return systems, all_bodies


# ── Database ────────────────────────────────────────────────

def init_database(conn):
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    with open(schema_path) as f:
        sql = f.read()
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    print("[✓] Schema created")


def populate_database(conn, systems, all_bodies):
    with conn.cursor() as cur:
        cur.execute("INSERT INTO players (username) VALUES (%s) RETURNING id", ("TestPlayer",))
        player_id = cur.fetchone()[0]

        execute_values(cur,
            "INSERT INTO systems (id, name, galaxy_x, galaxy_y, seed) VALUES %s",
            [(s["id"], s["name"], s["galaxy_x"], s["galaxy_y"], s["seed"]) for s in systems])
        cur.execute(f"SELECT setval('systems_id_seq', {len(systems)})")

        db_ids = {}
        for i, b in enumerate(all_bodies):
            parent_db_id = None
            if b["parent_index"] is not None:
                parent_list_idx = b["_offset"] + b["parent_index"]
                parent_db_id = db_ids.get(parent_list_idx)

            cur.execute("""
                INSERT INTO bodies (
                    system_id, parent_id, body_type, name,
                    semi_major, eccentricity, orbit_angle,
                    orbital_period, orbital_velocity,
                    mass, radius, color_hex, seed,
                    spectral_class, luminosity, temperature,
                    planet_type,
                    population, minerals_rate, biomass_rate, gas_rate, energy_rate
                ) VALUES (%s,%s,%s,%s, %s,%s,%s, %s,%s, %s,%s,%s,%s, %s,%s,%s, %s, %s,%s,%s,%s,%s)
                RETURNING id
            """, (
                b["system_id"], parent_db_id, b["body_type"], b["name"],
                b["semi_major"], b["eccentricity"], b["orbit_angle"],
                b.get("orbital_period"), b.get("orbital_velocity"),
                b["mass"], b["radius"], b["color_hex"], b["seed"],
                b.get("spectral_class"), b.get("luminosity"), b.get("temperature"),
                b.get("planet_type"),
                b["population"], b["minerals_rate"], b["biomass_rate"],
                b["gas_rate"], b["energy_rate"],
            ))
            db_ids[i] = cur.fetchone()[0]

        execute_values(cur,
            "INSERT INTO system_resources (system_id, controlled_by_player_id, minerals, biomass, gas, energy) VALUES %s",
            [(s["id"], player_id, 0, 0, 0, 0) for s in systems])

    conn.commit()

    stars = sum(1 for b in all_bodies if b["body_type"] == "star")
    planets = sum(1 for b in all_bodies if b["body_type"] == "planet")
    moons = sum(1 for b in all_bodies if b["body_type"] == "moon")
    rings = sum(1 for b in all_bodies if b["body_type"] == "ring")
    print(f"[✓] Inserted {len(systems)} systems, {stars} stars, "
          f"{planets} planets, {moons} moons, {rings} rings")


def main():
    print("═══════════════════════════════════════════")
    print("  Ships In The Night — Universe Generation  ")
    print("═══════════════════════════════════════════")
    print(f"Galaxy seed: {GALAXY_SEED}")
    print(f"Generating {NUM_SYSTEMS} systems...")

    systems, all_bodies = generate_universe(GALAXY_SEED)

    stars = sum(1 for b in all_bodies if b["body_type"] == "star")
    planets = sum(1 for b in all_bodies if b["body_type"] == "planet")
    moons = sum(1 for b in all_bodies if b["body_type"] == "moon")
    rings = sum(1 for b in all_bodies if b["body_type"] == "ring")
    print(f"  → {stars} stars, {planets} planets, {moons} moons, {rings} rings")

    print("Connecting to PostgreSQL...")
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        init_database(conn)
        populate_database(conn, systems, all_bodies)
    finally:
        conn.close()

    print("[✓] Universe initialized!")

if __name__ == "__main__":
    main()