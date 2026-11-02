import { AgentButton } from "../components/agent-prompt";
import {
  type GridDataset,
  ReportResultBody,
  ReportRunButton,
  ReportScreenFrame,
  ReportToolbar,
  useMemo,
  useReportResult,
} from "../report-kit";
import { reportsApi } from "./client";
import {
  postedBalanceCheckPrompt,
  postedDifferences,
} from "./postedBalanceCheckPrompt";

/**
 * Every posted balance check the books miss. While any does, its header
 * hands them all to the coding agent, to find why they stopped matching.
 */
export function BalanceAssertionsReport() {
  const report = useReportResult(["balance-assertions"], callReport);
  const differences = useMemo(
    () => postedDifferences(report.result),
    [report.result],
  );

  return (
    <ReportScreenFrame
      title="Reconciliation Differences"
      actions={
        differences.length > 0 && (
          <AgentButton
            label="Find why this stopped matching"
            prompt={postedBalanceCheckPrompt(differences)}
          />
        )
      }
    >
      <ReportToolbar
        actions={
          <ReportRunButton loading={report.loading} onClick={report.run} />
        }
      />
      <ReportResultBody error={report.error} result={report.result} />
    </ReportScreenFrame>
  );
}

function callReport(): Promise<GridDataset> {
  return reportsApi.balanceAssertions({ query: {} });
}
