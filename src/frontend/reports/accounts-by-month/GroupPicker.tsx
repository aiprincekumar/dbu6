import {
  AccountTreeCombobox,
  ToggleGroup,
  ToggleGroupItem,
} from "../../report-kit";
import {
  ACCOUNT_MONTHS_GROUPS,
  type AccountMonths,
  type AccountMonthsGroup,
} from "../../../shared/index";
import { GROUP_LABELS, GROUP_TYPES, type Group } from "./pivot";

/*
 * The two controls that pick the rows: a type, and within it the chart's
 * account picker, with search and the tree, to narrow to one account and
 * everything under it. An empty picker is the whole type.
 */

/** The group a type is, or null for a type the report doesn't group by. */
function groupOfType(type: AccountMonths["type"]): AccountMonthsGroup | null {
  return (
    ACCOUNT_MONTHS_GROUPS.find((name) => GROUP_TYPES[name] === type) ?? null
  );
}

export function GroupPicker({
  group,
  reportType,
  onChange,
}: {
  group: Group;
  /** The type of the report on screen; null until the first one arrives. */
  reportType: AccountMonths["type"] | null;
  onChange: (group: Group) => void;
}) {
  // An account's type is the report's, which an account from a link waits
  // for; the picker offers only that type's accounts.
  const type =
    group.kind === "type"
      ? group.group
      : reportType === null
        ? null
        : groupOfType(reportType);
  const label = type === null ? "accounts" : GROUP_LABELS[type].toLowerCase();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ToggleGroup<AccountMonthsGroup>
        aria-label="Type"
        value={type === null ? [] : [type]}
        onValueChange={(value) => {
          const [next] = value;
          if (next !== undefined) onChange({ kind: "type", group: next });
        }}
      >
        {ACCOUNT_MONTHS_GROUPS.map((name) => (
          <ToggleGroupItem<AccountMonthsGroup> key={name} value={name}>
            {GROUP_LABELS[name]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <label htmlFor="accounts-by-month-account" className="sr-only">
        Account
      </label>
      <AccountTreeCombobox
        id="accounts-by-month-account"
        narrowing={
          type === null
            ? undefined
            : {
                filter: [
                  {
                    column: "account_type",
                    op: "in",
                    values: [GROUP_TYPES[type]],
                  },
                ],
              }
        }
        value={group.kind === "account" ? group.accountId : null}
        onChange={(accountId) =>
          onChange(
            accountId !== null
              ? { kind: "account", accountId }
              : { kind: "type", group: type ?? "expense" },
          )
        }
        placeholder={`All ${label}`}
        clearLabel={`Show all ${label}`}
        className="w-[260px] max-w-full"
      />
    </div>
  );
}
