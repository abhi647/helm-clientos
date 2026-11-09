import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export interface ActivityItem {
  id: string;
  initials: string;
  content: ReactNode;
  time: string;
}
export function ActivityFeed({
  items,
  title = "Recent activity",
  className,
}: {
  items: ActivityItem[];
  title?: string;
  className?: string;
}) {
  return (
    <Card
      data-slot="activity-feed"
      className={cn(
        "gap-0 overflow-hidden rounded-xl border border-border/70 bg-card py-0 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_16px_-12px_rgb(0_0_0/0.10)]",
        className,
      )}
    >
      <CardHeader className="flex min-h-10 items-center border-b border-border/60 px-3.5 py-1.5 [.border-b]:pb-1.5">
        <CardTitle className="text-[13px] font-semibold"><h2 className="m-0 text-[length:inherit] font-[inherit]">{title}</h2></CardTitle>
      </CardHeader>
      <CardContent className="px-3.5 py-0">
        <ol className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex gap-2 py-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {item.initials}
              </span>
              <div className="min-w-0 text-xs leading-snug">
                <div className="text-card-foreground">{item.content}</div>
                <p className="m-0 mt-0.5 truncate text-[11px] text-muted-foreground">
                  {item.time}
                </p>
              </div>
            </li>
          ))}
        </ol>
        {!items.length && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No activity yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
