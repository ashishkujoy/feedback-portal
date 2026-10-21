import { Breadcrumb } from '../ui/breadcrumb.tsx';
import { ViewingAs } from './viewing-as.tsx';

/** 56px bar over the content: the breadcrumb, and "Viewing as <role>" once signed in. */
export const TopBar = () => (
  <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-7">
    <Breadcrumb />
    <ViewingAs />
  </header>
);
