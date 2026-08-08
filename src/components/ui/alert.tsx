import * as React from 'react';
import { cn } from '@/lib/utils';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive' | 'success';
}

function Alert({ className, variant = 'default', ...props }: AlertProps) {
  return (
    <div
      data-slot="alert"
      role={variant === 'destructive' ? 'alert' : undefined}
      className={cn(
        'relative flex w-full gap-3 rounded-[16px] border p-4 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
        variant === 'destructive' &&
          'border-[color:var(--danger)]/20 bg-[var(--danger-soft)] text-destructive [&>svg]:text-destructive',
        variant === 'success' &&
          'border-[color:var(--positive)]/20 bg-[var(--positive-soft)] text-[var(--positive)] [&>svg]:text-[var(--positive)]',
        variant === 'default' &&
          'border-border bg-secondary text-secondary-foreground [&>svg]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5
      data-slot="alert-title"
      className={cn('mb-1 font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('text-sm leading-relaxed [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
