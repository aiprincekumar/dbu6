import {
  cn,
  type ReactNode,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  X,
} from "../../report-kit";
import { barHeight, chartScale, type ChartBar, usualAmount } from "./chart";
import { sectionAmount, signedAmount, type Section } from "./figures";
import { shadeColor } from "./shade";

/** An account's bars, drawn in place of income and spending. */
export type AccountSeries = {
  name: string;
  section: Section;
  /** One amount per bar. */
  values: readonly number[];
};

/**
 * Month by month, drawn bare under what is in focus: a pair of bars per
 * month (or financial year), income green and spending warm on one scale;
 * or, while an account is in focus, that account's bars and their average
 * over the months the books reach, as a dashed line. The bars are light and the selected one deep. Each bar
 * is a button; its figures show on hover and focus and are its accessible
 * name. Clicking one selects it, so the accounts and the entries narrow to
 * it; clicking it again lets go. Months past the books' last day say so.
 */
export function MonthChart({
  bars,
  selected,
  onSelect,
  series,
  booksUntil,
}: {
  bars: readonly ChartBar[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  series: AccountSeries | null;
  /** The books' last day, when the period runs past it. */
  booksUntil: string | null;
}) {
  const scale = series ? Math.max(0, ...series.values) : chartScale(bars);
  const average = series && usualAmount(bars, series.values, booksUntil);
  const selectedBar = bars.find((bar) => bar.key === selected) ?? null;

  return (
    <section aria-label="Month by month" className="mt-5">
      <div className="flex min-h-7 flex-wrap items-center gap-x-5 gap-y-2 text-meta text-ink-soft">
        <ul className="flex gap-5">
          {series ? (
            average !== null && (
              <li className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="w-4 border-t-2 border-dashed border-ink-meta"
                />
                <span className="tnum font-mono">
                  Average {sectionAmount(series.section, average)}
                </span>
              </li>
            )
          ) : (
            <>
              <LegendItem section="income">Income</LegendItem>
              <LegendItem section="spending">Spending</LegendItem>
            </>
          )}
        </ul>
        {selectedBar && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="ml-auto flex h-7 items-center gap-1.5 rounded-full border border-sap-border-strong bg-card pl-3 pr-2 text-meta text-foreground outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40"
            title="Show every month (Esc)"
          >
            {selectedBar.name}
            <X className="size-3.5 text-ink-meta" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="-mx-2 mt-2 overflow-x-auto px-2 pb-1">
        <ol className="flex min-w-full">
          {bars.map((bar, index) => {
            const dimmed = selected !== null && bar.key !== selected;
            const isSelected = bar.key === selected;
            const notInBooks =
              booksUntil !== null && bar.dates.first_date > booksUntil;
            const description = notInBooks
              ? `${bar.name} · not in your books yet`
              : series
                ? `${bar.name} · ${series.name} ${signedAmount(series.section, series.values[index] ?? 0)}`
                : bar.description;
            return (
              <li key={bar.key} className="flex min-w-[38px] flex-1">
                <Tooltip>
                  <TooltipTrigger
                    delay={0}
                    closeDelay={0}
                    aria-label={description}
                    aria-pressed={isSelected}
                    onClick={() => onSelect(isSelected ? null : bar.key)}
                    className="group flex w-full flex-col items-center rounded-control px-0.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  >
                    <span
                      className={cn(
                        "relative flex h-[104px] w-full items-end justify-center gap-[3px] rounded-t-control border-b border-sap-border-strong group-hover:bg-muted",
                        isSelected && "bg-muted",
                      )}
                    >
                      {average !== null && scale > 0 && (
                        // The average, a dashed line across every bar.
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute -inset-x-1 z-10 border-t border-dashed border-ink-meta"
                          style={{ bottom: `${(average / scale) * 100}%` }}
                        />
                      )}
                      {notInBooks ? (
                        <span
                          aria-hidden="true"
                          className="pb-1 text-center text-[11px] leading-tight text-ink-meta"
                        >
                          not in books
                        </span>
                      ) : series ? (
                        <Bar
                          value={series.values[index] ?? 0}
                          scale={scale}
                          tone={series.section}
                          deep={isSelected}
                          dimmed={dimmed}
                          wide
                        />
                      ) : (
                        <>
                          <Bar
                            value={bar.income}
                            scale={scale}
                            tone="income"
                            deep={isSelected}
                            dimmed={dimmed}
                          />
                          <Bar
                            value={bar.spending}
                            scale={scale}
                            tone="spending"
                            deep={isSelected}
                            dimmed={dimmed}
                          />
                        </>
                      )}
                    </span>
                    <span
                      className={cn(
                        "mt-1.5 text-meta",
                        isSelected
                          ? "font-semibold text-foreground"
                          : "text-ink-soft",
                      )}
                    >
                      {bar.label}
                    </span>
                    <span className="min-h-[20px] text-meta text-ink-meta">
                      {bar.soFar ? "so far" : bar.year}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="tnum font-mono">
                    {description}
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** A series' name beside its hue. */
function LegendItem({
  section,
  children,
}: {
  section: Section;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-2.5 w-4 rounded-[3px]"
        style={{ background: shadeColor(section, 0) }}
      />
      {children}
    </li>
  );
}

function Bar({
  value,
  scale,
  tone,
  deep,
  dimmed,
  wide = false,
}: {
  value: number;
  scale: number;
  tone: Section;
  /** The selected bar, in the section's deepest shade. */
  deep: boolean;
  dimmed: boolean;
  wide?: boolean;
}) {
  const height = barHeight(value, scale);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "rounded-t-[3px]",
        wide ? "w-[56%] max-w-[30px]" : "w-[34%] max-w-[22px]",
        dimmed && "opacity-25",
      )}
      style={{
        // A sliver stays visible; nothing at all draws nothing.
        height: height > 0 ? `max(2px, ${height * 100}%)` : 0,
        background: shadeColor(tone, deep ? 1 : 0),
      }}
    />
  );
}
