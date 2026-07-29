# 0040. Intentional In-Memory Rate Limiting for Single-Instance Deployment

- **Status**: Accepted
- **Classification**: Technical Debt (Low / Managed) & Planned Future Enhancement
- **Date**: 2026-07-29
- **Deciders**: Principal Software Architect, DevSecOps Engineering Lead

## 1. Context

The Kynergy Platform currently operates as a single-instance Modular Monolith backed by PostgreSQL. The API is deployed without distributed caching services (e.g., Redis/Memcached) or container orchestration clusters (e.g., Kubernetes, AWS ECS).

A recent Security Hardening Review highlighted the following operational observation:

> _"In-memory rate limiting does not provide shared counters across multiple API instances."_

While distributed rate limiting is essential for multi-node clusters, introducing a distributed cache infrastructure during the current single-instance development phase would introduce unnecessary operational complexity and infrastructure overhead.

---

## 2. Architectural Decision

We intentionally select `@nestjs/throttler` with the default **in-memory storage engine** for transport-level rate limiting in the current phase.

This is an intentional architectural trade-off rather than an oversight:

1. **Deployment Symmetry**: For a single API instance, in-memory counter tracking is 100% accurate and provides identical protection to a distributed cache.
2. **Pluggable Storage Abstraction**: `@nestjs/throttler` encapsulates counter storage behind a pluggable storage port (`ThrottlerStorage`). Application controllers (`@LoginThrottle()`, `@RefreshThrottle()`) and domain logic are entirely decoupled from the underlying storage driver.

---

## 3. Consequences

### Benefits

- **Simpler Architecture**: Keeps the runtime topology lean and manageable.
- **Fewer Operational Dependencies**: Eliminates operational overhead, monitoring, and network failure modes associated with external cache clusters.
- **Lower Infrastructure Cost**: Minimizes cloud resource consumption during initial platform deployment.
- **Developer Experience**: Enables frictionless local development and automated CI/CD pipeline execution without requiring local Redis services.

### Limitations

- **Instance-Local Counters**: Rate limiting counters are maintained strictly within node process memory.
- **Horizontal Scaling Constraint**: In a multi-instance deployment (e.g., behind a round-robin load balancer), an attacker could bypass individual process limits by spreading requests across instances unless edge rate limiting is enforced.

---

## 4. Future Evolution & Migration Path

When the platform scales beyond a single node, the rate-limiting infrastructure can be upgraded without modifying any application business logic, controllers, or decorators.

```
Current Single-Instance Phase:
[Client] ──► [NestJS CustomThrottlerGuard (In-Memory Storage)] ──► [Controllers]

Future Distributed Phase:
[Client] ──► [Cloudflare WAF / API Gateway] ──► [CustomThrottlerGuard (Redis Storage Adapter)] ──► [Controllers]
                                                                        │
                                                                        ▼
                                                             [Shared Redis Cluster]
```

### Migration Target Technologies

1. **Application-Level Distributed Storage**:
   - Package: `@nestjs/throttler-storage-redis`
   - Store: Redis Cluster / AWS ElastiCache / Redis Enterprise
   - Change Scope: Update `RateLimitingModule` `useFactory` configuration to supply `ThrottlerStorageRedisService`. Zero changes to controllers or use cases.

2. **Edge & Gateway Offloading**:
   - **Cloudflare Rate Limiting / WAF**: Intercept and drop volumetric brute-force attacks before reaching container instances.
   - **NGINX Reverse Proxy (`limit_req_zone`)**: Enforce IP-based rate limiting at the ingress layer.
   - **API Gateway (AWS API Gateway / Kong)**: Offload rate limiting to managed gateway infrastructure.

---

## 5. Trigger Conditions for Revisiting

This Architectural Decision Record must be revisited and upgraded to distributed rate limiting upon encountering any of the following triggers:

- [ ] Scaling the API layer to $\ge 2$ concurrent instances or replicas.
- [ ] Deploying to container orchestration platforms (Kubernetes / AWS ECS HPA).
- [ ] Introducing Redis into the core platform infrastructure stack for session/cache management.
- [ ] Provisioning an API Gateway (AWS API Gateway, Kong, Apigee) in front of the platform.
- [ ] Observing distributed brute-force attacks across IP ranges during threat monitoring.

---

## 6. Self-Review Confirmation

This document confirms that using in-memory rate limiting is a deliberate, documented architectural decision tailored for the current single-instance deployment model. The storage implementation remains completely replaceable via dependency injection when scaling requirements dictate.
