# KEDA (Kafka autoscaling)

Install KEDA in the cluster (requires internet access on the VM):

```bash
kubectl create namespace keda
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install keda kedacore/keda --namespace keda
```

Apply the ScaledObject for algorithm-processor:

```bash
kubectl apply -f k8s/apps/algorithm-processor/algorithm-processor-scaledobject.yaml
```
