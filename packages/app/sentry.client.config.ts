// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

if (process.env.NODE_ENV === "production") {
  Sentry.init({
    dsn: "https://412e5ec6d342c70a49c175897c88308d@o4508343136026624.ingest.us.sentry.io/4508343151624192",

    // Add optional integrations for additional features
    integrations: [
      Sentry.replayIntegration(),
    ],

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,

    // Define how likely Replay events are sampled.
    // This sets the sample rate to be 10%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: 0.1,

    // Define how likely Replay events are sampled when an error occurs.
    replaysOnErrorSampleRate: 1.0,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    // Filter out noise — only things that can NEVER be our code
    ignoreErrors: [
      // Wallet extension errors (MetaMask, Coinbase, etc.)
      /Failed to connect to MetaMask/,
      /func sseError not found/,
      /Can't find variable: CONFIG/,
      // Safari in-app browser WebView bridge
      /webkit\.messageHandlers/,
      // Browser extension lifecycle / messaging
      /Attempting to use a disconnected port object/,
      /chrome\.runtime\.sendMessage\(\) called from a webpage/,
      // Extension proxy conflicts (TronLink, etc.)
      /tronlinkParams/,
      /Invalid property descriptor\. Cannot both specify accessors/,
      // User-initiated wallet rejections (not bugs)
      /UserRejectedRequestError/,
      /User rejected the request/,
      // Invalid addresses from user input (URL params, form fields)
      /InvalidAddressError: Address ".*" is invalid/,
      // Environment constraints (not actionable)
      /Embedded wallet is only available over HTTPS/,
      /^The source .* has not been authorized yet$/,
      /indexedDB is not defined/,
    ],

    // Ignore errors originating from browser extensions
    denyUrls: [
      /extensions\//i,
      /^chrome:\/\//i,
      /^chrome-extension:\/\//i,
      /^moz-extension:\/\//i,
      /inpage\.js/,
    ],
  });
} else {
  console.log("Sentry disabled in development mode");
}
