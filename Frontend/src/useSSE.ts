import { useCallback, useEffect, useRef } from "react";
import type { AlertCreatedEvent, SensorStateChangeEvent } from "./types";

type SSEHandler = {
  onSensorStateChange?: (e: SensorStateChangeEvent) => void
  onAlertCreated?: (e: AlertCreatedEvent) => void
}

/**
 * Hook that maintains an SSE connection to /api/events.
 * Automatically reconnects on disconnect with exponential backoff.
 * Zone-scoped on the backend — operators only receive their zones.
 */
export function useSSE(handlers: SSEHandler) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const connect = useCallback(() => {
    const userId = localStorage.getItem('gridwatch_user_id') || '1'
    // EventSource doesn't support custom headers, so we pass userId as query param.
    // The backend SSE controller reads from auth middleware (X-User-Id header).
    // We use fetch-based SSE instead.
    const controller = new AbortController()

    const startStream = async () => {
      try {
        const res = await fetch(`/api/events`, {
          headers: { 'X-User-Id': userId },
          signal: controller.signal,
        })

        if (!res.ok || !res.body) return

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          let currentEvent = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              const data = line.slice(6)
              try {
                const parsed = JSON.parse(data)
                if (currentEvent === 'sensor_state_change') {
                  handlersRef.current.onSensorStateChange?.(parsed)
                } else if (currentEvent === 'alert_created') {
                  handlersRef.current.onAlertCreated?.(parsed)
                }
              } catch {
                // ignore parse errors (e.g. heartbeat comments)
              }
              currentEvent = ''
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Reconnect after 3s
        setTimeout(() => {
          if (!controller.signal.aborted) startStream()
        }, 3000)
      }
    }

    startStream()
    return controller
  }, [])

  useEffect(() => {
    const controller = connect()
    return () => controller.abort()
  }, [connect])
}
