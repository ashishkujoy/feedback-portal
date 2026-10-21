import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './app.tsx';

describe('App', () => {
  it('renders the placeholder page', () => {
    const { container } = render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Feedback portal' })).toBeVisible();
    expect(screen.getByText('Web app skeleton')).toBeVisible();
    expect(container).toHaveTextContent(/^Feedback portalWeb app skeleton$/);
  });
});
