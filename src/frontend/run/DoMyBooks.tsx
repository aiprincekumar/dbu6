import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StatementInboxBatch } from "../../shared/index";
import { apiErrorMessage, statementInboxApi } from "../api";
import { AgentButton } from "../components/agent-prompt";
import { FRESH_QUERY } from "../queries";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";
import type { UpdateLink } from "../update/state";
import { formatFileSize } from "../format";
import { Dropzone } from "../views/import-statements/files";
import { doMyBooksPrompt, runLabel, saveToInbox } from "./inbox";

export const STATEMENT_INBOX_KEY = ["statement-inbox"] as const;

/**
 * Drop + "Do my books", on Update and the first run's card: every statement
 * the user has goes into the inbox in one drop, and one button hands the
 * coding agent the run over all of them. Dropping only saves the files; the
 * agent reads them, and the user adds each account on Review once the run is
 * done. The files uploaded and not yet imported are listed above the drop,
 * so a second drop joins them in the same run; a file dropped again isn't
 * added twice. `byHand`, doing it by hand instead, sits beside the run's
 * button after an "or"; `body` is what is already set up.
 */
export function DoMyBooks({
  body,
  byHand,
}: {
  body?: string;
  byHand?: UpdateLink;
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
  const batches = inbox.data?.batches ?? [];
  const files = batches.reduce((sum, batch) => sum + batch.files.length, 0);
  const skipped = save.data?.already_uploaded ?? [];

  return (
    <section>
      <h2 className="text-heading text-foreground">Do my books</h2>
      <div className="mt-1 space-y-1 pb-3 text-body text-ink-meta">
        <p>
          Drop every statement you have. Your coding agent imports and
          categorizes them, asks only what it can't settle, and leaves them on
          Review for you to add.
        </p>
        {body && <p>{body}</p>}
      </div>
      {files > 0 && (
        <InboxFiles
          batches={batches}
          removing={remove.isPending}
          onRemove={(savedPath) => remove.mutate(savedPath)}
        />
      )}
      <Dropzone
        disabled={save.isPending}
        onFiles={(files) => {
          if (files.length > 0) save.mutate(files);
        }}
      />
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
      {(files > 0 || byHand) && (
        <div className="mt-4 flex flex-wrap items-start gap-x-3 gap-y-2">
          {files > 0 && (
            <AgentButton
              label={runLabel(files)}
              prompt={doMyBooksPrompt(batches)}
              afterwards="Answer its questions in the terminal, then add each account on Review."
            />
          )}
          {byHand && (
            <div className="flex min-h-[calc(var(--height-sap-ctl)+2px)] items-center gap-2">
              <span className="text-row text-ink-meta">or</span>
              <Button
                render={<Link to={byHand.to} />}
                nativeButton={false}
                variant="ghost"
              >
                {byHand.label}
                <ArrowRight />
              </Button>
            </div>
          )}
        </div>
      )}
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
    <div className="mb-4">
      <div className="flex gap-3 border-b border-line-inner px-2 pb-2 text-meta text-ink-meta">
        <span className="min-w-0 flex-1">Statement files uploaded</span>
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
