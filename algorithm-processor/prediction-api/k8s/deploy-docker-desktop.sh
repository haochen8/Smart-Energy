#!/bin/bash

# Prediction API Docker Desktop Kubernetes Deployment Script
set -e

echo "🚀 Deploying Prediction API to Docker Desktop Kubernetes..."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Check if cluster is running
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Kubernetes cluster is not accessible"
    echo "💡 Make sure Docker Desktop Kubernetes is enabled"
    exit 1
fi

echo "✅ Kubernetes cluster is accessible"

# Build the Docker image
echo "🐳 Building Docker image..."
cd .. && docker build -t prediction-api:latest .

# For Docker Desktop, the image is automatically available to Kubernetes
echo "📦 Image built successfully and available to Docker Desktop Kubernetes"
cd k8s

# Create namespace
echo "📦 Creating namespace..."
kubectl apply -f namespace.yaml

# Apply ConfigMap and Secrets
echo "⚙️  Applying configuration..."
kubectl apply -f docker-desktop-configmap.yaml
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

# Apply services
echo "🌐 Applying services..."
kubectl apply -f docker-desktop-ingress.yaml

echo "✅ Deployment completed!"

# Show status
echo "📊 Deployment Status:"
kubectl get pods -n prediction-api
kubectl get services -n prediction-api

echo ""
echo "🔗 Access your API:"
echo "  - NodePort: http://localhost:30080"
echo "  - Health check: http://localhost:30080/health"
echo "  - API docs: http://localhost:30080/"
echo ""
echo "📝 To check logs:"
echo "  kubectl logs -f deployment/prediction-api -n prediction-api"
echo "  kubectl logs -f deployment/redis -n prediction-api"
echo ""
echo "🧪 Test the API:"
echo "  curl http://localhost:30080/health"
echo "  curl http://localhost:30080/"
