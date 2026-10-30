import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { appTimeZone } from "@sapporta/frontend";
import {
  ReportError,
  ReportGridDataset,
  type ReportCellLinkResolvers,
  type ReportCellRenderers,
} from "@sapporta/frontend/report";
import type { GridDataset } from "@sapporta/shared/grid-dataset";
import { Input } from "@sapporta/ui";
import { todayIn } from "../../shared/index";
import { apiErrorMessage } from "../api";
import { FRESH_QUERY } from "../queries";
import { wholeAmounts as roundAmounts } from "./whole-amounts";

/**
 * Today's date (`YYYY-MM-DD`) in the workspace's time zone, the zone the
 * reports count days in, as the boot sequence publishes it.
 */
export function today(): string {
  return todayIn(appTimeZone());
}

/**
 * A report's grid, fetched when the screen opens and again with Run.
 * `queryKey` names the report and every input the call reads, so changing an
 * input fetches that report.
 */
export function useReportResult(
  queryKey: readonly unknown[],
  callReport: () => Promise<GridDataset>,
  enabled = true,
) {
  const query = useQuery({
    queryKey: ["reports", ...queryKey],
    queryFn: callReport,
    enabled,
    ...FRESH_QUERY,
  });
  const failed = enabled && query.isError;
  return {
    result: enabled && !failed ? (query.data ?? null) : null,
    error: failed ? apiErrorMessage(query.error) : null,
    loading: enabled && query.isFetching,
    run: () => void query.refetch(),
  };
}

// The grid's default tracks were sized for 12px mono. At 15px a lakh-scale
// figure such as 12,34,567.00 needs about 128px, and a timestamp 176px.
const REPORT_COLUMN_SIZING = {
  minWidths: { numeric: 128, timestamp: 176 },
} as const;

export function ReportResultBody<TInput = unknown>({
  error,
  linkContext,
  links,
  renderCell,
  result,
  wholeAmounts = false,
}: {
  error: string | null;
  linkContext?: { input: TInput };
  links?: ReportCellLinkResolvers<TInput>;
  /** Cells drawn by the report, by level and column; a stable reference. */
  renderCell?: ReportCellRenderers;
  result: GridDataset | null;
  /**
   * Amounts in whole units, for a report that sums up the books; a ledger
   * or a check, read against statements, keeps its paise.
   */
  wholeAmounts?: boolean;
}) {
  const shown = useMemo(
    () => (result && wholeAmounts ? roundAmounts(result) : result),
    [result, wholeAmounts],
  );
  return (
    <>
      {error ? <ReportError error={error} /> : null}
      <div className="report-result-body flex-1 overflow-auto bg-sap-surface">
        {shown ? (
          <ReportGridDataset
            dataset={shown}
            links={links}
            linkContext={linkContext}
            renderCell={renderCell}
            columnSizing={REPORT_COLUMN_SIZING}
          />
        ) : null}
      </div>
    </>
  );
}

export function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-row">
      <span className="text-ink-meta">{label}:</span>
      <Input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="tnum h-sap-ctl w-[140px] rounded-control font-mono text-row"
      />
    </label>
  );
}
