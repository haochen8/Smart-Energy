# Quick Start Guide

## Two Ways to Use the API

### Option 1: Immediate Predictions (No Setup Required)
The API has a built-in smart algorithm that can predict simple patterns immediately:

```bash
# Start the API
docker-compose up --build api redis

# Test with arithmetic sequence
curl -X POST http://localhost:5001/predict \
  -H "Content-Type: application/json" \
  -d '{
    "AREA": "test_series",
    "historical_data": [
      {"timestamp": "2024-01-01T12:00:00", "value": 3},
      {"timestamp": "2024-01-01T12:01:00", "value": 6},
      {"timestamp": "2024-01-01T12:02:00", "value": 9},
      {"timestamp": "2024-01-01T12:03:00", "value": 12}
    ]
  }'

# Expected result: prediction around 15
```

### Option 2: Machine Learning Predictions (Requires Training)
For more complex patterns, use the ML model:

```bash
# 1. Generate training data
docker-compose run --rm data-ingester python data_ingester.py --batch 200

# 2. Train the model
docker-compose run --rm retrainer python retrain.py

# 3. Test ML predictions
curl -X POST http://localhost:5001/predict \
  -H "Content-Type: application/json" \
  -d '{"AREA": "sensor_1"}'
```

## Simple Architecture

```
Data Ingester → Redis → API (Predictions)
                  ↓
              Retrainer → ML Model
```

- **Redis**: Stores all data permanently
- **API**: Makes predictions (smart algorithm + optional ML model)
- **Data Ingester**: Simulates real data for testing
- **Retrainer**: Trains ML model from Redis data

## Quick Commands

```bash
# Check system health
curl http://localhost:5001/health

# Start continuous data generation
docker-compose up data-ingester

# Retrain model anytime
docker-compose run --rm retrainer python retrain.py
```

That's it! The system uses Redis as the single storage layer - no complex file management needed.
