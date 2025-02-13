import express, { Request } from 'express';
import cors from 'cors';
import { router } from './routes';

const corsOptions: cors.CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
    request?: Request
  ) => {
    // Allow all requests unless in production or staging
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'staging'
    ) {
      callback(null, true);
      return;
    }

    // Check for API token in production/staging
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
      /^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(origin) || //staging sites
      /^https?:\/\/localhost(:\d+)?$/.test(origin) // Allow localhost with optional port
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200,
  // Allow the Authorization header to be exposed to the client
  exposedHeaders: ['Authorization'],
  // Allow the Authorization header to be sent
  allowedHeaders: ['Authorization', 'Content-Type'],
};

const app = express();

// Middleware
app.use(express.json());
app.use(cors(corsOptions));

app.use('/', router);

export { app };
