# Redis-Based Time Series API - Simple Usage Guide

## What This System Does

A Flask API that predicts future values in time series data, using Redis as storage and Docker for easy deployment.

## How to Use It

### Method 1: Test Immediately (Built-in Smart Algorithm)

No setup required! The API can detect simple patterns right away:

```bash
# Start the basic services
docker-compose up --build api redis

# Test with a simple arithmetic sequence
curl -X POST http://localhost:5000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "AREA": "demo",
    "historical_data": [
      {"timestamp": "2024-01-01T12:00:00", "value": 10},
      {"timestamp": "2024-01-01T12:01:00", "value": 20},
      {"timestamp": "2024-01-01T12:02:00", "value": 30}
    ]
  }'
```

**Expected result**: The API will predict the next value as `40` because it detected the pattern (+10 each step).

### Method 2: Use Machine Learning (Requires Training)

For complex patterns that need a trained model:

```bash
# Step 1: Generate some training data
docker-compose run --rm data-ingester python data_ingester.py --batch 200

# Step 2: Train the machine learning model
docker-compose run --rm retrainer python retrain.py

# Step 3: Make predictions using the trained model
curl -X POST http://localhost:5000/predict \
  -H "Content-Type: application/json" \
  -d '{"AREA": "sensor_1"}'
```

## System Components

- **Flask API** (`app.py`): Makes predictions, stores data in Redis
- **Redis**: Stores all time series data permanently
- **Data Ingester** (`data_ingester.py`): Generates fake sensor data for testing
- **Retrainer** (`retrain.py`): Trains ML models using data from Redis

## Useful Commands

```bash
# Check if everything is working
curl http://localhost:5000/health

# See what data is available
curl http://localhost:5000/data/historical/summary

# Start generating continuous test data
docker-compose up data-ingester

# Retrain the ML model with new data
docker-compose run --rm retrainer python retrain.py
```

## Key Benefits

1. **Simple Storage**: Everything stored in Redis - no file management
2. **Immediate Testing**: Built-in algorithm works without training
3. **Scalable**: Add ML models when you need more sophisticated predictions
4. **Containerized**: Easy to deploy anywhere with Docker

Perfect for demonstrating time series prediction in a containerized environment!
