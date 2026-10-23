import { type KeyboardEvent, useRef } from 'react';

export type TabItem<T extends string> = Readonly<{
  value: T;
  label: string;
  /** Shown as a pill; none while unknown. */
  count?: number | undefined;
}>;

type TabsProps<T extends string> = Readonly<{
  label: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The id of the element the tabs control (the tab panel). */
  controls: string;
}>;

export const tabId = (controls: string, value: string) => `${controls}-tab-${value}`;

/**
 * Kuat Tabs: an underline tab bar with optional count pills. Arrow keys, Home and End move the
 * selection (automatic activation); only the selected tab is in the tab order.
 */
export const Tabs = <T extends string>({
  label,
  items,
  value,
  onChange,
  controls,
}: TabsProps<T>) => {
  const buttons = useRef(new Map<T, HTMLButtonElement>());

  const select = (next: TabItem<T> | undefined) => {
    if (!next) return;
    onChange(next.value);
    buttons.current.get(next.value)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const index = items.findIndex((item) => item.value === value);
    const moves: Record<string, number | undefined> = {
      ArrowRight: (index + 1) % items.length,
      ArrowLeft: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(items[target]);
  };

  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-border">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(element) => {
              if (element) buttons.current.set(item.value, element);
              else buttons.current.delete(item.value);
            }}
            type="button"
            role="tab"
            id={tabId(controls, item.value)}
            aria-selected={active}
            aria-controls={controls}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={onKeyDown}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
              active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            }`}
          >
            {item.label}
            {item.count === undefined ? null : (
              <span
                className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-[11px] font-semibold ${
                  active ? 'bg-ee-blue-100 text-ee-blue-700' : 'bg-(--slate-100) text-(--slate-600)'
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
