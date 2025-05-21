import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { router } from './routes';

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

// Apply rate limiting to all requests
app.use(limiter);

app.use('/', router);

export { app };
