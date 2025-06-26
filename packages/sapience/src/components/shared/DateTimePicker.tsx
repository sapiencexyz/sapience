'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { Calendar } from '@sapience/ui/components/ui/calendar';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { cn } from '@sapience/ui/lib/utils';
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
  
  // Set minimum date to today to prevent selecting past dates (in UTC)
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()));
  const minDate = min ? new Date(min * 1000) : today;
  const maxDate = max ? new Date(max * 1000) : undefined;

  const datePart = new Date(currentDate);
  datePart.setUTCHours(0, 0, 0, 0);

  // Local state for time input and focus
  const [localTime, setLocalTime] = useState(timePart || '');
  const [isFocused, setIsFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Separate state for calendar (local time)
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(
    isUnset ? undefined : new Date(value * 1000)
  );

  // Helper function to format time in UTC
  const formatUTCTime = (date: Date) => {
    return date.toISOString().slice(11, 16); // 'HH:mm' in UTC
  };

  // Helper function to check if two dates are the same day in UTC
  const isSameUTCDay = (date1: Date, date2: Date) => {
    return (
      date1.getUTCFullYear() === date2.getUTCFullYear() &&
      date1.getUTCMonth() === date2.getUTCMonth() &&
      date1.getUTCDate() === date2.getUTCDate()
    );
  };

  // Helper function to convert local timestamp to UTC timestamp
  const localToUTCTimestamp = (localDate: Date): number => {
    const utcDate = new Date(Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate()));
    return Math.floor(utcDate.getTime() / 1000);
  };

  // Helper function to convert UTC timestamp to local date for calendar
  const utcToLocalDate = (utcTimestamp: number): Date => {
    const utcDate = new Date(utcTimestamp * 1000);
    return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
  };

  // Sync calendarDate with value changes
  useEffect(() => {
    if (isUnset) {
      setCalendarDate(undefined);
    } else {
      setCalendarDate(utcToLocalDate(value));
    }
  }, [value, isUnset]);

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
    
    // Update calendar state with local date
    setCalendarDate(newDate);
    
    // Transform local date to UTC timestamp
    const utcTimestamp = localToUTCTimestamp(newDate);
    
    // Check if the selected date is today (in UTC)
    const utcDate = new Date(utcTimestamp * 1000);
    const isToday = isSameUTCDay(utcDate, today);
    
    let hours = 0;
    let minutes = 0;
    
    if (isToday) {
      // If today is selected, use current time + 1 minute (in UTC)
      const oneMinuteAhead = new Date(now.getTime() + 60000); // Add 60 seconds
      hours = oneMinuteAhead.getUTCHours();
      minutes = oneMinuteAhead.getUTCMinutes();
    } else {
      // For other dates, use existing time or default to 00:00
      [hours, minutes] = (localTime || '').split(':').map(Number);
    }
    
    const updatedDate = new Date(utcDate);
    updatedDate.setUTCHours(hours || 0, minutes || 0, 0, 0);
    const updatedTimestamp = Math.floor(updatedDate.getTime() / 1000);
    
    if (!isFocused) {
      // Check min constraint first
      if (min !== undefined && updatedTimestamp < min) {
        setError('End time is before start time');
        onChange(min);
        // Update local time to match the min constraint
        const minDate = new Date(min * 1000);
        setLocalTime(formatUTCTime(minDate));
        return;
      }
      
      // Check max constraint
      if (max !== undefined && updatedTimestamp > max) {
        setError('Start time is after end time');
        onChange(max);
        // Update local time to match the max constraint
        const maxDate = new Date(max * 1000);
        setLocalTime(formatUTCTime(maxDate));
        return;
      }
      
      // If today and time is in the past, set to current time (but only if constraints allow)
      if (isToday) {
        const oneMinuteAhead = new Date(now.getTime() + 60000); // Add 60 seconds
        const currentTime = oneMinuteAhead.getUTCHours() * 60 + oneMinuteAhead.getUTCMinutes();
        const selectedTime = (hours || 0) * 60 + (minutes || 0);
        
        if (selectedTime < currentTime) {
          // Check if one minute ahead would violate min constraint
          const oneMinuteAheadDate = new Date();
          oneMinuteAheadDate.setUTCHours(oneMinuteAhead.getUTCHours(), oneMinuteAhead.getUTCMinutes(), 0, 0);
          const oneMinuteAheadTimestamp = Math.floor(oneMinuteAheadDate.getTime() / 1000);
          
          if (min !== undefined && oneMinuteAheadTimestamp < min) {
            setError('Current time is before minimum allowed time');
            onChange(min);
            // Update local time to match the min constraint
            const minDate = new Date(min * 1000);
            setLocalTime(formatUTCTime(minDate));
            return;
          }
          
          setError('Cannot set time in the past');
          onChange(oneMinuteAheadTimestamp);
          setLocalTime(formatUTCTime(oneMinuteAhead));
          return;
        }
      }
      
      setError(null);
      // Set local time to match the actual selected time
      if (isToday) {
        const oneMinuteAhead = new Date(now.getTime() + 60000); // Add 60 seconds
        setLocalTime(formatUTCTime(oneMinuteAhead));
      }
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
    
    // Check if the selected date is today and time is in the past
    const now = new Date();
    const isToday = isSameUTCDay(datePart, today);
    
    if (isToday) {
      const oneMinuteAhead = new Date(now.getTime() + 60000); // Add 60 seconds
      const currentTime = oneMinuteAhead.getUTCHours() * 60 + oneMinuteAhead.getUTCMinutes();
      const selectedTime = (hours || 0) * 60 + (minutes || 0);
      
      if (selectedTime < currentTime) {
        setError('Cannot set time in the past');
        // Set to one minute ahead
        const oneMinuteAheadDate = new Date();
        oneMinuteAheadDate.setUTCHours(oneMinuteAhead.getUTCHours(), oneMinuteAhead.getUTCMinutes(), 0, 0);
        onChange(Math.floor(oneMinuteAheadDate.getTime() / 1000));
        setLocalTime(formatUTCTime(oneMinuteAhead));
        return;
      }
    }
    
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
    if (minDate && isSameUTCDay(currentDate, minDate)) {
      return formatUTCTime(minDate);
    }
    return undefined;
  };

  const computeMaxTime = () => {
    if (maxDate && isSameUTCDay(currentDate, maxDate)) {
      return formatUTCTime(maxDate);
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
                  : calendarDate?.toISOString().slice(0, 10) || 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={calendarDate}
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
