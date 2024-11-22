import * as Sentry from "@sentry/node";

if (process.env.NODE_ENV === "production") {
  Sentry.init({
    dsn: "https://51f9dc1f58790bea0860415ebfeab2f8@o4508343136026624.ingest.us.sentry.io/4508343455711232",
    tracesSampleRate: 1.0,
  });
} else {
  console.log("Sentry disabled in development mode");
}