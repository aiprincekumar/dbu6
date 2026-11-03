import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ANY_CODING_AGENT,
  codingAgentInUse,
  noCodingAgentMessage,
  type CodingAgentSettings,
  type NoCodingAgent,
  type StatementInboxBatch,
} from "../../shared/index";
import { apiErrorMessage, statementInboxApi } from "../api";
import { AgentButton } from "../components/agent-prompt";
import { CodingAgentSetupDialog } from "../components/coding-agent-setup";
import { codingAgentSettingsQuery, FRESH_QUERY } from "../queries";
import { Link, useLocation } from "react-router-dom";
import { Button } from "../components/ui/button";
import { DROP_ID } from "../update/routes";
import type { UpdateLink } from "../update/state";
import { formatFileSize } from "../format";
import { InfoButton } from "../views/import-statements/cards";
import { Dropzone } from "../views/import-statements/files";
import { StatusText } from "../views/settings/CodingAgent";
import {
  checkingModels,
  summarizeCodingAgent,
} from "../views/settings/describeCodingAgent";
import { CODING_AGENT_SETTINGS_ROUTE } from "../views/settings/routes";
import { doMyBooksPrompt, runLabel, saveToInbox } from "./inbox";

export const STATEMENT_INBOX_KEY = ["statement-inbox"] as const;

/**
 * Drop + "Do my books", on Update and the first run's card: every statement
 * the user has goes into the inbox in one drop, and one button hands the
 * coding agent the run over all of them. The drop is the screen's focus.
 * Dropping only saves the files; the agent reads them, and the user adds
 * each account on Review once the run is done. The files uploaded and not
 * yet imported are listed under the drop, so a second drop joins them in
 * the same run; a file dropped again isn't added twice. "Choose files" is
 * the primary action until a file is uploaded, then the run's button is.
 * A new bank or card's statements go in the same drop: the run sets it up.
 * `byHand`, doing it by hand instead, is a quiet link beside the run's
 * button; `body` is what to know before dropping, such as what is already
 * set up. The drop is `#drop`: arriving there, or following a link to it
 * from the same page, scrolls to it and focuses "Choose files". On the first
 * run (`firstRun`) the coding agent that will read the statements is named
 * above the drop, and with none to use, setting one up comes first and the
 * drop waits.
 */
export function DoMyBooks({
  body,
  byHand,
  afterList = false,
  choosePrimary = true,
  firstRun = false,
}: {
  body?: string;
  byHand?: UpdateLink;
  /**
   * Whether the list of statements to download is just above, so the drop
   * says "Drop them here".
   */
  afterList?: boolean;
  /**
   * Whether "Choose files" may be the primary button while nothing is
   * uploaded: not under the drafts card, whose button is the screen's one.
   */
  choosePrimary?: boolean;
  /** Nothing imported yet: the agent row above the drop, and the ⓘ. */
  firstRun?: boolean;
}) {
  const queryClient = useQueryClient();
  const agent = useQuery({
    ...codingAgentSettingsQuery,
    enabled: firstRun,
    refetchInterval: (query) =>
      query.state.data !== undefined && checkingModels(query.state.data)
        ? CHECKING_POLL_MS
        : false,
  });
  const agentState = firstRun && agent.data ? agentReadiness(agent.data) : null;
  const inbox = useQuery({
    queryKey: STATEMENT_INBOX_KEY,
    queryFn: () => statementInboxApi.listStatementInbox(),
    ...FRESH_QUERY,
  });
  const save = useMutation({
    mutationFn: saveToInbox,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: STATEMENT_INBOX_KEY }),
  });
  const remove = useMutation({
    mutationFn: (savedPath: string) =>
      statementInboxApi.removeFromStatementInbox({
        body: { saved_path: savedPath },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: STATEMENT_INBOX_KEY }),
  });
  const clear = useMutation({
    mutationFn: () => statementInboxApi.clearStatementInbox({ body: {} }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: STATEMENT_INBOX_KEY }),
  });
  const location = useLocation();
  const drop = useRef<HTMLDivElement>(null);
  // Each arrival at #drop is a new location, so a second click on the same
  // link scrolls and focuses again.
  useEffect(() => {
    if (location.hash !== `#${DROP_ID}`) return;
    const zone = drop.current;
    if (!zone) return;
    zone.scrollIntoView({ block: "center" });
    // The drop's one button is "Choose files".
    zone.querySelector("button")?.focus({ preventScroll: true });
  }, [location.key, location.hash]);
  const batches = inbox.data?.batches ?? [];
  const files = batches.reduce((sum, batch) => sum + batch.files.length, 0);
  const skipped = save.data?.already_uploaded ?? [];

  return (
    <section>
      {firstRun && <AgentRow settings={agent.data} />}
      {agentState?.ready === false ? (
        <AgentSetup missing={agentState.missing} />
      ) : (
        body && (
          <p className="mb-3 text-body text-ink-soft">
            {body}
            {firstRun && (
              <span className="ml-1 inline-flex align-middle">
                <HowItWorks />
              </span>
            )}
          </p>
        )
      )}
      <div id={DROP_ID} ref={drop}>
        <Dropzone
          disabled={save.isPending || agentState?.missing != null}
          title={
            agentState?.missing
              ? "Set up a coding agent first"
              : afterList
                ? "Drop them here"
                : undefined
          }
          hint={
            firstRun
              ? "PDF, Excel, CSV or text, from any bank or card."
              : "PDF, Excel, CSV or text, from any bank or card, new ones too."
          }
          prominent
          arrow={!firstRun}
          primary={choosePrimary && files === 0 && agentState?.ready !== false}
          onFiles={(files) => {
            if (files.length > 0) save.mutate(files);
          }}
        />
      </div>
      {skipped.length > 0 && (
        <p role="status" className="mt-3 text-row text-ink-meta">
          Already uploaded: {skipped.join(", ")}
        </p>
      )}
      {save.isError && (
        <p role="alert" className="mt-3 text-row text-destructive">
          {save.error.message}
        </p>
      )}
      {remove.isError && (
        <p role="alert" className="mt-3 text-row text-destructive">
          {apiErrorMessage(remove.error)}
        </p>
      )}
      {clear.isError && (
        <p role="alert" className="mt-3 text-row text-destructive">
          {apiErrorMessage(clear.error)}
        </p>
      )}
      {inbox.isError && (
        <p role="alert" className="mt-3 text-row text-destructive">
          {apiErrorMessage(inbox.error)}
        </p>
      )}
      {files > 0 && (
        <InboxFiles
          batches={batches}
          removing={remove.isPending || clear.isPending}
          onRemove={(savedPath) => remove.mutate(savedPath)}
          onClear={() => clear.mutate()}
        />
      )}
      {(files > 0 || byHand) && (
        <div className="mt-5 flex flex-wrap items-start gap-x-5 gap-y-2">
          {files > 0 && (
            <AgentButton
              label={runLabel(files)}
              prompt={doMyBooksPrompt(batches)}
              afterwards="Answer its questions in the terminal, then add the entries on Review."
            />
          )}
          {byHand && (
            <Link
              to={byHand.to}
              className="flex min-h-[calc(var(--height-sap-ctl)+2px)] items-center text-row text-ink-meta underline decoration-sap-border-strong underline-offset-4 hover:text-foreground hover:decoration-current"
            >
              {byHand.label}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

const CHECKING_POLL_MS = 2000;

/**
 * Whether the run has a coding agent: `missing` when there is none to use,
 * so the drop waits; `ready` false too when the one in use doesn't work yet.
 * Null while dbu6 is still looking.
 */
function agentReadiness(
  settings: CodingAgentSettings,
): { ready: boolean; missing: NoCodingAgent | null } | null {
  if (settings.picking) return null;
  const inUse = codingAgentInUse(settings.agents, settings.chosen);
  if (inUse.agent === null) return { ready: false, missing: inUse.why };
  return {
    ready: summarizeCodingAgent(settings).tone !== "attention",
    missing: null,
  };
}

/**
 * The coding agent that will read the statements, as a labelled value:
 * "✓ Claude Code", or what is wrong, as Settings' index says it.
 */
function AgentRow({ settings }: { settings: CodingAgentSettings | undefined }) {
  return (
    <dl className="mb-3 flex items-baseline gap-4">
      <dt className="w-32 shrink-0 text-label uppercase text-ink-meta">
        Coding agent
      </dt>
      <dd className="text-row font-semibold">
        {settings && <StatusText cell={summarizeCodingAgent(settings)} />}
      </dd>
    </dl>
  );
}

/**
 * With no coding agent to use, or one that doesn't work yet: why, and the
 * one step, filled blue. None to use opens the guide to installing one; one
 * that doesn't work is fixed on Settings › Coding agent.
 */
function AgentSetup({ missing }: { missing: NoCodingAgent | null }) {
  const [open, setOpen] = useState(false);
  if (!missing) {
    return (
      <Button
        variant="setup"
        className="mb-5"
        render={<Link to={CODING_AGENT_SETTINGS_ROUTE} />}
        nativeButton={false}
      >
        Fix the coding agent in Settings
      </Button>
    );
  }
  return (
    <div className="mb-5">
      <p className="text-body text-ink-soft">
        Your coding agent reads your statements and drafts the entries.{" "}
        {missing.kind === "none_installed"
          ? `Install ${ANY_CODING_AGENT} on the computer running dbu6.`
          : noCodingAgentMessage(missing)}
      </p>
      <Button variant="setup" className="mt-3" onClick={() => setOpen(true)}>
        Set up a coding agent
      </Button>
      <CodingAgentSetupDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** What happens to the statements, behind the first run's ⓘ. */
function HowItWorks() {
  return (
    <InfoButton label="How your coding agent adds your statements">
      <p>
        Your coding agent imports each file and categorizes its transactions in
        a terminal. It asks you there about anything it can't work out.
      </p>
      <p>
        Nothing from your statements goes into your books until you add it on
        Review.
      </p>
      <p>
        Your statements stay on this computer. Only your coding agent's AI
        provider reads them.
      </p>
    </InfoButton>
  );
}

/**
 * The files uploaded, a row each: the name, its size in its own column, and
 * Remove, which takes a file out without importing it. Clear all, above the
 * Remove column, takes every file out at once.
 */
function InboxFiles({
  batches,
  removing,
  onRemove,
  onClear,
}: {
  batches: readonly StatementInboxBatch[];
  removing: boolean;
  onRemove: (savedPath: string) => void;
  onClear: () => void;
}) {
  const files = batches.flatMap((batch) => batch.files);
  return (
    <div className="mt-5">
      <div className="flex items-end gap-3 border-b border-line-inner px-2 pb-2 text-meta text-ink-meta">
        <span className="min-w-0 flex-1">Files to add</span>
        <span className="w-20 shrink-0 text-right">Size</span>
        <span className="w-20 shrink-0 text-right">
          {files.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={removing}
              onClick={onClear}
            >
              Clear all
            </Button>
          )}
        </span>
      </div>
      <ul className="divide-y divide-line-inner border-b border-line-inner">
        {files.map((file) => (
          <li
            key={file.saved_path}
            className="flex gap-3 px-2 py-2 text-row text-foreground"
          >
            <span className="min-w-0 flex-1 truncate">{file.file_name}</span>
            <span className="tnum w-20 shrink-0 text-right text-ink-meta">
              {formatFileSize(file.bytes)}
            </span>
            <span className="w-20 shrink-0 text-right">
              <Button
                variant="ghost"
                size="sm"
                disabled={removing}
                onClick={() => onRemove(file.saved_path)}
              >
                Remove
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
