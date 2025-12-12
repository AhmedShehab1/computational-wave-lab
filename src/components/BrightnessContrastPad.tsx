import React, { useRef, useState, useCallback, useEffect } from 'react';

interface BrightnessContrastPadProps {
  brightness: number;
  contrast: number;
  onBrightnessChange: (value: number) => void;
  onContrastChange: (value: number) => void;
  target: 'source' | 'output';
  onTargetChange: (target: 'source' | 'output') => void;
}

export const BrightnessContrastPad: React.FC<BrightnessContrastPadProps> = ({
  brightness,
  contrast,
  onBrightnessChange,
  onContrastChange,
  target,
  onTargetChange
}) => {
  const padRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Brightness: -1 to 1 maps to x 0 to 100%
  // Contrast: -1 to 1 maps to y 100% to 0%
  const normalizedX = ((brightness + 1) / 2) * 100;
  const normalizedY = ((1 - contrast) / 2) * 100;

  const handleInteraction = useCallback((clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;

    const rect = pad.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    // Convert to -1 to 1 range
    const newBrightness = x * 2 - 1;
    const newContrast = (1 - y) * 2 - 1;

    onBrightnessChange(Number(newBrightness.toFixed(2)));
    onContrastChange(Number(newContrast.toFixed(2)));
  }, [onBrightnessChange, onContrastChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleInteraction(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    const touch = e.touches[0];
    handleInteraction(touch.clientX, touch.clientY);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      handleInteraction(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      handleInteraction(touch.clientX, touch.clientY);
    };

    const handleEnd = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, handleInteraction]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    switch (e.key) {
      case 'ArrowUp':
        onContrastChange(Math.min(1, contrast + step));
        e.preventDefault();
        break;
      case 'ArrowDown':
        onContrastChange(Math.max(-1, contrast - step));
        e.preventDefault();
        break;
      case 'ArrowLeft':
        onBrightnessChange(Math.max(-1, brightness - step));
        e.preventDefault();
        break;
      case 'ArrowRight':
        onBrightnessChange(Math.min(1, brightness + step));
        e.preventDefault();
        break;
      case 'Home':
        onBrightnessChange(0);
        onContrastChange(0);
        e.preventDefault();
        break;
    }
  };

  return (
    <div className="brightness-pad-container">
      <div className="brightness-pad-header">
        <h3>
          <span className="icon">☀️</span>
          Brightness & Contrast
        </h3>
        <span className="shortcut-hint">Arrow keys</span>
      </div>

      <div
        ref={padRef}
        className="brightness-pad"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        role="slider"
        aria-label="Brightness and Contrast control pad"
        aria-valuetext={`Brightness: ${brightness.toFixed(2)}, Contrast: ${contrast.toFixed(2)}`}
      >
        <span className="axis-label top">+C</span>
        <span className="axis-label bottom">-C</span>
        <span className="axis-label left">-B</span>
        <span className="axis-label right">+B</span>
        
        <div
          className="crosshair"
          style={{
            left: `${normalizedX}%`,
            top: `${normalizedY}%`
          }}
        />
      </div>

      <div className="brightness-values">
        <div className="value-box">
          <label htmlFor="brightness-input">Brightness</label>
          <input
            id="brightness-input"
            type="number"
            value={brightness.toFixed(2)}
            onChange={(e) => onBrightnessChange(Number(e.target.value))}
            min="-1"
            max="1"
            step="0.01"
          />
        </div>
        <div className="value-box">
          <label htmlFor="contrast-input">Contrast</label>
          <input
            id="contrast-input"
            type="number"
            value={contrast.toFixed(2)}
            onChange={(e) => onContrastChange(Number(e.target.value))}
            min="-1"
            max="1"
            step="0.01"
          />
        </div>
      </div>

      <div className="target-toggle">
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Apply to:</span>
        <div className="toggle-pill">
          <button
            className={target === 'source' ? 'active' : ''}
            onClick={() => onTargetChange('source')}
          >
            Source
          </button>
          <button
            className={target === 'output' ? 'active' : ''}
            onClick={() => onTargetChange('output')}
          >
            Output
          </button>
        </div>
      </div>

      <div className="contrast-slider">
        <label>
          <span>Fine Contrast</span>
          <span>{contrast.toFixed(2)}</span>
        </label>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={contrast}
          onChange={(e) => onContrastChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
};

export default BrightnessContrastPad;
