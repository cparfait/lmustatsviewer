import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function TableTitle({
  title,
  children,
  variant = "primary",
}: {
  title: ReactNode;
  children?: ReactNode;
  variant?: "primary" | "highlight";
}) {
  if (variant === "highlight") {
    return (
      <div className="bg-white dark:bg-yellow-950 text-slate-900 dark:text-yellow-50 px-4 py-2 border-y-2 border-primary flex items-center justify-center gap-4 flex-wrap relative">
        <h2 className="text-sm font-bold tracking-tight uppercase">{title}</h2>
        {children && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-4 text-slate-900 dark:text-yellow-50">
            {children}
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "bg-primary text-primary-foreground px-4 py-1 flex items-center justify-between gap-4 flex-wrap"
      )}
    >
      <h2 className="text-sm font-bold tracking-tight uppercase">{title}</h2>
      {children && <div className="flex items-center gap-4">{children}</div>}
    </div>
  );
}
