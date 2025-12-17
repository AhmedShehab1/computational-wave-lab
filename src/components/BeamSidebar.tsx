import React, { useCallback, useState } from 'react';
import { useBeamStore, type Medium, type ArrayGeometry } from '@/state/beamStore';
import { loadScenario, SCENARIO_LIST } from '@/config/scenarios';
import './BeamSidebar.css';

// ============================================================================
// COLLAPSIBLE SECTION COMPONENT
// ============================================================================

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ 
  title, 
  defaultOpen = true, 
  children 
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className={`beam-section ${isOpen ? 'open' : 'collapsed'}`}>
      <button 
        className="section-header" 
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="section-title">{title}</span>
        <span className="section-chevron">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && <div className="section-content">{children}</div>}
    </div>
  );
};

// ============================================================================
// SLIDER WITH LABEL COMPONENT
// ============================================================================

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
  showTicks?: boolean;
}

const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  formatValue,
  showTicks = false,
}) => {
  const displayValue = formatValue ? formatValue(value) : `${value}${unit}`;
  const percentage = ((value - min) / (max - min)) * 100;
  
  return (
    <div className="slider-control">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{displayValue}</span>
      </div>
      <div className="slider-track-container">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="slider-input"
          style={{ '--fill-percent': `${percentage}%` } as React.CSSProperties}
        />
        {showTicks && (
          <div className="slider-ticks">
            <span>{min}{unit}</span>
            <span>{max}{unit}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// STEERING ANGLE CONTROL (LARGE DIAL-STYLE)
// ============================================================================

interface SteeringControlProps {
  angle: number;
  onChange: (angle: number) => void;
}

const SteeringControl: React.FC<SteeringControlProps> = ({ angle, onChange }) => {
  const normalizedAngle = ((angle + 180) / 360) * 100;
  
  return (
    <div className="steering-control">
      <div className="steering-header">
        <span className="steering-label">θ Steering Angle</span>
        <span className="steering-value">{angle.toFixed(0)}°</span>
      </div>
      <div className="steering-dial-container">
        <div className="steering-dial">
          {/* Angle markers */}
          <div className="dial-marker" style={{ transform: 'rotate(-90deg)' }}>
            <span>-90°</span>
          </div>
          <div className="dial-marker" style={{ transform: 'rotate(0deg)' }}>
            <span>0°</span>
          </div>
          <div className="dial-marker" style={{ transform: 'rotate(90deg)' }}>
            <span>+90°</span>
          </div>
          
          {/* Dial indicator */}
          <div 
            className="dial-needle"
            style={{ transform: `rotate(${angle}deg)` }}
          />
          <div className="dial-center" />
        </div>
      </div>
      <input
        type="range"
        min={-180}
        max={180}
        step={1}
        value={angle}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="steering-slider"
        style={{ '--fill-percent': `${normalizedAngle}%` } as React.CSSProperties}
      />
      <div className="steering-ticks">
        <span>-180°</span>
        <span>-90°</span>
        <span>0°</span>
        <span>+90°</span>
        <span>+180°</span>
      </div>
    </div>
  );
};

// ============================================================================
// TOGGLE BUTTON GROUP
// ============================================================================

interface ToggleGroupProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

function ToggleGroup<T extends string>({ options, value, onChange }: ToggleGroupProps<T>) {
  return (
    <div className="toggle-group">
      {options.map((option) => (
        <button
          key={option.value}
          className={`toggle-btn ${value === option.value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// WEIGHTS VISUALIZATION BAR CHART
// ============================================================================

interface WeightsVisualizationProps {
  weights: number[];
}

const WeightsVisualization: React.FC<WeightsVisualizationProps> = ({ weights }) => {
  const maxWeight = Math.max(...weights, 1);
  
  return (
    <div className="weights-viz">
      <div className="weights-bars">
        {weights.map((w, i) => (
          <div 
            key={i}
            className="weight-bar"
            style={{ height: `${(w / maxWeight) * 100}%` }}
            title={`Element ${i + 1}: ${w.toFixed(2)}`}
          />
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN BEAM SIDEBAR COMPONENT
// ============================================================================

export const BeamSidebar: React.FC = () => {
  const {
    // Multi-Array State
    units,
    activeUnitId,
    
    // Global State
    medium,
    algorithm,
    weightType,
    weights,
    isPlaying,
    scanSpeed,
    interferenceCancel,
    wavelength,
    speedOfSound,
    
    // Unit Management Actions
    addUnit,
    removeUnit,
    setActiveUnit,
    updateUnit,
    loadScenarioConfig,
    
    // Global Actions
    setMedium,
    setAlgorithm,
    setWeightType,
    togglePlayPause,
    setScanSpeed,
    setInterferenceCancel,
    triggerScan,
    resetSimulation,
  } = useBeamStore();

  // Get active unit
  const activeUnit = units.find(u => u.id === activeUnitId);
  
  // ============================================================================
  // HANDLERS FOR ACTIVE UNIT
  // ============================================================================
  
  const handleSteeringAngleChange = useCallback((angle: number) => {
    if (activeUnit) {
      updateUnit(activeUnit.id, { steeringAngle: angle });
    }
  }, [activeUnit, updateUnit]);

  const handleFrequencyChange = useCallback((value: number) => {
    if (activeUnit) {
      // Recalculate pitch to maintain λ/2 spacing
      const newWavelength = speedOfSound / value;
      const currentSpacingRatio = activeUnit.pitch / (speedOfSound / activeUnit.frequency);
      const newPitch = newWavelength * currentSpacingRatio;
      updateUnit(activeUnit.id, { frequency: value, pitch: newPitch });
    }
  }, [activeUnit, updateUnit, speedOfSound]);

  const handleSensorCountChange = useCallback((value: number) => {
    if (activeUnit) {
      const count = Math.round(value);
      updateUnit(activeUnit.id, { 
        elements: count,
        amplitudes: new Array(count).fill(1)
      });
    }
  }, [activeUnit, updateUnit]);

  const handleSpacingChange = useCallback((fraction: number) => {
    if (activeUnit) {
      const currentWavelength = speedOfSound / activeUnit.frequency;
      const newPitch = currentWavelength * fraction;
      updateUnit(activeUnit.id, { pitch: newPitch });
    }
  }, [activeUnit, updateUnit, speedOfSound]);

  const handleGeometryChange = useCallback((geometry: ArrayGeometry) => {
    if (activeUnit) {
      updateUnit(activeUnit.id, { 
        geometry,
        // Set default curvature for curved arrays
        curvatureRadius: geometry === 'curved' ? 0.1 : 0
      });
    }
  }, [activeUnit, updateUnit]);

  const handleCurvatureRadiusChange = useCallback((radius: number) => {
    if (activeUnit) {
      updateUnit(activeUnit.id, { curvatureRadius: radius });
    }
  }, [activeUnit, updateUnit]);

  const handlePositionXChange = useCallback((x: number) => {
    if (activeUnit) {
      updateUnit(activeUnit.id, { position: { ...activeUnit.position, x } });
    }
  }, [activeUnit, updateUnit]);

  const handlePositionYChange = useCallback((y: number) => {
    if (activeUnit) {
      updateUnit(activeUnit.id, { position: { ...activeUnit.position, y } });
    }
  }, [activeUnit, updateUnit]);

  const handleAddUnit = useCallback(() => {
    addUnit();
  }, [addUnit]);

  const handleRemoveUnit = useCallback((id: string) => {
    if (units.length > 1) {
      removeUnit(id);
    }
  }, [units.length, removeUnit]);

  const handleLoadScenario = useCallback((scenarioId: string) => {
    const scenario = loadScenario(scenarioId);
    if (scenario) {
      loadScenarioConfig(scenario.units, scenario.medium);
    }
  }, [loadScenarioConfig]);

  // ============================================================================
  // FORMATTERS
  // ============================================================================

  const formatFrequency = useCallback((value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)} MHz`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)} kHz`;
    return `${value} Hz`;
  }, []);

  const formatSpacing = useCallback((fraction: number) => {
    if (Math.abs(fraction - 0.5) < 0.01) return 'λ/2';
    if (Math.abs(fraction - 0.25) < 0.01) return 'λ/4';
    if (Math.abs(fraction - 1) < 0.01) return 'λ';
    return `${fraction.toFixed(2)}λ`;
  }, []);

  // Compute spacing ratio from active unit
  const spacingLambdaFraction = activeUnit 
    ? activeUnit.pitch / (speedOfSound / activeUnit.frequency)
    : 0.5;

  return (
    <div className="beam-sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <h2>BEAMFORMING CONTROL</h2>
      </div>

      {/* Scrollable Content */}
      <div className="sidebar-scroll">
        {/* Section: Scenarios */}
        <CollapsibleSection title="📋 Scenarios" defaultOpen={true}>
          <div className="scenario-buttons">
            {SCENARIO_LIST.map((scenario) => (
              <button
                key={scenario.id}
                className="scenario-btn"
                onClick={() => handleLoadScenario(scenario.id)}
              >
                <span className="scenario-icon">{scenario.icon}</span>
                <span className="scenario-name">{scenario.name}</span>
              </button>
            ))}
          </div>
        </CollapsibleSection>

        {/* Section: Unit Selector */}
        <CollapsibleSection title="📡 Array Units" defaultOpen={true}>
          <div className="unit-selector">
            <div className="unit-tabs">
              {units.map((unit, index) => (
                <button
                  key={unit.id}
                  className={`unit-tab ${unit.id === activeUnitId ? 'active' : ''}`}
                  onClick={() => setActiveUnit(unit.id)}
                >
                  <span className="unit-letter">{String.fromCharCode(65 + index)}</span>
                  <span className="unit-name">{unit.name}</span>
                  {units.length > 1 && (
                    <span 
                      className="unit-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveUnit(unit.id);
                      }}
                    >
                      ×
                    </span>
                  )}
                </button>
              ))}
              <button className="unit-tab add-unit" onClick={handleAddUnit}>
                <span>+</span>
                <span>Add</span>
              </button>
            </div>
            <div className="unit-info">
              <span className="unit-count">{units.length} array{units.length > 1 ? 's' : ''} active</span>
            </div>
          </div>
        </CollapsibleSection>

        {/* Section: Delays & Phases (Main steering control) */}
        <CollapsibleSection title="🎯 Steering" defaultOpen={true}>
          <SteeringControl 
            angle={activeUnit?.steeringAngle ?? 0} 
            onChange={handleSteeringAngleChange} 
          />
        </CollapsibleSection>

        {/* Section: Frequencies */}
        <CollapsibleSection title="📊 Frequencies" defaultOpen={true}>
          <SliderControl
            label="Carrier Frequency"
            value={activeUnit?.frequency ?? 1000}
            min={100}
            max={100000}
            step={100}
            onChange={handleFrequencyChange}
            formatValue={formatFrequency}
          />
          <div className="info-row">
            <span className="info-label">Wavelength (λ)</span>
            <span className="info-value">{wavelength.toFixed(4)} m</span>
          </div>
          <div className="control-row">
            <label>Medium</label>
            <select 
              value={medium} 
              onChange={(e) => setMedium(e.target.value as Medium)}
              className="beam-select"
            >
              <option value="air">Air (343 m/s)</option>
              <option value="water">Water (1481 m/s)</option>
              <option value="tissue">Tissue (1540 m/s)</option>
            </select>
          </div>
        </CollapsibleSection>

        {/* Section: Phased Array Config */}
        <CollapsibleSection title="⚙️ Array Config" defaultOpen={true}>
          <SliderControl
            label="Element Count"
            value={activeUnit?.elements ?? 8}
            min={2}
            max={64}
            step={1}
            onChange={handleSensorCountChange}
          />
          <SliderControl
            label="Element Spacing"
            value={spacingLambdaFraction}
            min={0.1}
            max={2}
            step={0.05}
            onChange={handleSpacingChange}
            formatValue={formatSpacing}
          />
          <div className="control-row">
            <label>Geometry</label>
            <ToggleGroup
              options={[
                { value: 'linear', label: 'Linear' },
                { value: 'curved', label: 'Curved' },
              ]}
              value={activeUnit?.geometry ?? 'linear'}
              onChange={handleGeometryChange}
            />
          </div>
          
          {/* Curvature Radius - Only show for curved arrays */}
          {activeUnit?.geometry === 'curved' && (
            <SliderControl
              label="Curvature Radius"
              value={activeUnit.curvatureRadius * 1000}
              min={10}
              max={200}
              step={5}
              unit=" mm"
              onChange={(v) => handleCurvatureRadiusChange(v / 1000)}
            />
          )}
          
          {/* Position Controls */}
          <div className="position-controls">
            <label className="control-label">Position</label>
            <div className="position-inputs">
              <SliderControl
                label="X"
                value={activeUnit?.position.x ?? 0}
                min={-1}
                max={1}
                step={0.05}
                unit=" m"
                onChange={handlePositionXChange}
              />
              <SliderControl
                label="Y"
                value={activeUnit?.position.y ?? 0}
                min={-1}
                max={1}
                step={0.05}
                unit=" m"
                onChange={handlePositionYChange}
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* Section: Algorithm */}
        <CollapsibleSection title="🧮 Algorithm" defaultOpen={false}>
          <div className="control-row">
            <label>Select</label>
            <span className="option-hint">Capon / MUSIC</span>
          </div>
          <div className="selected-value">Selected: <span className="accent">{algorithm.charAt(0).toUpperCase() + algorithm.slice(1)}</span></div>
          <ToggleGroup
            options={[
              { value: 'capon', label: 'Capon' },
              { value: 'music', label: 'MUSIC' },
              { value: 'das', label: 'DAS' },
              { value: 'mvdr', label: 'MVDR' },
            ]}
            value={algorithm}
            onChange={setAlgorithm}
          />
        </CollapsibleSection>

        {/* Section: Weights */}
        <CollapsibleSection title="⚖️ Weights" defaultOpen={false}>
          <div className="control-row">
            <span className="option-hint">Adaptive / Fixed</span>
          </div>
          <div className="selected-value">Selected: <span className="accent">{weightType.charAt(0).toUpperCase() + weightType.slice(1)}</span></div>
          <ToggleGroup
            options={[
              { value: 'adaptive', label: 'Adaptive' },
              { value: 'fixed', label: 'Fixed' },
            ]}
            value={weightType}
            onChange={setWeightType}
          />
          <WeightsVisualization weights={weights} />
        </CollapsibleSection>
      </div>

      {/* Fixed Bottom: Real-Time Controls */}
      <div className="realtime-controls">
        <h3>REAL-TIME CONTROLS</h3>
        
        <div className="controls-row">
          <button 
            className={`play-btn ${isPlaying ? 'playing' : ''}`}
            onClick={togglePlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
          
          <div className="control-btns">
            <button className="action-btn" onClick={triggerScan}>Scan</button>
            <button className="action-btn" onClick={resetSimulation}>Reset</button>
          </div>
        </div>

        <SliderControl
          label="Scan Rate (Hz)"
          value={scanSpeed}
          min={1}
          max={60}
          step={1}
          unit=""
          onChange={setScanSpeed}
          formatValue={(v) => `Value: ${v}`}
        />

        <div className="interference-toggle">
          <span>Interference Cancel</span>
          <button 
            className={`toggle-switch ${interferenceCancel ? 'on' : 'off'}`}
            onClick={() => setInterferenceCancel(!interferenceCancel)}
            aria-pressed={interferenceCancel}
          >
            <span className="toggle-knob" />
            <span className="toggle-label">{interferenceCancel ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BeamSidebar;
