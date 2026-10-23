import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MultiSelect, type MultiSelectOption } from './multi-select.tsx';

type Fruit = 'apple' | 'pear' | 'plum';

const options: MultiSelectOption<Fruit>[] = [
  { value: 'apple', label: 'Apple', disabled: true, hint: 'Always in the bowl' },
  { value: 'pear', label: 'Pear' },
  { value: 'plum', label: 'Plum' },
];

const chosen: Fruit[] = ['apple', 'plum'];

const setup = (props: Partial<Parameters<typeof MultiSelect<Fruit>>[0]> = {}) => {
  const onToggle = vi.fn<(value: Fruit) => void>();
  const ui = (disabled = false) => (
    <>
      <MultiSelect
        label="Fruit"
        options={options}
        value={chosen}
        onToggle={onToggle}
        disabled={disabled}
        {...props}
      />
      <button type="button">Elsewhere</button>
    </>
  );
  const { rerender } = render(ui());
  const trigger = screen.getByRole('button', { name: 'Fruit: Apple, Plum' });
  return { user: userEvent.setup(), onToggle, trigger, setDisabled: () => rerender(ui(true)) };
};

const list = () => screen.queryByRole('group', { name: 'Fruit' });

describe('MultiSelect', () => {
  it('shows the choice on the trigger and opens on the first option it can change', async () => {
    const { user, trigger } = setup();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(list()).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: 'Apple' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Pear' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Pear' })).toHaveFocus();
  });

  it('toggles an option and stays open', async () => {
    const { user, onToggle, trigger } = setup();
    await user.click(trigger);

    await user.click(screen.getByRole('checkbox', { name: 'Pear' }));
    await user.keyboard('{Tab} ');

    expect(onToggle.mock.calls).toEqual([['pear'], ['plum']]);
    expect(list()).toBeInTheDocument();
  });

  it("can't toggle a disabled option, and says why", async () => {
    const { user, onToggle, trigger } = setup();
    await user.click(trigger);

    const apple = screen.getByRole('checkbox', { name: 'Apple' });
    expect(apple).toBeDisabled();
    expect(apple).toHaveAccessibleDescription('Always in the bowl');
    await user.click(apple);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('ignores toggles while disabled, keeping the open list and its focus', async () => {
    const { user, onToggle, trigger, setDisabled } = setup();
    await user.click(trigger);

    setDisabled(); // a change is saving
    await user.keyboard(' ');

    expect(onToggle).not.toHaveBeenCalled();
    expect(list()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('checkbox', { name: 'Pear' })).toHaveFocus();
  });

  it('closes on Escape (focus back on the trigger), a click outside, or tabbing away', async () => {
    const { user, trigger } = setup();

    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(list()).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(list()).not.toBeInTheDocument();

    await user.click(trigger);
    await user.tab();
    await user.tab();
    expect(list()).not.toBeInTheDocument();
  });
});
