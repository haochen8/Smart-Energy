# Simple Time-Series Prediction API 🚀

## What is this?

This is a simple web app that can predict future values based on your data. Think of it like asking "What's the next number in this sequence?"

For example, if you give it: `100, 101, 102, 103, 104`
It might predict the next number could be around: `105`

## What's inside?

- **Web API**: A simple web API that accepts your data and gives predictions
- **Redis Storage**: Persistent storage for all your time-series data  
- **Smart Model**: Trend-following algorithm that learns from patterns
- **Everything runs in containers**: No messy setup - just one command and it works!

## How to run it?

### Step 1: Start everything

```bash
docker-compose up --build
```

Wait a few minutes for everything to start up. You'll see lots of text, but don't worry!

### Step 2: Check if it's working

Open your web browser or use this command:

```bash
curl http://localhost:5001/health
```

You should see something like: `"status": "healthy"`

### Step 3: Make a prediction

```bash
curl -X POST http://localhost:5001/predict \
  -H "Content-Type: application/json" \
  -d '{"historical_data": [
    {"timestamp": "2024-01-01", "value": 100.0},
    {"timestamp": "2024-01-02", "value": 101.0},
    {"timestamp": "2024-01-03", "value": 102.0},
    {"timestamp": "2024-01-04", "value": 103.0},
    {"timestamp": "2024-01-05", "value": 104.0}
  ]}'
```

## Stateless vs Stateful Predictions 🧠

This API demonstrates an important concept in time-series modeling: **the importance of state**.

### With Redis (Stateful) 🎯

When Redis is running, the API remembers your data between requests:

```bash
curl -X POST http://localhost:5001/predict \
  -H "Content-Type: application/json" \
  -d '{"historical_data": [
    {"timestamp": "2024-01-01", "value": 100.0},
    {"timestamp": "2024-01-02", "value": 101.0},
    {"timestamp": "2024-01-03", "value": 102.0}
  ]}'
```

### Without Redis (Stateless) ⚠️

Even if Redis is down, the API will still make predictions using dummy data:

```bash
curl -X POST http://localhost:5001/predict \
  -H "Content-Type: application/json" \
  -d '{"value": 100}'
```

**Result**: You'll get inconsistent predictions because there's no historical context!

```json
{
  "prediction": 103.2,
  "warning": "STATELESS PREDICTION: No historical context available",
  "note": "This prediction is based on randomly generated dummy data and will be inconsistent across requests",
  "prediction_quality": "LOW - No historical context"
}
```

**Try calling the same endpoint multiple times** - you'll get different results each time! This perfectly demonstrates why stateful containers are crucial for time-series applications.

## What you'll get back

The API will return something like:

```json
{
  "prediction": 105.0,
  "model_type": "smart_trend_following",
  "data_points_used": 5,
  "timestamp": "2025-07-31T13:05:09.122812"
}
```

This means: "Based on your 5 data points, I predict the next value will be around 105.0"

The API uses an intelligent trend-following algorithm that:
- 🔍 **Detects patterns** in your data sequence
- 📈 **Follows arithmetic sequences** (like 2, 4, 6, 8 → predicts 10)
- 📊 **Calculates weighted trends** for more complex patterns
- 🎯 **Gives accurate predictions** for linear and near-linear sequences

## What's running?

When you start the app, two things happen:

1. **Web API** starts on `http://localhost:5001` - this is where you send your data
2. **Redis Database** starts on port `6379` - this stores ALL your data permanently

### The Key Insight 💡

**Redis isn't just a cache** - it's your **persistent database**! All your time-series data lives in Redis permanently, demonstrating how external state storage solves the containerization challenge.

## How to stop it?

```bash
docker-compose down
```

## What can you do with this?

- Predict stock prices (though don't bet money on it!)
- Forecast website traffic
- Predict sales numbers
- Any data that changes over time!

## Need help?

- Make sure Docker is installed and running
- The first time might take a few minutes to download everything
- If something breaks, try `docker-compose down` then `docker-compose up --build` again

## Why is this useful?

This shows how to build a "smart" web service that:

- ✅ Remembers things (has memory)
- ✅ Can be easily moved between computers (containerized)
- ✅ Handles multiple requests at once
- ✅ Gives consistent results

Perfect for learning how modern web apps work!
