import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@sapporta/frontend/shell";
import { NO_CODING_AGENT_MESSAGE, type ChartAccount } from "../../shared/index";
import { apiErrorMessage, setupApi } from "../api";
import { Disclosure } from "../components/disclosure";
import { Button } from "../components/ui/button";
import { NoCodingAgentNotice } from "../components/coding-agent-setup";
import {
  chartOfAccountsQuery,
  chartSuggesterQuery,
  refreshSetup,
} from "../queries";
import { plural } from "../format";
import {
  FocusCard,
  FocusLoading,
  type FocusFrame,
} from "../components/focus-card";
import { addHref } from "../add-account/state";
import { setupFrame } from "../add-account/words";
import {
  initialTicks,
  lockedAccounts,
  tickedAccounts,
  toggleTick,
  type Ticks,
} from "./chart-checklist";
import { ChartTree } from "./ChartTree";
import { DescribeMoney } from "./DescribeMoney";

/*
 * Card 1 of the first run (PLAN.md "The cards"), at `/setup`: books with no
 * accounts start from the standard chart, already on screen and ticked, or
 * first say how they earn and spend for the coding agent to tailor it. The
 * question comes first, as optional; using the chart on screen is the card's
 * one button. Books with a chart go to Overview, which resumes the first run
 * from the books; the Accounts page changes a chart.
 */

// The first run's first step, before any bank or card is in.
const FRAME: FocusFrame = setupFrame("chart", 0);

export function ChartCard() {
  usePageTitle("Set up your books");
  const chart = useQuery(chartOfAccountsQuery);
  if (!chart.data) {
    return (
      <FocusLoading
        {...FRAME}
        error={chart.isError ? chart.error : null}
        retry={() => void chart.refetch()}
      />
    );
  }
  if (chart.data.state === "existing") return <Navigate to="/" replace />;
  return (
    <Checklist
      starter={chart.data.starter.accounts}
      unticked={chart.data.unticked}
    />
  );
}

/** A chart on offer and what is ticked in it. */
interface Proposal {
  accounts: ChartAccount[];
  ticks: Ticks;
}

/** What the agent proposed, and what the server fixed in it. */
interface Described extends Proposal {
  notes: string[];
}

function Checklist({
  starter,
  unticked,
}: {
  starter: ChartAccount[];
  unticked: string[];
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const suggester = useQuery(chartSuggesterQuery);
  const agent = suggester.data?.ready ? suggester.data.name : null;
  // Each chart keeps its own ticks, so switching between them loses neither.
  const [standard, setStandard] = useState<Proposal>(() => ({
    accounts: starter,
    ticks: initialTicks(starter, unticked),
  }));
  const [described, setDescribed] = useState<Described | null>(null);
  const [showStandard, setShowStandard] = useState(false);
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState<string[] | null>(null);

  const shown = described && !showStandard ? described : standard;
  const { accounts, ticks } = shown;
  // A refusal is about the chart that was sent: another chart, or other
  // ticks, leave it behind.
  const setTicks = (next: Ticks) => {
    setProblem(null);
    if (shown === described) setDescribed({ ...described, ticks: next });
    else setStandard({ ...standard, ticks: next });
  };
  const show = (standardOne: boolean) => {
    setProblem(null);
    setShowStandard(standardOne);
  };

  async function create() {
    setCreating(true);
    setProblem(null);
    try {
      await setupApi.createChartOfAccounts({
        body: { accounts: tickedAccounts(accounts, ticks) },
      });
    } catch (error) {
      setProblem(refusalProblems(error));
      setCreating(false);
      return;
    }
    // On to card 2. `/setup` has nothing more to show these books, so Back
    // passes it.
    navigate(addHref({ setup: true }), { replace: true });
    void refreshSetup(client);
  }

  return (
    <FocusCard
      {...FRAME}
      width="wide"
      title="Chart of accounts"
      actions={
        <Button onClick={() => void create()} disabled={creating}>
          {creating
            ? "Creating…"
            : `Continue with ${plural(ticks.size, "account")} →`}
        </Button>
      }
    >
      <div className="mb-6">
        {agent !== null && (
          <DescribeMoney
            agent={agent}
            tailored={described !== null}
            current={() => tickedAccounts(accounts, ticks)}
            onProposal={(suggestion) => {
              setProblem(null);
              setShowStandard(false);
              setDescribed({
                accounts: suggestion.proposal.accounts,
                ticks: initialTicks(suggestion.proposal.accounts),
                notes: suggestion.notes,
              });
            }}
          />
        )}
        {suggester.data && !suggester.data.ready && (
          <NoAgent reason={suggester.data.reason} />
        )}
        {suggester.isError && (
          <p className="text-meta text-ink-meta">
            Couldn't check for a coding agent:{" "}
            {apiErrorMessage(suggester.error)}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-heading text-foreground">Accounts to create</h2>
        {shown === described && (
          <p className="text-label uppercase text-ink-meta">
            Tailored by {agent ?? "your agent"}
          </p>
        )}
        {described && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => show(shown === described)}
          >
            {shown === described
              ? "Show the default accounts"
              : "Show the tailored accounts"}
          </Button>
        )}
      </div>
      <p className="mb-5 mt-1 text-body text-ink-soft">
        Uncheck what you don't need. This is just an initial setup, you can
        easily change it as you use the system.
      </p>
      {shown === described && described.notes.length > 0 && (
        <div className="mb-4">
          <Disclosure summary={plural(described.notes.length, "adjustment")}>
            <ul className="list-disc pl-5 text-meta text-ink-soft">
              {described.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Disclosure>
        </div>
      )}

      <ChartTree
        accounts={accounts}
        checklist={{
          ticks,
          locked: lockedAccounts(accounts),
          onToggle: (name) => setTicks(toggleTick(accounts, ticks, name)),
        }}
      />

      {problem && (
        <div
          role="alert"
          className="rounded-card border border-destructive/40 px-4 py-3 text-body text-destructive"
        >
          {problem.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
    </FocusCard>
  );
}

// No agent ready: none set up at all gets the setup notice; one set up that
// isn't working says why, with the way to Settings.
function NoAgent({ reason }: { reason: string }) {
  if (reason === NO_CODING_AGENT_MESSAGE) {
    return (
      <NoCodingAgentNotice without="Until one is set up, you can use the default accounts below." />
    );
  }
  return (
    <p className="rounded-card border border-attention-border bg-attention-bg px-4 py-3 text-body text-attention-ink">
      {withoutFullStop(reason)}. You can check the agent in{" "}
      <Link to="/settings" className="underline underline-offset-4">
        Settings
      </Link>
      . Until it works, you can use the default accounts below.
    </p>
  );
}

// "No agent is ready." and "No agent is ready" both end in one full stop.
function withoutFullStop(sentence: string): string {
  return sentence.replace(/\.\s*$/, "");
}

// A refusal's problems, one per line, or what went wrong.
function refusalProblems(error: unknown): string[] {
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: { problems?: unknown } }).body;
    if (Array.isArray(body?.problems) && body.problems.length > 0) {
      return body.problems.map(String);
    }
  }
  return [apiErrorMessage(error)];
}
