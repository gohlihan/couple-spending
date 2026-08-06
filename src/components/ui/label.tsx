import * as React from 'react';
import { cn } from '@/lib/utils';

const Label = React.forwardRef<HTMLLabelElement, React.ComponentProps<'label'>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      data-slot="label"
      className={cn('text-sm font-semibold leading-none text-foreground', className)}
      {...props}
    />
  ),
);
Label.displayName = 'Label';

export { Label };
