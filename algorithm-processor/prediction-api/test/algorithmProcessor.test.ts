import { DecisionEngine, ShortTermForecaster, type HistoryPoint } from '../src/algorithmProcessor.js';

describe('ShortTermForecaster', () => {
  it('predicts a spike when trend is steep enough', () => {
    const history: HistoryPoint[] = [
      [new Date('2024-01-01T00:00:00Z'), 10],
      [new Date('2024-01-01T01:00:00Z'), 12],
      [new Date('2024-01-01T02:00:00Z'), 14],
      [new Date('2024-01-01T03:00:00Z'), 16],
    ];
    const forecaster = new ShortTermForecaster(10, 4);
    const result = forecaster.predict(history, 4);
    expect(result.predictedValues.length).toBe(4);
    expect(result.predictedSpike).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
  });
});

describe('DecisionEngine', () => {
  it('flags immediate critical actions when price is high', () => {
    const engine = new DecisionEngine(50, 10, [[0, 6]]);
    const decision = engine.decide(
      { timestamp: new Date('2024-01-01T12:00:00Z'), price: 75, area: 'A', customer: 'unknown', raw: {} },
      { predictedValues: [80], confidence: 0.8, predictedSpike: true, explanation: 'test' },
    );
    expect(decision.actionType).toBe('CRITICAL_NOW');
  });

  it('suggests charging during off-peak low price windows', () => {
    const engine = new DecisionEngine(50, 15, [[0, 6]]);
    const decision = engine.decide(
      { timestamp: new Date('2024-01-01T02:00:00Z'), price: 10, area: 'A', customer: 'unknown', raw: {} },
      { predictedValues: [12], confidence: 0.5, predictedSpike: false, explanation: 'test' },
    );
    expect(decision.actionType).toBe('OPPORTUNITY_CHARGE');
  });

  it('marks upcoming spikes when forecast signals one', () => {
    const engine = new DecisionEngine(50, 15, [[0, 6]]);
    const decision = engine.decide(
      { timestamp: new Date('2024-01-01T12:00:00Z'), price: 30, area: 'A', customer: 'unknown', raw: {} },
      { predictedValues: [60], confidence: 0.7, predictedSpike: true, explanation: 'test' },
    );
    expect(decision.actionType).toBe('PREPARE_FOR_SPIKE');
  });

  it('keeps normal operation otherwise', () => {
    const engine = new DecisionEngine(50, 15, [[0, 6]]);
    const decision = engine.decide(
      { timestamp: new Date('2024-01-01T12:00:00Z'), price: 20, area: 'A', customer: 'unknown', raw: {} },
      { predictedValues: [22], confidence: 0.4, predictedSpike: false, explanation: 'test' },
    );
    expect(decision.actionType).toBe('NORMAL_OPERATION');
  });
});
