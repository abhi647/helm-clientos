import type { ComponentProps, ReactNode } from "react";
import {
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SectionCardProps extends Omit<
  ComponentProps<"section">,
  "title"
> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  contentClassName?: string;
}

/** A shared heading, actions and content surface for admin panels. */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  ...props
}: SectionCardProps) {
  return (
    // a <section> landmark rather than a plain card div, so each panel is a region with its heading
    <section
      data-slot="section-card"
      className={cn(
        "flex flex-col min-w-0 gap-0 overflow-hidden rounded-xl border border-border/70 bg-card py-0 text-card-foreground ring-0",
        "shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_16px_-12px_rgb(0_0_0/0.10)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_1px_2px_rgb(0_0_0/0.5)]",
        className,
      )}
      {...props}
    >
      {(title || description || actions) && (
        <CardHeader className="flex min-h-10 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-border/60 px-3.5 py-1.5 [.border-b]:pb-1.5">
          <div data-slot="section-card-heading" className="min-w-0 flex-1">
            {title && (
              <CardTitle className="m-0 text-[13px] leading-5 font-semibold tracking-tight text-card-foreground">
                {/* a real heading, so the page outline and screen readers see each panel */}
                <h2 className="m-0 text-[length:inherit] leading-[inherit] font-[inherit]">{title}</h2>
              </CardTitle>
            )}
            {description && (
              <CardDescription className="m-0 text-[11px] leading-4 text-muted-foreground">
                {description}
              </CardDescription>
            )}
          </div>
          {actions && (
            <div
              data-slot="section-card-actions"
              className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"
            >
              {actions}
            </div>
          )}
        </CardHeader>
      )}
      <CardContent className={cn("p-3", contentClassName)}>
        {children}
      </CardContent>
    </section>
  );
}
