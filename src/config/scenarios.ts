/**
 * scenarios.ts
 * 
 * Preset configurations for common beamforming scenarios.
 * Each scenario defines one or more PhasedArrayConfig units plus global settings.
 */

import type { PhasedArrayConfig, ArrayGeometry } from '@/classes/PhasedArray';
import type { Medium } from '@/state/beamStore';

// ============================================================================
// SCENARIO TYPE
// ============================================================================

export interface ScenarioConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  medium: Medium;
  units: PhasedArrayConfig[];
}

// ============================================================================
// HELPER: Generate unique IDs
// ============================================================================

const generateId = (prefix: string): string => 
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ============================================================================
// SCENARIO 1: 5G BEAMFORMING
// ============================================================================

/**
 * 5G Beamforming Scenario
 * - High frequency (28 GHz scaled down for visualization)
 * - Linear array with 16-32 elements
 * - Targeted steering at 45°
 * - Used in 5G mmWave base stations
 */
export const create5GBeamformingScenario = (): ScenarioConfig => ({
  id: '5g-beamforming',
  name: '5G Beamforming',
  description: 'High-frequency mmWave linear array with targeted steering for 5G base stations',
  icon: '📡',
  medium: 'air',
  units: [
    {
      id: generateId('5g'),
      name: '5G Array',
      position: { x: 0, y: 0 },
      elements: 16,
      pitch: 0.00535,  // ~λ/2 at 32kHz (scaled from 28GHz for visualization)
      geometry: 'linear' as ArrayGeometry,
      curvatureRadius: 0,
      frequency: 32000,  // 32 kHz (scaled representation of 28 GHz)
      steeringAngle: 45,
      amplitudes: new Array(16).fill(1),
      enabled: true,
    },
  ],
});

// ============================================================================
// SCENARIO 2: ULTRASOUND IMAGING
// ============================================================================

/**
 * Ultrasound Imaging Scenario
 * - Medium frequency (5 MHz scaled for visualization)
 * - Curved/Convex array (like medical ultrasound probes)
 * - Focus distance set for near-field imaging
 * - Used in medical diagnostics
 */
export const createUltrasoundImagingScenario = (): ScenarioConfig => ({
  id: 'ultrasound-imaging',
  name: 'Ultrasound Imaging',
  description: 'Curved convex probe array for medical ultrasound imaging',
  icon: '🏥',
  medium: 'tissue',
  units: [
    {
      id: generateId('us'),
      name: 'Convex Probe',
      position: { x: 0, y: -0.3 },
      elements: 64,
      pitch: 0.000308,  // ~λ/2 at ~2.5MHz in tissue
      geometry: 'curved' as ArrayGeometry,
      curvatureRadius: 0.06,  // 60mm radius (typical convex probe)
      frequency: 2500,  // 2.5 kHz (scaled representation of 2.5 MHz)
      steeringAngle: 0,
      amplitudes: new Array(64).fill(1),
      enabled: true,
    },
  ],
});

// ============================================================================
// SCENARIO 3: TUMOR ABLATION (HIFU)
// ============================================================================

/**
 * Tumor Ablation Scenario (High-Intensity Focused Ultrasound)
 * - Two separate arrays positioned at different angles
 * - Both focused on the same central point (tumor location)
 * - Maximizes energy at the focal point while sparing surface tissue
 * - Used in non-invasive cancer treatment
 */
export const createTumorAblationScenario = (): ScenarioConfig => ({
  id: 'tumor-ablation',
  name: 'Tumor Ablation',
  description: 'Two-array HIFU setup with converging beams for focused tissue ablation',
  icon: '🎯',
  medium: 'tissue',
  units: [
    {
      id: generateId('hifu-a'),
      name: 'Array A (Left)',
      position: { x: -0.4, y: -0.3 },
      elements: 32,
      pitch: 0.000385,  // ~λ/2 at 2MHz in tissue
      geometry: 'curved' as ArrayGeometry,
      curvatureRadius: 0.08,  // 80mm radius
      frequency: 2000,  // 2 kHz (scaled representation of 2 MHz)
      steeringAngle: 45,  // Steered toward center
      amplitudes: new Array(32).fill(1),
      enabled: true,
    },
    {
      id: generateId('hifu-b'),
      name: 'Array B (Right)',
      position: { x: 0.4, y: -0.3 },
      elements: 32,
      pitch: 0.000385,  // ~λ/2 at 2MHz in tissue
      geometry: 'curved' as ArrayGeometry,
      curvatureRadius: 0.08,  // 80mm radius
      frequency: 2000,  // 2 kHz (scaled representation of 2 MHz)
      steeringAngle: -45,  // Steered toward center
      amplitudes: new Array(32).fill(1),
      enabled: true,
    },
  ],
});

// ============================================================================
// SCENARIO REGISTRY
// ============================================================================

export const SCENARIOS: Record<string, () => ScenarioConfig> = {
  '5g-beamforming': create5GBeamformingScenario,
  'ultrasound-imaging': createUltrasoundImagingScenario,
  'tumor-ablation': createTumorAblationScenario,
};

export const SCENARIO_LIST = [
  { id: '5g-beamforming', name: '5G Beamforming', icon: '📡' },
  { id: 'ultrasound-imaging', name: 'Ultrasound Imaging', icon: '🏥' },
  { id: 'tumor-ablation', name: 'Tumor Ablation', icon: '🎯' },
] as const;

/**
 * Load a scenario configuration by ID
 */
export const loadScenario = (id: string): ScenarioConfig | null => {
  const factory = SCENARIOS[id];
  return factory ? factory() : null;
};

export default SCENARIOS;
