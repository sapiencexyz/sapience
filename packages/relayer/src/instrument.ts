import * as Sentry from '@sentry/node';
import { isProd, config } from './config';

export function initSentry() {
  if (isProd && config.SENTRY_DSN) {
    Sentry.init({
      dsn: config.SENTRY_DSN,
      tracesSampleRate: 1.0,
    });
  } else if (isProd && !config.SENTRY_DSN) {
    console.log('Sentry DSN not configured - error tracking disabled');
  } else {
    console.log('Sentry disabled in development mode');
  }
}

export default Sentry;

