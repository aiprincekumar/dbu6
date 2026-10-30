import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../../report-kit";
import {
  ACCOUNT_MONTHS_GROUPS,
  type AccountMonths,
} from "../../../shared/index";
import { GROUP_LABELS, type Group, TYPE_TITLES } from "./pivot";

/*
 * The one control that picks the rows: a type's accounts, then every
 * account with sub-accounts, by type and indented as the tree runs.
 */

function valueOf(group: Group): string {
  return group.kind === "account" ? `account:${group.accountId}` : group.group;
}

function groupOf(value: string): Group | null {
  if (value.startsWith("account:"))
    return { kind: "account", accountId: Number(value.slice(8)) };
  const group = ACCOUNT_MONTHS_GROUPS.find((name) => name === value);
  return group === undefined ? null : { kind: "type", group };
}

export function GroupPicker({
  group,
  parents,
  onChange,
}: {
  group: Group;
  /** Null until the first report arrives. */
  parents: AccountMonths["parents"] | null;
  onChange: (group: Group) => void;
}) {
  const types = ACCOUNT_MONTHS_GROUPS.map((name) => ({
    value: name,
    label: GROUP_LABELS[name],
  }));
  const accounts = (parents ?? []).map((parent) => ({
    value: `account:${parent.account_id}`,
    label: parent.name,
    parent,
  }));
  const value = valueOf(group);
  const items = [
    ...types,
    ...accounts,
    // An account from a link, before the list arrives.
    ...(group.kind === "account" &&
    !accounts.some((item) => item.value === value)
      ? [{ value, label: "Account" }]
      : []),
  ];
  return (
    <Select<string>
      value={value}
      items={items}
      onValueChange={(next) => {
        const chosen = next === null ? null : groupOf(next);
        if (chosen !== null) onChange(chosen);
      }}
    >
      <SelectTrigger
        aria-label="Accounts"
        placeholder="Accounts"
        className="w-auto min-w-[180px] max-w-[280px]"
      />
      <SelectContent>
        {types.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
        {accounts.length > 0 && (
          <div
            role="separator"
            aria-hidden="true"
            className="my-1 border-t border-sap-border"
          />
        )}
        {accounts.map((item, index) => {
          const type = item.parent.account_type;
          const firstOfType =
            index === 0 || accounts[index - 1].parent.account_type !== type;
          return (
            <div key={item.value}>
              {firstOfType && (
                <div
                  aria-hidden="true"
                  className="px-2.5 pt-2 pb-1 text-meta text-ink-meta"
                >
                  {TYPE_TITLES[type]}
                </div>
              )}
              <SelectItem value={item.value}>
                <span style={{ paddingLeft: item.parent.depth * 14 }}>
                  {item.label}
                </span>
              </SelectItem>
            </div>
          );
        })}
      </SelectContent>
    </Select>
  );
}
