import { InputHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted transition-colors focus:outline focus:outline-1 focus:outline-white ${className}`}
      {...props}
    />
  )
);
Input.displayName = 'Input';
