import * as React from "react";
import {
  IconArrowDownRight as ArrowDownRight,
  IconArrowUpRight as ArrowUpRight,
  IconMinus as Minus,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { formatDelta } from "./metric-format";

export type DeltaDirection = "up" | "down" | "flat";

export function getDeltaDirection(delta: number | undefined): DeltaDirection {
  if (delta === undefined || delta === 0 || !Number.isFinite(delta))
    return "flat";
  return delta > 0 ? "up" : "down";
}

const directionIcon: Record<DeltaDirection, React.ElementType> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
};

type Tone = "positive" | "negative" | "neutral";

const toneText: Record<Tone, string> = {
  positive: "text-emerald-700 dark:text-emerald-400",
  negative: "text-rose-700 dark:text-rose-400",
  neutral: "text-muted-foreground",
};

const toneSoft: Record<Tone, string> = {
  positive: "bg-emerald-500/10 dark:bg-emerald-400/10",
  negative: "bg-rose-500/10 dark:bg-rose-400/10",
  neutral: "bg-muted dark:bg-muted/70",
};

const toneOutline: Record<Tone, string> = {
  positive:
    "bg-emerald-500/[0.06] ring-emerald-600/20 dark:bg-emerald-400/[0.07] dark:ring-emerald-400/25",
  negative:
    "bg-rose-500/[0.06] ring-rose-600/20 dark:bg-rose-400/[0.07] dark:ring-rose-400/25",
  neutral: "bg-muted/40 ring-border",
};

export interface DeltaBadgeProps extends React.ComponentProps<"span"> {
  /** Fractional change, e.g. 0.124 for +12.4%. */
  delta: number;
  /** Treat a decrease as good and an increase as bad (churn, latency, errors). */
  invert?: boolean;
  variant?: "outline" | "soft" | "text";
  showIcon?: boolean;
}

/** A change chip: the arrow shows direction, the color shows whether it helps. */
function DeltaBadge({
  delta,
  invert = false,
  variant = "outline",
  showIcon = true,
  className,
  children,
  ...props
}: DeltaBadgeProps) {
  const direction = getDeltaDirection(delta);
  const positive =
    direction === "flat" ? null : (direction === "up") !== invert;
  const tone: Tone =
    positive === true
      ? "positive"
      : positive === false
        ? "negative"
        : "neutral";
  const Icon = directionIcon[direction];
  const pill = variant !== "text";

  return (
    <span
      data-slot="delta-badge"
      data-direction={direction}
      data-positive={positive}
      data-variant={variant}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 text-xs leading-none font-medium tracking-[-0.01em] whitespace-nowrap tabular-nums",
        pill && "h-5 rounded-full",
        pill && (showIcon ? "pr-1.5 pl-1" : "px-1.5"),
        variant === "outline" && ["ring-1 ring-inset", toneOutline[tone]],
        variant === "soft" && toneSoft[tone],
        toneText[tone],
        className,
      )}
      {...props}
    >
      {showIcon ? (
        <Icon
          data-slot="delta-badge-icon"
          className="size-3 shrink-0"
          stroke={2.5}
          aria-hidden="true"
        />
      ) : null}
      {children ?? formatDelta(delta)}
    </span>
  );
}

export { DeltaBadge };
