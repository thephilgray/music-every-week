import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePrerequisiteCheck } from './usePrerequisiteCheck';
import type { Prompt } from '../types';

// Mock firebase
vi.mock('../lib/firebase', () => ({
  db: {},
}));

// Mock firestore
const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();
const mockCollection = vi.fn();
const mockQuery = vi.fn();
const mockWhere = vi.fn();
const mockDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
}));

const basePrompt: Prompt = {
  id: 'prompt-1',
  title: 'Test Prompt',
  description: 'desc',
  deadline: '2026-12-01T00:00:00Z',
  accessMode: 'invite',
  ownerPub: 'host-uid',
  createdAt: Date.now(),
};

describe('usePrerequisiteCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReturnValue('mock-query');
    mockCollection.mockReturnValue('mock-collection');
    mockWhere.mockReturnValue('mock-where');
    mockDoc.mockReturnValue('mock-doc-ref');
  });

  it('returns all prompts as eligible when none have prerequisites', async () => {
    const prompts: Prompt[] = [
      { ...basePrompt, id: 'prompt-1' },
      { ...basePrompt, id: 'prompt-2' },
    ];

    const { result } = renderHook(() =>
      usePrerequisiteCheck(prompts, 'user-uid-1', 'user@example.com')
    );

    // No prerequisites → all eligible immediately, no Firestore queries
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.eligibility.get('prompt-1')).toBe(true);
    expect(result.current.eligibility.get('prompt-2')).toBe(true);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('marks user as eligible when they submitted to the prerequisite prompt', async () => {
    const prompts: Prompt[] = [
      { ...basePrompt, id: 'prompt-2', prerequisitePromptId: 'prompt-1' },
    ];

    // Mock: user submitted to prompt-1
    mockGetDocs.mockResolvedValue({
      forEach: (cb: (doc: { data: () => Record<string, unknown> }) => void) => {
        cb({ data: () => ({ requestId: 'prompt-1', uploaderUid: 'user-uid-1' }) });
      },
    });

    // Mock: prerequisite prompt doc (no hasPass)
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ participants: {} }),
    });

    const { result } = renderHook(() =>
      usePrerequisiteCheck(prompts, 'user-uid-1', 'user@example.com')
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.eligibility.get('prompt-2')).toBe(true);
  });

  it('marks user as eligible when they have hasPass on the prerequisite prompt', async () => {
    const prompts: Prompt[] = [
      { ...basePrompt, id: 'prompt-2', prerequisitePromptId: 'prompt-1' },
    ];

    // Mock: user did NOT submit
    mockGetDocs.mockResolvedValue({
      forEach: () => {},
    });

    // Mock: prerequisite prompt has hasPass for user
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        participants: {
          'user-uid-1': { status: 'accepted', hasPass: true },
        },
      }),
    });

    const { result } = renderHook(() =>
      usePrerequisiteCheck(prompts, 'user-uid-1', 'user@example.com')
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.eligibility.get('prompt-2')).toBe(true);
  });

  it('marks user as NOT eligible when they neither submitted nor have a pass', async () => {
    const prompts: Prompt[] = [
      { ...basePrompt, id: 'prompt-2', prerequisitePromptId: 'prompt-1' },
    ];

    // Mock: no submissions
    mockGetDocs.mockResolvedValue({
      forEach: () => {},
    });

    // Mock: no hasPass
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        participants: {
          'user-uid-1': { status: 'accepted', hasPass: false },
        },
      }),
    });

    const { result } = renderHook(() =>
      usePrerequisiteCheck(prompts, 'user-uid-1', 'user@example.com')
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.eligibility.get('prompt-2')).toBe(false);
  });

  it('handles email-based submission matching when uploaderUid is missing', async () => {
    const prompts: Prompt[] = [
      { ...basePrompt, id: 'prompt-2', prerequisitePromptId: 'prompt-1' },
    ];

    // Mock: submission matched by email, not UID
    mockGetDocs.mockResolvedValue({
      forEach: (cb: (doc: { data: () => Record<string, unknown> }) => void) => {
        cb({ data: () => ({ requestId: 'prompt-1', uploaderEmail: 'user@example.com' }) });
      },
    });

    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ participants: {} }),
    });

    const { result } = renderHook(() =>
      usePrerequisiteCheck(prompts, 'user-uid-1', 'user@example.com')
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.eligibility.get('prompt-2')).toBe(true);
  });

  it('returns empty eligibility map when no user is provided', async () => {
    const prompts: Prompt[] = [
      { ...basePrompt, id: 'prompt-2', prerequisitePromptId: 'prompt-1' },
    ];

    const { result } = renderHook(() =>
      usePrerequisiteCheck(prompts, null, null)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // No user → can't check, defaults to not eligible
    expect(result.current.eligibility.get('prompt-2')).toBe(false);
  });

  it('handles multiple prompts with different prerequisites', async () => {
    const prompts: Prompt[] = [
      { ...basePrompt, id: 'prompt-2', prerequisitePromptId: 'prompt-1' },
      { ...basePrompt, id: 'prompt-3', prerequisitePromptId: 'prompt-2' },
      { ...basePrompt, id: 'prompt-4' }, // no prerequisite
    ];

    // Mock submissions: user submitted to prompt-1 but not prompt-2
    mockGetDocs.mockResolvedValue({
      forEach: (cb: (doc: { data: () => Record<string, unknown> }) => void) => {
        cb({ data: () => ({ requestId: 'prompt-1', uploaderUid: 'user-uid-1' }) });
      },
    });

    // Mock doc fetches for prerequisite prompts
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ participants: {} }),
    });

    const { result } = renderHook(() =>
      usePrerequisiteCheck(prompts, 'user-uid-1', 'user@example.com')
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.eligibility.get('prompt-2')).toBe(true);   // submitted to prompt-1
    expect(result.current.eligibility.get('prompt-3')).toBe(false);  // didn't submit to prompt-2
    expect(result.current.eligibility.get('prompt-4')).toBe(true);   // no prerequisite
  });
});
