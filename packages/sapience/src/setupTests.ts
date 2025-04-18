// This file is used for global Jest setup.
// You can import libraries like @testing-library/jest-dom/extend-expect here.
import '@testing-library/jest-dom';

// Polyfill TextEncoder and TextDecoder for Jest environment
// This is needed for the viem library which uses these web APIs
if (typeof TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
}

if (typeof TextDecoder === 'undefined') {
  global.TextDecoder = require('util').TextDecoder;
} 