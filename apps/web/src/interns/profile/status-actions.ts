import {
  type BatchDetail,
  type InternDetail,
  isFinalStatus,
  type MeResponse,
  type StatusAction,
} from '@feedback-portal/contracts';
import { formatDate } from '../../batches/batch-dates.ts';
import { colourSummary, firstName } from '../profile.ts';

type ButtonVariant = 'primary' | 'outline' | 'ghost-muted' | 'destructive';

/** The header's buttons, in v2's order and variants (P6). */
export const headerButtons: Readonly<
  Record<
    'active' | 'on_notice',
    readonly Readonly<{ action: StatusAction; label: string; variant: ButtonVariant }>[]
  >
> = {
  active: [
    { action: 'withdraw', label: 'Withdraw', variant: 'ghost-muted' },
    { action: 'graduate', label: 'Graduate', variant: 'outline' },
  ],
  on_notice: [
    { action: 'withdraw', label: 'Withdraw', variant: 'ghost-muted' },
    { action: 'terminate', label: 'Terminate', variant: 'destructive' },
    { action: 'lift_notice', label: 'Lift notice', variant: 'outline' },
  ],
};

/**
 * Status changes are the batch's current PM's alone (7.6 decision 1), never in an archived batch
 * (decision 2), and never once the intern is final.
 */
export const statusButtonsFor = (
  me: MeResponse,
  batch: Pick<BatchDetail, 'programManager' | 'isArchived'>,
  intern: Pick<InternDetail, 'status'>,
) =>
  batch.programManager.id !== me.id || batch.isArchived || isFinalStatus(intern.status)
    ? []
    : intern.status === 'on_notice'
      ? headerButtons.on_notice
      : headerButtons.active;

export type DialogCopy = Readonly<{
  title: string;
  description: string;
  points: readonly string[];
  submit: string;
  submitVariant: 'primary' | 'destructive';
  /** "We couldn't …" when the API refuses. */
  failure: string;
}>;

const finalPoints = (status: string) => [
  `The status changes to ${status}. This can't be undone.`,
  'The record becomes read-only.',
];

/** P18–P21, without pronouns: the app can't know an intern's (v2 says "her" and "his"). */
export const dialogCopy = (action: StatusAction, intern: InternDetail): DialogCopy => {
  const first = firstName(intern.name);
  switch (action) {
    case 'lift_notice': {
      const notice = intern.statusEvents.find((event) => event.toStatus === 'on_notice');
      const colour = colourSummary(intern.colorCode);
      return {
        title: `Lift notice for ${intern.name}`,
        description: `${first} returns to Active.`,
        points: [
          notice?.noticeStartsOn
            ? `The notice from ${formatDate(notice.noticeStartsOn)} stays in the status history.`
            : 'The notice stays in the status history.',
          intern.colorCode === null
            ? 'There is no colour code until the first coloured feedback.'
            : `The colour code stays ${colour.label} until new coloured feedback.`,
        ],
        submit: 'Lift notice',
        submitVariant: 'primary',
        failure: "We couldn't lift the notice",
      };
    }
    case 'terminate':
      return {
        title: `Terminate ${intern.name}?`,
        description: `This ends ${first}'s place in the programme.`,
        points: [
          "The status changes to Terminated. This can't be undone.",
          'The record becomes read-only. Feedback and conversations stay visible.',
        ],
        submit: 'Terminate intern',
        submitVariant: 'destructive',
        failure: `We couldn't terminate ${intern.name}`,
      };
    case 'graduate':
      return {
        title: `Graduate ${intern.name}`,
        description: `Use this when ${first} completes the programme.`,
        points: finalPoints('Graduated'),
        submit: 'Graduate',
        submitVariant: 'primary',
        failure: `We couldn't graduate ${intern.name}`,
      };
    case 'withdraw':
      return {
        title: `Withdraw ${intern.name}`,
        description: `Use this when ${first} leaves the programme.`,
        points: finalPoints('Withdrawn'),
        submit: 'Withdraw',
        submitVariant: 'primary',
        failure: `We couldn't withdraw ${intern.name}`,
      };
  }
};
