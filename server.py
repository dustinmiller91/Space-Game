from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import asyncpg
import asyncio
import json
from datetime import datetime

# Configuration
DB_CONFIG = {
    'host': 'localhost',
    'database': 'spacegame',
    'user': 'postgres',
    'password': '81@n2Hbjp'
}

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
    
    async def broadcast(self, data: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except:
                pass

manager = ConnectionManager()

# Game engine
class GameEngine:
    def __init__(self, db_pool):
        self.db = db_pool
        self.running = False
    
    async def game_tick(self):
        """Process resource generation every tick"""
        async with self.db.acquire() as conn:
            # Get all planets
            planets = await conn.fetch("""
                SELECT p.id, p.system_id, p.population, 
                       p.minerals_rate, p.biomass_rate, p.gas_rate, p.energy_rate
                FROM planets p
            """)
            
            # Group by system and calculate resource increments
            system_updates = {}
            for planet in planets:
                sid = planet['system_id']
                if sid not in system_updates:
                    system_updates[sid] = {
                        'minerals': 0, 'biomass': 0, 'gas': 0, 'energy': 0
                    }
                
                pop = planet['population']
                system_updates[sid]['minerals'] += pop * float(planet['minerals_rate'])
                system_updates[sid]['biomass'] += pop * float(planet['biomass_rate'])
                system_updates[sid]['gas'] += pop * float(planet['gas_rate'])
                system_updates[sid]['energy'] += pop * float(planet['energy_rate'])
            
            # Update system resources
            for system_id, increments in system_updates.items():
                await conn.execute("""
                    UPDATE system_resources
                    SET minerals = minerals + $1,
                        biomass = biomass + $2,
                        gas = gas + $3,
                        energy = energy + $4
                    WHERE system_id = $5
                """, increments['minerals'], increments['biomass'], 
                     increments['gas'], increments['energy'], system_id)
            
            # Get updated resources to broadcast
            resources = await conn.fetchrow("""
                SELECT minerals, biomass, gas, energy
                FROM system_resources
                WHERE system_id = 1
            """)
            
            # Broadcast to all connected clients
            await manager.broadcast({
                'type': 'resource_update',
                'resources': {
                    'minerals': float(resources['minerals']),
                    'biomass': float(resources['biomass']),
                    'gas': float(resources['gas']),
                    'energy': float(resources['energy'])
                }
            })
    
    async def run(self):
        """Main game loop"""
        self.running = True
        while self.running:
            await self.game_tick()
            await asyncio.sleep(3)  # 3 second tick
    
    def stop(self):
        self.running = False

# FastAPI app with lifespan management
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    app.state.db_pool = await asyncpg.create_pool(**DB_CONFIG)
    app.state.engine = GameEngine(app.state.db_pool)
    app.state.game_task = asyncio.create_task(app.state.engine.run())
    
    yield
    
    # Shutdown
    app.state.engine.stop()
    await app.state.game_task
    await app.state.db_pool.close()

app = FastAPI(lifespan=lifespan)

# Serve static files (HTML/JS client)
app.mount("/static", StaticFiles(directory="static", html=True), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html", media_type="text/html")

@app.get("/api/init")
async def get_initial_state():
    """Get initial game state"""
    async with app.state.db_pool.acquire() as conn:
        resources = await conn.fetchrow("""
            SELECT minerals, biomass, gas, energy
            FROM system_resources
            WHERE system_id = 1
        """)
        
        planets = await conn.fetch("""
            SELECT id, name, population
            FROM planets
            WHERE system_id = 1
        """)
        
        return {
            'resources': {
                'minerals': float(resources['minerals']),
                'biomass': float(resources['biomass']),
                'gas': float(resources['gas']),
                'energy': float(resources['energy'])
            },
            'planets': [dict(p) for p in planets]
        }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send initial state
        async with app.state.db_pool.acquire() as conn:
            resources = await conn.fetchrow("""
                SELECT minerals, biomass, gas, energy
                FROM system_resources
                WHERE system_id = 1
            """)
            
            await websocket.send_json({
                'type': 'init',
                'resources': {
                    'minerals': float(resources['minerals']),
                    'biomass': float(resources['biomass']),
                    'gas': float(resources['gas']),
                    'energy': float(resources['energy'])
                }
            })
        
        # Keep connection alive
        while True:
            await websocket.receive_text()
    except:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)