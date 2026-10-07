import { AlertTriangle, FileText } from 'lucide-react';
import type { ReactNode } from 'react';

export function WorkspaceState({
  empty = false,
  title,
  description,
  children,
}: {
  empty?: boolean;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const Icon = empty ? FileText : AlertTriangle;
  return (
    <main className="flex min-h-[calc(100dvh-6rem)] items-center justify-center bg-background px-4 py-10 text-foreground">
      <section
        role={empty ? 'status' : 'alert'}
        className="w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8"
      >
        <Icon aria-hidden="true" className="mb-5 size-8 text-muted-foreground" />
        <h1 className="mb-3 text-xl font-semibold">{title}</h1>
        <p className="mb-6 text-sm leading-7 text-muted-foreground">{description}</p>
        <div className="space-y-4">{children}</div>
      </section>
    </main>
  );
}
