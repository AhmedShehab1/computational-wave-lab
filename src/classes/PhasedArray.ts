/**
 * PhasedArray.ts
 * 
 * Object-Oriented Phased Array class that encapsulates all beamforming logic.
 * All mathematical manipulations for the phased array are handled INSIDE this class.
 * 
 * This follows the OOP requirement: "No mathematical manipulation for the phased array
 * should be handled outside the phased array class!"
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type ArrayGeometry = 'linear' | 'curved';

export interface Position2D {
  x: number;
  y: number;
}

export interface ElementPosition extends Position2D {
  index: number;
  phaseOffset: number;
  amplitude: number;
}

export interface PhasedArrayConfig {
  id: string;
  name: string;
  position: Position2D;
  elements: number;
  pitch: number;              // Element spacing in meters
  geometry: ArrayGeometry;
  curvatureRadius: number;    // For curved arrays (meters), 0 = linear
  frequency: number;          // Operating frequency in Hz
  steeringAngle: number;      // Steering angle in degrees
  amplitudes?: number[];      // Per-element amplitude weights (0-1)
  enabled: boolean;
}

// ============================================================================
// PHYSICAL CONSTANTS
// ============================================================================

const SPEED_OF_SOUND: Record<string, number> = {
  air: 343,
  water: 1481,
  tissue: 1540,
};

// ============================================================================
// PHASED ARRAY CLASS
// ============================================================================

/**
 * PhasedArray - Encapsulates all beamforming math and logic.
 * 
 * This class handles:
 * - Element position calculations (linear and curved geometries)
 * - Phase offset computation for beam steering
 * - Array factor (gain pattern) computation
 * - Wavelength and wave number calculations
 */
export class PhasedArray {
  // ========================================================================
  // PRIVATE PROPERTIES
  // ========================================================================
  
  private _id: string;
  private _name: string;
  private _position: Position2D;
  private _elements: number;
  private _pitch: number;
  private _geometry: ArrayGeometry;
  private _curvatureRadius: number;
  private _frequency: number;
  private _steeringAngle: number;
  private _amplitudes: number[];
  private _enabled: boolean;
  private _medium: string;
  
  // Cached computations
  private _elementPositionsCache: ElementPosition[] | null = null;
  private _phaseOffsetsCache: number[] | null = null;
  private _lastSteeringAngle: number | null = null;
  
  // ========================================================================
  // CONSTRUCTOR
  // ========================================================================
  
  constructor(config: PhasedArrayConfig, medium: string = 'air') {
    this._id = config.id;
    this._name = config.name;
    this._position = { ...config.position };
    this._elements = Math.max(2, Math.min(256, config.elements));
    this._pitch = Math.max(0.001, config.pitch);
    this._geometry = config.geometry;
    this._curvatureRadius = Math.max(0, config.curvatureRadius);
    this._frequency = Math.max(100, config.frequency);
    this._steeringAngle = config.steeringAngle;
    this._amplitudes = config.amplitudes?.slice() || new Array(this._elements).fill(1);
    this._enabled = config.enabled;
    this._medium = medium;
    
    // Ensure amplitudes array matches element count
    if (this._amplitudes.length !== this._elements) {
      this._amplitudes = new Array(this._elements).fill(1);
    }
  }
  
  // ========================================================================
  // GETTERS (Read-only access to properties)
  // ========================================================================
  
  get id(): string { return this._id; }
  get name(): string { return this._name; }
  get position(): Position2D { return { ...this._position }; }
  get elements(): number { return this._elements; }
  get pitch(): number { return this._pitch; }
  get geometry(): ArrayGeometry { return this._geometry; }
  get curvatureRadius(): number { return this._curvatureRadius; }
  get frequency(): number { return this._frequency; }
  get steeringAngle(): number { return this._steeringAngle; }
  get amplitudes(): number[] { return [...this._amplitudes]; }
  get enabled(): boolean { return this._enabled; }
  
  // ========================================================================
  // COMPUTED PROPERTIES (Derived from state)
  // ========================================================================
  
  /**
   * Get the speed of sound in the current medium (m/s)
   */
  get speedOfSound(): number {
    return SPEED_OF_SOUND[this._medium] || SPEED_OF_SOUND.air;
  }
  
  /**
   * Calculate wavelength: λ = c / f
   */
  get wavelength(): number {
    return this.speedOfSound / this._frequency;
  }
  
  /**
   * Calculate wave number: k = 2π / λ
   */
  get waveNumber(): number {
    return (2 * Math.PI) / this.wavelength;
  }
  
  /**
   * Calculate total array aperture (physical width)
   */
  get aperture(): number {
    return (this._elements - 1) * this._pitch;
  }
  
  /**
   * Get pitch as a fraction of wavelength (d/λ)
   */
  get pitchLambdaRatio(): number {
    return this._pitch / this.wavelength;
  }
  
  // ========================================================================
  // SETTERS (With cache invalidation)
  // ========================================================================
  
  set steeringAngle(angle: number) {
    if (this._steeringAngle !== angle) {
      this._steeringAngle = angle;
      this._phaseOffsetsCache = null;
    }
  }
  
  set frequency(freq: number) {
    if (this._frequency !== freq) {
      this._frequency = Math.max(100, freq);
      this._phaseOffsetsCache = null;
    }
  }
  
  set elements(count: number) {
    const newCount = Math.max(2, Math.min(256, count));
    if (this._elements !== newCount) {
      this._elements = newCount;
      this._amplitudes = new Array(newCount).fill(1);
      this._elementPositionsCache = null;
      this._phaseOffsetsCache = null;
    }
  }
  
  set pitch(spacing: number) {
    if (this._pitch !== spacing) {
      this._pitch = Math.max(0.001, spacing);
      this._elementPositionsCache = null;
      this._phaseOffsetsCache = null;
    }
  }
  
  set geometry(geo: ArrayGeometry) {
    if (this._geometry !== geo) {
      this._geometry = geo;
      this._elementPositionsCache = null;
      this._phaseOffsetsCache = null;
    }
  }
  
  set curvatureRadius(radius: number) {
    if (this._curvatureRadius !== radius) {
      this._curvatureRadius = Math.max(0, radius);
      this._elementPositionsCache = null;
      this._phaseOffsetsCache = null;
    }
  }
  
  setMedium(medium: string): void {
    if (this._medium !== medium) {
      this._medium = medium;
      this._phaseOffsetsCache = null;
    }
  }
  
  // ========================================================================
  // CORE METHODS - Element Positions
  // ========================================================================
  
  /**
   * Calculate the physical positions of all array elements.
   * Supports both linear and curved (arc) geometries.
   * 
   * @returns Array of element positions with phase offsets and amplitudes
   */
  getElementPositions(): ElementPosition[] {
    // Return cached result if available
    if (this._elementPositionsCache) {
      return this._elementPositionsCache;
    }
    
    const positions: ElementPosition[] = [];
    const phaseOffsets = this.computePhaseOffsets();
    
    if (this._geometry === 'linear') {
      // Linear array: elements along x-axis centered at position
      const arrayWidth = this.aperture;
      const startX = this._position.x - arrayWidth / 2;
      
      for (let i = 0; i < this._elements; i++) {
        positions.push({
          index: i,
          x: startX + i * this._pitch,
          y: this._position.y,
          phaseOffset: phaseOffsets[i],
          amplitude: this._amplitudes[i],
        });
      }
    } else {
      // Curved array: elements along an arc
      // If curvatureRadius is 0, default to aperture-based radius
      const radius = this._curvatureRadius > 0 
        ? this._curvatureRadius 
        : this.aperture / 2;
      
      // Arc angle subtended by the array
      const totalArcLength = this.aperture;
      const arcAngle = totalArcLength / radius; // θ = s/r
      const startAngle = -arcAngle / 2 - Math.PI / 2; // Center the arc, pointing up
      
      for (let i = 0; i < this._elements; i++) {
        const fraction = this._elements > 1 ? i / (this._elements - 1) : 0.5;
        const angle = startAngle + fraction * arcAngle;
        
        positions.push({
          index: i,
          x: this._position.x + radius * Math.cos(angle),
          y: this._position.y + radius * Math.sin(angle) + radius, // Offset so center is at position
          phaseOffset: phaseOffsets[i],
          amplitude: this._amplitudes[i],
        });
      }
    }
    
    // Cache the result
    this._elementPositionsCache = positions;
    return positions;
  }
  
  // ========================================================================
  // CORE METHODS - Phase Offsets
  // ========================================================================
  
  /**
   * Compute the phase offsets required to steer the beam to the current steering angle.
   * 
   * Formula: φ_n = -k * d * n * sin(θ₀)
   * where:
   *   k = 2π/λ (wave number)
   *   d = element spacing (pitch)
   *   n = element index
   *   θ₀ = steering angle
   * 
   * @returns Array of phase offsets in radians
   */
  computePhaseOffsets(): number[] {
    // Return cached result if steering angle hasn't changed
    if (this._phaseOffsetsCache && this._lastSteeringAngle === this._steeringAngle) {
      return this._phaseOffsetsCache;
    }
    
    const k = this.waveNumber;
    const d = this._pitch;
    const theta0 = (this._steeringAngle * Math.PI) / 180; // Convert to radians
    
    const offsets: number[] = [];
    
    for (let n = 0; n < this._elements; n++) {
      // Progressive phase shift: φ_n = -k * d * n * sin(θ₀)
      const phase = -k * d * n * Math.sin(theta0);
      offsets.push(phase);
    }
    
    // Cache the result
    this._phaseOffsetsCache = offsets;
    this._lastSteeringAngle = this._steeringAngle;
    
    return offsets;
  }
  
  // ========================================================================
  // CORE METHODS - Array Factor
  // ========================================================================
  
  /**
   * Compute the array factor (normalized gain) at a specific angle.
   * 
   * Formula: AF(θ) = |sin(N·ψ/2) / (N·sin(ψ/2))|
   * where: ψ = k·d·(sin(θ) - sin(θ₀))
   * 
   * This is the theoretical beam pattern for a uniform linear array (ULA).
   * 
   * @param thetaDeg - Observation angle in degrees
   * @returns Normalized array factor (0 to 1)
   */
  computeArrayFactor(thetaDeg: number): number {
    const theta = (thetaDeg * Math.PI) / 180;
    const theta0 = (this._steeringAngle * Math.PI) / 180;
    const k = this.waveNumber;
    const d = this._pitch;
    const N = this._elements;
    
    // Phase difference: ψ = k·d·(sin(θ) - sin(θ₀))
    const psi = k * d * (Math.sin(theta) - Math.sin(theta0));
    
    // Array factor: |sin(N·ψ/2) / (N·sin(ψ/2))|
    const halfPsiN = (N * psi) / 2;
    const halfPsi = psi / 2;
    
    // Handle singularity at ψ = 0 (main lobe direction)
    if (Math.abs(halfPsi) < 1e-10) {
      return 1.0;
    }
    
    const numerator = Math.sin(halfPsiN);
    const denominator = N * Math.sin(halfPsi);
    
    return Math.abs(numerator / denominator);
  }
  
  /**
   * Compute the array factor in dB.
   * 
   * @param thetaDeg - Observation angle in degrees
   * @param minDb - Minimum dB value (floor)
   * @returns Array factor in dB
   */
  computeArrayFactorDb(thetaDeg: number, minDb: number = -40): number {
    const af = this.computeArrayFactor(thetaDeg);
    if (af <= 0) return minDb;
    const db = 20 * Math.log10(af);
    return Math.max(minDb, db);
  }
  
  /**
   * Generate the complete beam pattern across all angles.
   * 
   * @param angleResolution - Angular step in degrees (default 1°)
   * @returns Array of { angle, magnitude, dB } for each angle
   */
  generateBeamPattern(angleResolution: number = 1): Array<{ angle: number; magnitude: number; dB: number }> {
    const pattern: Array<{ angle: number; magnitude: number; dB: number }> = [];
    
    for (let angle = -180; angle <= 180; angle += angleResolution) {
      const magnitude = this.computeArrayFactor(angle);
      const dB = this.computeArrayFactorDb(angle);
      pattern.push({ angle, magnitude, dB });
    }
    
    return pattern;
  }
  
  // ========================================================================
  // CORE METHODS - Field Computation
  // ========================================================================
  
  /**
   * Compute the complex field contribution at a point (x, y).
   * Used for interference pattern calculation.
   * 
   * @param x - X coordinate in meters
   * @param y - Y coordinate in meters
   * @returns Complex field { real, imag }
   */
  computeFieldAt(x: number, y: number): { real: number; imag: number } {
    const elements = this.getElementPositions();
    const k = this.waveNumber;
    
    let realSum = 0;
    let imagSum = 0;
    
    for (const element of elements) {
      // Distance from point to this element
      const dx = x - element.x;
      const dy = y - element.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Phase: k * distance + element phase offset
      const phase = k * distance + element.phaseOffset;
      
      // Add phasor: A * e^(j*phase)
      realSum += element.amplitude * Math.cos(phase);
      imagSum += element.amplitude * Math.sin(phase);
    }
    
    return { real: realSum, imag: imagSum };
  }
  
  /**
   * Compute the intensity (magnitude squared) at a point.
   * 
   * @param x - X coordinate in meters
   * @param y - Y coordinate in meters
   * @returns Intensity value
   */
  computeIntensityAt(x: number, y: number): number {
    const field = this.computeFieldAt(x, y);
    return field.real * field.real + field.imag * field.imag;
  }
  
  // ========================================================================
  // UTILITY METHODS
  // ========================================================================
  
  /**
   * Export the current configuration as a serializable object.
   * Use this to store in Zustand/Redux.
   */
  toConfig(): PhasedArrayConfig {
    return {
      id: this._id,
      name: this._name,
      position: { ...this._position },
      elements: this._elements,
      pitch: this._pitch,
      geometry: this._geometry,
      curvatureRadius: this._curvatureRadius,
      frequency: this._frequency,
      steeringAngle: this._steeringAngle,
      amplitudes: [...this._amplitudes],
      enabled: this._enabled,
    };
  }
  
  /**
   * Create a PhasedArray instance from a config object.
   * Factory method for instantiation from stored configs.
   */
  static fromConfig(config: PhasedArrayConfig, medium: string = 'air'): PhasedArray {
    return new PhasedArray(config, medium);
  }
  
  /**
   * Create a default configuration.
   */
  static createDefaultConfig(id: string = 'default'): PhasedArrayConfig {
    return {
      id,
      name: 'Array 1',
      position: { x: 0, y: 0 },
      elements: 8,
      pitch: 0.0172, // ~λ/2 at 10kHz in air
      geometry: 'linear',
      curvatureRadius: 0,
      frequency: 10000,
      steeringAngle: 0,
      amplitudes: new Array(8).fill(1),
      enabled: true,
    };
  }
  
  /**
   * Clear all cached computations.
   */
  clearCache(): void {
    this._elementPositionsCache = null;
    this._phaseOffsetsCache = null;
    this._lastSteeringAngle = null;
  }
}

export default PhasedArray;
