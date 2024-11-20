'use client';

import React from 'react';
import { Button } from '@/components/ui/button';

interface EmailCaptureButtonProps {
  children: React.ReactNode;
}

const EmailCaptureButton: React.FC<EmailCaptureButtonProps> = ({
  children,
}) => {
  return (
    <Button asChild className="rounded-2xl p-6 font-semibold">
      <a
        href="https://forms.gle/4gZcMgQFtjeET7t59"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    </Button>
  );
};

export default EmailCaptureButton;
