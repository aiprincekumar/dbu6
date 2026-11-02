import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StatementInboxBatch } from "../../shared/index";
import { apiErrorMessage, statementInboxApi } from "../api";
import { AgentButton } from "../components/agent-prompt";
import { FRESH_QUERY } from "../queries";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import type { UpdateLink } from "../update/state";
import { formatFileSize } from "../format";
import { Dropzone } from "../views/import-statements/files";
import { doMyBooksPrompt, saveToInbox } from "./inbox";

export const STATEMENT_INBOX_KEY = ["statement-inbox"] as const;

/**
 * Drop + "Do my books", on Update, and the first run's card with `byHand`,
 * its link to setting up by hand, and `body`, what is already set up:
 * every statement the user has goes into the inbox in one drop, and one
 * button hands the coding agent the run over all of them. Dropping only saves
 * the files; the agent reads them, and the user adds each account on Review
 * once the run is done. Files dropped earlier and not yet imported are
 * listed, so a second drop joins them in the same run.
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

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-heading text-foreground">Do my books</h2>
        {byHand && (
          <Button
            render={<Link to={byHand.to} />}
            nativeButton={false}
            variant="ghost"
            size="sm"
          >
            {byHand.label}
          </Button>
        )}
      </div>
      <div className="mt-1 space-y-1 pb-3 text-body text-ink-meta">
        <p>
          Drop every statement you have. Your coding agent sets up, imports and
          categorizes them, and asks you only what it can't settle.
        </p>
        {body && <p>{body}</p>}
      </div>
      <Dropzone
        disabled={save.isPending}
        onFiles={(files) => {
          if (files.length > 0) save.mutate(files);
        }}
      />
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
      {batches.length > 0 && (
        <>
          <InboxFiles
            batches={batches}
            removing={remove.isPending}
            onRemove={(savedPath) => remove.mutate(savedPath)}
          />
          <div className="mt-4">
            <AgentButton
              label="Do my books"
              prompt={doMyBooksPrompt(batches)}
              afterwards="Answer its questions in the terminal, then add each account on Review."
            />
          </div>
        </>
      )}
    </section>
  );
}

/**
 * The files waiting, a row each: the name, its size in its own column, and
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
    <div className="mt-4">
      <div
        aria-hidden="true"
        className="flex gap-3 border-b border-line-inner px-2 pb-2 text-meta text-ink-meta"
      >
        <span className="min-w-0 flex-1">Waiting for the run</span>
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
