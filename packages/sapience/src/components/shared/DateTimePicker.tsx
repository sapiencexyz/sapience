'use client';

import { Button } from '@foil/ui/components/ui/button';
import { Calendar } from '@foil/ui/components/ui/calendar';
import { Input } from '@foil/ui/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@foil/ui/components/ui/popover';
import { cn } from '@foil/ui/lib/utils';
import { format, isSameDay } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useState, useEffect } from 'react';

interface DateTimePickerProps {
  value: number; // Unix timestamp
  onChange: (value: number) => void;
  id?: string;
  className?: string;
  min?: number; // unix timestamp
  max?: number; // unix timestamp
  timePart?: string; // 'HH:mm' string from parent
}

const DateTimePicker = ({
  value,
  onChange,
  id,
  className,
  min,
  max,
  timePart,
}: DateTimePickerProps) => {
  const isUnset = value === 0;
  const currentDate = isUnset ? new Date() : new Date(value * 1000);
  const minDate = min ? new Date(min * 1000) : undefined;
  const maxDate = max ? new Date(max * 1000) : undefined;

  const datePart = new Date(currentDate);
  datePart.setHours(0, 0, 0, 0);

  // Local state for time input and focus
  const [localTime, setLocalTime] = useState(timePart || '');
  const [isFocused, setIsFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync localTime with prop changes
  useEffect(() => {
    if (!isFocused) {
      setLocalTime(timePart || '');
    }
  }, [timePart, isFocused]);

  // Clear error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleDateSelect = (newDate: Date | undefined) => {
    if (!newDate) return;
    const [hours, minutes] = (localTime || '').split(':').map(Number);
    const updatedDate = new Date(newDate);
    updatedDate.setUTCHours(hours || 0, minutes || 0, 0, 0);
    const updatedTimestamp = Math.floor(updatedDate.getTime() / 1000);
    if (!isFocused) {
      if (min !== undefined && updatedTimestamp < min) {
        setError('End time is before start time');
        onChange(min);
        return;
      }
      if (max !== undefined && updatedTimestamp > max) {
        setError('Start time is after end time');
        onChange(max);
        return;
      }
      setError(null);
    }
    onChange(updatedTimestamp);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalTime(e.target.value);
    setError(null); // Clear error while editing
    // Only update parent if not focused and valid
    if (!isFocused && /^\d{2}:\d{2}$/.test(e.target.value)) {
      updateTime(e.target.value);
    }
  };

  const handleTimeBlur = () => {
    setIsFocused(false);
    if (/^\d{2}:\d{2}$/.test(localTime)) {
      updateTime(localTime);
    } else {
      setLocalTime(timePart || '');
      setError(null);
    }
  };

  const handleTimeFocus = () => {
    setIsFocused(true);
    setError(null);
  };

  function updateTime(time: string) {
    const [hours, minutes] = (time || '').split(':').map(Number);
    const updatedDate = new Date(datePart);
    updatedDate.setUTCHours(hours || 0, minutes || 0, 0, 0);
    const updatedTimestamp = Math.floor(updatedDate.getTime() / 1000);
    // Only perform range checks when not focused
    if (min !== undefined && updatedTimestamp < min) {
      setError('End time is before start time, setting a fallback');
      onChange(min);
      return;
    }
    if (max !== undefined && updatedTimestamp > max) {
      setError('Start time is after end time, setting a fallback');
      onChange(max);
      return;
    }
    setError(null);
    onChange(updatedTimestamp);
  }

  const computeMinTime = () => {
    if (minDate && isSameDay(currentDate, minDate)) {
      return format(minDate, 'HH:mm');
    }
    return undefined;
  };

  const computeMaxTime = () => {
    if (maxDate && isSameDay(currentDate, maxDate)) {
      return format(maxDate, 'HH:mm');
    }
    return undefined;
  };

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="flex gap-2 items-center w-full">
        <div className="relative flex flex-col flex-[2]">
          <Popover modal>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn('w-full justify-start text-left font-normal')}
                id={id ? `${id}-date` : undefined}
                type="button"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {isUnset
                  ? 'Select date'
                  : currentDate.toISOString().slice(0, 10)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={isUnset ? undefined : currentDate}
                onSelect={handleDateSelect}
                initialFocus
                fromDate={minDate}
                toDate={maxDate}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="relative flex">
          <Input
            type="time"
            value={localTime}
            onChange={handleTimeChange}
            onFocus={handleTimeFocus}
            onBlur={handleTimeBlur}
            className="w-full"
            id={id ? `${id}-time` : undefined}
            min={computeMinTime()}
            max={computeMaxTime()}
            placeholder={isUnset ? 'Select time' : undefined}
          />
        </div>
      </div>
      {error ? (
        <div className="text-xs text-red-600 mt-1 w-full text-center">
          {error}
        </div>
      ) : (
        <div className="text-xs text-gray-400 mt-1 w-full text-center">
          {isUnset ? 'Not set' : `Unix timestamp: ${value}`}
          {!isUnset && (
            <>
              {' ('}
              <a
                href="https://www.unixtimestamp.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 underline"
              >
                Unix converter
              </a>
              )
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DateTimePicker;
