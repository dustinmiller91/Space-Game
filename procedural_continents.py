import matplotlib.pyplot as plt
import numpy as np
from opensimplex import OpenSimplex
from matplotlib.colors import LinearSegmentedColormap
from random import randint


def heightmap_to_rgb(heightmap, color_stops):
    """Convert heightmap to RGB image using color stops.
    
    Args:
        heightmap: 2D array of values in [0, 1]
        color_stops: List of (height, (r, g, b)) tuples
    
    Returns:
        RGB image array of shape (height, width, 3)
    """
    color_stops = sorted(color_stops, key=lambda x: x[0])
    h, w = heightmap.shape
    rgb_image = np.zeros((h, w, 3), dtype=np.uint8)
    
    for y in range(h):
        for x in range(w):
            value = heightmap[y, x]
            
            # Find surrounding color stops
            for i in range(len(color_stops) - 1):
                if color_stops[i][0] <= value <= color_stops[i+1][0]:
                    # Interpolate between the two colors
                    t = (value - color_stops[i][0]) / (color_stops[i+1][0] - color_stops[i][0])
                    color1 = np.array(color_stops[i][1])
                    color2 = np.array(color_stops[i+1][1])
                    rgb_image[y, x] = color1 * (1 - t) + color2 * t
                    break
    
    return rgb_image


def voronoi_sphere_heightmap(width, height, radius=1.0, points=20, scale=2.0, seed=0):
    """Generate Voronoi noise on the apparent disk of a sphere.
    
    Args:
        width, height: Dimensions of output image
        radius: Sphere radius
        points: Number of random Voronoi seed points on sphere surface
        scale: Exponent for distance scaling (higher = steeper boundaries)
        seed: Random seed
    
    Returns:
        numpy array of shape (height, width) with values in [0, 1]
        Points outside sphere disk are set to 0
    """
    np.random.seed(seed)
    heightmap = np.zeros((height, width))
    
    # Generate random points on sphere surface using spherical coordinates
    voronoi_points = []
    for _ in range(points):
        # Uniform distribution on sphere
        u = np.random.uniform(0, 1)
        v = np.random.uniform(0, 1)
        theta = 2 * np.pi * u  # azimuthal angle
        phi = np.arccos(2 * v - 1)  # polar angle
        
        # Convert to 3D Cartesian coordinates
        x = radius * np.sin(phi) * np.cos(theta)
        y = radius * np.sin(phi) * np.sin(theta)
        z = radius * np.cos(phi)
        voronoi_points.append((x, y, z))
    
    voronoi_points = np.array(voronoi_points)
    
    center_x, center_y = width / 2, height / 2
    
    for y in range(height):
        for x in range(width):
            # Map pixel to [-1, 1] range
            px = (x - center_x) / (width / 2)
            py = (y - center_y) / (height / 2)
            
            # Check if point is inside the sphere's disk
            dist_sq = px**2 + py**2
            if dist_sq > 1.0:
                continue  # Outside sphere
            
            # Project onto sphere surface (3D coordinates)
            pz = np.sqrt(1.0 - dist_sq)
            point_3d = np.array([px * radius, py * radius, pz * radius])
            
            # Find distances to all Voronoi centers
            distances = np.linalg.norm(voronoi_points - point_3d, axis=1)
            
            # Find closest distance
            min_dist = np.min(distances)
            
            # Invert: boundaries (far from centers) are high, centers are low
            heightmap[y, x] = min_dist ** scale
    
    # Normalize non-zero values to [0, 1]
    mask = heightmap != 0
    if mask.any():
        heightmap[mask] = (heightmap[mask] - heightmap[mask].min()) / (heightmap[mask].max() - heightmap[mask].min())
    
    return heightmap


def perlin_sphere_heightmap(width, height, radius=1.0, scale=1.0, octaves=6, 
                            persistence=0.5, lacunarity=2.0, seed=0):
    """Generate Perlin noise on the apparent disk of a sphere.
    
    Args:
        width, height: Dimensions of output image
        radius: Sphere radius
        scale: Noise scale factor
        octaves: Number of noise layers
        persistence: Amplitude multiplier per octave
        lacunarity: Frequency multiplier per octave
        seed: Random seed
    
    Returns:
        numpy array of shape (height, width) with values in [0, 1]
        Points outside sphere disk are set to 0
    """
    noise_gen = OpenSimplex(seed=seed)
    heightmap = np.zeros((height, width))
    
    center_x, center_y = width / 2, height / 2
    
    for y in range(height):
        for x in range(width):
            # Map pixel to [-1, 1] range
            px = (x - center_x) / (width / 2)
            py = (y - center_y) / (height / 2)
            
            # Check if point is inside the sphere's disk
            dist_sq = px**2 + py**2
            if dist_sq > 1.0:
                continue  # Outside sphere
            
            # Project onto sphere surface (3D coordinates)
            pz = np.sqrt(1.0 - dist_sq)
            
            # Sample 3D noise at sphere surface point
            noise_value = 0.0
            amplitude = 1.0
            frequency = 1.0
            
            for octave in range(octaves):
                sample_x = px * radius * frequency / scale
                sample_y = py * radius * frequency / scale
                sample_z = pz * radius * frequency / scale
                
                noise_value += noise_gen.noise3(sample_x, sample_y, sample_z) * amplitude
                
                amplitude *= persistence
                frequency *= lacunarity
            
            heightmap[y, x] = noise_value
    
    # Normalize non-zero values to [0, 1]
    mask = heightmap != 0
    if mask.any():
        heightmap[mask] = (heightmap[mask] - heightmap[mask].min()) / (heightmap[mask].max() - heightmap[mask].min())
    
    return heightmap


def simplex_sphere_heightmap(width, height, radius=1.0, scale=1.0, octaves=6, 
                             persistence=0.5, lacunarity=2.0, seed=0):
    """Generate Simplex noise on the apparent disk of a sphere.
    
    Args:
        width, height: Dimensions of output image
        radius: Sphere radius
        scale: Noise scale factor
        octaves: Number of noise layers
        persistence: Amplitude multiplier per octave
        lacunarity: Frequency multiplier per octave
        seed: Random seed
    
    Returns:
        numpy array of shape (height, width) with values in [0, 1]
        Points outside sphere disk are set to 0
    """
    noise_gen = OpenSimplex(seed=seed)
    heightmap = np.zeros((height, width))
    
    center_x, center_y = width / 2, height / 2
    
    for y in range(height):
        for x in range(width):
            # Map pixel to [-1, 1] range
            px = (x - center_x) / (width / 2)
            py = (y - center_y) / (height / 2)
            
            # Check if point is inside the sphere's disk
            dist_sq = px**2 + py**2
            if dist_sq > 1.0:
                continue  # Outside sphere
            
            # Project onto sphere surface (3D coordinates)
            pz = np.sqrt(1.0 - dist_sq)
            
            # Sample 3D simplex noise at sphere surface point
            noise_value = 0.0
            amplitude = 1.0
            frequency = 1.0
            
            for octave in range(octaves):
                sample_x = px * radius * frequency / scale
                sample_y = py * radius * frequency / scale
                sample_z = pz * radius * frequency / scale
                
                noise_value += noise_gen.noise3(sample_x, sample_y, sample_z) * amplitude
                
                amplitude *= persistence
                frequency *= lacunarity
            
            heightmap[y, x] = noise_value
            
    
    # Normalize non-zero values to [0, 1]
    mask = heightmap != 0
    if mask.any():
        heightmap[mask] = (heightmap[mask] - heightmap[mask].min()) / (heightmap[mask].max() - heightmap[mask].min())
    
    return heightmap


def combine_heightmaps(heightmap_1, heightmap_2, weight=0.0, scale=0.0):
    """Combine two heightmaps with weighted blending and elevation-dependent scaling.
    
    Args:
        heightmap_1: First heightmap array (values in [0, 1])
        heightmap_2: Second heightmap array (values in [0, 1])
        weight: Blend weight in [-1, 1]
                -1 = 100% heightmap_1
                 0 = 50/50 blend
                 1 = 100% heightmap_2
        scale: Elevation-dependent scaling factor in [0, 1]
               0 = heightmap_2 applied uniformly
               1 = heightmap_2 weight varies from 0% at Z=0 to 100% at Z=1
    
    Returns:
        Combined heightmap normalized to [0, 1]
    """
    assert heightmap_1.shape == heightmap_2.shape, "Heightmaps must have same dimensions"
    
    # Convert weight from [-1, 1] to blend factors
    # weight = -1: w1=1.0, w2=0.0
    # weight =  0: w1=0.5, w2=0.5
    # weight =  1: w1=0.0, w2=1.0
    w2_base = (weight + 1.0) / 2.0  # Maps [-1, 1] to [0, 1]
    w1_base = 1.0 - w2_base
    
    # Apply elevation-dependent scaling
    # scale = 0: no modification (uniform)
    # scale > 0: w2 increases with elevation of heightmap_1
    elevation_factor = scale * heightmap_1  # Range: [1, 1+scale]
    w2 = w2_base * elevation_factor
    
    # Normalize weights to sum to 1
    total_weight = w1_base + w2
    w1 = w1_base / total_weight
    w2 = w2 / total_weight
    
    # Combine heightmaps
    combined = w1 * heightmap_1 + w2 * heightmap_2
    
    # Normalize to [0, 1]
    mask = combined != 0
    if mask.any():
        combined[mask] = (combined[mask] - combined[mask].min()) / (combined[mask].max() - combined[mask].min())
    
    return combined


color_stops = [
    (0.0,  (0, 105, 148)),    # Deep water
    (0.3,  (8, 176, 222)),    # Shallow water
    (0.4,  (194, 178, 128)),  # Beach
    (0.5,  (34, 139, 34)),    # Grass
    (0.7,  (101, 67, 33)),    # Rock
    (0.85,  (169, 169, 169)), # Mountain
    (1.0,  (255, 255, 255))   # Snow
]


# Usage
seed = randint(0, 100000)
heightmap_perlin = perlin_sphere_heightmap(256, 256, radius=1.0, scale=.5, octaves=6, seed=seed)
# heightmap = voronoi_sphere_heightmap(512, 512, radius=1.0, points=180, scale=1.5, seed=42)
heightmap_simplex = simplex_sphere_heightmap(256, 256, radius=1.0, scale=.125, octaves=6, seed=seed)

combined = combine_heightmaps(heightmap_perlin, heightmap_simplex, weight=0, scale=0.5)

rgb_image = heightmap_to_rgb(combined, color_stops)
plt.imshow(rgb_image, origin='lower')
plt.axis('equal')
plt.show()