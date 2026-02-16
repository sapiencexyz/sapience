// Polyfill React.act for React 19 + jest-environment-jsdom compatibility
// Must run before @testing-library/react loads react-dom/test-utils
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
    if (result !== null && result !== undefined && typeof result.then === 'function') {
      return result;
    }
    return {
      then(resolve) {
        resolve(result);
      },
    };
  };
}
