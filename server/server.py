"""
server.py — Ships In The Night game server.

Serves client files, runs the game tick loop, and provides
REST + WebSocket APIs. All data comes from the unified 'bodies' table.
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
TICK_INTERVAL = 3

# ── Connection Manager ──────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: dict[int, WebSocket] = {}

    async def connect(self, uid: int, ws: WebSocket):
        await ws.accept()
        self.active[uid] = ws

    def disconnect(self, uid: int):
        self.active.pop(uid, None)

    async def broadcast(self, data: dict):
        dead = []
        for uid, ws in self.active.items():
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.active.pop(uid, None)

manager = ConnectionManager()

# ── Game Tick ───────────────────────────────────────────────

async def game_tick(pool: asyncpg.Pool):
    """Increment system resources by sum(population * rate) across all bodies."""
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE system_resources sr SET
                minerals = sr.minerals + sub.m,
                biomass  = sr.biomass  + sub.b,
                gas      = sr.gas      + sub.g,
                energy   = sr.energy   + sub.e
            FROM (
                SELECT system_id,
                    SUM(population * minerals_rate) AS m,
                    SUM(population * biomass_rate)  AS b,
                    SUM(population * gas_rate)      AS g,
                    SUM(population * energy_rate)   AS e
                FROM bodies
                WHERE population > 0
                GROUP BY system_id
            ) sub
            WHERE sr.system_id = sub.system_id
        """)

async def tick_loop(pool: asyncpg.Pool):
    while True:
        await asyncio.sleep(TICK_INTERVAL)
        try:
            await game_tick(pool)
        except Exception as e:
            print(f"[tick error] {e}")

# ── API Data Helpers ────────────────────────────────────────

async def get_galaxy_data(pool: asyncpg.Pool):
    """Return all systems with primary star info + star count for galaxy view."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT sys.id, sys.name, sys.galaxy_x, sys.galaxy_y, sys.seed,
                   b.id AS star_id, b.spectral_class, b.mass AS star_mass,
                   b.luminosity, b.temperature, b.radius AS star_radius,
                   b.color_hex, b.seed AS star_seed,
                   (SELECT COUNT(*) FROM bodies b2
                    WHERE b2.system_id = sys.id AND b2.body_type = 'star') AS star_count,
                   (SELECT json_agg(json_build_object(
                        'color_hex', b3.color_hex,
                        'spectral_class', b3.spectral_class,
                        'mass', b3.mass
                    )) FROM bodies b3
                    WHERE b3.system_id = sys.id AND b3.body_type = 'star'
                    AND b3.id != b.id) AS companions
            FROM systems sys
            JOIN bodies b ON b.system_id = sys.id
                         AND b.body_type = 'star'
                         AND b.parent_id IS NULL
            ORDER BY sys.id
        """)
    result = []
    for r in rows:
        d = dict(r)
        import json as _json
        if d["companions"] and isinstance(d["companions"], str):
            d["companions"] = _json.loads(d["companions"])
        result.append(d)
    return result


async def get_system_data(pool: asyncpg.Pool, system_id: int):
    """Return system info + all bodies as a flat list (client builds the tree)."""
    async with pool.acquire() as conn:
        system = await conn.fetchrow("SELECT * FROM systems WHERE id = $1", system_id)
        bodies = await conn.fetch(
            "SELECT * FROM bodies WHERE system_id = $1 ORDER BY semi_major NULLS FIRST",
            system_id)
        resources = await conn.fetchrow(
            "SELECT * FROM system_resources WHERE system_id = $1", system_id)
    return {
        "system": dict(system) if system else None,
        "bodies": [dict(b) for b in bodies],
        "resources": dict(resources) if resources else None,
    }


async def get_body_data(pool: asyncpg.Pool, body_id: int):
    """Return a single body + its parent + system resources."""
    async with pool.acquire() as conn:
        body = await conn.fetchrow("SELECT * FROM bodies WHERE id = $1", body_id)
        if not body:
            return {}
        parent = None
        if body["parent_id"]:
            parent = await conn.fetchrow("SELECT * FROM bodies WHERE id = $1", body["parent_id"])
        children = await conn.fetch(
            "SELECT * FROM bodies WHERE parent_id = $1 ORDER BY semi_major", body_id)
        resources = await conn.fetchrow(
            "SELECT * FROM system_resources WHERE system_id = $1", body["system_id"])
    return {
        "body": dict(body),
        "parent": dict(parent) if parent else None,
        "children": [dict(c) for c in children],
        "resources": dict(resources) if resources else None,
    }

# ── App Lifecycle ───────────────────────────────────────────

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

# ── REST Endpoints ──────────────────────────────────────────

@app.get("/api/galaxy")
async def api_galaxy():
    return await get_galaxy_data(app.state.pool)

@app.get("/api/system/{system_id}")
async def api_system(system_id: int):
    return await get_system_data(app.state.pool, system_id)

@app.get("/api/body/{body_id}")
async def api_body(body_id: int):
    return await get_body_data(app.state.pool, body_id)

# ── WebSocket ───────────────────────────────────────────────

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(ws: WebSocket, user_id: int):
    await manager.connect(user_id, ws)
    try:
        galaxy = await get_galaxy_data(app.state.pool)
        await ws.send_json({"type": "init", "galaxy": galaxy})
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            t = msg.get("type")
            if t == "get_system":
                data = await get_system_data(app.state.pool, msg["system_id"])
                await ws.send_json({"type": "system_data", **data})
            elif t == "get_body":
                data = await get_body_data(app.state.pool, msg["body_id"])
                await ws.send_json({"type": "body_data", **data})
    except WebSocketDisconnect:
        manager.disconnect(user_id)
    except Exception as e:
        print(f"[ws error] {e}")
        manager.disconnect(user_id)

# ── Static Files ────────────────────────────────────────────

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
CLIENT_DIR = os.path.normpath(os.path.join(_THIS_DIR, "..", "client"))
CLIENT_JS = os.path.join(CLIENT_DIR, "js")
CLIENT_ASSETS = os.path.join(CLIENT_DIR, "assets")
print(f"[static] Client: {CLIENT_DIR}")

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(CLIENT_DIR, "index.html"))

app.mount("/js", StaticFiles(directory=CLIENT_JS, follow_symlink=True), name="js")
app.mount("/assets", StaticFiles(directory=CLIENT_ASSETS, follow_symlink=True), name="assets")