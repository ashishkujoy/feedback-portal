import { Link } from '@tanstack/react-router';
import { PageTitle } from '../ui/page-title.tsx';

/** The design has no 404 screen: the page-title style plus a way back. */
export const NotFoundPage = () => (
  <>
    <PageTitle>Page not found</PageTitle>
    <p className="text-muted-foreground">
      This page doesn't exist.{' '}
      <Link to="/batches" className="text-link underline-offset-4 hover:underline">
        Go to batches
      </Link>
    </p>
  </>
);
