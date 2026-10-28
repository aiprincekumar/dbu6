import { useId, useState } from "react";
import type { ChartAccount, ChartSuggestion } from "../../shared/index";
import { apiErrorMessage, setupApi } from "../api";
import { Button } from "../components/ui/button";

/*
 * The chart card's question: how the user earns and spends, in their own
 * words, which go to the coding agent's LLM to revise the chart on screen to
 * fit them. One call, up to three minutes; nothing is created until the user
 * ticks through the answer and uses it. Shown only when an agent is ready
 * (ChartCard checks).
 */
export function DescribeMoney({
  agent,
  current,
  tailored,
  onProposal,
}: {
  /** The ready coding agent's name. */
  agent: string;
  /** The chart on screen, which the LLM revises rather than starting over. */
  current: () => ChartAccount[];
  /** Whether a proposal is in already, so asking again is "again". */
  tailored: boolean;
  onProposal: (suggestion: ChartSuggestion) => void;
}) {
  const questionId = useId();
  const [description, setDescription] = useState("");
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function propose() {
    setAsking(true);
    setProblem(null);
    try {
      onProposal(
        await setupApi.suggestChartOfAccounts({
          body: { description, current: current() },
        }),
      );
    } catch (error) {
      setProblem(apiErrorMessage(error));
    } finally {
      setAsking(false);
    }
  }

  return (
    <section aria-labelledby={questionId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={questionId} className="text-row font-semibold text-foreground">
          Personalize with {agent}
        </h2>
        <span className="text-label uppercase text-ink-meta">Optional</span>
      </div>
      <p className="mt-1 text-row text-ink-soft">
        If you want, you can personalize the chart of accounts listed below
        based on your financial life. To do that, briefly describe your work,
        home and recurring expenses.
      </p>
      <textarea
        aria-labelledby={questionId}
        rows={2}
        maxLength={4000}
        value={description}
        disabled={asking}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="e.g. Freelance designer with 3 clients. Renting a flat, paying a car loan EMI, a cook's salary, and mutual fund SIPs."
        className="mt-2.5 block w-full resize-y rounded-control border border-sap-border-strong bg-card px-3 py-2 text-body text-foreground outline-none placeholder:text-ink-meta focus-visible:ring-[3px] focus-visible:ring-ring/40"
      />
      <div className="mt-2.5 flex flex-col items-start gap-1">
        <Button
          disabled={asking || description.trim() === ""}
          onClick={() => void propose()}
        >
          {asking
            ? `${agent} is working…`
            : tailored
              ? "Personalize again"
              : "Personalize my Chart of Accounts"}
        </Button>
        <p className="text-meta text-ink-meta">Takes a minute or two.</p>
      </div>
      {problem && (
        <p
          role="alert"
          className="mt-2 text-body text-destructive [overflow-wrap:anywhere]"
        >
          {agent} couldn't tailor your accounts: {problem}
        </p>
      )}
    </section>
  );
}
