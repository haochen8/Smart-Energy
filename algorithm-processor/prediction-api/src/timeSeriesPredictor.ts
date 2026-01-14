import fs from 'fs';
import path from 'path';

export interface HistoricalPoint {
  timestamp: string;
  value: number;
}

export interface ModelArtifacts {
  lookbackWindow: number;
  mean?: number;
  version?: string;
}

export class TimeSeriesPredictor {
  private lookbackWindow = 5;
  private artifactsPath: string;
  private model: ModelArtifacts | null = null;

  constructor(modelPath: string, defaultLookback: number) {
    this.artifactsPath = modelPath;
    this.lookbackWindow = defaultLookback;
    this.loadModel();
  }

  private loadModel() {
    try {
      if (fs.existsSync(this.artifactsPath)) {
        const raw = fs.readFileSync(this.artifactsPath, 'utf-8');
        const parsed = JSON.parse(raw) as ModelArtifacts;
        this.model = parsed;
        this.lookbackWindow = parsed.lookbackWindow ?? this.lookbackWindow;
      } else {
        this.model = { lookbackWindow: this.lookbackWindow, mean: 0, version: 'dummy' };
      }
    } catch (err) {
      this.model = { lookbackWindow: this.lookbackWindow, mean: 0, version: 'dummy' };
    }
  }

  reload() {
    this.loadModel();
  }

  predict(historicalData: HistoricalPoint[]): number {
    const sorted = [...historicalData].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const values = sorted.map((p) => Number(p.value)).filter((v) => Number.isFinite(v));
    if (!values.length) return 0;

    const window = values.slice(-this.lookbackWindow);
    if (window.length < 2) return window[window.length - 1];

    const n = window.length;
    const x = window.map((_, idx) => idx);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = window.reduce((a, b) => a + b, 0);
    const sumXY = window.reduce((acc, y, idx) => acc + idx * y, 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
    const denom = n * sumX2 - sumX * sumX || 1e-9;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const next = intercept + slope * n;
    return Number(next.toFixed(2));
  }
}
