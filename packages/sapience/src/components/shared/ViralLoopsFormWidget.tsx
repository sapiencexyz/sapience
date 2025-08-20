'use client';

import { useEffect } from 'react';

interface ViralLoopsFormWidgetProps {
  ucid: string;
  popup?: boolean;
}

function loadViralLoopsScript(): Promise<unknown> {
  const SCRIPT_SRC = 'https://app.viral-loops.com/widgetsV2/core/loader.js';
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return resolve(true);
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function ViralLoopsFormWidget({
  ucid,
  popup = false,
}: ViralLoopsFormWidgetProps) {
  useEffect(() => {
    loadViralLoopsScript().catch(() => {
      // Swallow script load errors to avoid breaking the UI
    });
  }, []);

  if (!ucid) return null;

  return (
    // @ts-expect-error custom element provided by Viral Loops
    <form-widget ucid={ucid} mode={popup ? 'popup' : 'form'}></form-widget>
  );
}
