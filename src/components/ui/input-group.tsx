import * as React from 'react';
import { cn } from '@/lib/utils';

function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        'flex min-h-12 w-full items-center rounded-[14px] border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20',
        className,
      )}
      {...props}
    />
  );
}

const InputGroupAddon = React.forwardRef<HTMLSpanElement, React.ComponentProps<'span'>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="input-group-addon"
      className={cn('shrink-0 px-3.5 text-sm font-bold text-muted-foreground', className)}
      {...props}
    />
  ),
);
InputGroupAddon.displayName = 'InputGroupAddon';

const InputGroupInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      data-slot="input-group-control"
      className={cn(
        'h-12 min-w-0 flex-1 rounded-[14px] border-0 bg-transparent px-2 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
InputGroupInput.displayName = 'InputGroupInput';

export { InputGroup, InputGroupAddon, InputGroupInput };
