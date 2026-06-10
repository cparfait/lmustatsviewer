import * as React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn(
        "[&_tr]:border-b [&_tr]:bg-primary/15 dark:[&_tr]:bg-primary/10 [&_tr]:border-primary/30",
        className
      )}
      {...props}
    />
  )
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  )
);
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-auto py-1 px-2 text-left align-middle text-micro font-semibold uppercase tracking-wide text-yellow-900 dark:text-yellow-100",
        className
      )}
      {...props}
    />
  )
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("p-3 align-middle", className)} {...props} />
  )
);
TableCell.displayName = "TableCell";

/**
 * En-tête de colonne **triable** : `TableHead` cliquable avec chevrons de tri.
 * Générique sur le type de clé de tri (`T`). Partagé par tous les tableaux triables
 * (ex. Sessions) pour éviter la duplication.
 *
 * Rappels d'intégration (les primitives rendent un vrai `<table>`) :
 *  - `<colgroup>`/`<col>` natifs fonctionnent dans `<Table>` (largeurs fixes) ;
 *  - `table-fixed` / `min-w-*` → via `className` sur `<Table>` ;
 *  - en-tête collant → `className` sur `<TableHeader>`.
 */
function SortHeader<T extends string>({
  col,
  label,
  sortBy,
  sortDir,
  onSort,
  className,
}: {
  col: T;
  label: string;
  sortBy: T;
  sortDir: "asc" | "desc";
  onSort: (k: T) => void;
  className?: string;
}) {
  return (
    <TableHead
      className={cn(
        "h-auto py-1 text-micro cursor-pointer select-none hover:text-foreground whitespace-nowrap",
        className
      )}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {col === sortBy ? (
          sortDir === "asc" ? (
            <ChevronUp className="h-3 w-3 text-primary ml-0.5" />
          ) : (
            <ChevronDown className="h-3 w-3 text-primary ml-0.5" />
          )
        ) : (
          <ChevronDown className="h-3 w-3 opacity-20 ml-0.5" />
        )}
      </span>
    </TableHead>
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  SortHeader,
};
