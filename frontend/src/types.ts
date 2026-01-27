export interface UserProfile {
  pub: string;
  alias: string;
  bio?: string;
  avatarUrl?: string;
  email?: string;
  isAdmin?: boolean;
  submissions?: Record<string, boolean>; // Linked to Submission IDs
  invitedBy?: string; // Pub key of inviter
  invites?: Record<string, boolean>; // List of invited pub keys
  joinedAt?: number;
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
  participants?: Record<string, { 
    status: 'pending' | 'accepted', 
    alias?: string, 
    email?: string,
    extensionHours?: number, // 0, 12, 24, 48
    hasPass?: boolean 
  }>; // Snapshot of participants
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
  byline?: string; // Custom artist/project name
  collaborators?: Record<string, boolean>; // Map of user public keys
  waveform?: number[];
}

export interface Comment {
  id: string;
  text: string;
  authorPub: string;
  createdAt: number;
  audioUrl?: string;
}

export interface Notification {
  id: string;
  type: 'comment' | 'submission' | 'invite';
  message: string;
  link: string;
  fromPub: string;
  createdAt: number;
  read: boolean;
  requestId?: string;
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  ownerPub: string;
  createdAt: number;
  tracks: {
    submissionId: string;
    requestId: string;
    addedAt: number;
    title?: string;
    artist?: string;
  }[];
  artworkUrl?: string;
}