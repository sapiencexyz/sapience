/**
 * In-flight GraphQL request registry.
 *
 * Tracks which requests are currently holding concurrency slots, keyed by
 * pino-http's `req.id`. The concurrency limiter calls `add`/`remove` at
 * admission and completion; the Apollo plugin calls `setOperation` once
 * the GraphQL document has been parsed and the operation name is known.
 *
 * Two consumers:
 *  - Concurrency limiter: when a shed fires, calls `snapshot(ip)` to
 *    attach the list of occupants to the warn log.
 *  - Periodic dump: emits `event:'gql_inflight'` once per interval with
 *    active count, per-operation breakdown, and peak-since-last-dump.
 *
 * The operation name on a snapshot is server-derived (post body-parse,
 * post GraphQL parse) so it is trustworthy regardless of what an
 * adversarial client claims in headers.
 */

interface Slot {
  ip: string;
  startedAt: number;
  operationName?: string;
}

export interface InflightSnapshot {
  active: number;
  perIp: number;
  byOperation: Record<string, number>;
  occupants: Array<{
    requestId: string;
    operationName: string | undefined;
    ageMs: number;
    ip: string;
  }>;
}

const MAX_OCCUPANTS_IN_SNAPSHOT = 25;

export class InflightRegistry {
  private slots = new Map<string, Slot>();
  private perIpCount = new Map<string, number>();
  private peakActive = 0;

  add(requestId: string, ip: string): void {
    if (this.slots.has(requestId)) return;
    this.slots.set(requestId, { ip, startedAt: performance.now() });
    this.perIpCount.set(ip, (this.perIpCount.get(ip) ?? 0) + 1);
    if (this.slots.size > this.peakActive) this.peakActive = this.slots.size;
  }

  setOperation(requestId: string, operationName: string): void {
    const slot = this.slots.get(requestId);
    if (slot) slot.operationName = operationName;
  }

  remove(requestId: string): void {
    const slot = this.slots.get(requestId);
    if (!slot) return;
    this.slots.delete(requestId);
    const ipCount = this.perIpCount.get(slot.ip);
    if (ipCount === undefined) return;
    if (ipCount <= 1) this.perIpCount.delete(slot.ip);
    else this.perIpCount.set(slot.ip, ipCount - 1);
  }

  get active(): number {
    return this.slots.size;
  }

  perIp(ip: string): number {
    return this.perIpCount.get(ip) ?? 0;
  }

  snapshot(focusIp?: string): InflightSnapshot {
    const byOperation: Record<string, number> = {};
    const occupants: InflightSnapshot['occupants'] = [];
    const now = performance.now();

    for (const [requestId, slot] of this.slots) {
      const op = slot.operationName ?? '<parsing>';
      byOperation[op] = (byOperation[op] ?? 0) + 1;
      if (focusIp === undefined || slot.ip === focusIp) {
        occupants.push({
          requestId,
          operationName: slot.operationName,
          ageMs: Math.round(now - slot.startedAt),
          ip: slot.ip,
        });
      }
    }

    occupants.sort((a, b) => b.ageMs - a.ageMs);
    if (occupants.length > MAX_OCCUPANTS_IN_SNAPSHOT) {
      occupants.length = MAX_OCCUPANTS_IN_SNAPSHOT;
    }

    return {
      active: this.slots.size,
      perIp: focusIp !== undefined ? this.perIp(focusIp) : 0,
      byOperation,
      occupants,
    };
  }

  /**
   * Read-and-reset the peak active count. Used by the periodic dump so
   * each line carries the high-water mark for the previous window.
   */
  consumePeak(): number {
    const peak = this.peakActive;
    this.peakActive = this.slots.size;
    return peak;
  }
}

export const inflightRegistry = new InflightRegistry();
