"""
server.py — FastAPI game server.

Serves the client files, runs the game tick loop,
and pushes state updates to connected clients via WebSocket.
"""

import asyncio
import json
import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# ── Configuration ───────────────────────────────────────────
DB_CONFIG = {
    "database": "spacegame",
    "user": "postgres",
    "password": "postgres",
    "host": "localhost",
    "port": 5432,
}
TICK_INTERVAL = 3  # seconds


# ── Connection Manager ──────────────────────────────────────
class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        self.active: dict[int, WebSocket] = {}

    async def connect(self, user_id: int, ws: WebSocket):
        await ws.accept()
        self.active[user_id] = ws

    def disconnect(self, user_id: int):
        self.active.pop(user_id, None)

    async def broadcast(self, data: dict):
        dead = []
        for uid, ws in self.active.items():
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.active.pop(uid, None)

    async def send_to(self, user_id: int, data: dict):
        ws = self.active.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.active.pop(user_id, None)


manager = ConnectionManager()


# ── Game Tick ───────────────────────────────────────────────
async def game_tick(pool: asyncpg.Pool):
    """
    One game tick: for each system, increment resources
    by SUM(population * rate) across all planets.
    """
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE system_resources sr SET
                minerals = sr.minerals + sub.m,
                biomass  = sr.biomass  + sub.b,
                gas      = sr.gas      + sub.g,
                energy   = sr.energy   + sub.e
            FROM (
                SELECT
                    system_id,
                    SUM(population * minerals_rate) AS m,
                    SUM(population * biomass_rate)  AS b,
                    SUM(population * gas_rate)      AS g,
                    SUM(population * energy_rate)   AS e
                FROM planets
                GROUP BY system_id
            ) sub
            WHERE sr.system_id = sub.system_id
        """)


async def tick_loop(pool: asyncpg.Pool):
    """Background loop that runs game_tick every TICK_INTERVAL seconds."""
    while True:
        await asyncio.sleep(TICK_INTERVAL)
        try:
            await game_tick(pool)
        except Exception as e:
            print(f"[tick error] {e}")


# ── API Data Helpers ────────────────────────────────────────
async def get_galaxy_data(pool: asyncpg.Pool) -> list[dict]:
    """Return all systems with their primary star info for galaxy view."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT DISTINCT ON (sys.id)
                sys.id, sys.name, sys.galaxy_x, sys.galaxy_y, sys.seed,
                s.id AS star_id, s.spectral_class, s.mass AS star_mass,
                s.luminosity, s.temperature, s.radius AS star_radius,
                s.color_hex, s.seed AS star_seed
            FROM systems sys
            JOIN stars s ON s.system_id = sys.id
            ORDER BY sys.id, s.id
        """)
    return [dict(r) for r in rows]


async def get_system_data(pool: asyncpg.Pool, system_id: int) -> dict:
    """Return full system info: stars + planets + resources."""
    async with pool.acquire() as conn:
        stars = await conn.fetch(
            "SELECT * FROM stars WHERE system_id = $1 ORDER BY id", system_id
        )
        planets = await conn.fetch(
            "SELECT * FROM planets WHERE system_id = $1 ORDER BY orbit_radius",
            system_id,
        )
        resources = await conn.fetchrow(
            "SELECT * FROM system_resources WHERE system_id = $1", system_id
        )
        system = await conn.fetchrow(
            "SELECT * FROM systems WHERE id = $1", system_id
        )
    return {
        "system": dict(system) if system else None,
        "stars": [dict(s) for s in stars],
        "planets": [dict(p) for p in planets],
        "resources": dict(resources) if resources else None,
    }


async def get_planet_data(pool: asyncpg.Pool, planet_id: int) -> dict:
    """Return planet details + parent star + system resources."""
    async with pool.acquire() as conn:
        planet = await conn.fetchrow(
            "SELECT * FROM planets WHERE id = $1", planet_id
        )
        if not planet:
            return {}
        star = await conn.fetchrow(
            "SELECT * FROM stars WHERE id = $1", planet["parent_star_id"]
        )
        resources = await conn.fetchrow(
            "SELECT * FROM system_resources WHERE system_id = $1",
            planet["system_id"],
        )
    return {
        "planet": dict(planet),
        "star": dict(star) if star else None,
        "resources": dict(resources) if resources else None,
    }


async def get_star_data(pool: asyncpg.Pool, star_id: int) -> dict:
    """Return star details + parent system + system resources."""
    async with pool.acquire() as conn:
        star = await conn.fetchrow(
            "SELECT * FROM stars WHERE id = $1", star_id
        )
        if not star:
            return {}
        system = await conn.fetchrow(
            "SELECT * FROM systems WHERE id = $1", star["system_id"]
        )
        resources = await conn.fetchrow(
            "SELECT * FROM system_resources WHERE system_id = $1",
            star["system_id"],
        )
        planet_count = await conn.fetchval(
            "SELECT COUNT(*) FROM planets WHERE parent_star_id = $1", star_id
        )
    return {
        "star": dict(star),
        "system": dict(system) if system else None,
        "resources": dict(resources) if resources else None,
        "planet_count": planet_count,
    }


# ── App lifecycle ───────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await asyncpg.create_pool(**DB_CONFIG)
    app.state.pool = pool
    task = asyncio.create_task(tick_loop(pool))
    print(f"[✓] Game server running — tick every {TICK_INTERVAL}s")
    yield
    task.cancel()
    await pool.close()


app = FastAPI(lifespan=lifespan)


# ── REST endpoints ──────────────────────────────────────────
@app.get("/api/galaxy")
async def api_galaxy():
    data = await get_galaxy_data(app.state.pool)
    return data


@app.get("/api/system/{system_id}")
async def api_system(system_id: int):
    data = await get_system_data(app.state.pool, system_id)
    return data


@app.get("/api/planet/{planet_id}")
async def api_planet(planet_id: int):
    data = await get_planet_data(app.state.pool, planet_id)
    return data


@app.get("/api/star/{star_id}")
async def api_star(star_id: int):
    data = await get_star_data(app.state.pool, star_id)
    return data


# ── WebSocket ───────────────────────────────────────────────
@app.websocket("/ws/{user_id}")
async def websocket_endpoint(ws: WebSocket, user_id: int):
    await manager.connect(user_id, ws)
    try:
        # Send initial galaxy state
        galaxy = await get_galaxy_data(app.state.pool)
        await ws.send_json({"type": "init", "galaxy": galaxy})

        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "get_system":
                data = await get_system_data(app.state.pool, msg["system_id"])
                await ws.send_json({"type": "system_data", **data})

            elif msg_type == "get_planet":
                data = await get_planet_data(app.state.pool, msg["planet_id"])
                await ws.send_json({"type": "planet_data", **data})

            elif msg_type == "get_resources":
                async with app.state.pool.acquire() as conn:
                    res = await conn.fetchrow(
                        "SELECT * FROM system_resources WHERE system_id = $1",
                        msg["system_id"],
                    )
                await ws.send_json({
                    "type": "resource_update",
                    "resources": dict(res) if res else {},
                })

    except WebSocketDisconnect:
        manager.disconnect(user_id)
    except Exception as e:
        print(f"[ws error] {e}")
        manager.disconnect(user_id)


# ── Static file serving ─────────────────────────────────────
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
CLIENT_DIR = os.path.normpath(os.path.join(_THIS_DIR, "..", "client"))
CLIENT_JS_DIR = os.path.join(CLIENT_DIR, "js")

print(f"[static] Serving client from: {CLIENT_DIR}")
print(f"[static] JS directory: {CLIENT_JS_DIR}")


@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(CLIENT_DIR, "index.html"))


# Mount with follow_symlink support — serves subdirectories (scenes/) automatically
app.mount("/js", StaticFiles(directory=CLIENT_JS_DIR, follow_symlink=True), name="js")