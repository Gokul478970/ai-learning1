import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../pages/Landing';

describe('Landing page', () => {
  it('renders Get Started and Learn More buttons', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /get started/i })).toBeTruthy();
    const learnMore = screen.getByRole('link', { name: /learn more/i });
    expect(learnMore.getAttribute('href')).toBe('/learn-more');
  });
});
