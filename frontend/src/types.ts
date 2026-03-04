import { FieldValue } from 'firebase/firestore'; // Added import

export interface UserProfile {
  uid: string; // Changed from pub
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
  updatedAt?: FieldValue;
  deleted?: boolean;
  points?: number; // Gamification points
  settings?: {
    privacy?: {
      acceptUnsolicited?: boolean;
      showRequestsOnProfile?: boolean;
      showSubmissionsOnProfile?: boolean;
    };
    content?: {
      filterAI?: boolean;
    };
  };
  contacts?: string[];
}

export interface FileRequest {
  id?: string;
  title: string;
  description: string;
  deadline: string;
  accessMode: 'direct' | 'invite' | 'volunteer' | 'public'; // Added 'public' if needed, or map 'direct' to public
  artworkUrl?: string;
  ownerPub: string; // Changed from ownerUid to match existing data in some places
  hostEmail?: string; // Add hostEmail
  accessList?: string[]; // List of allowed emails
  createdAt: number | FieldValue; // Changed type
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
  hiddenFromProfile?: boolean;
  playlistLiveDate?: string;
  playlistId?: string; // Linked playlist
  previewTrackCount?: number; // Number of tracks visible to submitters before deadline
  deleted?: boolean;
  updatedAt?: number | FieldValue; // Changed type
}

export interface Submission {
  id?: string;
  requestId: string;
  playlistId?: string;
  audioUrl: string;
  artworkUrl?: string;
  lyrics?: string;
  originalUploaderPub: string; // Changed from uploaderUid to match Firestore field
  uploaderEmail?: string;
  uploaderUid?: string; // Firebase UID of uploader
  createdAt: number | FieldValue; // Changed type
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
  authorUid?: string; // Changed from authorPub - Assuming consistency
  authorEmail: string; // Added for Firestore
  createdAt: number | FieldValue; // Changed type
  audioUrl?: string;
  userProfile?: {
      displayName?: string;
      avatarUrl?: string;
  };
  requestId?: string;
  submissionId?: string;
  reactions?: Record<string, 'heart' | '+1'>; // user UID or Email -> reaction type
}

export interface Notification {
  id?: string;
  type: 'comment' | 'submission' | 'invite' | 'mention' | 'bug' | 'collaborator';
  message: string;
  link: string;
  fromUid: string; // Changed from fromPub
  fromName?: string; // Sender's display name (snapshot)
  fromEmail?: string; // Sender's email
  createdAt: number | FieldValue; // Changed type
  read: boolean;
  requestId?: string;
  usesAI?: boolean;
  recipientEmail?: string;
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  ownerPub: string; // Changed from ownerUid to match existing data in some places
  createdAt: number | FieldValue; // Changed type
  tracks: {
    submissionId: string;
    requestId: string;
    addedAt: number;
    title?: string;
    artist?: string;
  }[];
  artworkUrl?: string;
  accessList?: string[];
  accessMode?: 'public' | 'private';
  requestId?: string;
}