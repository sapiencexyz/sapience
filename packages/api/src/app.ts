import express from 'express';
import cors from 'cors';
import { router } from './routes';

const corsOptions: cors.CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void
  ) => {
    if (process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else if (
      !origin || // Allow same-origin requests
      /^https?:\/\/([a-zA-Z0-9-]+\.)*foil\.xyz$/.test(origin) ||
      /^https?:\/\/localhost(:\d+)?$/.test(origin) || // local testing
      /^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(origin) //staging sites
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200,
};

const app = express();

// Middleware
app.use(express.json());
app.use(cors(corsOptions));

app.use('/', router);

export { app };
