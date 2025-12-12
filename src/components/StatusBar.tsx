import React from 'react';

interface StatusBarProps {
  fourierStatus: 'idle' | 'processing' | 'ready' | 'error';
  beamStatus: 'idle' | 'processing' | 'ready' | 'error';
  systemLoad: number; // 0-100
  memoryUsage: number; // 0-100
  networkLatency?: number; // ms
  time?: Date;
  onHelpClick?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  fourierStatus,
  beamStatus,
  systemLoad,
  memoryUsage,
  networkLatency,
  time = new Date(),
  onHelpClick
}) => {
  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'ready': return { class: 'active', label: 'Ready' };
      case 'processing': return { class: 'warning', label: 'Processing' };
      case 'error': return { class: 'error', label: 'Error' };
      default: return { class: '', label: 'Idle' };
    }
  };

  const fourierIndicator = getStatusIndicator(fourierStatus);
  const beamIndicator = getStatusIndicator(beamStatus);

  return (
    <div className="status-bar">
      <div className="status-left">
        <div className="status-item">
          <span className={`indicator ${fourierIndicator.class}`} />
          <span>Fourier Mixer: {fourierIndicator.label}</span>
        </div>

        <div className="status-item">
          <span className={`indicator ${beamIndicator.class}`} />
          <span>Beamforming: {beamIndicator.label}</span>
        </div>

        <div className="status-item">
          <span 
            className={`indicator ${systemLoad > 80 ? 'warning' : systemLoad > 50 ? '' : 'active'}`} 
          />
          <span>CPU: {systemLoad.toFixed(0)}%</span>
        </div>

        <div className="status-item">
          <span 
            className={`indicator ${memoryUsage > 80 ? 'warning' : memoryUsage > 50 ? '' : 'active'}`}
          />
          <span>Memory: {memoryUsage.toFixed(0)}%</span>
        </div>

        {networkLatency !== undefined && (
          <div className="status-item">
            <span 
              className={`indicator ${networkLatency > 100 ? 'warning' : 'active'}`}
            />
            <span>Network: {networkLatency}ms</span>
          </div>
        )}
      </div>

      <div className="status-right">
        <span className="time">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <a 
          href="#" 
          className="help-link"
          onClick={(e) => {
            e.preventDefault();
            onHelpClick?.();
          }}
        >
          ❓ Quick Help
        </a>
      </div>
    </div>
  );
};

export default StatusBar;
