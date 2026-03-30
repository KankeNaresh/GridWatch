import { getPool } from "../config/db";
import { IngestReading } from "../types";

/**
 * Bulk-inserts readings using PostgreSQL unnest() — single round-trip
 * for up to 1000 rows. Returns the inserted reading IDs.
 *
 * Also updates sensors.last_seen for all ingested sensor_ids.
 *
 * Performance: unnest() avoids building massive VALUES(...) strings
 * and lets PG handle it in a single statement.
 */
export async function bulkInsertReadings(
  readings: IngestReading[],
  sensorZoneMap: Map<string, number>
): Promise<number[]> {
  const pool = getPool();

  const sensorIds: string[] = [];
  const zoneIds: number[] = [];
  const timestamps: string[] = [];
  const voltages: (number | null)[] = [];
  const currents: (number | null)[] = [];
  const temperatures: (number | null)[] = [];
  const statusCodes: (number | null)[] = [];

  for (const r of readings) {
    const zoneId = sensorZoneMap.get(r.sensor_id);
    if (zoneId === undefined) continue; // skip unknown sensors

    sensorIds.push(r.sensor_id);
    zoneIds.push(zoneId);
    timestamps.push(r.timestamp);
    voltages.push(r.voltage);
    currents.push(r.current);
    temperatures.push(r.temperature);
    statusCodes.push(r.status_code);
  }

  if (sensorIds.length === 0) return [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Bulk insert via unnest — single statement, single round-trip
    const insertResult = await client.query<{ id: number }>(
      `INSERT INTO readings (sensor_id, zone_id, timestamp, voltage, current, temperature, status_code)
       SELECT * FROM unnest(
         $1::text[], $2::int[], $3::timestamptz[],
         $4::double precision[], $5::double precision[],
         $6::double precision[], $7::int[]
       )
       RETURNING id`,
      [sensorIds, zoneIds, timestamps, voltages, currents, temperatures, statusCodes]
    );

    // Update last_seen for all sensors in batch
    const uniqueSensorIds = [...new Set(sensorIds)];
    await client.query(
      `UPDATE sensors SET last_seen = NOW(), updated_at = NOW()
       WHERE id = ANY($1::text[])`,
      [uniqueSensorIds]
    );

    await client.query("COMMIT");

    return insertResult.rows.map((r: { id: number }) => r.id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Fetches sensor_id → zone_id mapping for a set of sensor IDs.
 * Used during ingestion to denormalize zone_id onto readings.
 */
export async function getSensorZoneMap(
  sensorIds: string[]
): Promise<Map<string, number>> {
  const pool = getPool();
  const result = await pool.query<{ id: string; zone_id: number }>(
    `SELECT id, zone_id FROM sensors WHERE id = ANY($1::text[])`,
    [sensorIds]
  );

  const map = new Map<string, number>();
  for (const row of result.rows) {
    map.set(row.id, row.zone_id);
  }
  return map;
}
