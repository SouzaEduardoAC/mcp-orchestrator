# Phase 2 Deployment Guide

This guide covers deploying Phase 2 optimizations for 5-10x capacity improvement.

## Overview

Phase 2 introduces:
1. **Container Pooling** - Reduces container acquisition from 2-5s to <100ms
2. **Request Backpressure** - Prevents memory explosion (max 5 concurrent requests per user)
3. **Horizontal Scaling** - Multiple Node.js instances with load balancing

## Expected Performance

| Metric | Before Phase 2 | After Phase 2 |
|--------|----------------|---------------|
| **Max Concurrent Users** | ~200-300 | ~2000-5000 |
| **Container Acquisition** | 2-5 seconds | <100ms |
| **Memory per User** | 10-15 MB | 8-10 MB |
| **Request Handling** | Unlimited (risk of DoS) | Limited (5 per user) |

---

## Option 1: Container Pooling Only (Easiest)

Enable container pooling without horizontal scaling.

### 1. Update Environment Variables

Edit your `.env` file:

```bash
# Enable container pooling
ENABLE_CONTAINER_POOL=true
POOL_MIN_SIZE=10
POOL_MAX_SIZE=100
POOL_IDLE_TIMEOUT_MS=900000
```

### 2. Restart Application

```bash
docker compose down
docker compose up -d --build
```

### 3. Verify Container Pool

Check logs for pooling initialization:

```bash
docker compose logs app | grep "ContainerPool"
```

You should see:
```
[Phase 2] Container pooling enabled
[ContainerPool] Initializing with min=10, max=100
[ContainerPool] Warming up 10 containers...
[ContainerPool] Initialized with 10 idle containers
```

### Benefits
- 2-3x capacity improvement
- Faster user onboarding (<100ms vs 2-5s)
- Reduced Docker daemon load

### Considerations
- Increased base memory usage (~5-7.5 GB for 10 idle containers)
- Requires Docker socket access
- Container cleanup between sessions is critical

---

## Option 2: Full Horizontal Scaling (Recommended for Production)

Run multiple Node.js instances with Nginx load balancing.

### 1. Update Environment Variables

Edit your `.env` file:

```bash
# Enable container pooling
ENABLE_CONTAINER_POOL=true
POOL_MIN_SIZE=5
POOL_MAX_SIZE=50
POOL_IDLE_TIMEOUT_MS=900000

# LLM Provider and Keys
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
```

### 2. Deploy with Scaling Configuration

```bash
# Stop current deployment
docker compose down

# Deploy with scaling
docker compose -f docker-compose.scale.yml up -d --build
```

### 3. Verify Deployment

Check all services are running:

```bash
docker compose -f docker-compose.scale.yml ps
```

You should see:
- 1x Redis
- 4x App instances
- 1x Nginx load balancer
- 1x MCP placeholder

### 4. Test Load Balancing

```bash
# Check Nginx is routing requests
curl http://localhost:3000/health

# View Nginx logs
docker logs mcp-nginx -f
```

### 5. Monitor Performance

```bash
# View all app logs
docker compose -f docker-compose.scale.yml logs app -f

# View Redis stats
docker exec mcp-redis redis-cli INFO stats
```

### Benefits
- 5-10x capacity improvement
- Redundancy (one instance fails, others continue)
- Better resource utilization
- Sticky sessions (same user → same server)

### Considerations
- Requires more CPU cores (recommended 4-8 cores)
- Increased memory usage (~2-4 GB per instance)
- Redis is now critical single point of failure
- Shared session state requires Redis

---

## Configuration Options

### Container Pool Settings

```bash
# Minimum idle containers to maintain
POOL_MIN_SIZE=10

# Maximum total containers (idle + active)
POOL_MAX_SIZE=100

# How long idle containers stay alive (ms)
POOL_IDLE_TIMEOUT_MS=900000  # 15 minutes
```

**Recommendations:**
- **Development**: `POOL_MIN_SIZE=5`, `POOL_MAX_SIZE=50`
- **Staging**: `POOL_MIN_SIZE=10`, `POOL_MAX_SIZE=100`
- **Production**: `POOL_MIN_SIZE=20`, `POOL_MAX_SIZE=200`

### Horizontal Scaling

Edit `docker-compose.scale.yml` to adjust replicas:

```yaml
app:
  deploy:
    replicas: 4  # Change this number (2-8 recommended)
```

**Recommendations:**
- **2-4 cores**: 2 replicas
- **4-8 cores**: 4 replicas
- **8+ cores**: 6-8 replicas

---

## Monitoring

### Container Pool Stats

Container pool exposes statistics for monitoring:

```typescript
// Example monitoring endpoint (add to your app)
app.get('/stats/pool', (req, res) => {
  const stats = containerPool?.getStats();
  res.json(stats);
});
```

Returns:
```json
{
  "idle": 8,
  "active": 12,
  "total": 20,
  "maxPoolSize": 100,
  "minPoolSize": 10
}
```

### Key Metrics to Monitor

1. **Container Pool Utilization**
   - `active / maxPoolSize > 0.8` → Increase max pool size
   - `idle > minPoolSize * 2` → Reduce min pool size

2. **Request Queue Depth**
   - Monitor "Too many concurrent requests" errors
   - If frequent, increase `MAX_REQUESTS_PER_USER` in `SocketRegistry.ts`

3. **Redis Memory Usage**
   ```bash
   docker exec mcp-redis redis-cli INFO memory
   ```
   - Keep below 80% of max memory (2GB default)

4. **Nginx Connection Count**
   ```bash
   docker exec mcp-nginx cat /var/log/nginx/access.log | wc -l
   ```

---

## Troubleshooting

### Container Pool Not Starting

**Symptom**: No containers in idle pool

**Check**:
```bash
docker compose logs app | grep "ContainerPool"
```

**Common Causes**:
- Docker socket not mounted
- Insufficient permissions
- `ENABLE_CONTAINER_POOL` not set to `true`

**Solution**:
```bash
# Verify Docker socket is accessible
docker compose exec app ls -la /var/run/docker.sock

# Check environment variable
docker compose exec app env | grep ENABLE_CONTAINER_POOL
```

### Nginx Not Routing to Apps

**Symptom**: 502 Bad Gateway errors

**Check**:
```bash
docker logs mcp-nginx
```

**Common Causes**:
- App instances not started yet
- Network configuration issue
- App crashed on startup

**Solution**:
```bash
# Verify app instances are running
docker compose -f docker-compose.scale.yml ps app

# Check app logs
docker compose -f docker-compose.scale.yml logs app

# Restart services
docker compose -f docker-compose.scale.yml restart
```

### High Memory Usage

**Symptom**: Server running out of memory

**Check**:
```bash
# Container memory usage
docker stats --no-stream

# Pool statistics
curl http://localhost:3000/stats/pool
```

**Solutions**:
1. Reduce pool size:
   ```bash
   POOL_MIN_SIZE=5
   POOL_MAX_SIZE=50
   ```

2. Reduce replicas in `docker-compose.scale.yml`:
   ```yaml
   replicas: 2
   ```

3. Increase server memory or add memory limits per container

### Redis Connection Issues

**Symptom**: "Could not connect to Redis" errors

**Check**:
```bash
# Redis container status
docker compose -f docker-compose.scale.yml ps redis

# Redis connectivity
docker exec mcp-redis redis-cli ping
```

**Solution**:
```bash
# Restart Redis
docker compose -f docker-compose.scale.yml restart redis

# Verify Redis URL in environment
docker compose exec app env | grep REDIS_URL
```

---

## Rollback

If you encounter issues, rollback to Phase 1:

### From Container Pooling Only:

```bash
# Disable container pooling
# Edit .env:
ENABLE_CONTAINER_POOL=false

# Restart
docker compose down
docker compose up -d
```

### From Horizontal Scaling:

```bash
# Stop scaled deployment
docker compose -f docker-compose.scale.yml down

# Start single instance
docker compose up -d
```

---

## Performance Testing

### Load Test with Artillery

Install Artillery:
```bash
npm install -g artillery
```

Create `load-test-phase2.yml`:
```yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 50  # 50 new users per second
      name: "Ramp up"
    - duration: 300
      arrivalRate: 100  # 100 new users/sec = ~3000 concurrent
      name: "Sustained load"

scenarios:
  - engine: socketio
    flow:
      - emit:
          channel: "message"
          data: "List all files in /workspace"
      - think: 5
      - emit:
          channel: "tool:approval"
          data:
            callId: "{{ callId }}"
            approved: true
```

Run test:
```bash
artillery run load-test-phase2.yml
```

### Success Criteria

- ✅ Sustain 2000+ concurrent users for 5 minutes
- ✅ Container acquisition time p95 < 200ms
- ✅ No memory leaks (stable over 30 minutes)
- ✅ Error rate < 1%
- ✅ No "Too many requests" errors under normal load
- ✅ Redis memory stays below 80%

---

## Next Steps

After deploying Phase 2:

1. **Monitor for 1-2 weeks**
   - Collect metrics on actual usage patterns
   - Identify remaining bottlenecks
   - Tune pool sizes based on actual demand

2. **Consider Phase 3** (if needed)
   - Kubernetes deployment for auto-scaling
   - Separate MCP execution service
   - Memory optimizations (compression, streaming)

3. **Implement Monitoring Dashboard**
   - Prometheus + Grafana
   - Alert on error rates, memory usage, pool exhaustion

---

## Support

For issues or questions:
- Review `SCALABILITY.md` for detailed technical background
- Check application logs: `docker compose logs -f app`
- Monitor Redis: `docker exec mcp-redis redis-cli MONITOR`
- Review Nginx logs: `docker logs mcp-nginx -f`

---

**Last Updated**: 2026-02-12
**Phase**: 2 - Architectural Changes
**Expected Improvement**: 5-10x capacity (2000-5000 concurrent users)
