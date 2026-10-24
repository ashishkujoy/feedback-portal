import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './markdown.tsx';

const html = (source: string) => render(<Markdown>{source}</Markdown>).container;

describe('Markdown', () => {
  it('renders headings, lists, emphasis, code and links', () => {
    const container = html(
      '### Technical round\n- Solved it **tests first**\n- Used `reduce`\n\n[Repo](https://example.com)',
    );

    expect(container.querySelector('h3')?.textContent).toBe('Technical round');
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Solved it tests first',
      'Used reduce',
    ]);
    expect(container.querySelector('strong')?.textContent).toBe('tests first');
    expect(container.querySelector('code')?.textContent).toBe('reduce');
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('never renders raw HTML, scripts, event handlers or javascript: links', () => {
    const container = html(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<b onclick="alert(1)">bold</b>\n\n[click](javascript:alert(1))',
    );

    expect(container.querySelector('script, img, b, [onclick], [onerror]')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
  });

  it('renders GitHub-style tables and strikethrough', () => {
    const container = html('| A | B |\n|---|---|\n| 1 | 2 |\n\n~~gone~~');

    expect(container.querySelectorAll('td')).toHaveLength(2);
    expect(container.querySelector('del')?.textContent).toBe('gone');
  });
});
