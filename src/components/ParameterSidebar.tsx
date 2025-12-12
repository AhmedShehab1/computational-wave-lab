import React, { useState } from 'react';

interface ParamSectionProps {
  title: string;
  icon?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const ParamSection: React.FC<ParamSectionProps> = ({
  title,
  icon,
  defaultOpen = false,
  children
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`param-section ${isOpen ? 'open' : ''}`}>
      <div
        className="param-section-header"
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={(e) => e.key === 'Enter' && setIsOpen(!isOpen)}
      >
        <h3>
          {icon && <span style={{ marginRight: '6px' }}>{icon}</span>}
          {title}
        </h3>
        <span className="chevron">{isOpen ? '▼' : '▶'}</span>
      </div>
      {isOpen && <div className="param-section-content">{children}</div>}
    </div>
  );
};

export interface BeamParams {
  delays: number[];
  phases: number[];
  frequency: number;
  bandwidth: number;
  algorithm: string;
  weights: number[];
  scanStart: number;
  scanEnd: number;
  scanStep: number;
  isScanning: boolean;
  showInterference: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  preset?: Partial<BeamParams>;
}

interface ParameterSidebarProps {
  params: BeamParams;
  onParamsChange: (params: Partial<BeamParams>) => void;
  scenarios?: Scenario[];
  activeScenario?: string;
  onScenarioSelect?: (id: string) => void;
  onScan?: () => void;
  onPause?: () => void;
  onReset?: () => void;
  numElements?: number;
}

export const ParameterSidebar: React.FC<ParameterSidebarProps> = ({
  params,
  onParamsChange,
  scenarios = defaultScenarios,
  activeScenario,
  onScenarioSelect,
  onScan,
  onPause,
  onReset,
  numElements = 8
}) => {
  const handleDelayChange = (index: number, value: number) => {
    const newDelays = [...params.delays];
    newDelays[index] = value;
    onParamsChange({ delays: newDelays });
  };

  const handlePhaseChange = (index: number, value: number) => {
    const newPhases = [...params.phases];
    newPhases[index] = value;
    onParamsChange({ phases: newPhases });
  };

  return (
    <div className="param-sidebar">
      {/* Real-Time Controls */}
      <div className="realtime-controls">
        <h3>🎮 Real-Time Controls</h3>
        
        <div className="playback-controls">
          <button
            className="playback-btn"
            onClick={onReset}
            title="Reset to defaults"
          >
            ⟲
          </button>
          <button
            className="playback-btn primary"
            onClick={params.isScanning ? onPause : onScan}
            title={params.isScanning ? 'Pause scan' : 'Start scan'}
          >
            {params.isScanning ? '⏸' : '▶'}
          </button>
        </div>

        <div className="scan-controls">
          <div className="scan-row">
            <label>Scan Range</label>
            <span className="value">{params.scanStart}° – {params.scanEnd}°</span>
          </div>
          <input
            type="range"
            className="scan-slider"
            min="-90"
            max="90"
            value={params.scanStart}
            onChange={(e) => onParamsChange({ scanStart: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
          
          <div className="scan-row" style={{ marginTop: '8px' }}>
            <label>Step Size</label>
            <span className="value">{params.scanStep}°</span>
          </div>
          <input
            type="range"
            className="scan-slider"
            min="1"
            max="10"
            value={params.scanStep}
            onChange={(e) => onParamsChange({ scanStep: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>

        <div className="interference-toggle">
          <label>Show Interference</label>
          <div 
            className={`toggle-switch ${params.showInterference ? 'on' : ''}`}
            onClick={() => onParamsChange({ showInterference: !params.showInterference })}
            role="switch"
            aria-checked={params.showInterference}
            tabIndex={0}
          >
            <div className="knob" />
          </div>
        </div>
      </div>

      {/* Delays & Phases */}
      <ParamSection title="Delays & Phases" icon="⏱️" defaultOpen={true}>
        <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
          {Array.from({ length: numElements }, (_, i) => (
            <div key={i} className="param-row" style={{ gap: '8px' }}>
              <label style={{ width: '24px' }}>#{i + 1}</label>
              <input
                type="number"
                value={params.delays[i] || 0}
                onChange={(e) => handleDelayChange(i, Number(e.target.value))}
                style={{
                  width: '60px',
                  padding: '4px 6px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--text-primary)',
                  fontSize: '11px'
                }}
                title={`Delay for element ${i + 1} (ns)`}
              />
              <input
                type="number"
                value={params.phases[i] || 0}
                onChange={(e) => handlePhaseChange(i, Number(e.target.value))}
                style={{
                  width: '60px',
                  padding: '4px 6px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--text-primary)',
                  fontSize: '11px'
                }}
                title={`Phase for element ${i + 1} (°)`}
              />
            </div>
          ))}
        </div>
      </ParamSection>

      {/* Frequencies */}
      <ParamSection title="Frequencies" icon="📶">
        <div className="param-row">
          <label>Center Frequency</label>
          <span className="value">{params.frequency} Hz</span>
        </div>
        <input
          type="range"
          min="100"
          max="10000"
          step="100"
          value={params.frequency}
          onChange={(e) => onParamsChange({ frequency: Number(e.target.value) })}
          style={{ width: '100%' }}
        />
        
        <div className="param-row" style={{ marginTop: '12px' }}>
          <label>Bandwidth</label>
          <span className="value">{params.bandwidth} Hz</span>
        </div>
        <input
          type="range"
          min="10"
          max="2000"
          step="10"
          value={params.bandwidth}
          onChange={(e) => onParamsChange({ bandwidth: Number(e.target.value) })}
          style={{ width: '100%' }}
        />
      </ParamSection>

      {/* Scenario Cards */}
      <ParamSection title="Scenario Cards" icon="🎯" defaultOpen={true}>
        {scenarios.map(scenario => (
          <div
            key={scenario.id}
            className={`scenario-card ${activeScenario === scenario.id ? 'active' : ''}`}
            onClick={() => onScenarioSelect?.(scenario.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onScenarioSelect?.(scenario.id)}
          >
            <span style={{ fontSize: '20px' }}>{scenario.icon}</span>
            <div>
              <div style={{ fontWeight: 500, fontSize: '12px' }}>{scenario.name}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                {scenario.description}
              </div>
            </div>
          </div>
        ))}
      </ParamSection>

      {/* Algorithm */}
      <ParamSection title="Algorithm" icon="⚙️">
        <div className="algorithm-selector">
          <label>Beamforming Method</label>
          <select
            value={params.algorithm}
            onChange={(e) => onParamsChange({ algorithm: e.target.value })}
            style={{
              width: '100%',
              padding: '8px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              marginTop: '6px'
            }}
          >
            <option value="delay-sum">Delay-and-Sum</option>
            <option value="mvdr">MVDR (Capon)</option>
            <option value="music">MUSIC</option>
            <option value="esprit">ESPRIT</option>
          </select>
          <div className="algorithm-options" style={{ marginTop: '8px' }}>
            <a href="#" onClick={(e) => e.preventDefault()}>Learn more</a>
            <span style={{ color: 'var(--text-muted)' }}>|</span>
            <a href="#" onClick={(e) => e.preventDefault()}>Compare methods</a>
          </div>
        </div>
      </ParamSection>

      {/* Weights Visualization */}
      <ParamSection title="Element Weights" icon="📊">
        <WeightsGraph weights={params.weights} numElements={numElements} />
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          marginTop: '8px',
          fontSize: '10px',
          color: 'var(--text-muted)'
        }}>
          <span>Element 1</span>
          <span>Element {numElements}</span>
        </div>
      </ParamSection>
    </div>
  );
};

// Weights visualization mini-graph
const WeightsGraph: React.FC<{ weights: number[]; numElements: number }> = ({ 
  weights, 
  numElements 
}) => {
  const displayWeights = weights.length > 0 
    ? weights 
    : Array(numElements).fill(1).map((_, i) => 
        Math.cos((i - numElements / 2 + 0.5) * Math.PI / numElements)
      );

  const maxWeight = Math.max(...displayWeights);

  return (
    <div className="weights-graph" style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: '2px',
      padding: '8px',
      height: '60px'
    }}>
      {displayWeights.map((w, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${(w / maxWeight) * 100}%`,
            background: 'linear-gradient(to top, #4dd0e1, #2fe0c7)',
            borderRadius: '2px 2px 0 0',
            minHeight: '4px'
          }}
          title={`Element ${i + 1}: ${w.toFixed(3)}`}
        />
      ))}
    </div>
  );
};

// Default scenarios
const defaultScenarios: Scenario[] = [
  {
    id: 'broadside',
    name: 'Broadside',
    description: 'Main beam perpendicular to array',
    icon: '📡'
  },
  {
    id: 'endfire',
    name: 'Endfire',
    description: 'Main beam along array axis',
    icon: '➡️'
  },
  {
    id: 'interference',
    name: 'Interference Nulling',
    description: 'Null towards interference source',
    icon: '🚫'
  },
  {
    id: 'wideband',
    name: 'Wideband Signal',
    description: 'True time delay beamforming',
    icon: '📻'
  }
];

export default ParameterSidebar;
