import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StatementInboxBatch } from "../../shared/index";
import { apiErrorMessage, statementInboxApi } from "../api";
import { AgentButton } from "../components/agent-prompt";
import { FRESH_QUERY } from "../queries";
import { Link, useLocation } from "react-router-dom";
import { Button } from "../components/ui/button";
import { DROP_ID } from "../update/routes";
import type { UpdateLink } from "../update/state";
import { formatFileSize } from "../format";
import { InfoButton } from "../views/import-statements/cards";
import { Dropzone } from "../views/import-statements/files";
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
 * from the same page, scrolls to it and focuses "Choose files".
 */
export function DoMyBooks({
  body,
  byHand,
  afterList = false,
  choosePrimary = true,
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
}) {
  const queryClient = useQueryClient();
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
      {body && <p className="mb-3 text-body text-ink-soft">{body}</p>}
      <div id={DROP_ID} ref={drop}>
        <Dropzone
          disabled={save.isPending}
          title={afterList ? "Drop them here" : undefined}
          hint="PDF, Excel, CSV or text, from any bank or card, new ones too."
          prominent
          primary={choosePrimary && files === 0}
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
      {inbox.isError && (
        <p role="alert" className="mt-3 text-row text-destructive">
          {apiErrorMessage(inbox.error)}
        </p>
      )}
      {files > 0 && (
        <InboxFiles
          batches={batches}
          removing={remove.isPending}
          onRemove={(savedPath) => remove.mutate(savedPath)}
        />
      )}
      {(files > 0 || byHand) && (
        <div className="mt-5 flex flex-wrap items-start gap-x-5 gap-y-2">
          {files > 0 && (
            <AgentButton
              label={runLabel(files)}
              prompt={doMyBooksPrompt(batches)}
              afterwards="Answer its questions in the terminal, then add each account on Review."
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
      <div className="mt-2 flex items-center gap-1 text-meta text-ink-meta">
        <p>
          Your coding agent imports the files you add. You check its entries on
          Review and add them to your books.
        </p>
        <InfoButton label="How the coding agent adds your statements">
          <p>
            Your coding agent imports each file and categorizes its
            transactions. It asks you in the terminal about anything it can't
            work out.
          </p>
          <p>
            A bank or card new to your books goes in the same drop: your coding
            agent sets it up from its statements.
          </p>
          <p>Nothing is posted to your books until you add it on Review.</p>
        </InfoButton>
      </div>
    </section>
  );
}

/**
 * The files uploaded, a row each: the name, its size in its own column, and
 * Remove, which takes a file out without importing it.
 */
function InboxFiles({
  batches,
  removing,
  onRemove,
}: {
  batches: readonly StatementInboxBatch[];
  removing: boolean;
  onRemove: (savedPath: string) => void;
}) {
  const files = batches.flatMap((batch) => batch.files);
  return (
    <div className="mt-5">
      <div className="flex gap-3 border-b border-line-inner px-2 pb-2 text-meta text-ink-meta">
        <span className="min-w-0 flex-1">Files to add</span>
        <span className="w-20 shrink-0 text-right">Size</span>
        <span className="w-20 shrink-0" />
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
