# Kubernetes Deployment Guide

This directory contains Kubernetes manifests for deploying the MCP Orchestrator to a Kubernetes cluster with auto-scaling support.

## Prerequisites

- Kubernetes cluster (v1.24+)
- kubectl configured
- Docker registry access (for pushing images)
- Nginx Ingress Controller installed
- Metrics Server installed (for HPA)

## Architecture

```
[Ingress] → [Service] → [Deployment (2-50 pods)] → [Redis StatefulSet]
                                  ↓
                          [Docker on each node]
```

## Quick Start

### 1. Build and Push Docker Image

```bash
# Build image
docker build -t your-registry/mcp-orchestrator-app:latest .

# Push to registry
docker push your-registry/mcp-orchestrator-app:latest

# Update kustomization.yaml with your registry
```

### 2. Create Secrets

```bash
kubectl create secret generic mcp-orchestrator-secrets \
  --from-literal=GEMINI_API_KEY=your_gemini_key \
  --from-literal=ANTHROPIC_API_KEY=your_anthropic_key \
  --from-literal=OPENAI_API_KEY=your_openai_key \
  -n mcp-orchestrator
```

### 3. Deploy to Kubernetes

```bash
# Apply all manifests
kubectl apply -k .

# Or apply individually
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f redis.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f hpa.yaml
kubectl apply -f ingress.yaml
```

### 4. Verify Deployment

```bash
# Check pods
kubectl get pods -n mcp-orchestrator

# Check services
kubectl get svc -n mcp-orchestrator

# Check HPA status
kubectl get hpa -n mcp-orchestrator

# Check ingress
kubectl get ingress -n mcp-orchestrator
```

## Configuration

### Environment Variables

Edit `configmap.yaml` to adjust settings:

```yaml
PORT: "3000"
LLM_PROVIDER: "gemini"  # or "claude", "openai"
ENABLE_CONTAINER_POOL: "true"
POOL_MIN_SIZE: "10"
POOL_MAX_SIZE: "100"
```

### Resource Limits

Edit `deployment.yaml` to adjust resources:

```yaml
resources:
  requests:
    memory: "1Gi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "2000m"
```

### Auto-Scaling

Edit `hpa.yaml` to adjust scaling behavior:

```yaml
minReplicas: 2
maxReplicas: 50
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        averageUtilization: 70
```

## Monitoring

### Check Pod Status

```bash
kubectl get pods -n mcp-orchestrator -w
```

### View Logs

```bash
# All pods
kubectl logs -n mcp-orchestrator -l app=mcp-orchestrator --tail=100

# Specific pod
kubectl logs -n mcp-orchestrator mcp-orchestrator-xxxxx-xxxxx -f
```

### Check HPA Metrics

```bash
kubectl get hpa -n mcp-orchestrator -w
```

### Describe Resources

```bash
kubectl describe deployment mcp-orchestrator -n mcp-orchestrator
kubectl describe hpa mcp-orchestrator-hpa -n mcp-orchestrator
```

## Scaling

### Manual Scaling

```bash
# Scale to specific replica count
kubectl scale deployment mcp-orchestrator --replicas=10 -n mcp-orchestrator
```

### Auto-Scaling

HPA automatically scales based on:
- CPU utilization (target: 70%)
- Memory utilization (target: 80%)
- Scale up: Immediate (max 4 pods or 100% increase per 15s)
- Scale down: Gradual (max 50% reduction per 60s, 5min stabilization)

## Updating

### Rolling Update

```bash
# Update image
kubectl set image deployment/mcp-orchestrator \
  orchestrator=your-registry/mcp-orchestrator-app:v2.0.0 \
  -n mcp-orchestrator

# Check rollout status
kubectl rollout status deployment/mcp-orchestrator -n mcp-orchestrator
```

### Update ConfigMap

```bash
# Edit configmap
kubectl edit configmap mcp-orchestrator-config -n mcp-orchestrator

# Restart deployment to pick up changes
kubectl rollout restart deployment/mcp-orchestrator -n mcp-orchestrator
```

## Troubleshooting

### Pods Not Starting

```bash
# Check pod events
kubectl describe pod mcp-orchestrator-xxxxx-xxxxx -n mcp-orchestrator

# Check logs
kubectl logs mcp-orchestrator-xxxxx-xxxxx -n mcp-orchestrator
```

### HPA Not Scaling

```bash
# Check metrics server
kubectl top nodes
kubectl top pods -n mcp-orchestrator

# Check HPA status
kubectl describe hpa mcp-orchestrator-hpa -n mcp-orchestrator
```

### Redis Connection Issues

```bash
# Check Redis pod
kubectl get pods -n mcp-orchestrator -l app=redis

# Test Redis connection
kubectl exec -it redis-0 -n mcp-orchestrator -- redis-cli ping

# Check Redis logs
kubectl logs redis-0 -n mcp-orchestrator
```

### Ingress Not Working

```bash
# Check ingress status
kubectl describe ingress mcp-orchestrator-ingress -n mcp-orchestrator

# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx
```

## Production Recommendations

### 1. Enable Redis Cluster

For high availability, use Redis Cluster:

```yaml
# redis.yaml
replicas: 3  # Change from 1 to 3+
```

### 2. Configure TLS/SSL

Uncomment TLS section in `ingress.yaml`:

```yaml
tls:
  - hosts:
    - mcp-orchestrator.example.com
    secretName: mcp-orchestrator-tls
```

### 3. Set Up Monitoring

Install Prometheus + Grafana:

```bash
# Add Prometheus Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring
```

### 4. Configure Resource Quotas

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: mcp-orchestrator-quota
  namespace: mcp-orchestrator
spec:
  hard:
    requests.cpu: "50"
    requests.memory: 100Gi
    limits.cpu: "100"
    limits.memory: 200Gi
```

### 5. Enable Pod Disruption Budget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: mcp-orchestrator-pdb
  namespace: mcp-orchestrator
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: mcp-orchestrator
```

## Cleanup

```bash
# Delete all resources
kubectl delete -k .

# Or delete namespace (removes everything)
kubectl delete namespace mcp-orchestrator
```

## Cost Optimization

### Development/Staging

```yaml
# Lower resource requests
requests:
  memory: "512Mi"
  cpu: "250m"

# Reduce replicas
minReplicas: 1
maxReplicas: 10
```

### Production

```yaml
# Higher resource requests for stability
requests:
  memory: "1Gi"
  cpu: "500m"

# More replicas for availability
minReplicas: 3
maxReplicas: 50
```

## Performance Tuning

### Node Affinity

Schedule pods on nodes with SSD:

```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
      - matchExpressions:
        - key: disktype
          operator: In
          values:
          - ssd
```

### Pod Anti-Affinity

Distribute pods across nodes:

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchExpressions:
          - key: app
            operator: In
            values:
            - mcp-orchestrator
        topologyKey: kubernetes.io/hostname
```

## Support

For issues or questions:
- Review logs: `kubectl logs -n mcp-orchestrator -l app=mcp-orchestrator`
- Check events: `kubectl get events -n mcp-orchestrator`
- Review SCALABILITY.md for architectural details
