import { useId, useRef, useState, type ReactNode } from "react";
import { Input } from "@sapporta/ui";
import { cn } from "@sapporta/ui/cn";
import { BookOpen, CirclePlus } from "lucide-react";
import type {
  AccountKind,
  AddAccountCandidate,
  AddAccountFields,
  LlmStatus,
  StatementAccounts,
} from "../../shared/index";
import type { Fact } from "../components/fact-table";
import { Button } from "../components/ui/button";
import { formatBalance, formatDate } from "../format";
import {
  AccountCombobox,
  InstitutionCombobox,
} from "../components/account-pickers";
import {
  confirmDraft,
  confirmLayout,
  readConfirm,
  unlistedOf,
  withInstitution,
  withName,
  type ConfirmDraft,
} from "./confirm-form";
import { Field, FocusCard, type FocusFrame } from "../components/focus-card";
import { Importing } from "./Importing";
import { newProgressId, type Finale } from "../import-progress/LiveImport";
import type { Opening } from "./state";
import { bankLine, categorizerLine, importHeading, periodSpan } from "./words";

/**
 * Card 4: what dbu6 read, in a box, flowing into the account it goes into,
 * a new one unless the person picks one from the chart. The account is
 * written here and nowhere earlier, with its files imported and
 * categorized; while that runs the card gives way to Importing, and a
 * refusal brings it back, as it was, with one line under the button.
 */
export function Confirm({
  frame,
  account,
  kind,
  opening,
  categorizer,
  data,
  refusal,
  onAdd,
}: {
  frame: FocusFrame;
  account: AddAccountCandidate;
  kind: AccountKind;
  opening: Opening;
  categorizer: LlmStatus;
  data: StatementAccounts;
  /** The server's refusal of the last add, in its words. */
  refusal: string | null;
  /**
   * Adds the account; once it has, and before handing off, it waits on
   * `finale`, the importing card's last word.
   */
  onAdd: (
    fields: AddAccountFields,
    progressId: string,
    finale: Finale,
  ) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => confirmDraft(account, kind, data));
  const [problem, setProblem] = useState<string | null>(null);
  // The running add's progress id; null when none runs.
  const [adding, setAdding] = useState<string | null>(null);
  // An account from the chart instead of a new one.
  const [usingExisting, setUsingExisting] = useState(false);
  const finale = useRef<Finale | null>(null);
  const fixed = account.account;

  async function add() {
    if (usingExisting && draft.existingId === null) {
      setProblem("Pick an account.");
      return;
    }
    const read = readConfirm(account, kind, opening, draft, data);
    if (!read.ok) {
      setProblem(read.problem);
      return;
    }
    setProblem(null);
    const progressId = newProgressId();
    setAdding(progressId);
    try {
      await onAdd(read.fields, progressId, () =>
        finale.current === null ? Promise.resolve() : finale.current(),
      );
    } finally {
      setAdding(null);
    }
  }

  const update = (next: ConfirmDraft) => {
    setDraft(next);
    setProblem(null);
  };
  const said = problem ?? refusal;
  const layout = confirmLayout(account, kind, data);
  // A new bank follows the field, so a corrected one retitles the card.
  const title = fixed
    ? fixed.name
    : bankLine(
        layout.bank ? { ...account, institution: draft.institution } : account,
        kind,
      );
  const creates = !fixed && draft.existingId === null && !usingExisting;
  const span = periodSpan(account);

  if (adding !== null) {
    return (
      <Importing
        frame={frame}
        progressId={adding}
        name={fixed?.name ?? accountName(draft, data)}
        facts={[
          ...destinationFacts(account, kind, draft, data),
          ...statementFacts(account),
        ]}
        categorizer={categorizer}
        finale={finale}
      />
    );
  }

  return (
    <FocusCard
      {...frame}
      width="medium"
      title={title}
      lead={fixed ? bankLine(account, kind) : undefined}
      actions={
        <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-col items-start gap-1 text-body">
            <CategorizerNote categorizer={categorizer} />
            {!fixed && layout.canUseExisting && (
              <Button
                variant="ghost"
                className="h-auto px-0 text-body font-normal"
                onClick={() => {
                  setUsingExisting(!usingExisting);
                  update({ ...draft, existingId: null });
                }}
              >
                {usingExisting
                  ? "Create a new account instead"
                  : "Use an existing account"}
              </Button>
            )}
          </div>
          <div className="ml-auto flex flex-col items-end gap-2">
            <Button size="lg" className="text-body" onClick={() => void add()}>
              {creates ? "Create and import" : "Import"}
            </Button>
            {said && (
              <p
                role="alert"
                className="max-w-[440px] text-right text-meta text-destructive [overflow-wrap:anywhere]"
              >
                {said}
              </p>
            )}
          </div>
        </div>
      }
    >
      {layout.bank && (
        <BankField
          kind={kind}
          draft={draft}
          data={data}
          update={update}
          open={
            draft.institution.trim() === "" || problem === bankProblem(kind)
          }
        />
      )}
      <StatementFacts
        facts={[
          ...(span === null ? [] : [{ label: "Statements", value: span }]),
          balanceFact(opening, kind),
        ]}
      />
      {fixed ? (
        <IntoBox heading={importHeading(account.transactions, "into")}>
          <p className="text-[17px] font-semibold text-foreground">
            {fixed.name}
          </p>
        </IntoBox>
      ) : usingExisting ? (
        <ExistingAccount
          heading={importHeading(account.transactions, "existing")}
          kind={kind}
          draft={draft}
          data={data}
          update={update}
        />
      ) : (
        <NewAccount
          heading={importHeading(account.transactions, "new")}
          kind={kind}
          data={data}
          draft={draft}
          update={update}
        />
      )}
    </FocusCard>
  );
}

function bankProblem(kind: AccountKind): string {
  return kind === "card" ? "Name the card issuer." : "Name the bank.";
}

/**
 * The bank dbu6 hasn't met, as the title already names it: behind "Not
 * this bank?" for a correction, and open when the statements print none.
 */
function BankField({
  kind,
  draft,
  data,
  update,
  open,
}: {
  kind: AccountKind;
  draft: ConfirmDraft;
  data: StatementAccounts;
  update: (draft: ConfirmDraft) => void;
  open: boolean;
}) {
  const id = useId();
  const [shown, setShown] = useState(open);
  const label = kind === "card" ? "Card issuer" : "Bank";
  if (!shown && !open) {
    return (
      <div className="-mt-2 mb-6">
        <Button
          variant="ghost"
          className="h-auto px-0 text-body font-normal"
          onClick={() => setShown(true)}
        >
          {kind === "card" ? "Not this card issuer?" : "Not this bank?"}
        </Button>
      </div>
    );
  }
  return (
    <div className="mb-7">
      <Field id={id} label={label}>
        <InstitutionCombobox
          id={id}
          institutions={data.institutions.map((one) => one.name)}
          value={draft.institution}
          onChange={(name) => update(withInstitution(draft, name, data))}
          empty="Type the bank's name."
        />
      </Field>
    </div>
  );
}

/**
 * What dbu6 read from the statements, in columns under the title that
 * names them; the count goes in the heading of where they go.
 */
function StatementFacts({ facts }: { facts: readonly Fact[] }) {
  return (
    <dl className="mb-7 flex flex-wrap gap-x-16 gap-y-3">
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0">
          <dt className="text-body text-ink-meta">{fact.label}</dt>
          <dd
            className={cn(
              "mt-0.5 text-[17px] [overflow-wrap:anywhere]",
              fact.tone === "ok" ? "text-primary" : "text-foreground",
              fact.face !== "words" &&
                "tnum whitespace-nowrap font-mono font-medium",
            )}
          >
            {fact.tone === "ok" && <span aria-hidden="true">✓ </span>}
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Where the import goes; tinted when the add creates it. */
function IntoBox({
  heading,
  creates = false,
  children,
}: {
  heading: string;
  creates?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-control border px-5 pb-4 pt-5",
        creates ? "border-money-in-border bg-money-in-bg" : "border-sap-border",
      )}
    >
      <BoxHeading
        icon={creates ? <CirclePlus /> : <BookOpen />}
        tone={creates ? "new" : undefined}
      >
        {heading}
      </BoxHeading>
      {children}
    </section>
  );
}

function BoxHeading({
  icon,
  tone,
  children,
}: {
  icon: ReactNode;
  tone?: "new";
  children: ReactNode;
}) {
  return (
    <h2
      className={cn(
        "mb-4 flex items-center gap-2 text-body font-semibold [&_svg]:size-[18px]",
        tone === "new" ? "text-money-in-ink" : "text-ink-soft",
      )}
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </h2>
  );
}

/** The new account as a path: the account it sits under, then its name. */
function NewAccount({
  heading,
  kind,
  data,
  draft,
  update,
}: {
  heading: string;
  kind: AccountKind;
  data: StatementAccounts;
  draft: ConfirmDraft;
  update: (draft: ConfirmDraft) => void;
}) {
  const ids = { parent: useId(), name: useId() };
  return (
    <IntoBox heading={heading} creates>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-2">
        <div className="space-y-1.5 sm:w-[42%]">
          <SegmentLabel id={ids.parent}>Under</SegmentLabel>
          <AccountCombobox
            id={ids.parent}
            choices={data.parents[kind]}
            value={draft.parentId}
            onChange={(parentId) => update({ ...draft, parentId })}
            placeholder="Pick an account"
            className="w-full [&_[role=group]]:h-10 [&_input]:text-body [&_[role=group]>span]:text-body"
          />
        </div>
        <span
          aria-hidden="true"
          className="hidden pt-[38px] text-body text-ink-meta sm:block"
        >
          /
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <SegmentLabel id={ids.name}>Account name</SegmentLabel>
          <Input
            id={ids.name}
            value={draft.name}
            onChange={(event) => update(withName(draft, event.target.value))}
            className="h-10 rounded-control bg-card text-body"
          />
        </div>
      </div>
    </IntoBox>
  );
}

/** An account from the chart that no bank or card uses yet. */
function ExistingAccount({
  heading,
  kind,
  draft,
  data,
  update,
}: {
  heading: string;
  kind: AccountKind;
  draft: ConfirmDraft;
  data: StatementAccounts;
  update: (draft: ConfirmDraft) => void;
}) {
  const id = useId();
  return (
    <IntoBox heading={heading}>
      <div className="space-y-1.5">
        <SegmentLabel id={id}>Account</SegmentLabel>
        {/* A combobox of its own: no table filter says "no bank or card
            uses it, and nothing sits under it" (`unlisted`). */}
        <AccountCombobox
          id={id}
          choices={unlistedOf(data, kind)}
          value={draft.existingId}
          onChange={(existingId) => update({ ...draft, existingId })}
          placeholder="Pick an account"
        />
      </div>
    </IntoBox>
  );
}

function SegmentLabel({ id, children }: { id: string; children: string }) {
  return (
    <label htmlFor={id} className="block text-body text-ink-soft">
      {children}
    </label>
  );
}

/** Under the boxes: who categorizes the import, or why nobody can. */
function CategorizerNote({ categorizer }: { categorizer: LlmStatus }) {
  return (
    <span
      className={categorizer.ready ? "text-ink-meta" : "text-attention-ink"}
    >
      {categorizerLine(categorizer)}
    </span>
  );
}

/** What the statements hold: their months and their rows. */
function statementFacts(account: AddAccountCandidate): Fact[] {
  const span = periodSpan(account);
  return [
    ...(span === null ? [] : [{ label: "Statements", value: span }]),
    { label: "Transactions", value: String(account.transactions) },
  ];
}

/** Where the balances start, or that the statements' own add up. */
function balanceFact(opening: Opening, kind: AccountKind): Fact {
  switch (opening.from) {
    case "typed":
      return {
        label: "Opening balance",
        value: `${formatBalance(opening.amount, kind)} on ${formatDate(opening.date)}`,
      };
    case "books":
      return {
        label: "Opening balance",
        value: "From your books",
        face: "words",
      };
    default:
      return { label: "Balances", value: "Add up", face: "words", tone: "ok" };
  }
}

/** The account the add writes to, as the importing card recalls it. */
function destinationFacts(
  account: AddAccountCandidate,
  kind: AccountKind,
  draft: ConfirmDraft,
  data: StatementAccounts,
): Fact[] {
  const bank = account.institution_listed
    ? account.institution
    : draft.institution.trim();
  const facts: Fact[] =
    bank === ""
      ? []
      : [
          {
            label: kind === "card" ? "Card issuer" : "Bank",
            value: bank,
            face: "words",
          },
        ];
  if (account.account !== null || draft.existingId !== null) return facts;
  const parent = data.parents[kind].find((one) => one.id === draft.parentId);
  return parent === undefined
    ? facts
    : [
        ...facts,
        { label: "Parent account", value: parent.name, face: "words" },
      ];
}

/** The name the new account gets, or the existing one it goes into. */
function accountName(draft: ConfirmDraft, data: StatementAccounts): string {
  if (draft.existingId === null) return draft.name.trim();
  const existing = data.unlisted.find((one) => one.id === draft.existingId);
  return existing?.name ?? draft.name.trim();
}
