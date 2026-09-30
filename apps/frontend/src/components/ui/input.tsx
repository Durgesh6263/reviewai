'use client';

import { InputHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, disabled, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={twMerge(
          'flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm',
          'placeholder:text-secondary-400',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-secondary-100 dark:disabled:bg-secondary-800',
          'transition-colors duration-200',
          error && 'border-error-500 focus-visible:ring-error-500',
          className
        )}
        disabled={disabled}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };