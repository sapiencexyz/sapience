'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@sapience/ui/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@sapience/ui/components/ui/form';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { CalendarIcon, InfoIcon, PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';

import { FOCUS_AREAS } from '~/lib/constants/focusAreas';

// Form validation schema
const askFormSchema = z.object({
  question: z.string().min(1, 'Question is required').min(10, 'Question must be at least 10 characters'),
  focusArea: z.string().min(1, 'Focus area is required'),
  settlementDate: z.string().min(1, 'Settlement date is required'),
  marketClassification: z.enum(['yes-no', 'multiple-choice', 'numeric'], {
    required_error: 'Market classification is required',
  }),
  units: z.string().optional(),
  options: z.array(z.object({
    value: z.string().min(1, 'Option cannot be empty')
  })).optional(),
});

type AskFormValues = z.infer<typeof askFormSchema>;

interface AskFormProps {
  className?: string;
}

const AskForm = ({ className }: AskFormProps) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AskFormValues>({
    resolver: zodResolver(askFormSchema),
    defaultValues: {
      question: '',
      focusArea: '',
      settlementDate: '',
      marketClassification: 'yes-no',
      units: '',
      options: [{ value: '' }, { value: '' }], // Start with 2 empty options
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'options',
  });

  const marketClassification = form.watch('marketClassification');

  const onSubmit = async (values: AskFormValues) => {
    setIsSubmitting(true);
    try {
      // Here you would submit the form to your API
      console.log('Form submitted:', values);
      
      // Show success toast
      toast({
        title: 'Question Submitted',
        description: 'Your question has been submitted for review. We\'ll notify you when it\'s available for forecasting.',
      });
      
      // Reset form
      form.reset();
    } catch (error) {
      console.error('Error submitting form:', error);
      toast({
        title: 'Error',
        description: 'There was an error submitting your question. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`p-6 ${className || ''}`}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold mb-2">Submit a Question</h2>
          <p className="text-muted-foreground">
            Ask a question for the sapience community and bots to forecast. The most interesting questions will become prediction markets.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Question Field */}
            <FormField
              control={form.control}
              name="question"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Will Bitcoin reach $100,000 by the end of 2025?"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Write a clear, specific question that can be objectively resolved.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Focus Area Field */}
            <FormField
              control={form.control}
              name="focusArea"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Focus Area</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a focus area" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FOCUS_AREAS.map((area) => (
                        <SelectItem key={area.id} value={area.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: area.color }}
                            />
                            {area.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Choose the category that best fits your question.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Settlement Date Field */}
            <FormField
              control={form.control}
              name="settlementDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Settlement Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </FormControl>
                  <FormDescription>
                    <div className="flex items-start gap-2">
                      <InfoIcon className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <span>
                        When can this question be definitively answered? This should be the date when the outcome becomes known or verifiable.
                      </span>
                    </div>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Market Classification Field */}
            <FormField
              control={form.control}
              name="marketClassification"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Market Classification</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="yes-no">Yes/No</SelectItem>
                      <SelectItem value="multiple-choice">Multiple Choice</SelectItem>
                      <SelectItem value="numeric">Numeric</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Choose the type of answer format for your question.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Conditional Units Field (for Numeric) */}
            {marketClassification === 'numeric' && (
              <FormField
                control={form.control}
                name="units"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Units</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., USD, Fahrenheit, Rushing Yards, ETH/BTC"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Specify the unit of measurement for the numeric answer (e.g., "USD" for price questions, "Celsius" for temperature, etc.).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Conditional Options Field (for Multiple Choice) */}
            {marketClassification === 'multiple-choice' && (
              <div className="space-y-3">
                <FormLabel>Options</FormLabel>
                <FormDescription>
                  Provide the possible answer choices for your question.
                </FormDescription>
                
                {fields.map((field, index) => (
                  <FormField
                    key={field.id}
                    control={form.control}
                    name={`options.${index}.value`}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              placeholder={`Option ${index + 1}`}
                              {...field}
                            />
                          </FormControl>
                          {fields.length > 2 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => remove(index)}
                              className="flex-shrink-0"
                            >
                              <XIcon className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ value: '' })}
                  className="flex items-center gap-2"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add Option
                </Button>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Question'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
};

export default AskForm; 