// Polyfill React.act for React 19 + jest-environment-jsdom compatibility
// React 19 CJS production build (used by jsdom) does not export React.act,
// but @testing-library/react requires it. Must run before tests load.
const React = require('react');
if (typeof React.act !== 'function') {
  const ReactDOM = require('react-dom');
  const { flushSync } = ReactDOM;
  React.act = function act(callback) {
    let result;
    let error;
    flushSync(() => {
      try {
        result = callback();
      } catch (e) {
        error = e;
      }
    });
    if (error) {
      throw error;
    }
    if (
      result !== null &&
      result !== undefined &&
      typeof result.then === 'function'
    ) {
      return result;
    }
    return {
      then(resolve) {
        resolve(result);
      },
    };
  };
}
