import { ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
};

// SPEC v1.3 §0.2: primary = white bg / black text; secondary = transparent + 1px border;
// danger = --danger border/text, filled on hover. Monochrome — no accent color.
const VARIANTS = {
  primary: 'bg-white text-black hover:bg-white/90',
  secondary: 'border border-border text-foreground hover:bg-surface',
  danger: 'border border-danger text-danger hover:bg-danger hover:text-white',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', loading = false, variant = 'primary', disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-semibold transition-colors focus:outline focus:outline-1 focus:outline-white disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
);
Button.displayName = 'Button';
