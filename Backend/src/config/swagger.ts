// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const swaggerSpec: Record<string, any> = {
  openapi: "3.0.3",
  info: {
    title: "GridWatch API",
    version: "1.0.0",
    description:
      "Real-Time Infrastructure Anomaly Detection Platform — REST API.\n\n" +
      "**Auth**: All endpoints except `POST /ingest` require the `X-User-Id` header.\n\n" +
      "Seed users:\n" +
      "- `1` → Alice (operator, Zone North only)\n" +
      "- `2` → Bob (operator, Zone South only)\n" +
      "- `3` → Carol (supervisor, all zones)",
  },
  servers: [{ url: "/api", description: "API base path" }],
  components: {
    securitySchemes: {
      UserIdHeader: {
        type: "apiKey",
        in: "header",
        name: "X-User-Id",
        description: "Seed user IDs: 1 (Alice/operator), 2 (Bob/operator), 3 (Carol/supervisor)",
      },
    },
    schemas: {
      // ─── Enums ────────────────────────────────────────────────
      SensorStatus: {
        type: "string",
        enum: ["healthy", "warning", "critical", "silent"],
        description: "Current operational status of a sensor",
      },
      AnomalyType: {
        type: "string",
        enum: ["threshold", "rate_change", "absence"],
      },
      AlertSeverity: {
        type: "string",
        enum: ["warning", "critical"],
      },
      AlertStatus: {
        type: "string",
        enum: ["open", "acknowledged", "resolved"],
      },
      // ─── Core models ──────────────────────────────────────────
      Sensor: {
        type: "object",
        properties: {
          id: { type: "string", example: "sensor-0001" },
          zone_id: { type: "integer", example: 1 },
          status: { $ref: "#/components/schemas/SensorStatus" },
          last_seen: {
            type: "string",
            format: "date-time",
            nullable: true,
            example: "2026-03-29T10:00:00Z",
          },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      SensorDetail: {
        type: "object",
        properties: {
          sensor: { $ref: "#/components/schemas/Sensor" },
          recentReadings: {
            type: "array",
            items: { $ref: "#/components/schemas/Reading" },
          },
          recentAnomalies: {
            type: "array",
            items: { $ref: "#/components/schemas/Anomaly" },
          },
          activeSuppression: {
            $ref: "#/components/schemas/Suppression",
            nullable: true,
          },
        },
      },
      Reading: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int64", example: 100001 },
          sensor_id: { type: "string", example: "sensor-0001" },
          zone_id: { type: "integer", example: 1 },
          timestamp: { type: "string", format: "date-time" },
          voltage: { type: "number", nullable: true, example: 230.5 },
          current: { type: "number", nullable: true, example: 12.3 },
          temperature: { type: "number", nullable: true, example: 72.4 },
          status_code: { type: "integer", nullable: true, example: 1 },
          processed: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Anomaly: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int64" },
          sensor_id: { type: "string" },
          reading_id: { type: "integer", format: "int64", nullable: true, description: "NULL for absence anomalies" },
          zone_id: { type: "integer" },
          type: { $ref: "#/components/schemas/AnomalyType" },
          is_suppressed: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Alert: {
        type: "object",
        properties: {
          id: { type: "integer", format: "int64" },
          anomaly_id: { type: "integer", format: "int64" },
          sensor_id: { type: "string" },
          zone_id: { type: "integer" },
          severity: { $ref: "#/components/schemas/AlertSeverity" },
          status: { $ref: "#/components/schemas/AlertStatus" },
          is_suppressed: { type: "boolean" },
          is_escalated: { type: "boolean" },
          assigned_to: { type: "integer", nullable: true },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      Suppression: {
        type: "object",
        properties: {
          id: { type: "integer" },
          sensor_id: { type: "string" },
          zone_id: { type: "integer" },
          start_time: { type: "string", format: "date-time" },
          end_time: { type: "string", format: "date-time" },
          created_by: { type: "integer" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      HistoryRow: {
        type: "object",
        properties: {
          reading_id: { type: "integer", format: "int64" },
          sensor_id: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          voltage: { type: "number", nullable: true },
          current: { type: "number", nullable: true },
          temperature: { type: "number", nullable: true },
          status_code: { type: "integer", nullable: true },
          anomalies: {
            type: "array",
            description: "Empty array if no anomalies for this reading",
            items: {
              type: "object",
              properties: {
                anomaly_id: { type: "integer", format: "int64" },
                type: { $ref: "#/components/schemas/AnomalyType" },
                alert_id: { type: "integer", format: "int64", nullable: true },
                alert_status: {
                  $ref: "#/components/schemas/AlertStatus",
                  nullable: true,
                },
              },
            },
          },
        },
      },
      // ─── Request bodies ───────────────────────────────────────
      IngestRequest: {
        type: "object",
        required: ["readings"],
        properties: {
          readings: {
            type: "array",
            maxItems: 1000,
            items: {
              type: "object",
              required: ["sensor_id", "timestamp"],
              properties: {
                sensor_id: { type: "string", example: "sensor-0001" },
                timestamp: {
                  type: "string",
                  format: "date-time",
                  description: "ISO 8601 timestamp of the reading",
                  example: "2026-03-29T12:00:00Z",
                },
                voltage: { type: "number", nullable: true, description: "Voltage reading", example: 230.5 },
                current: { type: "number", nullable: true, description: "Current reading", example: 12.3 },
                temperature: { type: "number", nullable: true, description: "Temperature reading", example: 95.0 },
                status_code: { type: "integer", nullable: true, description: "Sensor status code", example: 1 },
              },
            },
          },
        },
      },
      AlertTransitionRequest: {
        type: "object",
        required: ["status"],
        properties: {
          status: { $ref: "#/components/schemas/AlertStatus" },
        },
      },
      SuppressionRequest: {
        type: "object",
        required: ["sensor_id", "start_time", "end_time"],
        properties: {
          sensor_id: { type: "string", example: "sensor-0001" },
          start_time: {
            type: "string",
            format: "date-time",
            example: "2026-03-29T12:00:00Z",
          },
          end_time: {
            type: "string",
            format: "date-time",
            example: "2026-03-29T14:00:00Z",
          },
        },
      },
      // ─── Generic wrappers ─────────────────────────────────────
      PaginatedAlerts: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/Alert" } },
          total: { type: "integer", example: 42 },
          page: { type: "integer", example: 1 },
          page_size: { type: "integer", example: 20 },
        },
      },
      PaginatedHistory: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/HistoryRow" } },
          total: { type: "integer" },
          page: { type: "integer" },
          page_size: { type: "integer" },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          code: { type: "string", example: "NOT_FOUND" },
          message: { type: "string", example: "Sensor not found" },
        },
      },
    },
  },
  // Global security — overridden on public endpoints
  security: [{ UserIdHeader: [] }],
  paths: {
    // ─── Ingest ───────────────────────────────────────────────
    "/ingest": {
      post: {
        tags: ["Ingest"],
        summary: "Bulk ingest sensor readings",
        description:
          "Accepts up to **1000 readings** per call. No authentication required — simulates sensor device push. " +
          "Readings are inserted via a single unnest() round-trip and trigger the anomaly worker on the next poll cycle (≤2s).",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/IngestRequest" },
              examples: {
                single: {
                  summary: "Single high-temperature reading",
                  value: {
                    readings: [
                      {
                        sensor_id: "sensor-0001",
                        timestamp: "2026-03-29T12:00:00Z",
                        voltage: 230.0,
                        current: 10.5,
                        temperature: 95.0,
                        status_code: 1,
                      },
                    ],
                  },
                },
                batch: {
                  summary: "Batch of 3 readings (different zones)",
                  value: {
                    readings: [
                      { sensor_id: "sensor-0001", timestamp: "2026-03-29T12:00:00Z", voltage: 230.0, temperature: 95.0, status_code: 1 },
                      { sensor_id: "sensor-0400", timestamp: "2026-03-29T12:00:01Z", voltage: 250.5, temperature: 45.0, status_code: 1 },
                      { sensor_id: "sensor-0700", timestamp: "2026-03-29T12:00:02Z", voltage: 220.0, temperature: 80.1, status_code: 1 },
                    ],
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Readings accepted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "201 readings ingested" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error (e.g. batch > 1000)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    // ─── Sensors ──────────────────────────────────────────────
    "/sensors": {
      get: {
        tags: ["Sensors"],
        summary: "List sensors (zone-scoped)",
        description:
          "Returns all sensors visible to the authenticated user. " +
          "Operators only see sensors in their assigned zones. Supervisors see all zones.",
        security: [{ UserIdHeader: [] }],
        responses: {
          "200": {
            description: "Sensor list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Sensor" } },
                  },
                },
              },
            },
          },
          "401": { description: "Missing X-User-Id header" },
        },
      },
    },
    "/sensors/{id}": {
      get: {
        tags: ["Sensors"],
        summary: "Get sensor detail",
        description:
          "Returns sensor metadata + last 20 readings + last 20 anomalies + active suppression window (if any). " +
          "Zone isolation enforced.",
        security: [{ UserIdHeader: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "sensor-0001",
          },
        ],
        responses: {
          "200": {
            description: "Sensor detail",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SensorDetail" } } },
          },
          "403": { description: "Sensor belongs to a zone not accessible by this user" },
          "404": { description: "Sensor not found" },
        },
      },
    },
    "/sensors/{id}/history": {
      get: {
        tags: ["Sensors"],
        summary: "Sensor historical readings with anomaly flags",
        description:
          "Returns paginated readings for a sensor between `from` and `to` timestamps. " +
          "Each reading includes any linked anomaly/alert data via a single `LEFT JOIN + json_agg` query.",
        security: [{ UserIdHeader: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "sensor-0001",
          },
          {
            name: "from",
            in: "query",
            required: true,
            schema: { type: "string", format: "date-time" },
            description: "Start of time range (ISO 8601)",
            example: "2026-03-28T00:00:00Z",
          },
          {
            name: "to",
            in: "query",
            required: true,
            schema: { type: "string", format: "date-time" },
            description: "End of time range (ISO 8601)",
            example: "2026-03-29T00:00:00Z",
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
          {
            name: "page_size",
            in: "query",
            schema: { type: "integer", default: 100, maximum: 500 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated history",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedHistory" } } },
          },
          "400": { description: "Missing from/to parameters" },
          "403": { description: "Zone access denied" },
          "404": { description: "Sensor not found" },
        },
      },
    },
    // ─── Alerts ───────────────────────────────────────────────
    "/alerts": {
      get: {
        tags: ["Alerts"],
        summary: "List alerts (zone-scoped, paginated)",
        description:
          "Supports filtering by `status` and `sensor_id`. Zone isolation applied automatically. " +
          "Returns total count for pagination.",
        security: [{ UserIdHeader: [] }],
        parameters: [
          {
            name: "status",
            in: "query",
            schema: { $ref: "#/components/schemas/AlertStatus" },
            description: "Filter by alert status",
          },
          {
            name: "sensor_id",
            in: "query",
            schema: { type: "string" },
            description: "Filter by sensor ID",
            example: "sensor-0001",
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
          {
            name: "page_size",
            in: "query",
            schema: { type: "integer", default: 20, maximum: 100 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated alert list",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedAlerts" } } },
          },
          "401": { description: "Missing X-User-Id header" },
        },
      },
    },
    "/alerts/{id}": {
      patch: {
        tags: ["Alerts"],
        summary: "Transition alert status",
        description:
          "Valid state machine transitions:\n" +
          "- `open` → `acknowledged`\n" +
          "- `open` → `resolved` (direct close)\n" +
          "- `acknowledged` → `resolved`\n\n" +
          "Every transition appends an immutable audit log entry.",
        security: [{ UserIdHeader: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer" },
            example: 1,
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AlertTransitionRequest" },
              examples: {
                acknowledge: {
                  summary: "Acknowledge an open alert",
                  value: { status: "acknowledged" },
                },
                resolve: {
                  summary: "Resolve an acknowledged alert",
                  value: { status: "resolved" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated alert",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Alert" } } },
          },
          "400": { description: "Invalid status transition" },
          "403": { description: "Alert belongs to zone not accessible by user" },
          "404": { description: "Alert not found" },
        },
      },
    },
    // ─── Suppression ──────────────────────────────────────────
    "/suppression": {
      get: {
        tags: ["Suppression"],
        summary: "List active suppression windows (zone-scoped)",
        security: [{ UserIdHeader: [] }],
        responses: {
          "200": {
            description: "Active suppression windows",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Suppression" } },
              },
            },
          },
        },
      },
      post: {
        tags: ["Suppression"],
        summary: "Create a suppression window",
        description:
          "Creates a time-bounded suppression window for a sensor. " +
          "If `start_time` is in the past or now, any currently open alerts for that sensor are immediately marked `suppressed`. " +
          "Zone isolation enforced — operators can only suppress sensors in their zones.",
        security: [{ UserIdHeader: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SuppressionRequest" },
              examples: {
                future: {
                  summary: "Suppress during upcoming maintenance",
                  value: {
                    sensor_id: "sensor-0001",
                    start_time: "2026-03-30T02:00:00Z",
                    end_time: "2026-03-30T04:00:00Z",
                  },
                },
                immediate: {
                  summary: "Suppress immediately (retroactively closes open alerts)",
                  value: {
                    sensor_id: "sensor-0001",
                    start_time: "2026-03-29T00:00:00Z",
                    end_time: "2026-03-29T23:59:59Z",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Suppression created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Suppression" } } },
          },
          "403": { description: "Sensor zone not accessible by user" },
          "404": { description: "Sensor not found" },
          "409": { description: "Overlapping suppression already exists" },
        },
      },
    },
    // ─── SSE ──────────────────────────────────────────────────
    "/events": {
      get: {
        tags: ["Real-Time"],
        summary: "SSE stream — real-time sensor and alert events",
        description:
          "Opens a persistent Server-Sent Events connection. Events are zone-scoped (operators receive only their zones, supervisors receive all).\n\n" +
          "**Event types:**\n" +
          "- `connected` — sent on connection established\n" +
          "- `sensor_state_change` — sensor status changed (e.g. `normal` → `critical`)\n" +
          "- `alert_created` — new alert created by anomaly worker\n" +
          "- heartbeat (`: heartbeat` comment line every 30s)\n\n" +
          "**Usage:** `const es = new EventSource('/api/events', { headers: { 'X-User-Id': '3' } })`\n\n" +
          "**Note:** This endpoint keeps the connection open — it cannot be tested directly from Swagger UI.",
        security: [{ UserIdHeader: [] }],
        parameters: [],
        responses: {
          "200": {
            description: "SSE stream (text/event-stream)",
            content: {
              "text/event-stream": {
                schema: {
                  type: "string",
                  example:
                    "event: connected\ndata: {\"userId\":3}\n\nevent: sensor_state_change\ndata: {\"sensorId\":\"sensor-0001\",\"oldStatus\":\"healthy\",\"newStatus\":\"critical\",\"zoneId\":1}\n\n",
                },
              },
            },
          },
          "401": { description: "Missing X-User-Id header" },
        },
      },
    },
  },
};
