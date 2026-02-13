import express, { Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { router } from './routes';
import { config } from './config';
import { rateLimiter } from './middleware';

const corsOptions: cors.CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
    request?: Request
  ) => {
    // Allow all requests unless in production
    if (!config.isProd) {
      callback(null, true);
      return;
    }

    // Check for API token in production
    const authHeader = request?.headers?.authorization;
    const apiToken = process.env.API_ACCESS_TOKEN;

    // If API token is provided and matches, allow the request regardless of origin
    if (
      apiToken &&
      authHeader?.startsWith('Bearer ') &&
      authHeader.slice(7) === apiToken
    ) {
      callback(null, true);
      return;
    }

    // Otherwise, only allow specific domains
    if (
      !origin || // Allow same-origin requests
      /^https?:\/\/([a-zA-Z0-9-]+\.)*foil\.xyz$/.test(origin) ||
      /^https?:\/\/([a-zA-Z0-9-]+\.)*sapience\.xyz$/.test(origin) ||
      /^https?:\/\/(app|docs)(-[a-z0-9]+-sapiencexyz)?\.vercel\.app$/.test(origin) || //staging sites
      /^https?:\/\/localhost(:\d+)?$/.test(origin) // Allow localhost with optional port
    ) {
      callback(null, true);
    } else {
      // Silently reject — don't throw, which would create Sentry noise for every
      // bot/crawler/server-side request without an Origin header (DATA-2E, 5k+ events).
      // callback(null, false) tells the cors middleware to omit CORS headers,
      // so browsers still block the response. Same security, no error spam.
      callback(null, false);
    }
  },
  optionsSuccessStatus: 200,
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'x-admin-signature',
    'x-admin-signature-timestamp',
  ],
};

const app = express();

// Middleware
app.use(helmet());
app.use(express.json());
app.use(cors(corsOptions));
app.use(rateLimiter);

app.use('/', router);

export { app };
