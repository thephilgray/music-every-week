export interface UserProfile {
  pub: string;
  alias: string;
  bio?: string;
  avatarUrl?: string;
  email?: string;
  isAdmin?: boolean;
  submissions?: Record<string, boolean>; // Linked to Submission IDs
}

export interface FileRequest {
  id?: string;
  title: string;
  description: string;
  deadline: string;
  visibility: 'public' | 'private';
  artworkUrl?: string;
  ownerPub: string;
  createdAt: number;
  participants?: Record<string, { status: 'pending' | 'accepted', alias?: string, email?: string }>; // Snapshot of participants
  pending_emails?: string[];
}

export interface Submission {
  id?: string;
  requestId: string;
  audioUrl: string;
  artworkUrl?: string;
  lyrics?: string;
  uploaderPub: string;
  createdAt: number;
  title: string;
  collaborators?: Record<string, boolean>; // Map of user public keys
}

export interface Comment {
  id: string;
  text: string;
  authorPub: string;
  createdAt: number;
}

export interface Notification {
  id: string;
  type: 'comment' | 'submission' | 'invite';
  message: string;
  link: string;
  fromPub: string;
  createdAt: number;
  read: boolean;
}