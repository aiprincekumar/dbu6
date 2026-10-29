import {
  accountLedgerLink,
  accountNameColumn,
  dateColumn,
  type GridDatasetColumn,
  hiddenIdColumn,
  moneyColumn,
  type NavLink,
} from "../../report-kit.js";

/**
 * The columns of a balance assertion grid. A grid narrowed to one account
 * leaves the Account column out, and its date carries the ledger link. The
 * Account column names the account in the row's hidden `account_id`.
 * `balanceLabel` heads the computed running balance: "Books" for posted
 * journals, "Drafts" when the drafts are counted in.
 */
export function assertionColumns(
  idName: string,
  idLabel: string,
  assertionLink: NavLink,
  options: { accountColumn?: boolean; balanceLabel: string },
): GridDatasetColumn[] {
  const accountColumn = options.accountColumn ?? true;
  const ledgerLink = accountLedgerLink({
    account_id: "account_id",
    to_date: "date",
  });
  return [
    ...(accountColumn
      ? [
          accountNameColumn("account_name", "Account", "account_id", {
            width: 52,
            links: [ledgerLink],
          }),
        ]
      : []),
    dateColumn("date", "Date", {
      width: 12,
      ...(accountColumn ? {} : { links: [ledgerLink] }),
    }),
    hiddenIdColumn(idName, idLabel),
    moneyColumn("running_balance", options.balanceLabel, { width: 18 }),
    moneyColumn("assertion", "Statement", {
      width: 18,
      links: [assertionLink],
    }),
    moneyColumn("diff", "Difference", {
      width: 16,
      colorRule: "signed",
      strong: true,
    }),
  ];
}
