// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

if (process.env.NODE_ENV === "production") {
  Sentry.init({
    dsn: "https://412e5ec6d342c70a49c175897c88308d@o4508343136026624.ingest.us.sentry.io/4508343151624192",
    tracesSampleRate: 1,
    debug: false,
  });
} else {
  console.log("Sentry disabled in development mode");
}
