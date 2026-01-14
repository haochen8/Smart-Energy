#!/bin/bash

# Prediction API k3s Deployment Script
set -e

echo "🚀 Deploying Prediction API to k3s..."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Check if k3s is running
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ k3s cluster is not accessible"
    exit 1
fi

echo "✅ k3s cluster is accessible"

# Create namespace
echo "📦 Creating namespace..."
kubectl apply -f namespace.yaml

# Apply ConfigMap and Secrets
echo "⚙️  Applying configuration..."
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml

# Deploy Redis
echo "🔴 Deploying Redis..."
kubectl apply -f redis-deployment.yaml

# Wait for Redis to be ready
echo "⏳ Waiting for Redis to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/redis -n prediction-api

# Deploy API
echo "🚀 Deploying Prediction API..."
kubectl apply -f api-deployment.yaml

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/prediction-api -n prediction-api

# Apply Ingress
echo "🌐 Applying Ingress..."
kubectl apply -f ingress.yaml

echo "✅ Deployment completed!"

# Show status

echo "📊 Deployment Status:"
kubectl get pods -n prediction-api
kubectl get services -n prediction-api
kubectl get ingress -n prediction-api

echo ""
echo "🔗 Access your API:"
echo "  - Local: http://prediction-api.local (add to /etc/hosts)"
echo "  - NodePort: http://<node-ip>:30080"
echo "  - Health check: http://<node-ip>:30080/health"
echo ""
echo "📝 To check logs:"
echo "  kubectl logs -f deployment/prediction-api -n prediction-api"
echo "  kubectl logs -f deployment/redis -n prediction-api"
