import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ParticipantAuth } from './ParticipantAuth';
import * as AuthContext from '../contexts/AuthContext';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('ParticipantAuth component', () => {
  const mockSendMagicLink = vi.fn();
  const mockLoginWithGoogle = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    (AuthContext.useAuth as any).mockReturnValue({
      sendMagicLink: mockSendMagicLink,
      loginWithGoogle: mockLoginWithGoogle,
    });
  });

  it('should render sign in form with email input and buttons', () => {
    render(<ParticipantAuth />);

    expect(screen.getByText('Member Access')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send magic link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  it('should display error when submitting with an invalid email address', async () => {
    render(<ParticipantAuth />);

    const input = screen.getByPlaceholderText('you@example.com');
    const submitBtn = screen.getByRole('button', { name: /send magic link/i });

    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.submit(submitBtn.closest('form')!);

    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument();
    expect(mockSendMagicLink).not.toHaveBeenCalled();
  });

  it('should call sendMagicLink and display confirmation view when valid email is submitted', async () => {
    mockSendMagicLink.mockResolvedValue(undefined);
    render(<ParticipantAuth />);

    const input = screen.getByPlaceholderText('you@example.com');
    const submitBtn = screen.getByRole('button', { name: /send magic link/i });

    fireEvent.change(input, { target: { value: 'user@example.com' } });
    fireEvent.submit(submitBtn.closest('form')!);

    await waitFor(() => {
      expect(mockSendMagicLink).toHaveBeenCalledWith('user@example.com');
    });

    expect(await screen.findByText('Check Your Email')).toBeInTheDocument();
    expect(screen.getByText(/We've sent a magic link to/i)).toBeInTheDocument();
  });

  it('should call loginWithGoogle when Google sign in button is clicked', async () => {
    mockLoginWithGoogle.mockResolvedValue(undefined);
    render(<ParticipantAuth />);

    const googleBtn = screen.getByRole('button', { name: /sign in with google/i });
    fireEvent.click(googleBtn);

    await waitFor(() => {
      expect(mockLoginWithGoogle).toHaveBeenCalledTimes(1);
    });
  });
});
