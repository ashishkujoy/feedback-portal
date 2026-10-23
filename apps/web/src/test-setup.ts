import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom has `<dialog>` but not its modal methods. Just enough for our Dialog: `open` toggles, and
// Escape fires `cancel`, then `close`, as browsers do. (Focus trapping is checked in a browser.)
const showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '');
};

const close = function close(this: HTMLDialogElement) {
  if (!this.open) return;
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};

if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) {
      if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
    }
  });
}
