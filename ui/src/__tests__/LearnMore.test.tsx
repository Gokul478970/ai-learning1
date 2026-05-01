import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LearnMore from '../pages/LearnMore';

describe('LearnMore page', () => {
  it('renders all four sections', () => {
    render(
      <MemoryRouter>
        <LearnMore />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /project overview/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /key features/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /how it works/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /benefits/i })).toBeTruthy();
  });

  it('renders Back to Home link pointing to /', () => {
    render(
      <MemoryRouter>
        <LearnMore />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /back to home/i });
    expect(link.getAttribute('href')).toBe('/');
  });
});
