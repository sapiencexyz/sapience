'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { useForm, ControllerRenderProps } from 'react-hook-form';

const SHEET_URL =
  'https://script.google.com/macros/s/AKfycbz4_JnldtbjiTGe7YwTgSDO2iqKtB5EfP1qnj3igYCmL1_sxRq2oZL-G4gBDNQKcFWw1w/exec';

interface EmailCaptureButtonProps {
  children: React.ReactNode;
}

const EmailCaptureButton: React.FC<EmailCaptureButtonProps> = ({
  children,
}) => {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm({
    defaultValues: {
      email: '',
    },
  });

  const handleSubmit = async (values: { email: string }) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('email', values.email);

      const response = await fetch(SHEET_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ email: values.email }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.type === 'opaque') {
        setSubmitted(true);
      } else {
        throw new Error('Unexpected response type');
      }

      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting email:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="rounded-2xl p-6 font-semibold"
      >
        {children}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          {submitted ? (
            <DialogTitle className="mb-1 mt-4 text-center leading-tight tracking-normal">
              Your email has been submitted
            </DialogTitle>
          ) : (
            <>
              <DialogTitle className="mb-1 mt-4 text-center leading-tight tracking-normal">
                Share your email for priority access to Foil&apos;s upcoming
                testnet competition
              </DialogTitle>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(handleSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="email"
                    render={({
                      field,
                    }: {
                      field: ControllerRenderProps<{ email: string }, 'email'>;
                    }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="Enter your email"
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button
                      className="w-full"
                      type="submit"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Submitting...' : 'Submit'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </>
          )}
          <DialogFooter>
            <p className="text-center text-sm text-muted-foreground">
              If you don’t like email (us neither), keep an eye on the{' '}
              <a
                href="https://twitter.com/foilxyz"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Twitter"
                className="underline"
              >
                Foil X account
              </a>{' '}
              and/or{' '}
              <a
                href="https://discord.gg/foil"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Discord"
                className="underline"
              >
                join the Discord server
              </a>
              .
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EmailCaptureButton;
