import express from 'express';
import { router } from './routes';
import { setupMiddleware } from './middleware';

/**
 * Factory function to create Express app with fresh middleware
 * This ensures tests get isolated rate limiter instances
 */
export function createApp() {
  const app = express();

  // Trust the first reverse proxy (Railway's load balancer) so that
  // req.ip reflects the real client IP from X-Forwarded-For instead
  // of the proxy's internal address.  Without this, every request
  // appears to come from the same IP and all users share one
  // rate-limit bucket.  See: Immunefi report #68771.
  app.set('trust proxy', 1);

  setupMiddleware(app);
  app.use('/', router);

  return app;
}

// Export singleton app instance for production use
export const app = createApp();
