import type { Request } from 'express';
import { config } from '../core/config';

/** True when `x-internal-token` matches the configured bypass secret. */
export function hasValidInternalToken(req: Request): boolean {
  return (
    Boolean(config.INTERNAL_RATE_LIMIT_BYPASS_TOKEN) &&
    req.headers['x-internal-token'] === config.INTERNAL_RATE_LIMIT_BYPASS_TOKEN
  );
}
