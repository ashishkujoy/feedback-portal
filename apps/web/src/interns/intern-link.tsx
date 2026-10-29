import type { InternSummary } from '@feedback-portal/contracts';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';

/** The intern's name as a link to their profile (7.5). Only the name is a link, so nothing nests. */
export const InternLink = ({
  intern,
  className,
}: Readonly<{ intern: Pick<InternSummary, 'id' | 'batchId' | 'name'>; className: string }>) => {
  const params = useMemo(
    () => ({ batchId: intern.batchId, internId: intern.id }),
    [intern.batchId, intern.id],
  );
  return (
    <Link
      to="/batches/$batchId/interns/$internId"
      params={params}
      className={`${className} hover:underline focus-visible:underline focus-visible:outline-none`}
    >
      {intern.name}
    </Link>
  );
};

/** The same link from plain values, so list rows don't build an object each render. */
export const InternNameLink = ({
  batchId,
  internId,
  name,
}: Readonly<{ batchId: string; internId: string; name: string }>) => {
  const intern = useMemo(() => ({ id: internId, batchId, name }), [internId, batchId, name]);
  return <InternLink intern={intern} className="text-sm font-medium" />;
};
