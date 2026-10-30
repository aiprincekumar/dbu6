import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  LookupPicker,
  useTableLookup,
  type LookupNarrowing,
  type LookupPickerLabels,
} from "@sapporta/frontend/lookup";
import { Combobox, comboboxClassNames } from "@sapporta/ui/combobox";
import { cn } from "@sapporta/ui/cn";
import { knownInstitution, type ChartChoice } from "../../shared/index";

/*
 * The forms' pickers. `AccountTreeCombobox` picks an account with Sapporta's
 * tree picker over the accounts table: the server sends the chart as its
 * tree, narrowed, the picker searches it in the browser, the list indents
 * each account under its parent, and the chosen account's parents sit before
 * its name in the field.
 * `InstitutionCombobox` picks a bank by name, on Base UI's Combobox with
 * Sapporta's style tokens.
 */

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
}: {
  id: string;
  placeholder: string;
  invalid?: boolean;
}) {
  return (
    <Combobox.InputGroup
      className={cn(comboboxClassNames.inputGroup, "bg-card")}
    >
      <Combobox.Input
        id={id}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className={comboboxClassNames.input}
      />
      <Combobox.Trigger
        aria-label="Show the choices"
        className={cn(comboboxClassNames.action, comboboxClassNames.trigger)}
      >
        <ChevronDown />
      </Combobox.Trigger>
    </Combobox.InputGroup>
  );
}

// How the account pickers word Sapporta's picker.
const ACCOUNT_PICKER_LABELS: LookupPickerLabels = {
  open: "Show the choices",
  empty: "No account matches.",
  loading: "Reading the chart…",
  tooLarge: "Too many accounts to show here. Type to search.",
  loadFailed: "Could not read the chart.",
  editing: "(this account)",
};

/**
 * One account from the chart, by id, narrowed by `narrowing`, such as to
 * the accounts of one type. With `notUnder`, that account, the one being
 * edited, is shown greyed where it sits, and nothing under it can be picked.
 * Typing searches the chart the picker was sent, in its tree order. With
 * `clearLabel`, it may be left empty: the placeholder says what empty means,
 * and a button named `clearLabel` clears a choice.
 */
export function AccountTreeCombobox({
  id,
  narrowing,
  value,
  onChange,
  placeholder,
  invalid,
  describedBy,
  disabled,
  clearLabel,
  labels,
  className,
}: {
  id: string;
  /** The accounts that can be picked; leave it out for any account. */
  narrowing?: LookupNarrowing;
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder: string;
  invalid?: boolean;
  /** The id of what explains the field, such as its error. */
  describedBy?: string;
  disabled?: boolean;
  /** Name a button that empties the choice; omitted, one is required. */
  clearLabel?: string;
  /** Wording beyond the account pickers' own, such as the empty list's. */
  labels?: Omit<LookupPickerLabels, "clear">;
  className?: string;
}) {
  // The chart is in the browser already; searching it there finds every
  // account in tree order, not the first page of the server's matches.
  const lookup = useTableLookup<number>("accounts", narrowing, {
    search: "client",
  });
  return (
    <div className={className}>
      <LookupPicker<number>
        lookup={lookup}
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        allowClear={clearLabel !== undefined && value !== null}
        labels={{
          ...ACCOUNT_PICKER_LABELS,
          ...labels,
          ...(clearLabel === undefined ? {} : { clear: clearLabel }),
        }}
        ariaInvalid={invalid}
        ariaDescribedBy={describedBy}
        className="bg-card"
      />
    </div>
  );
}

/**
 * One account from `choices`, by id, drawn in the chart's tree as
 * `AccountTreeCombobox` draws it. The ids travel in the request, so the
 * list stays short: a few parents or unlisted accounts, not the chart.
 */
export function AccountCombobox({
  choices,
  notUnder,
  ...props
}: Omit<Parameters<typeof AccountTreeCombobox>[0], "narrowing"> & {
  choices: readonly ChartChoice[];
  /** The account being edited, greyed, with nothing under it pickable. */
  notUnder?: number;
}) {
  return (
    <AccountTreeCombobox
      {...props}
      narrowing={{
        filter: [
          choices.length === 0
            ? // Nothing to choose, so the list says no account matches.
              // An empty `in` can't be sent; an id is never null.
              { column: "id", op: "is", polarity: "null" }
            : {
                column: "id",
                op: "in",
                values: choices.map((choice) => choice.id),
              },
        ],
        notUnder,
      }}
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
