import React, { useRef, useEffect } from 'react';

export interface Measurement {
  label: string;
  value: number;
  unit: string;
  trend?: 'up' | 'down' | 'stable';
  sparklineData?: number[];
  precision?: number;
}

interface MeasurementsRibbonProps {
  measurements: Measurement[];
}

export const MeasurementsRibbon: React.FC<MeasurementsRibbonProps> = ({
  measurements
}) => {
  return (
    <div className="measurements-ribbon">
      {measurements.map((m, idx) => (
        <MeasurementCard key={idx} measurement={m} />
      ))}
    </div>
  );
};

const MeasurementCard: React.FC<{ measurement: Measurement }> = ({ measurement }) => {
  const sparklineRef = useRef<HTMLCanvasElement>(null);

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

    // Draw sparkline
    ctx.strokeStyle = measurement.trend === 'up' 
      ? '#4caf50' 
      : measurement.trend === 'down' 
        ? '#ff5c6c' 
        : '#4dd0e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((data[i] - min) / range) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw dot at end
    const lastX = width;
    const lastY = height - ((data[data.length - 1] - min) / range) * height;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fill();

  }, [measurement.sparklineData, measurement.trend]);

  const getTrendIcon = (trend?: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return '↑';
      case 'down': return '↓';
      default: return '→';
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
    <div className="measurement-card">
      <div className="label">
        {measurement.label}
        {measurement.trend && (
          <span className="trend" style={{ color: getTrendColor(measurement.trend) }}>
            {getTrendIcon(measurement.trend)}
          </span>
        )}
      </div>
      <div className="value">
        {measurement.value.toFixed(precision)}
        <span className="unit">{measurement.unit}</span>
      </div>
      {measurement.sparklineData && (
        <canvas
          ref={sparklineRef}
          className="sparkline"
          style={{ width: '100%', height: '24px' }}
        />
      )}
    </div>
  );
};

// Default measurements for beamforming
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
