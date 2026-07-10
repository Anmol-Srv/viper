import { HTMLAttributes, ReactNode } from 'react';

type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: string;
  description: ReactNode;
};

/** Designed placeholder for "nothing here yet" / "can't reach X" states — never a bare paragraph. */
export function EmptyState({ title, description, className = '', ...props }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded border border-dashed border-border px-6 py-10 text-center ${className}`}
      {...props}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted">{description}</p>
    </div>
  );
}
