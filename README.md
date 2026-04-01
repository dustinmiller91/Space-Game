# Ships In The Night

A browser-based multiplayer idle space strategy game.

## Project Structure

```
star_strategy/
├── server/
│   ├── schema.sql                # PostgreSQL table definitions
│   ├── universe_generation.py    # Initialization script — generates galaxy & populates DB
│   ├── server.py                 # FastAPI game server (REST + WebSocket + tick loop)
│   └── requirements.txt          # Python dependencies
│
└── client/
    ├── index.html                # Entry point — loads Phaser + all JS modules
    └── js/
        ├── config.js             # Shared constants & color palette
        ├── assets.js             # Procedural asset generation (placeholder circles)
        ├── network.js            # Client/server communication (REST + WebSocket)
        ├── ui.js                 # Reusable UI elements (tooltips, panels, edge-scroll)
        ├── engine.js             # Phaser boot & game initialization
        └── scenes/
            ├── GalaxyScene.js    # Top-level galaxy map (100 star systems)
            ├── SystemScene.js    # Solar system view (star + planets)
            └── DetailsScene.js   # Planet inspection panel
```

### Module Responsibilities

| Module         | Purpose                                                              |
|----------------|----------------------------------------------------------------------|
| `config.js`    | Constants, colors, fonts — single source of truth for shared values  |
| `assets.js`    | Drawing functions for stars, planets, starfields (will become procedural pixel-art) |
| `network.js`   | REST `fetch()` calls + WebSocket connection, event system            |
| `ui.js`        | Tooltips, HUD labels, back buttons, info panels, edge-scroll camera  |
| `engine.js`    | Phaser config, scene registration, boot sequence                     |
| `GalaxyScene`  | Fetches galaxy from `/api/galaxy`, renders star map                  |
| `SystemScene`  | Fetches system from `/api/system/:id`, renders orbits + planets      |
| `DetailsScene` | Fetches planet from `/api/planet/:id`, renders detail panel          |

## Setup

### 1. PostgreSQL

```bash
sudo service postgresql start
sudo -u postgres psql -c "CREATE DATABASE spacegame;"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
```

### 2. Python Environment

```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Initialize the Universe

This creates all tables and populates star systems with stars, planets, moons, and rings:

```bash
python universe_generation.py
```

### 4. Start the Game Server

```bash
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### 5. Play

Open http://localhost:8000

- **Galaxy view**: Pan with mouse at screen edges, hover stars for tooltips, click to enter a system
- **System view**: See the star, orbiting planets, moons, and rings; click any body for details
- **Details view**: Body attributes, resource rates, and system stockpile (accumulates every 3s tick)

## Architecture

```
Browser (Phaser 3)                    Server (FastAPI)
┌────────────────────┐                ┌────────────────────────┐
│  GalaxyScene       │──GET /api/──→  │  REST endpoints        │
│  SystemScene       │    galaxy      │    /api/galaxy          │
│  DetailsScene      │    system/:id  │    /api/system/:id      │
│                    │    body/:id    │    /api/body/:id        │
│  Network.ws ◄──────┼──WebSocket──→  │  WebSocket handler      │
│                    │                │                          │
│  Assets (render)   │                │  Tick loop (3s)          │
│  UI (tooltips etc) │                │    └→ UPDATE resources   │
└────────────────────┘                │                          │
                                      │  PostgreSQL              │
                                      │    players, systems,     │
                                      │    bodies,               │
                                      │    system_resources      │
                                      └────────────────────────┘
```

## Re-initializing

To reset the universe (drops all tables and regenerates):

```bash
python universe_generation.py
```

Change `GALAXY_SEED` in `universe_generation.py` for a different galaxy.