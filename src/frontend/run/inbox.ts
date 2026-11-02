import { getApiBase } from "@sapporta/frontend/platform";
import {
  statementInboxBatchSchema,
  type StatementInboxBatch,
} from "../../shared/index";
import { runPrompt, type AgentPrompt } from "../agent-prompt-rules";
import { plural } from "../format";

/*
 * The statement inbox's drop (statementInboxContract): the files are only
 * saved, as one batch, for the coding agent's run to read. It is multipart,
 * so a plain fetch, as /add sends its files; the listing goes through
 * statementInboxApi.
 */

/** Saves the dropped files as one batch. Throws with the server's words. */
export async function saveToInbox(
  files: readonly File[],
): Promise<StatementInboxBatch> {
  const body = new FormData();
  for (const file of files) body.append("files", file);
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}/statement-inbox`, {
      method: "POST",
      body,
    });
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "The request failed.",
    );
  }
  const reply: unknown = await response.json().catch(() => null);
  if (response.ok) {
    const batch = statementInboxBatchSchema.safeParse(reply);
    if (batch.success) return batch.data;
    throw new Error("The server's answer about the files couldn't be read.");
  }
  const error =
    reply && typeof reply === "object" && "error" in reply ? reply.error : null;
  throw new Error(
    typeof error === "string"
      ? error
      : `The statements couldn't be saved (HTTP ${response.status}).`,
  );
}

/** The run's prompt for the batches waiting in the inbox. */
export function doMyBooksPrompt(
  batches: readonly StatementInboxBatch[],
): AgentPrompt {
  const files = batches.reduce((sum, batch) => sum + batch.files.length, 0);
  return runPrompt({
    outcome:
      "Turn the statements waiting in the statement inbox into books ready for me to add, asking me only what you can't settle.",
    facts: `Statements: ${plural(files, "file")} in the inbox.`,
  });
}
