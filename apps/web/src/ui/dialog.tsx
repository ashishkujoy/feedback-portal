import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef } from 'react';

type DialogProps = Readonly<{
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** The panel's max width as a Tailwind class (Kuat's default is 460px). */
  widthClass?: string;
  /** Rendered only while open, so a form inside starts fresh each time. */
  children: ReactNode;
}>;

/**
 * Kuat Dialog on a native `<dialog>` opened with `showModal()`: the browser traps focus, closes
 * it on Escape and makes the page behind inert. Clicking the overlay closes it too, and focus
 * goes back to whatever had it before (usually the button that opened it).
 */
export const Dialog = ({
  open,
  onClose,
  title,
  description,
  widthClass = 'max-w-[460px]',
  children,
}: DialogProps) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return undefined;
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open]);

  // The overlay: the panel fills the dialog, so a click on the dialog itself is on the backdrop.
  // (A listener, not `onClick`: Escape, handled by the browser, is the keyboard equivalent.)
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    const onBackdropClick = (event: MouseEvent) => {
      if (event.target === dialog) onClose();
    };
    dialog.addEventListener('click', onBackdropClick);
    return () => dialog.removeEventListener('click', onBackdropClick);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      className={`m-auto w-[calc(100%-48px)] ${widthClass} border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-[color-mix(in_srgb,var(--slate-900)_55%,transparent)]`}
    >
      {open ? (
        <>
          <div className="flex items-start justify-between gap-3 px-[22px] pt-5">
            <div>
              <h2 id={titleId} className="text-xl leading-6 font-semibold">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-sm leading-normal text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="-mr-1 inline-flex cursor-pointer rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_35%,transparent)] focus-visible:outline-none"
            >
              <X aria-hidden size={18} strokeWidth={2} />
            </button>
          </div>
          <div className="px-[22px] pt-4 pb-[22px] text-sm">{children}</div>
        </>
      ) : null}
    </dialog>
  );
};
