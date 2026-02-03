-- Space Strategy Game Database Schema

-- Players table
CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL
);

-- Systems table
CREATE TABLE systems (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

-- Planets table
CREATE TABLE planets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    system_id INTEGER NOT NULL REFERENCES systems(id),
    population INTEGER NOT NULL DEFAULT 0,
    minerals_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
    biomass_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
    gas_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
    energy_rate DECIMAL(10,2) NOT NULL DEFAULT 0
);

-- System resources table
CREATE TABLE system_resources (
    system_id INTEGER PRIMARY KEY REFERENCES systems(id),
    controlled_by_player_id INTEGER REFERENCES players(id),
    minerals DECIMAL(15,2) NOT NULL DEFAULT 0,
    biomass DECIMAL(15,2) NOT NULL DEFAULT 0,
    gas DECIMAL(15,2) NOT NULL DEFAULT 0,
    energy DECIMAL(15,2) NOT NULL DEFAULT 0
);

-- Insert test data
INSERT INTO players (username) VALUES ('TestPlayer');

INSERT INTO systems (name) VALUES ('Alpha Centauri');

INSERT INTO planets (name, system_id, population, minerals_rate, biomass_rate, gas_rate, energy_rate)
VALUES ('Terra Prime', 1, 1000, 5.0, 3.0, 2.0, 4.0);

INSERT INTO system_resources (system_id, controlled_by_player_id, minerals, biomass, gas, energy)
VALUES (1, 1, 0, 0, 0, 0);
