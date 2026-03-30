import { Response } from "express";
import { SSEEvent } from "../types";

/**
 * SSE Connection Manager — manages per-zone event streams.
 *
 * When a sensor state changes or alert is created, workers call
 * broadcast() which pushes to all connected operators in that zone.
 * Supervisors receive events from ALL zones.
 *
 * Pattern: Server-Sent Events (simpler than WebSocket for
 * one-way server→client push).
 */

interface SSEClient {
  res: Response;
  userId: number;
  role: "operator" | "supervisor";
  zoneIds: number[]; // empty for supervisor = all zones
}

class SSEManager {
  private clients: Map<number, SSEClient> = new Map(); // keyed by userId

  /**
   * Register a new SSE client connection.
   */
  addClient(
    userId: number,
    role: "operator" | "supervisor",
    zoneIds: number[],
    res: Response
  ): void {
    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ event: "connected", userId })}\n\n`);

    this.clients.set(userId, { res, userId, role, zoneIds });

    // Clean up on disconnect
    res.on("close", () => {
      this.clients.delete(userId);
    });
  }

  /**
   * Broadcast an event to all clients subscribed to this zone.
   * Supervisors get all events. Operators only get their zone's events.
   */
  broadcast(zoneId: number, event: SSEEvent): void {
    const data = JSON.stringify(event);

    for (const client of this.clients.values()) {
      const shouldReceive =
        client.role === "supervisor" ||
        client.zoneIds.includes(zoneId);

      if (shouldReceive) {
        client.res.write(`data: ${data}\n\n`);
      }
    }
  }

  /**
   * Send heartbeat to keep connections alive.
   */
  heartbeat(): void {
    for (const client of this.clients.values()) {
      client.res.write(`: heartbeat\n\n`);
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

// Singleton
export const sseManager = new SSEManager();

// Heartbeat every 30s to prevent proxy/LB timeouts
setInterval(() => sseManager.heartbeat(), 30_000);
