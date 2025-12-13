import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';

export interface Measurement {
  label: string;
  value: number;
  unit: string;
  trend?: 'up' | 'down' | 'stable';
  sparklineData?: number[];
  precision?: number;
  minValue?: number;
  maxValue?: number;
  target?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  color?: string;
}

interface MeasurementsRibbonProps {
  measurements: Measurement[];
  compact?: boolean;
  showTrendGraph?: boolean;
  onMeasurementClick?: (measurement: Measurement, index: number) => void;
}

// Expanded detail panel for clicked measurement
const MeasurementDetail: React.FC<{
  measurement: Measurement;
  onClose: () => void;
}> = ({ measurement, onClose }) => {
  const chartRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = chartRef.current;
    if (!canvas || !measurement.sparklineData?.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const data = measurement.sparklineData;
    const width = rect.width;
    const height = rect.height;
    const padding = { top: 10, right: 10, bottom: 25, left: 45 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const max = Math.max(...data) * 1.1;
    const min = Math.min(...data) * 0.9;
    const range = max - min || 1;

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#1e2530';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Y-axis labels
      const val = max - (range / 4) * i;
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(1), padding.left - 5, y + 3);
    }

    // X-axis labels
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const x = padding.left + (chartWidth / 4) * i;
      const timeAgo = Math.round((data.length - 1) * (1 - i / 4));
      ctx.fillText(`-${timeAgo}`, x, height - 5);
    }

    // Draw area fill
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
    gradient.addColorStop(0, 'rgba(77, 208, 225, 0.3)');
    gradient.addColorStop(1, 'rgba(77, 208, 225, 0.0)');
    
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartHeight);
    for (let i = 0; i < data.length; i++) {
      const x = padding.left + (i / (data.length - 1)) * chartWidth;
      const y = padding.top + chartHeight - ((data[i] - min) / range) * chartHeight;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.strokeStyle = measurement.color || '#4dd0e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = padding.left + (i / (data.length - 1)) * chartWidth;
      const y = padding.top + chartHeight - ((data[i] - min) / range) * chartHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw target line if present
    if (measurement.target !== undefined) {
      const targetY = padding.top + chartHeight - ((measurement.target - min) / range) * chartHeight;
      ctx.strokeStyle = '#fbbf24';
      ctx.setLineDash([5, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, targetY);
      ctx.lineTo(width - padding.right, targetY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw endpoint
    const lastX = padding.left + chartWidth;
    const lastY = padding.top + chartHeight - ((data[data.length - 1] - min) / range) * chartHeight;
    ctx.fillStyle = measurement.color || '#4dd0e1';
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fill();

  }, [measurement]);

  const stats = useMemo(() => {
    const data = measurement.sparklineData || [];
    if (data.length === 0) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const std = Math.sqrt(data.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / data.length);
    return { min, max, avg, std };
  }, [measurement.sparklineData]);

  return (
    <div className="measurement-detail-overlay" onClick={onClose}>
      <div className="measurement-detail-panel" onClick={e => e.stopPropagation()}>
        <div className="detail-header">
          <h3>{measurement.label}</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="detail-current">
          <span className="current-value">{measurement.value.toFixed(measurement.precision ?? 1)}</span>
          <span className="current-unit">{measurement.unit}</span>
        </div>
        <canvas ref={chartRef} className="detail-chart" />
        {stats && (
          <div className="detail-stats">
            <div className="stat">
              <span className="stat-label">Min</span>
              <span className="stat-value">{stats.min.toFixed(1)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Max</span>
              <span className="stat-value">{stats.max.toFixed(1)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Avg</span>
              <span className="stat-value">{stats.avg.toFixed(1)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Std Dev</span>
              <span className="stat-value">{stats.std.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const MeasurementsRibbon: React.FC<MeasurementsRibbonProps> = ({
  measurements,
  compact = false,
  showTrendGraph = true,
  onMeasurementClick
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleCardClick = useCallback((m: Measurement, idx: number) => {
    setSelectedIndex(idx);
    onMeasurementClick?.(m, idx);
  }, [onMeasurementClick]);

  return (
    <>
      <div className={`measurements-ribbon ${compact ? 'compact' : ''}`}>
        {measurements.map((m, idx) => (
          <MeasurementCard 
            key={idx} 
            measurement={m} 
            compact={compact}
            showTrendGraph={showTrendGraph}
            onClick={() => handleCardClick(m, idx)}
          />
        ))}
      </div>
      {selectedIndex !== null && (
        <MeasurementDetail
          measurement={measurements[selectedIndex]}
          onClose={() => setSelectedIndex(null)}
        />
      )}
    </>
  );
};

interface MeasurementCardProps {
  measurement: Measurement;
  compact?: boolean;
  showTrendGraph?: boolean;
  onClick?: () => void;
}

const MeasurementCard: React.FC<MeasurementCardProps> = ({ 
  measurement, 
  compact = false,
  showTrendGraph = true,
  onClick 
}) => {
  const sparklineRef = useRef<HTMLCanvasElement>(null);

  // Calculate status based on thresholds
  const status = useMemo(() => {
    if (measurement.criticalThreshold !== undefined && 
        measurement.value < measurement.criticalThreshold) {
      return 'critical';
    }
    if (measurement.warningThreshold !== undefined && 
        measurement.value < measurement.warningThreshold) {
      return 'warning';
    }
    return 'normal';
  }, [measurement.value, measurement.warningThreshold, measurement.criticalThreshold]);

  // Calculate percentage change
  const percentChange = useMemo(() => {
    const data = measurement.sparklineData;
    if (!data || data.length < 2) return null;
    const first = data[0];
    const last = data[data.length - 1];
    return first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  }, [measurement.sparklineData]);

  useEffect(() => {
    const canvas = sparklineRef.current;
    if (!canvas || !measurement.sparklineData?.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const data = measurement.sparklineData;
    const width = rect.width;
    const height = rect.height;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    const baseColor = measurement.color || (measurement.trend === 'up' 
      ? '#4caf50' 
      : measurement.trend === 'down' 
        ? '#ff5c6c' 
        : '#4dd0e1');
    
    gradient.addColorStop(0, baseColor + '40');
    gradient.addColorStop(1, baseColor + '00');

    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((data[i] - min) / range) * (height - 4) - 2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw sparkline
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = compact ? 1 : 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((data[i] - min) / range) * (height - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw glow at end
    const lastX = width;
    const lastY = height - ((data[data.length - 1] - min) / range) * (height - 4) - 2;
    
    // Glow effect
    const glowGradient = ctx.createRadialGradient(lastX, lastY, 0, lastX, lastY, 8);
    glowGradient.addColorStop(0, baseColor + '80');
    glowGradient.addColorStop(1, baseColor + '00');
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Dot
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.arc(lastX, lastY, compact ? 2 : 3, 0, Math.PI * 2);
    ctx.fill();

    // Min/Max markers if not compact
    if (!compact && data.length > 5) {
      const maxIdx = data.indexOf(max);
      const minIdx = data.indexOf(min);
      
      // Max marker
      const maxX = (maxIdx / (data.length - 1)) * width;
      const maxY = 2;
      ctx.fillStyle = '#4caf5080';
      ctx.beginPath();
      ctx.arc(maxX, maxY, 2, 0, Math.PI * 2);
      ctx.fill();

      // Min marker
      const minX = (minIdx / (data.length - 1)) * width;
      const minY = height - 2;
      ctx.fillStyle = '#ff5c6c80';
      ctx.beginPath();
      ctx.arc(minX, minY, 2, 0, Math.PI * 2);
      ctx.fill();
    }

  }, [measurement.sparklineData, measurement.trend, measurement.color, compact]);

  const getTrendIcon = (trend?: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return '▲';
      case 'down': return '▼';
      default: return '●';
    }
  };

  const getTrendColor = (trend?: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return 'var(--success-green)';
      case 'down': return 'var(--error-red)';
      default: return 'var(--text-muted)';
    }
  };

  const precision = measurement.precision ?? 1;

  return (
    <div 
      className={`measurement-card ${compact ? 'compact' : ''} status-${status}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick?.()}
    >
      <div className="card-header">
        <div className="label">
          {measurement.label}
        </div>
        {measurement.trend && (
          <span className="trend" style={{ color: getTrendColor(measurement.trend) }}>
            {getTrendIcon(measurement.trend)}
            {percentChange !== null && !compact && (
              <span className="percent-change">
                {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(1)}%
              </span>
            )}
          </span>
        )}
      </div>
      <div className="value-row">
        <div className="value">
          {measurement.value.toFixed(precision)}
          <span className="unit">{measurement.unit}</span>
        </div>
        {!compact && measurement.target !== undefined && (
          <div className="target">
            <span className="target-label">Target:</span>
            <span className="target-value">{measurement.target}{measurement.unit}</span>
          </div>
        )}
      </div>
      {showTrendGraph && measurement.sparklineData && (
        <div className="sparkline-container">
          <canvas
            ref={sparklineRef}
            className="sparkline"
          />
          {!compact && (
            <div className="min-max">
              <span className="max">↑{Math.max(...measurement.sparklineData).toFixed(0)}</span>
              <span className="min">↓{Math.min(...measurement.sparklineData).toFixed(0)}</span>
            </div>
          )}
        </div>
      )}
      {status !== 'normal' && (
        <div className={`status-indicator ${status}`}>
          {status === 'critical' ? '!' : '⚠'}
        </div>
      )}
    </div>
  );
};

// Default measurements for beamforming
// eslint-disable-next-line react-refresh/only-export-components
export const createDefaultMeasurements = (
  snr: number,
  directivity: number,
  beamwidth: number,
  sidelobeLevel: number,
  history: {
    snrHistory?: number[];
    directivityHistory?: number[];
    beamwidthHistory?: number[];
    sidelobeHistory?: number[];
  } = {}
): Measurement[] => [
  {
    label: 'SNR',
    value: snr,
    unit: 'dB',
    trend: determineTrend(history.snrHistory),
    sparklineData: history.snrHistory || generateFakeHistory(snr, 20),
    precision: 1
  },
  {
    label: 'Directivity',
    value: directivity,
    unit: 'dBi',
    trend: determineTrend(history.directivityHistory),
    sparklineData: history.directivityHistory || generateFakeHistory(directivity, 20),
    precision: 1
  },
  {
    label: 'Beamwidth (3dB)',
    value: beamwidth,
    unit: '°',
    trend: determineTrend(history.beamwidthHistory, true), // lower is better
    sparklineData: history.beamwidthHistory || generateFakeHistory(beamwidth, 20, 0.1),
    precision: 1
  },
  {
    label: 'Sidelobe Level',
    value: sidelobeLevel,
    unit: 'dB',
    trend: determineTrend(history.sidelobeHistory, true), // lower is better
    sparklineData: history.sidelobeHistory || generateFakeHistory(sidelobeLevel, 20, 0.5),
    precision: 1
  }
];

// Helper to determine trend from history
const determineTrend = (
  history?: number[], 
  lowerIsBetter = false
): 'up' | 'down' | 'stable' => {
  if (!history || history.length < 2) return 'stable';
  
  const recent = history.slice(-5);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const last = history[history.length - 1];
  const diff = last - avg;
  const threshold = Math.abs(avg) * 0.02;

  if (Math.abs(diff) < threshold) return 'stable';
  
  const improving = lowerIsBetter ? diff < 0 : diff > 0;
  return improving ? 'up' : 'down';
};

// Generate fake history for demo
const generateFakeHistory = (
  current: number, 
  points: number, 
  variance = 0.05
): number[] => {
  const history: number[] = [];
  let val = current * (1 - variance * 2);
  
  for (let i = 0; i < points; i++) {
    val += (current - val) * 0.2 + (Math.random() - 0.5) * current * variance;
    history.push(val);
  }
  history[history.length - 1] = current;
  return history;
};

export default MeasurementsRibbon;
