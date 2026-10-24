import type { InternCounts } from '@feedback-portal/contracts';

/** A batch's counts before anyone is added. */
export const noInternCounts: InternCounts = {
  total: 0,
  onNotice: 0,
  terminated: 0,
  colours: {
    green: 0,
    yellow: 0,
    borderline_yellow: 0,
    orange: 0,
    borderline_red: 0,
    red: 0,
    none: 0,
  },
};
