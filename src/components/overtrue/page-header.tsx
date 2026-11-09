import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2",
        className,
      )}
    >
      <div
        data-slot="page-header-heading"
        className="min-w-0 transition-[opacity,translate] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:starting:translate-y-1 motion-safe:starting:opacity-0 motion-reduce:transition-none"
      >
        {eyebrow && (
          <p
            data-slot="page-header-eyebrow"
            className="m-0 mb-1 flex items-center gap-2 text-xs leading-4 font-medium text-muted-foreground"
          >
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_16%,transparent)] dark:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_22%,transparent),0_0_10px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
            />
            {eyebrow}
          </p>
        )}
        <h1 className="m-0 text-[19px] leading-6 font-semibold tracking-[-0.02em] text-balance text-foreground">
          {title}
        </h1>
        {description && (
          <div className="m-0 mt-0.5 flex max-w-4xl flex-wrap items-center gap-2 text-xs leading-5 text-pretty text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {actions && (
        <div
          data-slot="page-header-actions"
          className="flex flex-wrap items-center gap-2"
        >
          {actions}
        </div>
      )}
    </header>
  );
}
