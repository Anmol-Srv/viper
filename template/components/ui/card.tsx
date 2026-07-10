import { HTMLAttributes } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Set false for tables/lists that should bleed to the card edges instead of being inset. */
  padded?: boolean;
};

export function Card({ className = '', padded = true, ...props }: CardProps) {
  return (
    <div
      className={`rounded border border-border bg-surface ${padded ? 'p-6' : ''} ${className}`}
      {...props}
    />
  );
}

export function CardTitle({ className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`text-[11px] font-medium uppercase tracking-wide text-muted ${className}`}
      {...props}
    />
  );
}
