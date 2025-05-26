import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { router } from './routes';

const corsOptions: cors.CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void
  ) => {
    // Allow all requests unless in production or staging
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'staging'
    ) {
      callback(null, true);
      return;
    }

    // Otherwise, only allow specific domains
    if (
      !origin || // Allow same-origin requests
      /^https?:\/\/([a-zA-Z0-9-]+\.)*foil\.xyz$/.test(origin) ||
      /^https?:\/\/([a-zA-Z0-9-]+\.)*sapience\.xyz$/.test(origin) ||
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

// Configure rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 60, // Limit each IP to 60 requests per window
  standardHeaders: 'draft-8', // Use the draft standard Rate-Limit headers
  legacyHeaders: false, // Disable the X-RateLimit-* headers
  message: { error: 'Too many requests, please try again later.' },
});

const app = express();

// Middleware
app.use(express.json());
app.use(cors(corsOptions));
app.use(limiter);

app.use('/', router);

export { app };
