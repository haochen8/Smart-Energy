# Monitoring (Prometheus + Grafana)

This folder installs Prometheus + Grafana for ops/scaling visibility on k3s.

## Install on the VM

```bash
# Create namespace
sudo k3s kubectl apply -f /home/ubuntu/visualization/k8s/monitoring/namespace.yaml

# Create Grafana admin secret
sudo k3s kubectl -n monitoring create secret generic grafana-admin \
  --from-literal=admin-user=admin \
  --from-literal=admin-password=change-me \
  --dry-run=client -o yaml | sudo k3s kubectl apply -f -

# Install kube-prometheus-stack
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n monitoring \
  -f /home/ubuntu/visualization/k8s/monitoring/kube-prometheus-stack-values.yaml
```

## Access Grafana

- URL: `http://194.47.171.153:32000`
- Username: `admin`
- Password: `change-me`

Change the password after first login.
