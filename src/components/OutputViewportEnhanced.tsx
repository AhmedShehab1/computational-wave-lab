import React, { useRef, useEffect } from 'react';

export interface OutputViewportEnhancedProps {
  label: string;
  imageData: ImageData | null;
  spectrumData?: ImageData | null;
  showSpectrum?: boolean;
  onSpectrumToggle?: (show: boolean) => void;
  snapshots?: { id: string; thumb: string; timestamp: number }[];
  selectedSnapshot?: string | null;
  onSnapshotSelect?: (id: string | null) => void;
  onSnapshotTake?: () => void;
  onCompare?: () => void;
  status?: 'idle' | 'routing' | 'mixing' | 'processing';
  tabs?: string[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  loading?: boolean;
}

export const OutputViewportEnhanced: React.FC<OutputViewportEnhancedProps> = ({
  label,
  imageData,
  spectrumData,
  showSpectrum = false,
  onSpectrumToggle,
  snapshots = [],
  selectedSnapshot,
  onSnapshotSelect,
  onSnapshotTake,
  onCompare,
  status = 'idle',
  tabs = ['Mixed', 'Magnitude', 'Phase'],
  activeTab = 'Mixed',
  onTabChange,
  loading = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spectrumRef = useRef<HTMLCanvasElement>(null);

  // Main canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (imageData) {
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      ctx.putImageData(imageData, 0, 0);
    } else {
      // Draw placeholder
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      
      ctx.fillStyle = '#080a0f';
      ctx.fillRect(0, 0, rect.width, rect.height);
      
      ctx.fillStyle = '#2a3142';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No output', rect.width / 2, rect.height / 2);
    }
  }, [imageData]);

  // Spectrum inset rendering
  useEffect(() => {
    const canvas = spectrumRef.current;
    if (!canvas || !showSpectrum || !spectrumData) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = spectrumData.width;
    canvas.height = spectrumData.height;
    ctx.putImageData(spectrumData, 0, 0);
  }, [spectrumData, showSpectrum]);

  const statusLabels: Record<string, string> = {
    idle: '● Ready',
    routing: '◌ Routing',
    mixing: '◌ Mixing',
    processing: '◌ Processing'
  };

  return (
    <div className="output-section">
      <div className="output-header">
        <h3>{label}</h3>
        
        <div className="output-tabs">
          {tabs.map(tab => (
            <button
              key={tab}
              className={`output-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => onTabChange?.(tab)}
              aria-pressed={activeTab === tab}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className={`output-status ${status}`}>
          {statusLabels[status]}
        </div>
      </div>

      <div className="output-canvas-container">
        {loading && (
          <div className="loading-overlay" style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-cyan)',
            fontSize: '13px'
          }}>
            Processing...
          </div>
        )}
        
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        
        {showSpectrum && spectrumData && (
          <div className="spectrum-inset">
            <canvas ref={spectrumRef} style={{ width: '100%', height: '100%' }} />
          </div>
        )}

        {selectedSnapshot && (
          <div className="snapshot-badge">
            <span>📷 Viewing snapshot</span>
            <button
              onClick={() => onSnapshotSelect?.(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-cyan)',
                cursor: 'pointer',
                fontSize: '10px'
              }}
            >
              ✕ Clear
            </button>
          </div>
        )}
      </div>

      {snapshots.length > 0 && (
        <div className="snapshot-strip">
          {snapshots.map(snap => (
            <img
              key={snap.id}
              src={snap.thumb}
              className={`snapshot-thumb ${selectedSnapshot === snap.id ? 'selected' : ''}`}
              onClick={() => onSnapshotSelect?.(snap.id === selectedSnapshot ? null : snap.id)}
              alt={`Snapshot from ${new Date(snap.timestamp).toLocaleTimeString()}`}
              title={`Snapshot: ${new Date(snap.timestamp).toLocaleTimeString()}`}
            />
          ))}
        </div>
      )}

      <div className="output-footer">
        <label className="spectrum-toggle">
          <input
            type="checkbox"
            checked={showSpectrum}
            onChange={(e) => onSpectrumToggle?.(e.target.checked)}
          />
          <span>Show Spectrum</span>
        </label>

        <div style={{ display: 'flex', gap: '8px' }}>
          {onSnapshotTake && (
            <button className="snapshot-btn" onClick={onSnapshotTake}>
              📷 Snapshot
            </button>
          )}
          {onCompare && snapshots.length >= 2 && (
            <button className="snapshot-btn" onClick={onCompare}>
              ⇄ Compare
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OutputViewportEnhanced;
