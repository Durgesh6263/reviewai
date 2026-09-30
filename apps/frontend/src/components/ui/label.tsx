'use client';

import { LabelHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={twMerge(
          'text-sm font-medium text-secondary-900 dark:text-white',
          'mb-1.5 block',
          className
        )}
        {...props}
      />
    );
  }
);

Label.displayName = 'Label';

export { Label };