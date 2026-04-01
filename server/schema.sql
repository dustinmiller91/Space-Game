-- ============================================================
-- Ships In The Night — Database Schema
-- ============================================================
--
-- MOBILE DIAGRAM: Every object in a system is a "body" in a tree.
--
--   System root
--     └─ Primary Star (parent_id = NULL)
--          ├─ Secondary Star (orbits primary)
--          │    └─ Planet (orbits secondary)
--          │         └─ Moon (orbits planet)
--          ├─ Planet (orbits primary)
--          │    ├─ Ring (Roche limit zone)
--          │    ├─ Ring
--          │    ├─ Moon
--          │    └─ Moon
--          └─ Planet
--
-- body_type: 'star', 'planet', 'moon', 'ring'
-- Orbital params are NULL for root bodies (they don't orbit anything).
--
-- All masses are in solar masses (M☉).
-- semi_major is in AU.
-- orbital_period is in years.
-- orbital_velocity is in AU/year.

DROP TABLE IF EXISTS system_resources CASCADE;
DROP TABLE IF EXISTS bodies CASCADE;
DROP TABLE IF EXISTS systems CASCADE;
DROP TABLE IF EXISTS players CASCADE;

CREATE TABLE players (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(50) UNIQUE NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE systems (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    galaxy_x    DOUBLE PRECISION NOT NULL,
    galaxy_y    DOUBLE PRECISION NOT NULL,
    seed        INTEGER NOT NULL
);

CREATE TABLE bodies (
    id              SERIAL PRIMARY KEY,
    system_id       INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    parent_id       INTEGER REFERENCES bodies(id) ON DELETE CASCADE,
    body_type       VARCHAR(10) NOT NULL CHECK (body_type IN ('star', 'planet', 'moon', 'ring')),
    name            VARCHAR(100) NOT NULL,

    -- Orbit (NULL for root body)
    semi_major      DOUBLE PRECISION,       -- AU
    eccentricity    DOUBLE PRECISION DEFAULT 0,
    orbit_angle     DOUBLE PRECISION DEFAULT 0,
    orbital_period  DOUBLE PRECISION,       -- years (Kepler's third law)
    orbital_velocity DOUBLE PRECISION,      -- AU/year

    -- Physical
    mass            DOUBLE PRECISION NOT NULL DEFAULT 0,  -- solar masses
    radius          DOUBLE PRECISION NOT NULL,
    color_hex       VARCHAR(7) NOT NULL,
    seed            INTEGER NOT NULL,

    -- Star-specific
    spectral_class  VARCHAR(10),
    luminosity      DOUBLE PRECISION,
    temperature     INTEGER,

    -- Planet/moon-specific
    planet_type     VARCHAR(30),

    -- Economy
    population      INTEGER NOT NULL DEFAULT 0,
    minerals_rate   DOUBLE PRECISION NOT NULL DEFAULT 0,
    biomass_rate    DOUBLE PRECISION NOT NULL DEFAULT 0,
    gas_rate        DOUBLE PRECISION NOT NULL DEFAULT 0,
    energy_rate     DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE system_resources (
    system_id               INTEGER PRIMARY KEY REFERENCES systems(id) ON DELETE CASCADE,
    controlled_by_player_id INTEGER REFERENCES players(id),
    minerals                DOUBLE PRECISION NOT NULL DEFAULT 0,
    biomass                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    gas                     DOUBLE PRECISION NOT NULL DEFAULT 0,
    energy                  DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE INDEX idx_bodies_system ON bodies(system_id);
CREATE INDEX idx_bodies_parent ON bodies(parent_id);
CREATE INDEX idx_bodies_type   ON bodies(body_type);
CREATE INDEX idx_sysres_player ON system_resources(controlled_by_player_id);