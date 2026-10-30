"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { formatNumber } from "./metric-format";

export interface DistributionSegment {
  name: string;
  value: number;
  /** Any CSS color. Defaults to chart-1 through chart-5 in order. */
  color?: string;
}

export interface DistributionBarProps extends React.ComponentProps<"div"> {
  segments: DistributionSegment[];
  valueFormatter?: (value: number) => string;
  showLegend?: boolean;
  /** Show absolute values in the legend in addition to the share. */
  showValues?: boolean;
}

const defaultColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const keyframes =
  "@keyframes distribution-bar-reveal{from{clip-path:inset(0 100% 0 0 round 999px)}to{clip-path:inset(0 0 0 0 round 999px)}}";

function DistributionBar({
  segments,
  valueFormatter = (value) => formatNumber(value, { format: "compact" }),
  showLegend = true,
  showValues = false,
  className,
  ...props
}: DistributionBarProps) {
  const [active, setActive] = React.useState<string | null>(null);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const resolved = segments.map((segment, index) => ({
    ...segment,
    color: segment.color ?? defaultColors[index % defaultColors.length]!,
    share: total > 0 ? segment.value / total : 0,
  }));
  const visible = resolved.filter((segment) => segment.share > 0);

  return (
    <div
      data-slot="distribution-bar"
      className={cn("flex flex-col gap-3.5", className)}
      {...props}
    >
      <style href="overtrue-distribution-bar" precedence="default">
        {keyframes}
      </style>
      <div
        role="img"
        aria-label={resolved
          .map(
            (segment) =>
              `${segment.name} ${formatNumber(segment.share, { format: "percent" })}`,
          )
          .join(", ")}
        data-slot="distribution-bar-strip"
        className="flex h-3 w-full gap-[3px] motion-safe:animate-[distribution-bar-reveal_800ms_cubic-bezier(0.22,1,0.36,1)_both]"
        onMouseLeave={() => setActive(null)}
      >
        {visible.map((segment, index) => (
          <div
            key={segment.name}
            data-slot="distribution-bar-segment"
            data-active={active === segment.name || undefined}
            onMouseEnter={() => setActive(segment.name)}
            className={cn(
              "h-full min-w-[3px] rounded-[3px] transition-[flex-grow,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]",
              index === 0 && "rounded-l-full",
              index === visible.length - 1 && "rounded-r-full",
            )}
            style={{
              flex: `${segment.share} 1 0%`,
              backgroundImage: `linear-gradient(180deg, ${segment.color}, color-mix(in oklab, ${segment.color} 78%, transparent))`,
              opacity: active && active !== segment.name ? 0.4 : 1,
              transitionDuration: active !== null ? "150ms" : undefined,
            }}
          />
        ))}
      </div>
      {showLegend ? (
        <ul
          data-slot="distribution-bar-legend"
          className="flex flex-wrap gap-x-5 gap-y-2 text-sm"
          onMouseLeave={() => setActive(null)}
        >
          {resolved.map((segment) => (
            <li
              key={segment.name}
              data-active={active === segment.name || undefined}
              onMouseEnter={() => setActive(segment.name)}
              className={cn(
                "flex items-center gap-2 transition-opacity duration-150 motion-reduce:transition-none",
                active && active !== segment.name && "opacity-50",
              )}
            >
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: segment.color,
                  boxShadow: `0 0 0 2px color-mix(in oklab, ${segment.color} 16%, transparent)`,
                }}
              />
              <span className="text-muted-foreground">{segment.name}</span>
              <span className="font-medium tabular-nums">
                {formatNumber(segment.share, { format: "percent" })}
              </span>
              {showValues ? (
                <span className="text-muted-foreground text-xs tabular-nums">
                  ({valueFormatter(segment.value)})
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export { DistributionBar };
