import { Breadcrumb } from '../ui/breadcrumb.tsx';

/** 56px bar over the content: the breadcrumb now; "Viewing as <role>" joins it in 4.4. */
export const TopBar = () => (
  <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-7">
    <Breadcrumb />
  </header>
);
