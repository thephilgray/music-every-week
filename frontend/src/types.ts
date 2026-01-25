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
