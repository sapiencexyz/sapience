import express from 'express';
import { router } from './routes';
import { setupMiddleware } from './middleware';

/**
 * Factory function to create Express app with fresh middleware
 * This ensures tests get isolated rate limiter instances
 */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  setupMiddleware(app);
  app.use('/', router);

  return app;
}

// Export singleton app instance for production use
export const app = createApp();
