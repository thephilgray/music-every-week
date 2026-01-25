export interface FileRequest {
  id?: string;
  title: string;
  description: string;
  deadline: string;
  visibility: 'public' | 'private';
  artworkUrl?: string;
  ownerPub: string;
  createdAt: number;
  participants?: Record<string, { status: 'pending' | 'accepted' }>;
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
  title: string; // The user might want to name their specific submission different from the Request
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