'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          {
            'border-transparent bg-primary text-primary-foreground hover:bg-primary/80': variant === 'default',
            'border-transparent bg-secondary-100 text-secondary-900 hover:bg-secondary-100/80 dark:bg-secondary-700 dark:text-secondary-100 dark:hover:bg-secondary-700/80': variant === 'secondary',
            'border-transparent bg-error-500 text-white hover:bg-error-500/80': variant === 'destructive',
            'border-transparent bg-green-500 text-white hover:bg-green-500/80': variant === 'success',
            'border-transparent bg-yellow-500 text-white hover:bg-yellow-500/80': variant === 'warning',
            'text-foreground border-border': variant === 'outline',
          }
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';

export { Badge };