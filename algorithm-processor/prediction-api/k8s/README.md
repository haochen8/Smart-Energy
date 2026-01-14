# Prediction API - Kubernetes Deployment

This directory contains Kubernetes manifests for deploying the Prediction API to k3s or any Kubernetes cluster.

## Prerequisites

- k3s or Kubernetes cluster running
- kubectl configured to access your cluster
- Docker image built and available (see main README for building)

## Quick Start

1. **Build and push your Docker image:**
   ```bash
   # Build the image
   docker build -t prediction-api:latest .
   
   # For k3s, load the image directly
   sudo k3s ctr images import <(docker save prediction-api:latest)
   ```

2. **Deploy to k3s:**
   ```bash
   ./deploy.sh
   ```

3. **Access your API:**
   - Add to `/etc/hosts`: `127.0.0.1 prediction-api.local`
   - Visit: http://prediction-api.local
   - Or use NodePort: http://localhost:30080

## Manual Deployment

```bash
# Apply all resources
kubectl apply -k .

# Or apply individually
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f redis-deployment.yaml
kubectl apply -f api-deployment.yaml
kubectl apply -f ingress.yaml
```

## Configuration Management

### ConfigMap
Contains non-sensitive configuration:
- Redis connection settings
- Model parameters
- API limits
- Gunicorn settings

### Secrets
Contains sensitive data:
- Flask secret key
- Redis passwords (if using AUTH)

### Environment Files
- `env.development` - Development settings
- `env.production` - Production settings

## Scaling

```bash
# Scale API replicas
kubectl scale deployment prediction-api --replicas=3 -n prediction-api

# Scale Redis (not recommended for single-instance Redis)
kubectl scale deployment redis --replicas=1 -n prediction-api
```

## Monitoring

```bash
# Check pod status
kubectl get pods -n prediction-api

# View logs
kubectl logs -f deployment/prediction-api -n prediction-api
kubectl logs -f deployment/redis -n prediction-api

# Check services
kubectl get services -n prediction-api

# Check ingress
kubectl get ingress -n prediction-api
```

## Troubleshooting

### Common Issues

1. **Image not found:**
   ```bash
   # Load image into k3s
   sudo k3s ctr images import <(docker save prediction-api:latest)
   ```

2. **Redis connection issues:**
   ```bash
   # Check Redis service
   kubectl get svc redis-service -n prediction-api
   kubectl describe pod -l app=redis -n prediction-api
   ```

3. **API not responding:**
   ```bash
   # Check API logs
   kubectl logs -f deployment/prediction-api -n prediction-api
   
   # Check health endpoint
   kubectl port-forward svc/prediction-api-service 8080:80 -n prediction-api
   curl http://localhost:8080/health
   ```

## Production Considerations

1. **Update the secret key:**
   ```bash
   # Generate new secret
   echo -n "your-new-secret-key" | base64
   
   # Update secret.yaml with the base64 value
   kubectl apply -f secret.yaml
   ```

2. **Use proper image registry:**
   - Update `api-deployment.yaml` with your registry URL
   - Use specific image tags instead of `latest`

3. **Configure resource limits:**
   - Adjust CPU/memory limits in deployment files
   - Monitor resource usage

4. **Enable SSL/TLS:**
   - Configure TLS certificates in ingress
   - Update Traefik annotations for HTTPS

## Cleanup

```bash
# Remove all resources
kubectl delete namespace prediction-api

# Or remove individually
kubectl delete -k .
```
