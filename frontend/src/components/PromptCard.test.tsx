import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PromptCard } from './PromptCard';
import type { Prompt } from '../types';

const mockRequest: Prompt = {
  id: 'req-123',
  title: 'Summer Electronic Session #1',
  description: 'Create a synthwave track at 120 BPM.',
  deadline: new Date('2026-08-01T23:59:59Z').toISOString(),
  createdAt: Date.now(),
  accessMode: 'direct',
  ownerPub: 'host-uid-1',
  hostEmail: 'host@example.com',
  playlistId: 'playlist-123',
  participants: {},
};

describe('PromptCard component', () => {
  it('should render title and description correctly', () => {
    render(
      <MemoryRouter>
        <PromptCard request={mockRequest} isClosed={false} />
      </MemoryRouter>
    );

    expect(screen.getByText('Summer Electronic Session #1')).toBeInTheDocument();
    expect(screen.getByText('Create a synthwave track at 120 BPM.')).toBeInTheDocument();
  });

  it('should link to the correct prompt detail page', () => {
    render(
      <MemoryRouter>
        <PromptCard request={mockRequest} isClosed={false} />
      </MemoryRouter>
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/prompt/req-123');
  });

  it('should display PUBLIC badge when accessMode is direct', () => {
    render(
      <MemoryRouter>
        <PromptCard request={mockRequest} isClosed={false} />
      </MemoryRouter>
    );

    expect(screen.getByText('PUBLIC')).toBeInTheDocument();
  });

  it('should display PRIVATE badge when accessMode is invite', () => {
    const inviteRequest: Prompt = { ...mockRequest, accessMode: 'invite' };
    render(
      <MemoryRouter>
        <PromptCard request={inviteRequest} isClosed={false} />
      </MemoryRouter>
    );

    expect(screen.getByText('PRIVATE')).toBeInTheDocument();
  });

  it('should display CLOSED badge and Ended status when isClosed is true', () => {
    render(
      <MemoryRouter>
        <PromptCard request={mockRequest} isClosed={true} />
      </MemoryRouter>
    );

    expect(screen.getByText('CLOSED')).toBeInTheDocument();
    expect(screen.getByText(/Ended:/i)).toBeInTheDocument();
  });

  it('should render fallback No Artwork text when artworkUrl is missing', () => {
    render(
      <MemoryRouter>
        <PromptCard request={mockRequest} isClosed={false} />
      </MemoryRouter>
    );

    expect(screen.getByText('No Artwork')).toBeInTheDocument();
  });
});
