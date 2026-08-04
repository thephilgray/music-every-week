import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditPrompt } from './EditPrompt';
import * as AuthContext from '../contexts/AuthContext';
import * as ToastContext from '../contexts/ToastContext';
import { getDoc, getDocs } from 'firebase/firestore';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock r2
vi.mock('../lib/r2', () => ({
  uploadToR2: vi.fn(),
}));

// Mock Firebase Firestore
vi.mock('firebase/firestore', () => {
  return {
    getFirestore: vi.fn(),
    doc: vi.fn((_db, collection, id) => ({ path: `${collection}/${id}`, id })),
    collection: vi.fn((_db, path) => ({ path })),
    query: vi.fn((collection, ...args) => ({ collection, args })),
    where: vi.fn((field, op, value) => ({ type: 'where', field, op, value })),
    getDocs: vi.fn(),
    getDoc: vi.fn(),
    updateDoc: vi.fn(),
    setDoc: vi.fn(),
    arrayUnion: vi.fn(),
    serverTimestamp: vi.fn(() => 1234567890),
  };
});

const mockUser = {
  uid: 'admin-uid',
  email: 'admin@example.com',
};

const mockPrompt = {
  id: 'target-prompt-id',
  title: 'Test Prompt',
  description: 'Test Description',
  ownerPub: 'host-uid', // Different from admin-uid
  participants: {},
  createdAt: Date.now(),
};

describe('EditPrompt component', () => {
  const mockSuccess = vi.fn();
  const mockError = vi.fn();
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    
    // Mock Auth
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: mockUser,
      participantEmail: null,
      isAdmin: true,
      logout: vi.fn(),
      loginWithGoogle: vi.fn(),
      sendMagicLink: vi.fn(),
      loading: false,
    } as any);

    // Mock Toast
    vi.spyOn(ToastContext, 'useToast').mockReturnValue({
      success: mockSuccess,
      error: mockError,
    } as any);
  });

  it('filters imported participants correctly when using "submitted" filter', async () => {
    const user = userEvent.setup();

    // 1. Mock getDoc for the import lookup
    (getDoc as any).mockImplementation((docRef: any) => {
      if (docRef.id === 'past-prompt-id') {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            id: 'past-prompt-id',
            title: 'Past Prompt',
            ownerPub: 'host-uid',
            accessList: ['pending@example.com'], // Should NOT be imported if filter is 'submitted'
            participants: {
              'user1-uid': { status: 'accepted', alias: 'User 1' },
              'user2-uid': { status: 'accepted', alias: 'User 2' }, // User 2 submitted
              'host-uid': { status: 'accepted', alias: 'Host' }, // Host should be skipped
            }
          })
        });
      }
      return Promise.resolve({ exists: () => false });
    });

    // 2. Mock getDocs specifically for the submissions query
    (getDocs as any).mockImplementation((q: any) => {
      // Return the mock sessions/requests for initial load
      if (q && q.collection && q.collection.path === 'requests') {
         return Promise.resolve({
            forEach: (cb: any) => {
               cb({
                  exists: () => true,
                  id: 'past-prompt-id',
                  data: () => ({ title: 'Past Prompt', ownerPub: 'host-uid', createdAt: Date.now() })
               });
            }
         });
      }
      if (q && q.collection && q.collection.path === 'sessions') {
         return Promise.resolve({ forEach: () => {} });
      }
      // Return the mock submissions for the submitted filter
      if (q && q.collection && q.collection.path === 'submissions') {
        // Verify it's using the top-level submissions collection with the requestId filter
        expect(q.collection.path).toBe('submissions');
        expect(q.args[0]).toEqual({ type: 'where', field: 'requestId', op: '==', value: 'past-prompt-id' });
        
        return Promise.resolve({
          forEach: (callback: any) => {
            callback({
              data: () => ({
                uploaderUid: 'user2-uid',
                requestId: 'past-prompt-id',
              })
            });
          }
        });
      }
      return Promise.resolve({ forEach: () => {} });
    });

    render(<EditPrompt request={mockPrompt as any} onClose={mockOnClose} onUpdate={mockOnUpdate} />);

    // Click Next to get to Step 2
    const nextButton = screen.getByRole('button', { name: /Next: Participants/i });
    await user.click(nextButton);

    // Verify we are on Step 2
    expect(await screen.findByText(/Step 2 of 2: Participants/i)).toBeInTheDocument();

    // Find the import filter select (has "submitted" option)
    const selects = screen.getAllByRole('combobox');
    const filterSelect = selects.find(s => within(s).queryByRole('option', { name: 'Submitted' })) as HTMLSelectElement;
    await user.selectOptions(filterSelect, 'submitted');

    // Find the import prompt select (has "past-prompt-id" option)
    const importSelect = selects.find(s => within(s).queryByRole('option', { name: 'Past Prompt' })) as HTMLSelectElement;
    await user.selectOptions(importSelect, 'past-prompt-id');

    // Wait for the import to complete and verify the UI updates correctly
    await waitFor(() => {
      // User 2 should be in the list because they submitted
      expect(screen.getByText('User 2')).toBeInTheDocument();
      
      // User 1 should NOT be in the list (didn't submit)
      expect(screen.queryByText('User 1')).not.toBeInTheDocument();
      
      // Host should NOT be in the list (skipped)
      expect(screen.queryByText('Host')).not.toBeInTheDocument();
      
      // pending@example.com is NOT shown in the pending emails tags list.
      expect(screen.queryByText('pending@example.com')).not.toBeInTheDocument();
    });

    // Ensure error toast was NOT called
    expect(mockError).not.toHaveBeenCalled();
  });
});
