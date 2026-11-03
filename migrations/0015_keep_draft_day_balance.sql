-- A statement prints the balance at the end of each day, and dbu6 keeps it on
-- the day's last draft of that account (date, then id, as `draftOrderSql`
-- orders them). Deleting that draft, as a duplicate or as a transfer's second
-- copy, would take the bank's balance for the day with it, and nothing would
-- say a check was lost. This trigger moves it, unchanged, onto the day's new
-- last draft. A day left with no draft loses its balance: there is nothing
-- of that day's to carry it.
--
-- It catches every delete: the Drafts grid, `rows delete`, the table API.
-- Posting deletes an account's drafts too, and the balance hops from row to
-- row until the last one goes, which is harmless.
--
-- A table's triggers are dropped with it. A migration that rebuilds
-- `draft_transactions` must create this again; schema/draft-journals.test.ts
-- fails until it does.
CREATE TRIGGER `draft_transactions_keep_day_balance`
AFTER DELETE ON `draft_transactions`
WHEN OLD.balance_assertion_base_account IS NOT NULL
	AND OLD.base_account_id IS NOT NULL
BEGIN
	UPDATE `draft_transactions`
	SET `balance_assertion_base_account` = OLD.balance_assertion_base_account
	WHERE `balance_assertion_base_account` IS NULL
		AND `id` = (
			SELECT day.id
			FROM `draft_transactions` day
			WHERE day.workspace_id = OLD.workspace_id
				AND day.scoped_to_user_id = OLD.scoped_to_user_id
				AND day.base_account_id = OLD.base_account_id
				AND day.date = OLD.date
			ORDER BY day.date DESC, day.id DESC
			LIMIT 1
		);
END;
