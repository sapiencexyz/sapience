import * as Sentry from '@sentry/node';
import { config } from './config';

// HTTP status codes that represent client errors we don't want to report
const IGNORED_CLIENT_ERROR_CODES = [
  413, // Payload Too Large
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  405, // Method Not Allowed
  408, // Request Timeout
  429, // Too Many Requests
];

export function initSentry() {
  if (config.isProd) {
    Sentry.init({
      dsn: 'https://51f9dc1f58790bea0860415ebfeab2f8@o4508343136026624.ingest.us.sentry.io/4508343455711232',
      tracesSampleRate: 1.0,
      beforeSend(event, hint) {
        const error = hint.originalException;

        // Filter out client errors (4xx) that are expected and handled
        if (error && typeof error === 'object') {
          const statusCode =
            (error as { statusCode?: number }).statusCode ??
            (error as { status?: number }).status;

          if (statusCode && IGNORED_CLIENT_ERROR_CODES.includes(statusCode)) {
            return null;
          }
        }

        return event;
      },
    });
  } else {
    console.log('Sentry disabled in development mode');
  }
}

export default Sentry;
