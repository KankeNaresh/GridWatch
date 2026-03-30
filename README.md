# GridWatch — Real-Time Infrastructure Anomaly Detection

A full-stack platform that ingests high-volume sensor telemetry, detects anomalies via configurable rules, manages alert lifecycles with role-based access, and delivers real-time status updates through Server-Sent Events.

## Quick Start

### Docker (one command)

```bash
docker compose up --build
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000/api
- **Swagger UI**: http://localhost:3000/api-docs

### Local Development

**Prerequisites**: Node.js 20+, PostgreSQL 16+

```bash
# 1. Database
psql -U postgres -f Backend/src/db/Gridwatch_Schema.sql
psql -U postgres -f Backend/src/db/seed.sql

# 2. Backend
cd Backend
cp .env.example .env   # edit DB credentials if needed
npm install
npm run dev             # http://localhost:3000

# 3. Frontend
cd Frontend
npm install
npm run dev             # http://localhost:5173
```

---

## Architecture

```
                        ┌─────────────────────────────┐
  Sensors/Devices ────► │  POST /ingest (bulk insert)  │
                        └──────────┬──────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │   readings table     │  (unprocessed = true)
                        └──────────┬───────────┘
                                   │
               ┌───────────────────┼───────────────────┐
               ▼                   ▼                   ▼
   ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
   │  Anomaly Worker  │ │  Absence Worker  │ │ Escalation Worker│
   │  (every 2s)      │ │  (every 30s)     │ │  (every 30s)     │
   │                  │ │                  │ │                  │
   │ Rule A: threshold│ │ Rule C: no data  │ │ Auto-assigns     │
   │ Rule B: Δ rate   │ │ for >2 minutes   │ │ critical alerts  │
   └────────┬─────────┘ └────────┬─────────┘ │ to supervisors   │
            │                    │            │ after 5 min      │
            ▼                    ▼            └──────────────────┘
   ┌──────────────────────────────────┐
   │    anomalies → alerts tables     │
   └──────────────┬───────────────────┘
                  │
                  ▼
   ┌──────────────────────────────────┐
   │  SSE Manager (broadcast)        │───► React Dashboard
   │  • sensor_state_change          │     (real-time updates)
   │  • alert_created                │
   │  • heartbeat (30s)              │
   └──────────────────────────────────┘
```

### Three-Tier Backend

```
Controller (HTTP) → Service (business logic) → DataAccess (SQL)
```

- **Controllers**: Parse requests, zone-scoping via auth middleware, return JSON
- **Services**: Orchestrate multi-step operations (ingest batch, alert transitions)
- **DataAccess**: Raw SQL with parameterized queries, no ORM

### Frontend

React 19 + TypeScript + Vite + Tailwind CSS. Four pages:

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Live sensor grid with status filters, SSE-driven updates |
| Alerts | `/alerts` | Alert list with pagination, acknowledge/resolve buttons |
| Sensor Detail | `/sensors/:id` | Readings table, active anomalies, suppression controls |
| Suppression | `/suppression` | Create/view alert suppressions per sensor |

---

## Database Schema

11 tables with 10 targeted indexes. Key design decisions:

### Zone-based Access Control

`users` → `user_zones` → `zones` → `sensors`. Operators only see sensors in their assigned zones. Supervisors see everything. This is enforced at the query level — every list endpoint adds a zone filter via `buildZoneFilter()`.

### Denormalized `zone_id`

`readings`, `anomalies`, and `alerts` carry a denormalized `zone_id` column. This avoids JOINs back to `sensors` on every dashboard/filter query — critical at 10k readings/minute throughput.

### Partial Indexes

| Index | WHERE clause | Purpose |
|-------|-------------|---------|
| `idx_readings_unprocessed` | `processed = FALSE` | Anomaly worker polls only unprocessed rows |
| `idx_alerts_zone_status` | `status != 'resolved'` | Dashboard never queries resolved alerts |
| `idx_alerts_escalation_candidates` | `status='open' AND severity='critical' AND is_escalated=FALSE` | Escalation worker skips already-handled alerts |

These partial indexes keep the index size small as the majority of readings become processed and alerts become resolved.

### Per-Sensor Rules

`sensor_rules` table stores per-sensor thresholds (`min_voltage`, `max_voltage`, `min_temperature`, `max_temperature`, `rate_change_threshold`, `severity`). The anomaly worker joins this at processing time — no hardcoded thresholds.

### Append-Only Audit Trail

`alert_logs` records every status transition with `from_status`, `to_status`, `changed_by`, `changed_at`. No UPDATE or DELETE on this table.

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/ingest` | No | Bulk-insert sensor readings |
| GET | `/sensors` | Yes | List sensors (zone-filtered) |
| GET | `/sensors/:id` | Yes | Sensor detail + readings + anomalies + suppression |
| GET | `/sensors/:id/history` | Yes | Paginated history with inline anomaly data |
| GET | `/alerts` | Yes | List alerts with status/severity filters |
| PATCH | `/alerts/:id` | Yes | Transition alert: open → acknowledged → resolved |
| GET | `/suppression` | Yes | List all suppressions |
| POST | `/suppression` | Yes | Create time-windowed suppression |
| GET | `/events` | Yes | SSE stream (zone-scoped events) |

Authentication uses `X-User-Id` header. In production this would be replaced with JWT validation — the middleware is designed as a drop-in swap point.

---

## Real-Time Design

### Why SSE over WebSocket

- **Unidirectional**: Server pushes events; clients never send data back over the event stream. SSE is purpose-built for this.
- **Auto-reconnect**: Browsers natively retry SSE connections. WebSocket requires manual reconnection logic.
- **Simpler infrastructure**: Works through standard HTTP proxies and load balancers without upgrade negotiation.
- **Zone scoping**: Each SSE connection is scoped to the user's zones. Supervisors receive all events; operators only their zones.

### Event Types

- `sensor_state_change` — emitted when a sensor transitions status (e.g., healthy → warning)
- `alert_created` — emitted when a new alert is generated from an anomaly
- `: heartbeat` — comment-based keep-alive every 30s to prevent proxy/LB timeouts

### Frontend Integration

The `useSSE` hook uses `fetch()` with streaming `ReadableStream` instead of `EventSource` — this allows passing custom `X-User-Id` headers (EventSource doesn't support custom headers).

---

## Worker Design

### Anomaly Worker (2s interval)

1. Fetch up to 200 unprocessed readings with `FOR UPDATE SKIP LOCKED`
2. Batch-fetch sensor rules and suppression status for all sensors in the batch
3. Evaluate Rule A (threshold) and Rule B (rate-of-change) per reading
4. Insert anomalies + alerts in one pass
5. Mark readings as `processed = TRUE`
6. Broadcast SSE events for status changes

`FOR UPDATE SKIP LOCKED` prevents duplicate processing if multiple workers run concurrently.

### Absence Worker (30s interval)

Queries sensors where `last_seen < NOW() - 2 minutes` and `status != 'silent'`. Creates absence anomalies with `reading_id = NULL` (no specific reading triggered the anomaly).

### Escalation Worker (30s interval)

Finds critical alerts that have been open for >5 minutes without acknowledgment. Assigns them to an available supervisor. Uses `UNIQUE(alert_id)` on `escalation_log` + `ON CONFLICT DO NOTHING` to guarantee exactly-once escalation.

---

## Three Hardest Problems

### 1. Concurrent Worker Safety

Multiple workers polling the same `readings` table required careful locking. Using `SELECT ... FOR UPDATE SKIP LOCKED` ensures each reading is processed exactly once even under concurrent load. Without `SKIP LOCKED`, workers would block each other. Without `FOR UPDATE`, two workers could process the same batch.

### 2. Zone-Scoped SSE Broadcasting

Each SSE connection must see only events for its authorized zones. The `SSEManager` stores each client's `role` and `zone_ids`, and `broadcast(zoneId, event)` filters at emission time. Supervisors bypass the filter. This was simpler than maintaining per-zone channels but means each broadcast iterates all connected clients — acceptable at the expected scale.

### 3. Suppression During Active Alerts

When a suppression window starts, existing open alerts for that sensor should be marked as suppressed. The `createSuppressionController` handles this atomically — after inserting the suppression row, it updates any open unsuppressed alerts for that sensor. The anomaly worker checks suppression status per-reading so new anomalies during the window are flagged `is_suppressed = TRUE` and don't generate fresh alerts.

---

## What's Finished vs Cut

### Finished
- Full ingest → detect → alert → notify pipeline
- Three background workers with configurable intervals
- Role-based zone isolation on all endpoints
- SSE real-time push with zone scoping and heartbeat
- Alert lifecycle (open → acknowledged → resolved) with audit log
- Suppression windows that retroactively suppress open alerts
- Auto-escalation of critical alerts to supervisors
- Dashboard with live sensor grid, status filters, search
- Alert management with pagination, status transitions
- Sensor detail with readings, anomalies, suppression controls
- History view with inline anomaly markers
- User switcher (3 seeded users with different zone access)
- Docker Compose setup (postgres + backend + frontend)
- Swagger UI for API exploration

### Cut (would add with more time)
- JWT authentication (currently header-based simulation)
- WebSocket fallback for environments that don't support SSE
- Sensor map visualization (geographic placement)
- Alert notification channels (email, Slack, PagerDuty)
- Rate limiting on ingest endpoint
- Metrics/monitoring (Prometheus, Grafana)
- Comprehensive test suite (unit + integration)
- Pagination cursor-based (currently offset-based)
- Database connection pooling tuning under production load

---

## Production Gap

This is a prototype. To run in production:

1. **Auth**: Replace `X-User-Id` header with JWT validation. The middleware is a single swap point.
2. **Scaling**: Workers run in-process. Extract to separate services with a message queue (Redis/RabbitMQ) for horizontal scaling.
3. **Time-series partitioning**: The `readings` table will grow unbounded. Partition by month or week with pg_partman, archive old partitions to cold storage.
4. **Connection pooling**: Add PgBouncer between the app and PostgreSQL, especially if running multiple backend replicas.
5. **Monitoring**: Add Prometheus metrics for ingest throughput, worker lag, SSE client count, query latency.
6. **Load testing**: Verify the 10k readings/minute target with k6 or Artillery against the containerized stack.
7. **TLS**: All traffic over HTTPS in production. SSE connections are especially sensitive to MITM.

---

## Project Structure

```
Gridwatch/
├── Backend/
│   ├── src/
│   │   ├── server.ts              # Express app + graceful shutdown
│   │   ├── config/
│   │   │   ├── db.ts              # PostgreSQL pool (singleton)
│   │   │   └── swagger.ts         # OpenAPI 3.0 spec
│   │   ├── controllers/           # HTTP handlers
│   │   ├── dataAccess/            # SQL queries
│   │   ├── middleware/            # Auth + error handling
│   │   ├── realtime/
│   │   │   └── sseManager.ts      # SSE connection manager
│   │   ├── routes/
│   │   │   └── index.ts           # Route definitions
│   │   ├── services/              # Business logic
│   │   ├── types/                 # TypeScript interfaces
│   │   ├── utils/                 # Error classes
│   │   ├── workers/               # Background processors
│   │   └── db/                    # Schema + seed SQL
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── package.json
└── Frontend/
    ├── src/
    │   ├── App.tsx                # Route definitions
    │   ├── main.tsx               # Entry point
    │   ├── api.ts                 # API client
    │   ├── useSSE.ts              # SSE hook (fetch-based)
    │   ├── AuthContext.tsx         # User context + switcher
    │   ├── types.ts               # Domain types (mirrors backend)
    │   ├── utils.ts               # Status colors, time formatting
    │   ├── components/
    │   │   ├── Layout.tsx         # Nav + user switcher + Outlet
    │   │   └── StatusDot.tsx      # Animated status indicator
    │   └── pages/
    │       ├── DashboardPage.tsx   # Sensor grid + SSE live updates
    │       ├── AlertsPage.tsx      # Alert list + transitions
    │       ├── SensorDetailPage.tsx# Readings, anomalies, suppression
    │       └── SuppressionPage.tsx # Manage suppressions
    ├── Dockerfile
    ├── nginx.conf
    └── package.json
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React + TypeScript | 19.1 + 5.8 |
| Build | Vite | 6.3 |
| Styling | Tailwind CSS | 3.4 |
| Routing | react-router-dom | 7.6 |
| Backend | Express (TypeScript) | 5.2 |
| Database | PostgreSQL | 16 |
| ORM | None (raw SQL) | — |
| Real-time | Server-Sent Events | — |
| Container | Docker Compose | — |
