# Phase 3 Deployment Guide - Advanced Optimizations

This guide covers deploying Phase 3 optimizations for 20-50x capacity improvement and 10,000+ concurrent users.

## Overview

Phase 3 introduces:
1. **Kubernetes Deployment** - Auto-scaling from 2-50 pods
2. **Worker Architecture** - Separate MCP execution service
3. **Memory Optimizations** - Compression and streaming

## Expected Performance

| Metric | Before Phase 3 | After Phase 3 |
|--------|----------------|---------------|
| **Max Concurrent Users** | ~2000-5000 | ~10,000+ |
| **Memory per User** | 8-10 MB | 5-8 MB |
| **Deployment** | Manual scaling | Auto-scaling (K8s) |
| **Architecture** | Monolithic | Microservices |

---

## Option 1: Memory Optimizations Only

Enable memory optimizations without Kubernetes or worker architecture.

### 1. Enable Conversation Compression

Edit `.env`:
```bash
ENABLE_CONVERSATION_COMPRESSION=true
```

**Benefits**:
- 60-80% reduction in Redis memory usage
- Conversation history compressed with gzip
- Transparent to application logic

**Trade-offs**:
- Slight CPU overhead for compression/decompression
- ~5-10ms added latency per message

### 2. Start with Optimized Settings

```bash
# Instead of: npm start
# Use:
npm run start:optimized

# Or directly:
./start-optimized.sh
```

This applies:
- `--max-old-space-size=4096` (4GB heap)
- `--expose-gc` (manual GC control)
- `--optimize-for-size` (memory over speed)

### 3. Verify Compression

Check Redis memory usage:
```bash
docker exec mcp-redis redis-cli INFO memory
```

Look for `used_memory_human` - should be 60-80% lower with compression enabled.

---

## Option 2: Worker Architecture

Deploy separate worker processes for tool execution.

### Architecture

```
[Orchestrator] → [Redis Queue] → [Worker Fleet (1-10 workers)]
       ↓                                    ↓
   [WebSocket]                         [Docker]
   [Sessions]                       [Tool Execution]
```

### 1. Start Orchestrator (API Gateway)

```bash
# Build
npm run build

# Start orchestrator
npm start
```

### 2. Start Workers

In separate terminal(s):
```bash
# Start 1 worker with 10 concurrent jobs
WORKER_CONCURRENCY=10 npm run start:worker

# Or multiple workers:
WORKER_CONCURRENCY=10 npm run start:worker &
WORKER_CONCURRENCY=10 npm run start:worker &
WORKER_CONCURRENCY=10 npm run start:worker &
```

### 3. Enable Worker Mode

Edit `.env`:
```bash
ENABLE_WORKER_MODE=true
WORKER_CONCURRENCY=10
JOB_TIMEOUT_MS=300000
```

### Benefits
- **Stateless orchestrator** - Easy to scale horizontally
- **Independent scaling** - Scale workers separately from API
- **Fault isolation** - Worker crash doesn't affect orchestrator
- **Better resource utilization** - Workers on dedicated nodes

### Monitoring

Check queue depth:
```bash
# Redis CLI
docker exec mcp-redis redis-cli LLEN mcp:jobs:queue
```

View worker logs:
```bash
# If running with npm
# Check terminal where worker is running

# If running as background process
ps aux | grep worker
```

---

## Option 3: Kubernetes Deployment (Full Phase 3)

Deploy to Kubernetes for maximum scalability.

### Prerequisites

- Kubernetes cluster (v1.24+)
- kubectl configured
- Docker registry
- Nginx Ingress Controller
- Metrics Server (for HPA)

### 1. Build and Push Image

```bash
# Build
docker build -t your-registry/mcp-orchestrator-app:latest .

# Push
docker push your-registry/mcp-orchestrator-app:latest

# Update k8s/kustomization.yaml
# Change image registry to yours
```

### 2. Create Secrets

```bash
kubectl create secret generic mcp-orchestrator-secrets \
  --from-literal=GEMINI_API_KEY=your_key \
  --from-literal=ANTHROPIC_API_KEY=your_key \
  --from-literal=OPENAI_API_KEY=your_key \
  -n mcp-orchestrator
```

### 3. Deploy to Kubernetes

```bash
cd k8s/

# Apply all manifests
kubectl apply -k .

# Or apply individually
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
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

# Check HPA
kubectl get hpa -n mcp-orchestrator

# Check services
kubectl get svc -n mcp-orchestrator

# View logs
kubectl logs -n mcp-orchestrator -l app=mcp-orchestrator -f
```

### 5. Test Auto-Scaling

Generate load to trigger HPA:
```bash
# Install hey (HTTP load tool)
go install github.com/rakyll/hey@latest

# Generate load
hey -z 60s -c 100 http://your-ingress-url/
```

Watch pods scale:
```bash
kubectl get hpa -n mcp-orchestrator -w
```

### Benefits
- **Auto-scaling**: 2-50 pods based on CPU/memory
- **High availability**: Multi-replica deployment
- **Self-healing**: Automatic pod restarts
- **Zero-downtime deploys**: Rolling updates
- **Resource limits**: Prevent resource exhaustion

---

## Configuration Options

### Memory Optimization Settings

```bash
# Enable conversation compression (60-80% memory reduction)
ENABLE_CONVERSATION_COMPRESSION=true

# Streaming threshold for large outputs (1MB)
STREAM_OUTPUT_THRESHOLD_BYTES=1048576
```

### Worker Settings

```bash
# Enable worker architecture
ENABLE_WORKER_MODE=true

# Concurrent jobs per worker (5-20 recommended)
WORKER_CONCURRENCY=10

# Job timeout (5 minutes)
JOB_TIMEOUT_MS=300000
```

### Node.js Memory Settings

Edit `start-optimized.sh`:
```bash
# Heap size (adjust based on available RAM)
--max-old-space-size=4096  # 4GB

# Expose GC for manual control
--expose-gc

# Optimize for memory over speed
--optimize-for-size
```

---

## Monitoring

### Memory Usage

```bash
# Docker memory usage
docker stats --no-stream

# Kubernetes pod memory
kubectl top pods -n mcp-orchestrator

# Redis memory
docker exec mcp-redis redis-cli INFO memory
```

### Worker Queue

```bash
# Queue depth
docker exec mcp-redis redis-cli LLEN mcp:jobs:queue

# Should stay < 100 under normal load
```

### Auto-Scaling (Kubernetes)

```bash
# Watch HPA scale
kubectl get hpa -n mcp-orchestrator -w

# Pod count
kubectl get pods -n mcp-orchestrator
```

### Key Metrics

1. **Memory per Pod** - Should be 1-2GB under load
2. **Queue Depth** - Should stay < 100
3. **Pod Count** - Should scale 2-50 based on load
4. **Redis Memory** - With compression, 40-60% of without

---

## Troubleshooting

### High Memory Usage

**Symptom**: Pods using > 2GB memory

**Solutions**:
1. Enable compression:
   ```bash
   ENABLE_CONVERSATION_COMPRESSION=true
   ```

2. Reduce pool sizes:
   ```bash
   POOL_MIN_SIZE=5
   POOL_MAX_SIZE=50
   ```

3. Lower resource limits in `k8s/deployment.yaml`:
   ```yaml
   limits:
     memory: "2Gi"
   ```

### Worker Queue Backing Up

**Symptom**: Queue depth > 100

**Solutions**:
1. Scale workers:
   ```bash
   # Add more workers
   WORKER_CONCURRENCY=10 npm run start:worker &
   ```

2. Increase worker concurrency:
   ```bash
   WORKER_CONCURRENCY=20
   ```

3. Check for slow tool executions

### Kubernetes Pods Not Scaling

**Symptom**: HPA shows high CPU but pods not scaling

**Check**:
```bash
# Verify metrics server
kubectl top nodes
kubectl top pods -n mcp-orchestrator

# Check HPA events
kubectl describe hpa mcp-orchestrator-hpa -n mcp-orchestrator

# Check HPA conditions
kubectl get hpa -n mcp-orchestrator -o yaml
```

**Solutions**:
1. Install/restart metrics server
2. Adjust HPA thresholds
3. Verify resource requests are set in deployment

### Compression Errors

**Symptom**: Errors decompressing conversation history

**Cause**: Mixed compressed/uncompressed data in Redis

**Solution**:
```bash
# Clear Redis and restart
docker exec mcp-redis redis-cli FLUSHDB
docker compose restart app
```

---

## Performance Testing

### Load Test Configuration

Create `load-test-phase3.yml`:
```yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 120
      arrivalRate: 200  # 200 new users/sec
      name: "Phase 3 stress test"

scenarios:
  - engine: socketio
    flow:
      - emit:
          channel: "message"
          data: "Execute complex tool with large output"
      - think: 10
```

Run test:
```bash
artillery run load-test-phase3.yml
```

### Success Criteria

- ✅ Sustain 10,000+ concurrent users
- ✅ Memory per user < 8MB
- ✅ Queue depth < 100
- ✅ Response time p95 < 15 seconds
- ✅ Auto-scaling responsive (< 60s to add pods)
- ✅ No memory leaks over 24 hours

---

## Cost Optimization

### Development

```bash
# Disable compression (faster, uses more memory)
ENABLE_CONVERSATION_COMPRESSION=false

# Smaller pool
POOL_MIN_SIZE=3
POOL_MAX_SIZE=20

# Fewer workers
WORKER_CONCURRENCY=5

# Kubernetes: 1-5 pods
minReplicas: 1
maxReplicas: 5
```

### Production

```bash
# Enable all optimizations
ENABLE_CONTAINER_POOL=true
ENABLE_CONVERSATION_COMPRESSION=true
ENABLE_WORKER_MODE=true

# Larger pool
POOL_MIN_SIZE=20
POOL_MAX_SIZE=200

# More workers
WORKER_CONCURRENCY=20

# Kubernetes: 3-50 pods
minReplicas: 3
maxReplicas: 50
```

---

## Rollback

### From Memory Optimizations:
```bash
# Disable compression
ENABLE_CONVERSATION_COMPRESSION=false

# Use standard start
npm start  # Instead of start:optimized
```

### From Worker Architecture:
```bash
# Disable worker mode
ENABLE_WORKER_MODE=false

# Stop workers
pkill -f "node dist/worker.js"
```

### From Kubernetes:
```bash
# Switch back to docker-compose
kubectl delete -k k8s/
docker compose up -d
```

---

## Support

For issues or questions:
- Review k8s/README.md for Kubernetes-specific help
- Check SCALABILITY.md for architectural details
- View worker logs: `kubectl logs -n mcp-orchestrator -l app=worker`
- Monitor queue: `redis-cli LLEN mcp:jobs:queue`

---

**Last Updated**: 2026-02-12
**Phase**: 3 - Advanced Optimizations
**Expected Improvement**: 20-50x capacity (10,000+ concurrent users)
