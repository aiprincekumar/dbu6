import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sapporta/ui/dialog";
import { CODING_AGENTS, type CodingAgentSetupGuide } from "../../shared/index";
import { apiErrorMessage, codingAgentApi } from "../api";
import { copyText } from "../clipboard";
import {
  codingAgentSettingsQuery,
  codingAgentSetupGuideQuery,
  refreshCodingAgent,
} from "../queries";
import { Button } from "./ui/button";

/*
 * dbu6 is run by a coding agent, so having none is said up front, not as a
 * footnote: a notice saying so and what dbu6 uses one for, and a dialog with
 * Nuabase's own guide to installing one. Nuabase runs the agent's CLI, so it
 * knows which agents it can run and that a desktop app won't do.
 */

/**
 * The notice on a screen whose AI half needs an agent: Nuabase's line that
 * none is set up, what dbu6 does with one, and the way to the guide.
 * `without` says what the screen still offers without one.
 */
export function NoCodingAgentNotice({ without }: { without: string }) {
  const guide = useQuery(codingAgentSetupGuideQuery);
  const [open, setOpen] = useState(false);
  return (
    <div
      role="status"
      className="flex gap-3 rounded-card border border-attention-border bg-attention-bg px-4 py-3 text-attention-ink"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold">
          {guide.data?.missing ?? "No coding agent is set up."}
        </p>
        <p className="mt-1 text-body">
          dbu6 uses a coding agent, such as Claude Code or Codex, to tailor your
          accounts, categorize your transactions and read new statement formats.{" "}
          {without}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setOpen(true)}
        >
          How to set one up
        </Button>
      </div>
      <CodingAgentSetupDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** Nuabase's guide to installing a coding agent, and Check again. */
export function CodingAgentSetupDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const guide = useQuery({ ...codingAgentSetupGuideQuery, enabled: open });
  const checkAgain = useMutation({
    mutationFn: () => codingAgentApi.checkCodingAgentModels({ body: {} }),
    onSuccess: (body) => {
      client.setQueryData(codingAgentSettingsQuery.queryKey, body);
      void refreshCodingAgent(client);
    },
  });
  // The agent the last check settled on; null until one works.
  const found = checkAgain.isPending ? null : (checkAgain.data?.chosen ?? null);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set up a coding agent</DialogTitle>
          <DialogDescription>
            Install one of these agents on the computer that runs dbu6. The
            agent uses your own account with its AI provider, and dbu6 sends
            your data only to that provider.
          </DialogDescription>
        </DialogHeader>
        {guide.isError && (
          <p role="alert" className="text-body text-destructive">
            Couldn't load the guide: {apiErrorMessage(guide.error)}
          </p>
        )}
        {guide.data && <Guide guide={guide.data} />}
        {checkAgain.isError && (
          <p role="alert" className="text-body text-destructive">
            {apiErrorMessage(checkAgain.error)}
          </p>
        )}
        {checkAgain.data && !checkAgain.isPending && found === null && (
          <p role="status" className="text-body text-ink-soft">
            dbu6 still found no working coding agent. Check that the agent's
            command runs in a terminal and that you signed in to it.
          </p>
        )}
        <DialogFooter className="items-center">
          {found !== null ? (
            <>
              <p role="status" className="mr-auto text-body text-ink-soft">
                dbu6 will use {CODING_AGENTS[found].label}.
              </p>
              <Button onClick={onClose}>Done</Button>
            </>
          ) : (
            <Button
              onClick={() => checkAgain.mutate()}
              disabled={checkAgain.isPending}
            >
              {checkAgain.isPending ? "Checking…" : "Check again"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Guide({ guide }: { guide: CodingAgentSetupGuide }) {
  return (
    <div className="space-y-4">
      <p className="rounded-card bg-muted px-3 py-2 text-body text-foreground">
        {guide.cliOnly}
      </p>
      <ol className="space-y-3">
        {guide.agents.map((setup) => (
          <li
            key={setup.agent}
            className="rounded-card border border-sap-border px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 className="text-row font-semibold text-foreground">
                {setup.name}
              </h3>
              <a
                href={setup.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-meta text-primary underline-offset-4 hover:underline"
              >
                Docs
              </a>
            </div>
            <p className="text-meta text-ink-meta">{setup.about}</p>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-body">
              <dt className="text-label uppercase text-ink-meta">Install</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-control bg-muted px-2 py-1 font-mono text-meta">
                  {setup.install}
                </code>
                <CopyButton text={setup.install} />
              </dd>
              <dt className="text-label uppercase text-ink-meta">Sign in</dt>
              <dd className="text-ink-soft">
                <WithCode text={setup.signIn} />
              </dd>
            </dl>
          </li>
        ))}
      </ol>
      <p className="text-body text-ink-soft">{guide.afterInstall}</p>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void copyText(text).then(setCopied)}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

// "Run `codex login` in a terminal." with the command set as code.
function WithCode({ text }: { text: string }) {
  return text
    .split("`")
    .map((part, i) => (
      <Fragment key={i}>
        {i % 2 === 1 ? (
          <code className="rounded-control bg-muted px-1 font-mono text-meta text-foreground">
            {part}
          </code>
        ) : (
          part
        )}
      </Fragment>
    ));
}
