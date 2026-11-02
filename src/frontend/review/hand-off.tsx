import { Link } from "react-router-dom";
import { cn } from "@sapporta/ui/cn";
import { EmptyState } from "../components/empty-state";
import { Button } from "../components/ui/button";
import { UPDATE_ROUTE } from "../update/routes";
import { BOOKS_SET_UP, BOOKS_SET_UP_NEXT } from "./overview-state";

/*
 * Cards 7 and 8 of /add (PLAN.md "The cards"), as Review shows them: the
 * hand-off note on the account list the first run lands on (an account's
 * Overview says it itself), and the first run's end once nothing is left
 * to post. And the way on from a Review with nothing in it: Update, where
 * the run takes the next statements, with /import a quiet link for doing
 * it by hand.
 */

/**
 * The note above the account list, on `?imported=1`. `left` is whether
 * anything is left for the agent's Fix these, beside the accounts Add all
 * can add.
 */
export function HandOffNote({
  left,
  className,
}: {
  left: boolean;
  className?: string;
}) {
  return (
    <p
      role="status"
      className={cn(
        "rounded-card border border-money-in-border bg-money-in-bg px-4 py-2.5 text-body text-money-in-ink",
        className,
      )}
    >
      {left
        ? "Your transactions are imported. Fix these hands what's left to your agent; then add them to your books."
        : "Your transactions are imported and ready to add to your books."}
    </p>
  );
}

/** Review's empty state on the first run, once nothing is left to post. */
export function BooksSetUp({ className }: { className?: string }) {
  return (
    <EmptyState
      className={className}
      title={BOOKS_SET_UP}
      body="Everything you imported is in your books."
      action={
        <Button
          render={<Link to={BOOKS_SET_UP_NEXT.to} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          {BOOKS_SET_UP_NEXT.label}
        </Button>
      }
    />
  );
}

/** The way on from an empty Review: Update, or /import by hand. */
export function UpdateYourBooks() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
      <Button
        render={<Link to={UPDATE_ROUTE} />}
        nativeButton={false}
        variant="outline"
        size="sm"
      >
        Update your books
      </Button>
      <Link
        to="/import"
        className="text-meta text-ink-meta underline decoration-sap-border-strong underline-offset-4 hover:text-foreground hover:decoration-current"
      >
        Import by hand
      </Link>
    </div>
  );
}
