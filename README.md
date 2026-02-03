# Space Strategy Game - Proof of Concept

## Setup Instructions

### 1. Install PostgreSQL
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

### 2. Create Database
```bash
# Start PostgreSQL service
sudo service postgresql start

# Create database and user
sudo -u postgres psql -c "CREATE DATABASE spacegame;"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
```

### 3. Load Schema
```bash
sudo -u postgres psql -d spacegame -f schema.sql
```

### 4. Install Python Dependencies
```bash
pip install -r requirements.txt --break-system-packages
```

### 5. Run the Server
```bash
python server.py
```

### 6. Open Browser
Navigate to: http://localhost:8000

## What You'll See

- A green circle representing the test planet
- Resource counter at the top showing: Minerals, Biomass, Gas, Energy
- Resources increment every 3 seconds based on planet population and production rates

## Current Test Data

- **Planet**: Terra Prime
- **Population**: 1000
- **Production Rates**:
  - Minerals: 5.0 per population
  - Biomass: 3.0 per population
  - Gas: 2.0 per population
  - Energy: 4.0 per population

Every tick (3 seconds), resources increase by:
- Minerals: +5000
- Biomass: +3000
- Gas: +2000
- Energy: +4000

## Architecture

- **Database**: PostgreSQL stores game state
- **Backend**: FastAPI server runs game tick loop every 3 seconds
- **Frontend**: Phaser 3 renders planet and UI, WebSocket receives updates
- **Communication**: WebSocket for real-time resource updates

## Next Steps

Once this is working, we can add:
- Multiple planets
- Player actions (build, upgrade)
- Procedurally generated planet visuals
- More complex game mechanics
