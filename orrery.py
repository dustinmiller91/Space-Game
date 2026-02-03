import numpy as np
from enum import Enum
from typing import List, Optional

class SequenceType(Enum):
    O = "O"  # Blue, very hot
    B = "B"  # Blue-white, hot
    A = "A"  # White
    F = "F"  # Yellow-white
    G = "G"  # Yellow (like our Sun)
    K = "K"  # Orange
    M = "M"  # Red, cool

class Star:
    def __init__(self, sequence_type: SequenceType):
        self.sequence_type = sequence_type
        self.mass = self._generate_mass()
        self.luminosity = self._generate_luminosity()
        self.temperature = self._generate_temperature()
        self.radius = self._generate_radius()

    def __repr__(self) -> str:        
        return (f"Star(type={self.sequence_type.value}, "
                f"mass={self.mass:.2f}M☉, "
                f"luminosity={self.luminosity:.2f}L☉, "
                f"temp={self.temperature:.0f}K)")

    def _generate_mass(self) -> float:
        """Mass in solar masses"""
        base_masses = {
            SequenceType.O: 40, SequenceType.B: 10, SequenceType.A: 2.5,
            SequenceType.F: 1.5, SequenceType.G: 1.0, SequenceType.K: 0.7,
            SequenceType.M: 0.3
        }
        base = base_masses[self.sequence_type]
        return max(0.08, np.random.normal(base, base * 0.15))
    
    def _generate_luminosity(self) -> float:
        """Luminosity in solar luminosities (rough mass-luminosity relation)"""
        # L ≈ M^3.5 for main sequence
        return self.mass ** 3.5
    
    def _generate_temperature(self) -> float:
        """Surface temperature in Kelvin"""
        base_temps = {
            SequenceType.O: 40000, SequenceType.B: 20000, SequenceType.A: 9000,
            SequenceType.F: 7000, SequenceType.G: 5500, SequenceType.K: 4500,
            SequenceType.M: 3000
        }
        base = base_temps[self.sequence_type]
        return max(2000, np.random.normal(base, base * 0.1))
    
    def _generate_radius(self) -> float:
        """Radius in solar radii"""
        # Rough approximation based on mass
        return self.mass ** 0.8
    
    def habitable_zone(self) -> tuple[float, float]:
        """Returns inner and outer bounds of habitable zone in AU"""
        # Simple approximation: HZ scales with sqrt(luminosity)
        inner = 0.95 * np.sqrt(self.luminosity)
        outer = 1.37 * np.sqrt(self.luminosity)
        return (inner, outer)

class PlanetCategory(Enum):
    TERRESTRIAL = "terrestrial"
    GAS_GIANT = "gas_giant"
    ICE_GIANT = "ice_giant"
    DWARF = "dwarf"

class AtmosphereType(Enum):
    NONE = "none"
    THIN = "thin"
    BREATHABLE = "breathable"
    TOXIC = "toxic"
    DENSE = "dense"

class Planet:
    def __init__(self, parent_star: Star, orbital_distance: Optional[float] = None):
        self.parent_star = parent_star
        self.orbital_distance = orbital_distance or self._generate_orbital_distance()
        self.category = self._determine_category()
        self.mass = self._generate_mass()
        self.radius = self._generate_radius()
        self.atmosphere = self._determine_atmosphere()

    def __repr__(self) -> str:
        return (f"Planet({self.category.value}, "
                f"{self.mass:.2f}M⊕, "
                f"{self.radius:.2f}R⊕, "
                f"{self.orbital_distance:.2f}AU, "
                f"atmosphere={self.atmosphere.value})")

    def _generate_orbital_distance(self) -> float:
        """Distance from parent star in AU"""
        # Log-normal distribution for realistic orbital spacing
        return np.random.lognormal(mean=0.5, sigma=1.2)
    
    def _determine_category(self) -> PlanetCategory:
        """Category depends on distance from star and temperature"""
        hz_inner, hz_outer = self.parent_star.habitable_zone()
        
        # Frost line roughly at 4-5 AU for Sun-like star, scales with luminosity
        frost_line = 4.0 * np.sqrt(self.parent_star.luminosity)
        
        if self.orbital_distance < frost_line * 0.3:
            # Close to star: mostly terrestrial or dwarf
            return np.random.choice(
                [PlanetCategory.TERRESTRIAL, PlanetCategory.DWARF],
                p=[0.8, 0.2]
            )
        elif self.orbital_distance < frost_line:
            # Warm region: terrestrial planets dominate
            return np.random.choice(
                [PlanetCategory.TERRESTRIAL, PlanetCategory.DWARF],
                p=[0.7, 0.3]
            )
        else:
            # Beyond frost line: gas and ice giants
            return np.random.choice(
                [PlanetCategory.GAS_GIANT, PlanetCategory.ICE_GIANT, PlanetCategory.TERRESTRIAL],
                p=[0.5, 0.4, 0.1]
            )
    
    def _generate_mass(self) -> float:
        """Mass in Earth masses"""
        base_masses = {
            PlanetCategory.DWARF: 0.1,
            PlanetCategory.TERRESTRIAL: 1.0,
            PlanetCategory.ICE_GIANT: 15,
            PlanetCategory.GAS_GIANT: 150
        }
        base = base_masses[self.category]
        return max(0.01, np.random.normal(base, base * 0.4))
    
    def _generate_radius(self) -> float:
        """Radius in Earth radii"""
        base_radii = {
            PlanetCategory.DWARF: 0.4,
            PlanetCategory.TERRESTRIAL: 1.0,
            PlanetCategory.ICE_GIANT: 3.5,
            PlanetCategory.GAS_GIANT: 10
        }
        base = base_radii[self.category]
        return max(0.1, np.random.normal(base, base * 0.25))
    
    def _determine_atmosphere(self) -> AtmosphereType:
        """Atmosphere depends on category, mass, and proximity to habitable zone"""
        hz_inner, hz_outer = self.parent_star.habitable_zone()
        in_hz = hz_inner <= self.orbital_distance <= hz_outer
        
        if self.category == PlanetCategory.DWARF:
            return AtmosphereType.NONE if self.mass < 0.15 else AtmosphereType.THIN
        
        elif self.category == PlanetCategory.TERRESTRIAL:
            if self.mass < 0.3:
                return AtmosphereType.THIN
            elif in_hz and 0.5 <= self.mass <= 2.0:
                # Goldilocks conditions for breathable atmosphere
                return np.random.choice(
                    [AtmosphereType.BREATHABLE, AtmosphereType.TOXIC, AtmosphereType.THIN],
                    p=[0.3, 0.5, 0.2]
                )
            elif self.orbital_distance < hz_inner:
                # Too hot: dense/toxic atmosphere likely
                return np.random.choice(
                    [AtmosphereType.TOXIC, AtmosphereType.DENSE],
                    p=[0.6, 0.4]
                )
            else:
                return AtmosphereType.TOXIC if np.random.random() > 0.3 else AtmosphereType.THIN
        
        else:  # Gas/Ice giants
            return AtmosphereType.DENSE

class System:
    def __init__(self, num_stars: int = 1):
        self.stars = self._generate_stars(num_stars)
        self.planets = []

    def __repr__(self) -> str:
        star_summary = f"{len(self.stars)}-star system"
        planet_count = len(self.planets)
        return f"System({star_summary}, {planet_count} planets)"
        
    def _generate_stars(self, num_stars: int) -> List[Star]:
        """Generate stars based on realistic distribution"""
        stars = []
        
        # Sequence type probabilities (M-type most common)
        # These must sum to 1.0
        sequence_probs = {
            SequenceType.O: 0.00003,
            SequenceType.B: 0.0013,
            SequenceType.A: 0.006,
            SequenceType.F: 0.03,
            SequenceType.G: 0.076,
            SequenceType.K: 0.121,
            SequenceType.M: 0.76567  # Adjusted to make total = 1.0
        }
        
        for _ in range(num_stars):
            sequence = np.random.choice(
                list(sequence_probs.keys()),
                p=list(sequence_probs.values())
            )
            stars.append(Star(sequence))
        
        return stars    
    

    def add_planet(self, parent_star: Optional[Star] = None, 
                orbital_distance: Optional[float] = None):
        """Add a planet orbiting one of the system's stars"""
        if parent_star is None:
            parent_star = np.random.choice(self.stars)
        
        planet = Planet(parent_star, orbital_distance)
        self.planets.append(planet)
        self.planets.sort(key=lambda p: p.orbital_distance)  # Keep sorted
        return planet


    def generate_planets(self, num_planets: int):
        """Generate multiple planets in the system"""
        for _ in range(num_planets):
            self.add_planet()
    
    @classmethod
    def random(cls, star_count_probs: dict = None) -> 'System':
        """Generate a random system"""
        if star_count_probs is None:
            star_count_probs = {1: 0.7, 2: 0.25, 3: 0.05}
        
        num_stars = np.random.choice(
            list(star_count_probs.keys()),
            p=list(star_count_probs.values())
        )
        
        system = cls(num_stars)
        num_planets = np.random.randint(0, 15)
        system.generate_planets(num_planets)
        
        return system
    

# Random system
sys = System.random()
for star in sys.stars:
    print(star)
print()

for planet in sys.planets:
    print(planet)


# # Or build manually
# system = System(num_stars=2)
# system.generate_planets(8)