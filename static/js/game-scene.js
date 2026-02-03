// Main game scene - orchestrates all components

import { generatePlanetTexture, generateStarfield } from './asset-generator.js';
import { ResourceDisplay } from './ui.js';
import { ServerConnection } from './network.js';

export class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }
    
    create() {
        // Generate and add starfield background
        const bgTexture = generateStarfield(this, window.innerWidth, window.innerHeight);
        this.background = this.add.image(0, 0, bgTexture).setOrigin(0, 0);
        
        // Generate and add procedural planet (centered)
        const planetSeed = 42;
        const planetTexture = generatePlanetTexture(this, planetSeed, 100);
        this.planet = this.add.image(window.innerWidth / 2, window.innerHeight / 2, planetTexture);
        
        // Create UI elements
        this.resourceDisplay = new ResourceDisplay(this);
        
        // Connect to server
        this.server = new ServerConnection((data) => this.handleServerMessage(data));
        
        // Handle window resize
        this.scale.on('resize', (gameSize) => this.handleResize(gameSize));
    }
    
    update() {
        // Main game loop - currently unused
    }
    
    handleServerMessage(data) {
        switch(data.type) {
            case 'init':
                this.resourceDisplay.setResources(data.resources);
                break;
            case 'resource_update':
                this.resourceDisplay.setResources(data.resources);
                break;
        }
    }
    
    handleResize(gameSize) {
        // Regenerate background for new size
        this.textures.remove('starfield');
        const newBgTexture = generateStarfield(this, gameSize.width, gameSize.height);
        this.background.setTexture(newBgTexture);
        this.background.setPosition(0, 0);
        
        // Recenter planet
        this.planet.setPosition(gameSize.width / 2, gameSize.height / 2);
    }
}
