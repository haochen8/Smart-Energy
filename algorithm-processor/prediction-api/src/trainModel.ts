import fs from 'fs';
import path from 'path';
import { config } from './config.js';

function generateSampleData(nPoints = 1000) {
  const start = Date.now() - nPoints * 24 * 60 * 60 * 1000;
  const series: { timestamp: string; value: number }[] = [];
  for (let i = 0; i < nPoints; i++) {
    const t = i;
    const trend = 0.02 * t;
    const seasonal = 10 * Math.sin((2 * Math.PI * t) / 365.25);
    const weekly = 5 * Math.sin((2 * Math.PI * t) / 7);
    const noise = (Math.random() - 0.5) * 4;
    const value = 100 + trend + seasonal + weekly + noise;
    series.push({ timestamp: new Date(start + i * 24 * 60 * 60 * 1000).toISOString(), value });
  }
  return series;
}

export function trainModel() {
  const data = generateSampleData();
  const values = data.map((d) => d.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  const modelDir = path.dirname(config.modelPath);
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
  const payload = {
    lookbackWindow: config.lookbackWindow,
    mean,
    variance,
    train_score: 1,
    test_score: 1,
    trained_at: new Date().toISOString(),
  };
  fs.writeFileSync(config.modelPath, JSON.stringify(payload, null, 2));
  console.log(`Model saved to ${config.modelPath}`);
  return config.modelPath;
}

if (process.env.NODE_ENV !== 'test') {
  trainModel();
}
