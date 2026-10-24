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

  it('drops the address of disguised script, data and vbscript links (9.4)', () => {
    const container = html(
      [
        '[a](JaVaScRiPt:alert(1))',
        '[b](&#106;avascript:alert(1))',
        '[c](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
        '[d](vbscript:msgbox(1))',
        '[e](https://example.com/ok)',
      ].join('\n\n'),
    );

    // The text stays, but only the https link keeps an address to follow.
    const links = [...container.querySelectorAll('a')].map((link) => [
      link.textContent,
      link.getAttribute('href'),
    ]);
    expect(links).toEqual([
      ['a', null],
      ['b', null],
      ['c', null],
      ['d', null],
      ['e', 'https://example.com/ok'],
    ]);
  });

  it('never renders iframes, SVG handlers, styles, forms or style attributes (9.4)', () => {
    const container = html(
      [
        '<iframe src="https://example.com"></iframe>',
        '<svg onload="alert(1)"><circle /></svg>',
        '<style>body { display: none }</style>',
        '<form action="https://example.com"><input name="q"></form>',
        '<span style="color: red">styled</span>',
        '*kept*',
      ].join('\n\n'),
    );

    expect(
      container.querySelector('iframe, svg, style, form, input, [style], [onload]'),
    ).toBeNull();
    expect(container.querySelector('em')?.textContent).toBe('kept');
  });

  it('shows images as links, fetching nothing (9.4 decision 2)', () => {
    const container = html(
      '![Diagram](https://example.com/d.png)\n\n![](https://example.com/e.png)\n\n![Bad](javascript:alert(1))',
    );

    expect(container.querySelector('img')).toBeNull();
    const links = [...container.querySelectorAll('a')].map((link) => [
      link.textContent,
      link.getAttribute('href'),
      link.getAttribute('target'),
    ]);
    expect(links).toEqual([
      ['Diagram', 'https://example.com/d.png', '_blank'],
      ['https://example.com/e.png', 'https://example.com/e.png', '_blank'],
    ]);
    expect(container.textContent).toContain('Bad');
  });

  it('renders GitHub-style tables and strikethrough', () => {
    const container = html('| A | B |\n|---|---|\n| 1 | 2 |\n\n~~gone~~');

    expect(container.querySelectorAll('td')).toHaveLength(2);
    expect(container.querySelector('del')?.textContent).toBe('gone');
  });
});
