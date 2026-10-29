import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, X } from "lucide-react";
import { Combobox, comboboxClassNames } from "@sapporta/ui/combobox";
import { cn } from "@sapporta/ui/cn";
import {
  LEDGER_ACCOUNT_TYPE,
  LEDGER_ACCOUNT_TYPES,
  knownInstitution,
  type AccountKind,
  type ChartChoice,
  type LedgerAccountType,
} from "../../shared/index";
import { accountChartQuery } from "../queries";

/*
 * The forms' pickers, on Base UI's Combobox with Sapporta's style tokens.
 * `AccountTreeCombobox` picks an account from the chart, drawn as the tree it
 * is: the chosen account's parents sit before its name in the field, the list
 * indents each account under its parent, and a search lists the matches with
 * their paths. `InstitutionCombobox` picks a bank by name.
 */

/** The accounts a bank or card of `kind` can sit under: those of its type. */
export function statementParentEligible(kind: AccountKind) {
  return (account: ChartAccount) =>
    account.account_type === LEDGER_ACCOUNT_TYPE[kind];
}

/** An account as the picker reads it from the chart. */
export interface ChartAccount {
  id: number;
  name: string;
  parent_id: number | null;
  account_type: LedgerAccountType;
}

// One account in the list: where it sits, and whether it can be picked. An
// account that can't is drawn only to place the ones under it that can.
interface TreeItem {
  account: ChartAccount;
  depth: number;
  ancestors: readonly string[];
  pickable: boolean;
  self: boolean;
}

function chartAccount(row: Record<string, unknown>): ChartAccount | null {
  const { id, name, parent_id, account_type } = row;
  if (typeof id !== "number" || typeof name !== "string") return null;
  if (!LEDGER_ACCOUNT_TYPES.includes(account_type as LedgerAccountType)) {
    return null;
  }
  return {
    id,
    name,
    parent_id: typeof parent_id === "number" ? parent_id : null,
    account_type: account_type as LedgerAccountType,
  };
}

/**
 * The chart in tree order, top accounts by type and then by name, children
 * by name under their parent. Kept are the accounts `eligible` lets through,
 * the ones above them, and `self` with its branch, which can't be picked.
 */
function treeItems(
  rows: readonly Record<string, unknown>[],
  eligible: (account: ChartAccount) => boolean,
  self: number | undefined,
): TreeItem[] {
  const accounts = rows
    .map(chartAccount)
    .filter((one): one is ChartAccount => one !== null);
  const children = new Map<number | null, ChartAccount[]>();
  for (const account of accounts) {
    const siblings = children.get(account.parent_id) ?? [];
    siblings.push(account);
    children.set(account.parent_id, siblings);
  }
  const typeOrder = (account: ChartAccount) =>
    LEDGER_ACCOUNT_TYPES.indexOf(account.account_type);
  const roots = [...(children.get(null) ?? [])].sort(
    (a, b) => typeOrder(a) - typeOrder(b) || a.name.localeCompare(b.name),
  );

  const items: TreeItem[] = [];
  // Returns whether anything at or under `account` was kept.
  const walk = (
    account: ChartAccount,
    ancestors: readonly string[],
    inSelf: boolean,
  ): boolean => {
    const isSelf = account.id === self;
    const blocked = inSelf || isSelf;
    const pickable = !blocked && eligible(account);
    const item: TreeItem = {
      account,
      depth: ancestors.length,
      ancestors,
      pickable,
      self: isSelf,
    };
    const at = items.length;
    items.push(item);
    let kept = pickable || isSelf;
    for (const child of children.get(account.id) ?? []) {
      // Under itself, only the account is drawn: its branch moves with it.
      if (isSelf) break;
      if (walk(child, [...ancestors, account.name], blocked)) kept = true;
    }
    if (!kept) items.splice(at, 1);
    return kept;
  };
  for (const root of roots) walk(root, [], false);
  return items;
}

function Popup({
  empty,
  children,
}: {
  empty: string;
  // A function of each item, rendering its row.
  children: Combobox.List.Props["children"];
}) {
  return (
    <Combobox.Portal>
      {/* Above the form's dialog, which sits over the popover layer. */}
      <Combobox.Positioner
        className={cn(
          comboboxClassNames.positioner,
          "z-[calc(var(--sap-z-modal-content)+1)]",
        )}
        sideOffset={4}
      >
        <Combobox.Popup className={comboboxClassNames.popup}>
          <Combobox.Empty className={comboboxClassNames.empty}>
            {empty}
          </Combobox.Empty>
          <Combobox.List className={comboboxClassNames.list}>
            {children}
          </Combobox.List>
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Portal>
  );
}

function Field({
  id,
  placeholder,
  invalid,
  describedBy,
  clearLabel,
  prefix,
}: {
  id: string;
  placeholder: string;
  invalid?: boolean;
  describedBy?: string;
  /** Show a clear button named this, for a choice that may be left empty. */
  clearLabel?: string;
  /** Drawn before the input's text, such as the chosen account's parents. */
  prefix?: string;
}) {
  return (
    <Combobox.InputGroup
      className={cn(comboboxClassNames.inputGroup, "bg-card")}
    >
      {prefix && (
        <span
          title={prefix}
          className="max-w-[55%] shrink-0 truncate pl-3 text-sap-emph text-ink-meta"
        >
          {prefix}
        </span>
      )}
      <Combobox.Input
        id={id}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(comboboxClassNames.input, prefix && "pl-1.5")}
      />
      {clearLabel !== undefined && (
        <Combobox.Clear
          aria-label={clearLabel}
          className={comboboxClassNames.action}
        >
          <X />
        </Combobox.Clear>
      )}
      <Combobox.Trigger
        aria-label="Show the choices"
        className={cn(comboboxClassNames.action, comboboxClassNames.trigger)}
      >
        <ChevronDown />
      </Combobox.Trigger>
    </Combobox.InputGroup>
  );
}

const PATH_MARK = " › ";

const anyAccount = () => true;

/**
 * One account from the chart, by id, among those `eligible` lets through.
 * With `self`, the account being edited is shown, greyed, where it sits, and
 * nothing under it can be picked. With `clearLabel`, it may be left empty:
 * the placeholder says what empty means, and a button clears a choice.
 */
export function AccountTreeCombobox({
  id,
  eligible,
  self,
  value,
  onChange,
  placeholder,
  invalid,
  describedBy,
  disabled,
  clearLabel,
  className,
}: {
  id: string;
  /** The accounts that can be picked; leave it out for any account. */
  eligible?: (account: ChartAccount) => boolean;
  self?: number;
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder: string;
  invalid?: boolean;
  /** The id of what explains the field, such as its error. */
  describedBy?: string;
  disabled?: boolean;
  /** Name a button that empties the choice; omitted, one is required. */
  clearLabel?: string;
  className?: string;
}) {
  const { data } = useQuery(accountChartQuery);
  const items = treeItems(data?.rows ?? [], eligible ?? anyAccount, self);
  const selected =
    value === null
      ? null
      : (items.find((item) => item.account.id === value) ?? null);
  // What is typed to search; null while the input shows the chosen name.
  const [query, setQuery] = useState<string | null>(null);
  const needle = (query ?? "").trim().toLowerCase();
  const searching = needle !== "";
  const shown = searching
    ? items.filter(
        (item) =>
          item.pickable && item.account.name.toLowerCase().includes(needle),
      )
    : items;
  const prefix =
    selected === null || searching || selected.ancestors.length === 0
      ? undefined
      : selected.ancestors.join(PATH_MARK) + PATH_MARK.trimEnd();
  return (
    <div className={className}>
      <Combobox.Root<TreeItem>
        items={items}
        filteredItems={shown}
        value={selected}
        disabled={disabled}
        onValueChange={(next) => {
          setQuery(null);
          onChange(next?.account.id ?? null);
        }}
        // The input is controlled: the list is rebuilt from the chart on
        // every render, so Base UI would otherwise reset what is typed.
        inputValue={query ?? selected?.account.name ?? ""}
        onInputValueChange={(text, details) =>
          setQuery(details.reason === "input-change" ? text : null)
        }
        onOpenChange={(open) => !open && setQuery(null)}
        itemToStringLabel={(item) => item.account.name}
        isItemEqualToValue={(a, b) => a.account.id === b.account.id}
      >
        <Field
          id={id}
          placeholder={placeholder}
          invalid={invalid}
          describedBy={describedBy}
          clearLabel={selected === null ? undefined : clearLabel}
          prefix={prefix}
        />
        <Popup empty="No account matches.">
          {(item: TreeItem) => (
            <Combobox.Item
              key={item.account.id}
              value={item}
              disabled={!item.pickable}
              className={cn(
                comboboxClassNames.item,
                // Greyed, not faded: it is there to place the others.
                "data-disabled:opacity-100",
                !item.pickable && "text-ink-meta",
              )}
              style={
                searching
                  ? undefined
                  : { paddingLeft: `${0.5 + item.depth * 1.125}rem` }
              }
            >
              <span className="min-w-0 truncate">
                {searching && item.ancestors.length > 0 && (
                  <span className="text-ink-meta">
                    {item.ancestors.join(PATH_MARK) + PATH_MARK}
                  </span>
                )}
                {item.account.name}
                {item.self && (
                  <span className="text-ink-meta"> (this account)</span>
                )}
              </span>
              <Combobox.ItemIndicator
                className={comboboxClassNames.itemIndicator}
              >
                <Check />
              </Combobox.ItemIndicator>
            </Combobox.Item>
          )}
        </Popup>
      </Combobox.Root>
    </div>
  );
}

/**
 * One account from `choices`, by id, drawn in the chart's tree as
 * `AccountTreeCombobox` draws it.
 */
export function AccountCombobox({
  choices,
  ...props
}: Omit<Parameters<typeof AccountTreeCombobox>[0], "eligible"> & {
  choices: readonly ChartChoice[];
}) {
  const ids = new Set(choices.map((choice) => choice.id));
  return (
    <AccountTreeCombobox
      {...props}
      eligible={(account) => ids.has(account.id)}
    />
  );
}

// A bank the books know, or the name being typed when none has it.
interface InstitutionItem {
  name: string;
  isNew: boolean;
}

/**
 * A bank or card issuer by name: one the books know (an institution in the
 * import presets), or a new name typed in, which the server adds. Choosing
 * a known one, or typing it in another case, keeps its spelling.
 */
export function InstitutionCombobox({
  id,
  institutions,
  value,
  onChange,
  empty,
  invalid,
}: {
  id: string;
  institutions: readonly string[];
  value: string;
  onChange: (name: string) => void;
  /** What the list says before anything is typed and none is known. */
  empty: string;
  invalid?: boolean;
}) {
  const [query, setQuery] = useState(value);
  // What is typed names a known bank when only case or spaces differ.
  const typed = knownInstitution(institutions, query);
  const items: InstitutionItem[] = [
    ...institutions.map((name) => ({ name, isNew: false })),
    ...(typed !== "" && !institutions.includes(typed)
      ? [{ name: typed, isNew: true }]
      : []),
  ];
  const selected =
    value === "" ? null : { name: value, isNew: !institutions.includes(value) };
  return (
    <Combobox.Root<InstitutionItem>
      items={items}
      value={selected}
      onValueChange={(next) => onChange(next?.name ?? "")}
      inputValue={query}
      // What is typed is the institution, whether or not it is picked: the
      // known one it names, else a new one.
      onInputValueChange={(text) => {
        setQuery(text);
        onChange(knownInstitution(institutions, text));
      }}
      itemToStringLabel={(item) => item.name}
      isItemEqualToValue={(a, b) => a.name === b.name}
    >
      <Field id={id} placeholder="Search or type a name" invalid={invalid} />
      <Popup empty={empty}>
        {(item: InstitutionItem) => (
          <Combobox.Item
            key={`${item.isNew}:${item.name}`}
            value={item}
            className={comboboxClassNames.item}
          >
            {item.isNew ? <span>Add “{item.name}”</span> : item.name}
            <Combobox.ItemIndicator
              className={comboboxClassNames.itemIndicator}
            >
              <Check />
            </Combobox.ItemIndicator>
          </Combobox.Item>
        )}
      </Popup>
    </Combobox.Root>
  );
}
