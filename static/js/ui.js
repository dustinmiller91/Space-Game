// UI and GUI elements

export class ResourceDisplay {
    constructor(scene) {
        this.scene = scene;
        this.resources = {
            minerals: 0,
            biomass: 0,
            gas: 0,
            energy: 0
        };
        
        this.text = scene.add.text(10, 10, '', {
            fontSize: '16px',
            fill: '#ffffff',
            fontFamily: 'monospace',
            backgroundColor: '#000000',
            padding: { x: 5, y: 5 }
        });
        
        this.update();
    }
    
    setResources(resources) {
        this.resources = resources;
        this.update();
    }
    
    update() {
        const text = `Minerals: ${this.resources.minerals.toFixed(2)} | ` +
                    `Biomass: ${this.resources.biomass.toFixed(2)} | ` +
                    `Gas: ${this.resources.gas.toFixed(2)} | ` +
                    `Energy: ${this.resources.energy.toFixed(2)}`;
        this.text.setText(text);
    }
}
