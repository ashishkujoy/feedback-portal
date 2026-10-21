import { Link, useMatches } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';

/** Kuat Breadcrumb, built from the matched routes' `staticData.crumb`; the last is the page. */
export const Breadcrumb = () => {
  const crumbs = useMatches()
    .filter((match) => match.staticData.crumb !== undefined)
    .map((match) => ({ id: match.id, label: match.staticData.crumb, to: match.pathname }));

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={crumb.id} className="flex items-center gap-1.5">
              {last ? (
                <span aria-current="page" className="font-medium text-foreground">
                  {crumb.label}
                </span>
              ) : (
                <>
                  <Link to={crumb.to} className="text-muted-foreground hover:text-foreground">
                    {crumb.label}
                  </Link>
                  <ChevronRight aria-hidden size={14} className="text-(--slate-400)" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
