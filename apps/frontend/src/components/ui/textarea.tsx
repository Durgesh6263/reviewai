'use client';

import { TextareaHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, disabled, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={twMerge(
          'flex min-h-[100px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm',
          'placeholder:text-secondary-400',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-secondary-100 dark:disabled:bg-secondary-800',
          'transition-colors duration-200 resize-y',
          error && 'border-error-500 focus-visible:ring-error-500',
          className
        )}
        disabled={disabled}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea };