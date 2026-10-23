import type { MeResponse } from '@feedback-portal/contracts';
import { Link, useMatches, type StaticDataRouteOption } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useMe } from '../shell/use-me.ts';

const labelOf = (
  crumb: NonNullable<StaticDataRouteOption['crumb']>,
  me: MeResponse | null | undefined,
  loaderData: unknown,
) => (typeof crumb === 'string' ? crumb : me ? crumb({ me, loaderData }) : undefined);

/** Kuat Breadcrumb, built from the matched routes' `staticData.crumb`; the last is the page. */
export const Breadcrumb = () => {
  const me = useMe();
  const crumbs = useMatches().flatMap((match) => {
    const crumb = match.staticData.crumb;
    const label = crumb === undefined ? undefined : labelOf(crumb, me, match.loaderData);
    return label === undefined ? [] : [{ id: match.id, label, to: match.pathname }];
  });

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
