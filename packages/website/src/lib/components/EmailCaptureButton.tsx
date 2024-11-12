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

const SHEET_URL = 'https://sheet.best/api/sheets/6888888888888888';

interface EmailCaptureButtonProps {
  children: React.ReactNode;
}

const EmailCaptureButton: React.FC<EmailCaptureButtonProps> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const form = useForm({
    defaultValues: {
      email: '',
    },
  });

  const handleSubmit = async (values: { email: string }) => {
    try {
      const response = await fetch(SHEET_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: values.email }),
      });

      if (response.ok) {
        setSubmitted(true);
      } else {
        console.error('Failed to submit email');
      }
    } catch (error) {
      console.error('Error submitting email:', error);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        {children}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">

          {submitted ? (
            <DialogTitle className="text-center mt-4 leading-tight tracking-normal">Your email has been successfully submitted.</DialogTitle>
          ) : (
            <>
            <DialogTitle className="text-center mt-4 leading-tight tracking-normal">Share your email for priority access to Foil&apos;s upcoming testnet competition</DialogTitle>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }: { field: ControllerRenderProps<{ email: string }, 'email'> }) => (
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
                  <Button className="w-full" type="submit">
                    Submit
                  </Button>
                </DialogFooter>
              </form>
            </Form>
            </>
          )}
          <DialogFooter>
          <p className="text-sm text-muted-foreground text-center ">If you don’t like email (us neither), keep an eye on the <a 
            href="https://twitter.com/foilxyz"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Twitter" className='underline'>Foil X account</a> and/or <a 
            href="https://discord.gg/foil"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discord"
            className='underline'
            >join the Discord server</a>.</p>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EmailCaptureButton;
