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
