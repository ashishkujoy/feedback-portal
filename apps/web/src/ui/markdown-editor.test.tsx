import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownEditor } from './markdown-editor.tsx';

type HostProps = Readonly<{
  initial?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}>;

/** The editor bound to state, as a form would bind it, with a label. */
const Host = ({ initial = '', disabled = false, onChange }: HostProps) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="notes">Feedback</label>
      <MarkdownEditor
        id="notes"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        placeholder="What did you observe, and what should change?"
        disabled={disabled}
        invalid
        aria-describedby="notes-message"
        aria-required
      />
      <span id="notes-message">Write your feedback before submitting.</span>
    </>
  );
};

const setUp = (props: HostProps = {}) => {
  const user = userEvent.setup();
  render(<Host {...props} />);
  const textarea = screen.getByRole('textbox', { name: 'Feedback' });
  if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('expected a textarea');
  return { user, textarea };
};

const toolbar = () => within(screen.getByRole('toolbar', { name: 'Formatting' }));

describe('MarkdownEditor', () => {
  it("shows Write, the textarea with the field's state, and v2's toolbar", () => {
    const { textarea } = setUp();

    expect(screen.getByRole('tab', { name: 'Write' })).toHaveAttribute('aria-selected', 'true');
    expect(textarea).toHaveAttribute(
      'placeholder',
      'What did you observe, and what should change?',
    );
    expect(textarea).toHaveAttribute('rows', '6');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAttribute('aria-required', 'true');
    expect(textarea).toHaveAccessibleDescription('Write your feedback before submitting.');
    expect(toolbar().getByText('Markdown')).toBeInTheDocument();
    expect(
      toolbar()
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Bold', 'Italic', 'Heading', 'Bulleted list', 'Code', 'Link']);
  });

  it('types into the field', async () => {
    const onChange = vi.fn<(value: string) => void>();
    const { user, textarea } = setUp({ onChange });

    await user.type(textarea, 'Hi');

    expect(textarea).toHaveValue('Hi');
    expect(onChange).toHaveBeenLastCalledWith('Hi');
  });

  it('formats the selection, keeps focus in the textarea and selects the result', async () => {
    const { user, textarea } = setUp({ initial: 'Closed PAY-214 today' });
    textarea.focus();
    textarea.setSelectionRange(7, 14);

    await user.click(toolbar().getByRole('button', { name: 'Bold' }));

    expect(textarea).toHaveValue('Closed **PAY-214** today');
    expect(textarea).toHaveFocus();
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([9, 16]);

    await user.click(toolbar().getByRole('button', { name: 'Link' }));
    expect(textarea).toHaveValue('Closed **[PAY-214](url)** today');
    expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe('url');
  });

  it('prefixes lines with Heading and Bulleted list', async () => {
    const { user, textarea } = setUp({ initial: 'Keep doing\nAsk early' });
    textarea.focus();
    textarea.setSelectionRange(11, 11);

    await user.click(toolbar().getByRole('button', { name: 'Bulleted list' }));
    textarea.setSelectionRange(0, 0);
    await user.click(toolbar().getByRole('button', { name: 'Heading' }));

    expect(textarea).toHaveValue('### Keep doing\n- Ask early');
  });

  it('takes Ctrl+B and ⌘+I', async () => {
    const { user, textarea } = setUp({ initial: 'one two' });
    textarea.focus();
    textarea.setSelectionRange(0, 3);

    await user.keyboard('{Control>}b{/Control}');
    expect(textarea).toHaveValue('**one** two');

    textarea.setSelectionRange(8, 11);
    await user.keyboard('{Meta>}i{/Meta}');
    expect(textarea).toHaveValue('**one** _two_');
  });

  it('previews the Markdown sanitized, with the toolbar off, and goes back with the arrow keys', async () => {
    const { user, textarea } = setUp({
      initial: '### Summary\n<script>alert(1)</script>\n- **Pairs** often',
    });

    await user.click(screen.getByRole('tab', { name: 'Preview' }));

    const panel = screen.getByRole('tabpanel', { name: 'Preview' });
    expect(within(panel).getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
    expect(within(panel).getByText('Pairs').tagName).toBe('STRONG');
    expect(panel.querySelector('script')).toBeNull();
    expect(textarea).not.toBeVisible();
    for (const button of toolbar().getAllByRole('button')) expect(button).toBeDisabled();

    await user.keyboard('{ArrowLeft}');
    const write = screen.getByRole('tab', { name: 'Write' });
    expect(write).toHaveAttribute('aria-selected', 'true');
    expect(write).toHaveFocus();
    expect(textarea).toBeVisible();
  });

  it('says when there is nothing to preview', async () => {
    const { user } = setUp({ initial: '  \n' });

    await user.click(screen.getByRole('tab', { name: 'Preview' }));

    expect(screen.getByText('Nothing to preview yet.')).toBeInTheDocument();
  });

  it('turns everything off when disabled', () => {
    const { textarea } = setUp({ disabled: true });

    expect(textarea).toBeDisabled();
    for (const button of toolbar().getAllByRole('button')) expect(button).toBeDisabled();
  });
});
