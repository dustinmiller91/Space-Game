"""
universe_generation.py — Server-side galaxy initialization.

Generates 100 star systems with stars and planets,
inserts everything into PostgreSQL. Uses seeded RNG so
the same galaxy_seed always produces the same universe.
"""

import math
import random
import psycopg2
from psycopg2.extras import execute_values

# ── Configuration ───────────────────────────────────────────
GALAXY_SEED = 42
NUM_SYSTEMS = 100
GALAXY_EXTENT = 3000.0  # coordinate space width/height
GALAXY_OFFSET = 500.0   # min offset so nothing sits at 0,0

DB_CONFIG = {
    "dbname": "spacegame",
    "user": "postgres",
    "password": "postgres",
    "host": "localhost",
    "port": 5432,
}

# ── Spectral class definitions ──────────────────────────────
SPECTRAL_CLASSES = [
    {
        "class": "O",
        "color": "#9BB0FF",
        "temp_range": (30000, 50000),
        "mass_range": (16.0, 60.0),
        "luminosity_range": (30000, 500000),
        "radius_range": (6.6, 15.0),
        "weight": 1,
    },
    {
        "class": "B",
        "color": "#AABFFF",
        "temp_range": (10000, 30000),
        "mass_range": (2.1, 16.0),
        "luminosity_range": (25, 30000),
        "radius_range": (1.8, 6.6),
        "weight": 3,
    },
    {
        "class": "A",
        "color": "#CAD7FF",
        "temp_range": (7500, 10000),
        "mass_range": (1.4, 2.1),
        "luminosity_range": (5, 25),
        "radius_range": (1.4, 1.8),
        "weight": 6,
    },
    {
        "class": "F",
        "color": "#F8F7FF",
        "temp_range": (6000, 7500),
        "mass_range": (1.04, 1.4),
        "luminosity_range": (1.5, 5),
        "radius_range": (1.15, 1.4),
        "weight": 10,
    },
    {
        "class": "G",
        "color": "#FFF4E0",
        "temp_range": (5200, 6000),
        "mass_range": (0.8, 1.04),
        "luminosity_range": (0.6, 1.5),
        "radius_range": (0.96, 1.15),
        "weight": 15,
    },
    {
        "class": "K",
        "color": "#FFD2A1",
        "temp_range": (3700, 5200),
        "mass_range": (0.45, 0.8),
        "luminosity_range": (0.08, 0.6),
        "radius_range": (0.7, 0.96),
        "weight": 25,
    },
    {
        "class": "M",
        "color": "#FF6347",
        "temp_range": (2400, 3700),
        "mass_range": (0.08, 0.45),
        "luminosity_range": (0.001, 0.08),
        "radius_range": (0.1, 0.7),
        "weight": 40,
    },
]

# ── Planet type definitions ─────────────────────────────────
PLANET_TYPES = [
    {"type": "Gas Giant",    "color": "#D4A574", "min_r": 18, "max_r": 32},
    {"type": "Ice Giant",    "color": "#7EC8E3", "min_r": 14, "max_r": 22},
    {"type": "Terrestrial",  "color": "#6B8E23", "min_r":  6, "max_r": 12},
    {"type": "Rocky",        "color": "#A0522D", "min_r":  5, "max_r": 10},
    {"type": "Ocean World",  "color": "#4682B4", "min_r":  8, "max_r": 14},
    {"type": "Volcanic",     "color": "#CC4400", "min_r":  5, "max_r":  9},
]


# ── Helpers ─────────────────────────────────────────────────
def weighted_choice(rng, items, key="weight"):
    """Pick an item from a weighted list using the given RNG."""
    total = sum(it[key] for it in items)
    r = rng.random() * total
    cumulative = 0
    for item in items:
        cumulative += item[key]
        if r <= cumulative:
            return item
    return items[-1]


def rand_in_range(rng, low, high):
    return low + rng.random() * (high - low)


# ── Generators ──────────────────────────────────────────────
def generate_star(rng, system_id, star_index):
    """Generate a single star with attributes based on spectral class."""
    spec = weighted_choice(rng, SPECTRAL_CLASSES)
    return {
        "system_id": system_id,
        "name": f"S{system_id}-{star_index}",
        "spectral_class": spec["class"],
        "mass": round(rand_in_range(rng, *spec["mass_range"]), 4),
        "luminosity": round(rand_in_range(rng, *spec["luminosity_range"]), 4),
        "temperature": int(rand_in_range(rng, *spec["temp_range"])),
        "radius": round(rand_in_range(rng, *spec["radius_range"]), 4),
        "color_hex": spec["color"],
        "seed": rng.randint(0, 2**31 - 1),
    }


def generate_planets(rng, system_id, star_id, star_luminosity):
    """Generate 2-8 planets for a star, ordered by orbit distance."""
    num_planets = rng.randint(2, 8)
    planets = []
    orbit_base = 80.0

    # Rough habitable zone based on luminosity (in display units)
    hz_inner = 100 * math.sqrt(star_luminosity) * 0.85
    hz_outer = 100 * math.sqrt(star_luminosity) * 1.5

    for i in range(num_planets):
        orbit_radius = orbit_base + 30 + rng.random() * 70
        orbit_base = orbit_radius

        # Weight planet type by distance from star
        if orbit_radius < hz_inner:
            # Inner: more rocky/volcanic
            weights = [2, 1, 3, 8, 1, 10]
        elif orbit_radius <= hz_outer:
            # Habitable zone: terrestrial/ocean
            weights = [2, 2, 10, 3, 8, 1]
        else:
            # Outer: gas/ice giants
            weights = [10, 8, 2, 3, 2, 1]

        type_idx = rng.choices(range(len(PLANET_TYPES)), weights=weights, k=1)[0]
        pt = PLANET_TYPES[type_idx]

        planet_radius = rand_in_range(rng, pt["min_r"], pt["max_r"])

        # Resource rates loosely tied to type
        base_minerals = rng.random() * 5
        base_biomass = rng.random() * 3
        base_gas = rng.random() * 4
        base_energy = rng.random() * 6

        # Terrestrial/ocean worlds get population, others mostly barren
        if pt["type"] in ("Terrestrial", "Ocean World"):
            population = rng.randint(500, 15000)
        elif pt["type"] == "Rocky":
            population = rng.randint(0, 2000)
        else:
            population = rng.randint(0, 500)

        planets.append({
            "system_id": system_id,
            "parent_star_id": star_id,
            "name": f"P{system_id}-{i}",
            "planet_type": pt["type"],
            "orbit_radius": round(orbit_radius, 2),
            "orbit_angle": round(rng.random() * math.pi * 2, 4),
            "eccentricity": round(rng.random() * 0.35, 4),
            "planet_radius": round(planet_radius, 2),
            "population": population,
            "minerals_rate": round(base_minerals, 2),
            "biomass_rate": round(base_biomass, 2),
            "gas_rate": round(base_gas, 2),
            "energy_rate": round(base_energy, 2),
            "color_hex": pt["color"],
            "seed": rng.randint(0, 2**31 - 1),
        })

    return planets


def generate_universe(galaxy_seed=GALAXY_SEED):
    """Generate all systems, stars, and planets for the galaxy."""
    master_rng = random.Random(galaxy_seed)

    systems = []
    all_stars = []
    all_planets = []

    for sys_idx in range(NUM_SYSTEMS):
        sys_seed = master_rng.randint(0, 2**31 - 1)
        sys_rng = random.Random(sys_seed)

        system = {
            "id": sys_idx + 1,
            "name": f"System-{sys_idx + 1}",
            "galaxy_x": round(GALAXY_OFFSET + master_rng.random() * GALAXY_EXTENT, 2),
            "galaxy_y": round(GALAXY_OFFSET + master_rng.random() * GALAXY_EXTENT, 2),
            "seed": sys_seed,
        }
        systems.append(system)

        # 85% single star, 12% binary, 3% trinary
        roll = sys_rng.random()
        if roll < 0.03:
            num_stars = 3
        elif roll < 0.15:
            num_stars = 2
        else:
            num_stars = 1

        system_stars = []
        for si in range(num_stars):
            star = generate_star(sys_rng, system["id"], si)
            system_stars.append(star)

        all_stars.extend(system_stars)

        # Planets orbit the primary star (index 0)
        # star_id will be assigned after DB insert; use placeholder
        primary_star = system_stars[0]
        planets = generate_planets(
            sys_rng, system["id"], None, primary_star["luminosity"]
        )
        all_planets.extend(planets)

    return systems, all_stars, all_planets


# ── Database insertion ──────────────────────────────────────
def init_database(conn):
    """Run schema.sql to create/reset tables."""
    import os
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    with open(schema_path, "r") as f:
        sql = f.read()
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    print("[✓] Schema created")


def populate_database(conn, systems, stars, planets):
    """Bulk-insert generated data into PostgreSQL."""
    with conn.cursor() as cur:
        # Insert default player
        cur.execute(
            "INSERT INTO players (username) VALUES (%s) RETURNING id",
            ("TestPlayer",)
        )
        player_id = cur.fetchone()[0]

        # Insert systems
        sys_values = [
            (s["id"], s["name"], s["galaxy_x"], s["galaxy_y"], s["seed"])
            for s in systems
        ]
        execute_values(
            cur,
            "INSERT INTO systems (id, name, galaxy_x, galaxy_y, seed) VALUES %s",
            sys_values,
        )
        # Reset sequence
        cur.execute(f"SELECT setval('systems_id_seq', {len(systems)})")

        # Insert stars and collect assigned IDs mapped by (system_id, index)
        star_id_map = {}
        star_counter = 0
        for star in stars:
            cur.execute(
                """INSERT INTO stars
                   (system_id, name, spectral_class, mass, luminosity,
                    temperature, radius, color_hex, seed)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (
                    star["system_id"], star["name"], star["spectral_class"],
                    star["mass"], star["luminosity"], star["temperature"],
                    star["radius"], star["color_hex"], star["seed"],
                ),
            )
            db_id = cur.fetchone()[0]
            star_id_map[(star["system_id"], star_counter)] = db_id
            star_counter += 1

        # Build a lookup: system_id → first star's DB id (primary star)
        primary_star_ids = {}
        for (sys_id, idx), db_id in star_id_map.items():
            if sys_id not in primary_star_ids:
                primary_star_ids[sys_id] = db_id

        # Insert planets with correct parent_star_id
        for p in planets:
            p["parent_star_id"] = primary_star_ids[p["system_id"]]

        planet_values = [
            (
                p["system_id"], p["parent_star_id"], p["name"], p["planet_type"],
                p["orbit_radius"], p["orbit_angle"], p["eccentricity"],
                p["planet_radius"],
                p["population"], p["minerals_rate"], p["biomass_rate"],
                p["gas_rate"], p["energy_rate"], p["color_hex"], p["seed"],
            )
            for p in planets
        ]
        execute_values(
            cur,
            """INSERT INTO planets
               (system_id, parent_star_id, name, planet_type, orbit_radius,
                orbit_angle, eccentricity, planet_radius, population,
                minerals_rate,
                biomass_rate, gas_rate, energy_rate, color_hex, seed)
               VALUES %s""",
            planet_values,
        )

        # Initialize system_resources for each system (owned by test player)
        res_values = [(s["id"], player_id, 0, 0, 0, 0) for s in systems]
        execute_values(
            cur,
            """INSERT INTO system_resources
               (system_id, controlled_by_player_id, minerals, biomass, gas, energy)
               VALUES %s""",
            res_values,
        )

    conn.commit()
    print(f"[✓] Inserted {len(systems)} systems, {len(stars)} stars, {len(planets)} planets")


# ── Main ────────────────────────────────────────────────────
def main():
    print("═══════════════════════════════════════")
    print("  Star Strategy — Universe Generation  ")
    print("═══════════════════════════════════════")
    print(f"Galaxy seed: {GALAXY_SEED}")
    print(f"Generating {NUM_SYSTEMS} systems...")

    systems, stars, planets = generate_universe(GALAXY_SEED)

    print(f"  → {len(stars)} stars")
    print(f"  → {len(planets)} planets")
    print()

    print("Connecting to PostgreSQL...")
    conn = psycopg2.connect(**DB_CONFIG)

    try:
        init_database(conn)
        populate_database(conn, systems, stars, planets)
    finally:
        conn.close()

    print()
    print("[✓] Universe initialized successfully!")
    print("    Run `python server.py` to start the game server.")


if __name__ == "__main__":
    main()