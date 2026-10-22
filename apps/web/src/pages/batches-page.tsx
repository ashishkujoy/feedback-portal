import { batchesLabel } from '../identity/roles.ts';
import { useMe } from '../shell/use-me.ts';
import { PageTitle } from '../ui/page-title.tsx';

export const BatchesPage = () => {
  const me = useMe();
  return <PageTitle>{me ? batchesLabel(me) : 'Batches'}</PageTitle>;
};
