'use client';

import { useEffect } from 'react';

const ConsoleMessage = () => {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const message1 =
        'Our code is open source on GitHub https://github.com/sapiencexyz/sapience';
      const message2 =
        'Come chat with us on Discord https://discord.gg/sapience';
      const style =
        'font-size: 13px; font-weight: 500; padding: 8px 0; color: #a0a0a0;';

      console.log('%c' + message1, style);

      console.log('%c' + message2, style);
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return null;
};

export default ConsoleMessage;
