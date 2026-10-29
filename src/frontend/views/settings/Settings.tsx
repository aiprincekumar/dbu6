import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@sapporta/frontend/shell";
import { Screen } from "../../components/screen";
import { CATEGORIZATION_RULES_ROUTE } from "../import-instructions/routes";
import {
  codingAgentSettingsQuery,
  openingBalancesQuery,
  statementAccountsQuery,
  transactionMappingsQuery,
} from "../../queries";
import { StatusText } from "./CodingAgent";
import { summarizeCodingAgent, type StatusCell } from "./describeCodingAgent";
import { balancesValue, banksValue, rulesValue } from "./describeSettings";
import {
  BALANCES_SETTINGS_ROUTE,
  BANKS_SETTINGS_ROUTE,
  CODING_AGENT_SETTINGS_ROUTE,
} from "./routes";

/*
 * Settings is an index of the pages that look after how dbu6 is set up: the
 * coding agent, the banks and cards, the opening balances and the
 * categorization rules. Each row shows what its page holds, so the index
 * says whether everything is set up without opening any of them.
 */
export function Settings() {
  usePageTitle("Settings");
  const agent = useQuery(codingAgentSettingsQuery);
  const banks = useQuery(statementAccountsQuery);
  const balances = useQuery(openingBalancesQuery);
  const rules = useQuery(transactionMappingsQuery);

  return (
    <Screen
      width="narrow"
      header={<h1 className="text-title text-foreground">Settings</h1>}
    >
      <nav aria-label="Settings" className="mt-6 border-t border-sap-border">
        <SettingsRow
          label="Coding agent"
          description="Configure the coding agent that dbu6 uses"
          to={CODING_AGENT_SETTINGS_ROUTE}
          value={valueOf(agent, summarizeCodingAgent)}
        />
        <SettingsRow
          label="Banks & cards"
          description="All the accounts for which you import statements"
          to={BANKS_SETTINGS_ROUTE}
          value={valueOf(banks, banksValue)}
        />
        <SettingsRow
          label="Opening balances"
          description="Opening balances of each account"
          to={BALANCES_SETTINGS_ROUTE}
          value={valueOf(balances, balancesValue)}
        />
        <SettingsRow
          label="Categorization rules"
          description="How to categorize your transactions"
          to={CATEGORIZATION_RULES_ROUTE}
          value={valueOf(rules, rulesValue)}
        />
      </nav>
    </Screen>
  );
}

// A row's value once its query is in; nothing while it loads, and a dash
// when it failed, which the page itself explains.
function valueOf<T>(
  query: { data: T | undefined; isError: boolean },
  describe: (data: T) => StatusCell,
): StatusCell | null {
  if (query.data !== undefined) return describe(query.data);
  return query.isError ? { tone: "quiet", text: "—" } : null;
}

function SettingsRow({
  label,
  description,
  to,
  value,
}: {
  label: string;
  description: string;
  to: string;
  value: StatusCell | null;
}) {
  return (
    <Link
      to={to}
      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 border-b border-sap-border px-2 py-3 text-foreground no-underline hover:bg-sap-row-hover"
    >
      <span className="min-w-0">
        <span className="block text-row font-semibold">{label}</span>
        <span className="mt-0.5 block text-meta text-ink-soft">
          {description}
        </span>
      </span>
      <span className="text-right text-row tabular-nums">
        {value && <StatusText cell={value} />}
      </span>
      <ArrowRight
        aria-hidden="true"
        className="size-4 text-ink-meta"
        strokeWidth={1.8}
      />
    </Link>
  );
}
