export interface UserProfile {
  pub: string;
  alias: string;
  displayName?: string; // Mutable Display Name
  bio?: string;
  avatarUrl?: string;
  email?: string;
  location?: string;
  links?: { label: string; url: string }[];
  isAdmin?: boolean;
  isVolunteer?: boolean; // Opt-in for random feedback requests
  isHost?: boolean; // Opt-in to host requests and invite users
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
  accessMode: 'direct' | 'invite' | 'volunteer';
  artworkUrl?: string;
  ownerPub: string;
  hostEmail?: string; // Add hostEmail
  createdAt: number;
  inviteCode?: string; // Reusable invite code
  poolSeats?: number; // Number of open seats for volunteer pool
  allowParticipantSubmissions?: boolean; // If false, only owner can submit
  participants?: Record<string, { 
    status: 'pending' | 'accepted', 
    alias?: string, 
    email?: string,
    extensionHours?: number, // 0, 12, 24, 48
    hasPass?: boolean 
  }>; // Snapshot of participants
  pending_emails?: string[];
  hiddenFromProfile?: boolean;
  playlistLiveDate?: string;
}

export interface Submission {
  id?: string;
  requestId: string;
  audioUrl: string;
  artworkUrl?: string;
  lyrics?: string;
  uploaderPub: string;
  uploaderEmail?: string;
  createdAt: number;
  title: string;
  byline?: string; // Custom artist/project name
  linkProfile?: boolean; // Whether to link to user profile
  collaborators?: Record<string, boolean>; // Map of user public keys
  waveform?: number[];
  hiddenFromProfile?: boolean;
  stage?: string;
  feedbackFocus?: string[];
  usesAI?: boolean;
  proxyFor?: { alias: string, pub?: string };
  fragile?: boolean;
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
  usesAI?: boolean;
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