#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Applying namespace..."
kubectl apply -f "${ROOT_DIR}/k8s/namespaces/namespace-kalmar-digital-twin.yaml"

echo "Applying config (ConfigMaps and Secrets)..."
kubectl apply -f "${ROOT_DIR}/k8s/config/"

echo "Applying infra components (Kafka, TimescaleDB, Prometheus)..."
kubectl apply -f "${ROOT_DIR}/k8s/infra/"

echo "Applying application workloads..."
kubectl apply -f "${ROOT_DIR}/k8s/apps/"

echo "Applying ingress..."
kubectl apply -f "${ROOT_DIR}/k8s/ingress/ingress.yaml"

echo "Done. Check resources with: kubectl get all -n kalmar-digital-twin"
