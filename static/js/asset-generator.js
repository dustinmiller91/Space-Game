// Asset generation functions for procedural content

// Simple seeded random number generator
function seededRandom(seed) {
    let value = seed;
    return function() {
        value = (value * 9301 + 49297) % 233280;
        return value / 233280;
    };
}

// HSL to RGB conversion
function hslToRgb(h, s, l) {
    let r, g, b;
    
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Generate procedural planet texture
export function generatePlanetTexture(scene, seed, size) {
    const textureName = `planet_${seed}`;
    const texture = scene.textures.createCanvas(textureName, size, size);
    const ctx = texture.getContext();
    
    const random = seededRandom(seed);
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 2;
    
    // Generate base color from seed
    const hue = Math.floor(random() * 360);
    const baseColor = hslToRgb(hue / 360, 0.6, 0.5);
    
    // Draw planet pixel by pixel
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            const dx = x - centerX;
            const dy = y - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < radius) {
                // Add noise variation
                const noise = random() * 0.3 - 0.15;
                const brightness = 1 + noise;
                
                const r = Math.floor(baseColor[0] * brightness);
                const g = Math.floor(baseColor[1] * brightness);
                const b = Math.floor(baseColor[2] * brightness);
                
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }
    
    texture.refresh();
    return textureName;
}

// Generate starfield background
export function generateStarfield(scene, width, height) {
    const texture = scene.textures.createCanvas('starfield', width, height);
    const ctx = texture.getContext();
    
    // Black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    // Add stars
    const numStars = Math.floor((width * height) / 2400);
    const random = seededRandom(12345);
    for (let i = 0; i < numStars; i++) {
        const x = Math.floor(random() * width);
        const y = Math.floor(random() * height);
        const brightness = Math.floor(150 + random() * 105);
        ctx.fillStyle = `rgb(${brightness},${brightness},${brightness})`;
        ctx.fillRect(x, y, 1, 1);
    }
    
    texture.refresh();
    return 'starfield';
}
