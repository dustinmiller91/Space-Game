-- ============================================================
-- Star Strategy — Database Schema
-- ============================================================

-- Drop existing tables (for re-initialization)
DROP TABLE IF EXISTS system_resources CASCADE;
DROP TABLE IF EXISTS planets CASCADE;
DROP TABLE IF EXISTS stars CASCADE;
DROP TABLE IF EXISTS systems CASCADE;
DROP TABLE IF EXISTS players CASCADE;

-- Players
CREATE TABLE players (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(50) UNIQUE NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Systems (a grouping that holds stars + planets)
CREATE TABLE systems (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    galaxy_x    DOUBLE PRECISION NOT NULL,
    galaxy_y    DOUBLE PRECISION NOT NULL,
    seed        INTEGER NOT NULL
);

-- Stars (each system has 1+ stars)
CREATE TABLE stars (
    id              SERIAL PRIMARY KEY,
    system_id       INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    spectral_class  VARCHAR(10) NOT NULL,
    mass            DOUBLE PRECISION NOT NULL,
    luminosity      DOUBLE PRECISION NOT NULL,
    temperature     INTEGER NOT NULL,
    radius          DOUBLE PRECISION NOT NULL,
    color_hex       VARCHAR(7) NOT NULL,
    seed            INTEGER NOT NULL
);

-- Planets
CREATE TABLE planets (
    id              SERIAL PRIMARY KEY,
    system_id       INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    parent_star_id  INTEGER NOT NULL REFERENCES stars(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    planet_type     VARCHAR(30) NOT NULL,
    orbit_radius    DOUBLE PRECISION NOT NULL,
    orbit_angle     DOUBLE PRECISION NOT NULL,
    eccentricity    DOUBLE PRECISION NOT NULL DEFAULT 0,
    planet_radius   DOUBLE PRECISION NOT NULL,
    population      INTEGER NOT NULL DEFAULT 0,
    minerals_rate   DOUBLE PRECISION NOT NULL DEFAULT 0,
    biomass_rate    DOUBLE PRECISION NOT NULL DEFAULT 0,
    gas_rate        DOUBLE PRECISION NOT NULL DEFAULT 0,
    energy_rate     DOUBLE PRECISION NOT NULL DEFAULT 0,
    color_hex       VARCHAR(7) NOT NULL,
    seed            INTEGER NOT NULL
);

-- System-level accumulated resources
CREATE TABLE system_resources (
    system_id               INTEGER PRIMARY KEY REFERENCES systems(id) ON DELETE CASCADE,
    controlled_by_player_id INTEGER REFERENCES players(id),
    minerals                DOUBLE PRECISION NOT NULL DEFAULT 0,
    biomass                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    gas                     DOUBLE PRECISION NOT NULL DEFAULT 0,
    energy                  DOUBLE PRECISION NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX idx_stars_system      ON stars(system_id);
CREATE INDEX idx_planets_system    ON planets(system_id);
CREATE INDEX idx_planets_star      ON planets(parent_star_id);
CREATE INDEX idx_sysres_player     ON system_resources(controlled_by_player_id);