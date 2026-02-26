/**
 * SseHub — manages Server-Sent Events client connections.
 *
 * Responsibilities:
 * - Tracks connected client callbacks in a Set
 * - Broadcasts events to all connected clients
 * - Handles per-client ping and disconnect cleanup
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SendFn = (event: any) => void;

export class SseHub {
  private readonly clients = new Set<SendFn>();

  /**
   * Register a new SSE client.
   * @param send   - function that writes a data frame to the client
   * @param ping   - function that writes a `: ping` comment to the client
   * @param onClose - subscribe to the underlying socket close event
   * @returns cleanup function (exposed for testing)
   */
  addClient(
    send: SendFn,
    ping: () => void,
    onClose: (handler: () => void) => void,
  ): () => void {
    this.clients.add(send);
    const pingInterval = setInterval(ping, 30_000);

    const cleanup = () => {
      this.clients.delete(send);
      clearInterval(pingInterval);
    };

    onClose(cleanup);
    return cleanup;
  }

  /** Broadcast a structured event to every connected client. */
  broadcast(event: unknown): void {
    for (const send of this.clients) send(event);
  }

  /** Number of currently connected SSE clients. */
  get clientCount(): number {
    return this.clients.size;
  }
}
