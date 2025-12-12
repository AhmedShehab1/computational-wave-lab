import React from 'react';

interface TopHeaderProps {
  projectName: string;
  taskName?: string;
  workspace: string;
  onWorkspaceChange?: (workspace: string) => void;
  workspaceOptions?: string[];
  scenario?: string;
  onScenarioLoad?: () => void;
  imageSize?: { width: number; height: number } | null;
  uploadWarning?: string | null;
  educationalMode?: boolean;
  onEducationalToggle?: (enabled: boolean) => void;
  fftMode?: 'wasm' | 'js';
  onFftModeChange?: (mode: 'wasm' | 'js') => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  projectName,
  taskName = 'DSP Lab Session',
  workspace,
  onWorkspaceChange,
  workspaceOptions = ['Dual Workspace', 'Fourier Only', 'Beamforming Only'],
  scenario: _scenario,
  onScenarioLoad,
  imageSize,
  uploadWarning,
  educationalMode = false,
  onEducationalToggle,
  fftMode,
  onFftModeChange
}) => {
  return (
    <header className="top-header">
      <div className="project-title">
        <h1>
          <span style={{ color: 'var(--accent-cyan)' }}>⚛️</span>
          Project: {projectName}
        </h1>
        <span className="task-name">{taskName}</span>
      </div>

      <div className="header-controls">
        <select
          className="header-select"
          value={workspace}
          onChange={(e) => onWorkspaceChange?.(e.target.value)}
          aria-label="Workspace layout"
        >
          {workspaceOptions.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>

        <button 
          className="scenario-btn"
          onClick={onScenarioLoad}
          title="Load a preset scenario"
        >
          <span>📁</span>
          <span>Scenario Loader</span>
        </button>

        {imageSize && (
          <div className="size-badge">
            <span className="icon">📐</span>
            <span>{imageSize.width} × {imageSize.height}</span>
          </div>
        )}

        {uploadWarning && (
          <div className="upload-warning">
            <span>⚠️</span>
            <span>{uploadWarning}</span>
          </div>
        )}

        {fftMode && onFftModeChange && (
          <select
            className="header-select"
            value={fftMode}
            onChange={(e) => onFftModeChange(e.target.value as 'wasm' | 'js')}
            aria-label="FFT Engine"
            title="FFT computation engine"
          >
            <option value="wasm">WASM FFT</option>
            <option value="js">JS FFT</option>
          </select>
        )}

        <label className="educational-toggle">
          <input
            type="checkbox"
            checked={educationalMode}
            onChange={(e) => onEducationalToggle?.(e.target.checked)}
          />
          <span>📖 Educational Explain</span>
        </label>
      </div>
    </header>
  );
};

export default TopHeader;
