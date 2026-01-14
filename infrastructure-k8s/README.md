# Kalmar Energi Digital Twin – Kubernetes Infrastructure (`infra-k8s`)

This repository contains **cloud-agnostic Kubernetes manifests** for a student
project: a cloud-native “Digital Twin” for smart energy management for a
fictional customer, **Kalmar Energi**.

> The actual application code (TypeScript microservices) lives in **other repos**.  
> This repo only contains **infrastructure and Kubernetes manifests**.

---

## Components

All resources live in a single namespace: **`kalmar-digital-twin`**.

### Core infrastructure (stateful)

- **Kafka** – event stream / message bus (StatefulSet + headless Service + PVC)
- **TimescaleDB (PostgreSQL)** – time-series database (StatefulSet + Service + PVC)
- **Prometheus** – metrics collection (simple Deployment)

A placeholder folder is included for **KEDA / custom metrics** configuration.

### Application workloads (stateless)

Application images are built from other repos and referenced here by **TODO**
placeholders:

- `data-generator` – Deployment + CronJob (batch data generation)
- `algorithm-processor` – Deployment + HPA
- `rest-api` – Deployment + Service
- `visualization-ui` – Deployment + Service (e.g. React dashboard)

### Networking

- Internal **ClusterIP Services** for Kafka, TimescaleDB, and microservices.
- One **Ingress** resource that:
  - Exposes REST API under `/api`
  - Exposes visualization UI under `/dashboard`
  - Uses placeholder host: `kalmar-twin.local` (can be customized).

### Configuration & Secrets

- `ConfigMap` with shared application configuration (Kafka broker, DB host, etc.).
- Example `Secret` with dummy credentials (TimescaleDB user/password, etc.).

### Autoscaling

- `HPA` for `algorithm-processor`:
  - Scales between 1 and 5 replicas based on **CPU utilization**.
- Commented TODO showing where to plug in **Kafka lag / KEDA ScaledObject** later.

---

## Applying the manifests

>  These manifests are designed to work on any Kubernetes cluster:
> `kind`, `minikube`, or managed services (EKS/GKE/AKS) with minimal changes
> (images, storage class, hostnames, ingress controller, etc.).

### 1. Create namespace

```bash
kubectl apply -f k8s/namespaces/namespace-kalmar-digital-twin.yaml
