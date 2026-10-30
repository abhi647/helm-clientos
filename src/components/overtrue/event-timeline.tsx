import * as React from "react";

import { cn } from "@/lib/utils";

export type TimelineStatus = "default" | "current" | "done";

/**
 * Timeline owns only the chronology layout: an ordered list of items, each
 * with a rail (marker + connector) beside its content. Put your own semantic
 * content (headings, time, badges, avatars, cards) inside TimelineContent.
 */
function Timeline({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="timeline"
      className={cn("flex flex-col", className)}
      {...props}
    />
  );
}

export interface TimelineItemProps extends React.ComponentProps<"li"> {
  /**
   * "current" marks the item as the present step (sets aria-current) and
   * highlights its marker. "done" fills the marker.
   */
  status?: TimelineStatus;
}

function TimelineItem({
  status = "default",
  className,
  ...props
}: TimelineItemProps) {
  return (
    <li
      data-slot="timeline-item"
      data-status={status}
      aria-current={status === "current" ? "true" : undefined}
      className={cn("group/timeline-item relative flex gap-3", className)}
      {...props}
    />
  );
}

/** The column beside the content that holds the marker and connector. */
function TimelineRail({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="timeline-rail"
      className={cn("flex w-6 shrink-0 flex-col items-center", className)}
      {...props}
    />
  );
}

/**
 * The dot on the rail. Pass an icon, avatar, or image as children; with no
 * children it renders a plain ring and is hidden from assistive technology.
 */
function TimelineMarker({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  const empty = React.Children.count(children) === 0;
  return (
    <span
      data-slot="timeline-marker"
      aria-hidden={empty ? "true" : undefined}
      className={cn(
        "relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/80 bg-card text-muted-foreground",
        "shadow-[0_1px_2px_rgb(0_0_0/0.06)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_1px_2px_rgb(0_0_0/0.4)]",
        "transition-[color,background-color,border-color,box-shadow] duration-150 motion-reduce:transition-none",
        "[&>svg]:size-3 [&>img]:size-full [&>img]:object-cover",
        // The present step carries a soft primary halo, and a faint glow on dark surfaces.
        "group-data-[status=current]/timeline-item:border-primary group-data-[status=current]/timeline-item:text-primary group-data-[status=current]/timeline-item:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-primary)_14%,transparent)]",
        "dark:group-data-[status=current]/timeline-item:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-primary)_18%,transparent),0_0_14px_color-mix(in_oklab,var(--color-primary)_45%,transparent)]",
        "group-data-[status=done]/timeline-item:border-primary group-data-[status=done]/timeline-item:bg-primary group-data-[status=done]/timeline-item:text-primary-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** The line between markers. Decorative; hidden on the last item. */
function TimelineConnector({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="timeline-connector"
      aria-hidden="true"
      className={cn(
        "my-1.5 w-px flex-1 bg-linear-to-b from-border to-border/40 group-last/timeline-item:hidden",
        // Completed steps draw the rail in the accent, so progress reads at a glance.
        "group-data-[status=done]/timeline-item:from-primary/50 group-data-[status=done]/timeline-item:to-primary/25",
        className,
      )}
      {...props}
    />
  );
}

function TimelineContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="timeline-content"
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-1 pt-0.5 pb-6 group-last/timeline-item:pb-0",
        className,
      )}
      {...props}
    />
  );
}

/** A row for the title, badges, and time. Time floats right via TimelineTime. */
function TimelineHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="timeline-header"
      className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}
      {...props}
    />
  );
}

function TimelineTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="timeline-title"
      className={cn(
        "m-0 text-sm leading-5 font-medium tracking-tight text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TimelineTime({ className, ...props }: React.ComponentProps<"time">) {
  return (
    <time
      data-slot="timeline-time"
      className={cn(
        "ml-auto text-xs whitespace-nowrap text-muted-foreground tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

function TimelineDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="timeline-description"
      className={cn(
        "m-0 text-[13px] leading-5 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Timeline,
  TimelineItem,
  TimelineRail,
  TimelineMarker,
  TimelineConnector,
  TimelineContent,
  TimelineHeader,
  TimelineTitle,
  TimelineTime,
  TimelineDescription,
};
