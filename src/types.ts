export type IssueCategory = 'road' | 'light' | 'trash' | 'sidewalk' | 'water' | 'park';
export type IssueStatus = 'Yeni' | 'Doğrulandı' | 'Uzun süredir açık' | 'İşlemde' | 'Çözüldü';
export type MapMode = 'issues' | 'heat';

export interface Point {
  lng: number;
  lat: number;
}

export interface Issue extends Point {
  id: string;
  category: IssueCategory;
  categoryLabel: string;
  emoji: string;
  title: string;
  place: string;
  description: string;
  confirms: number;
  comments: number;
  lastCommentAt?: string;
  age: string;
  severity: 1 | 2 | 3;
  status: IssueStatus;
  photoUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReportDraft extends Point {
  category: IssueCategory | null;
  categoryLabel: string;
  emoji: string;
  place: string;
  description: string;
  photoUrl: string;
}

export type ResolutionFeedbackValue = 'resolved' | 'still_open';

export interface IssueComment {
  id: string;
  issueId: string;
  authorLabel: string;
  body: string;
  createdAt: string;
}

export interface ResolutionFeedbackSummary {
  resolvedCount: number;
  stillOpenCount: number;
  myFeedback: ResolutionFeedbackValue | null;
}

export interface IssueCommunitySnapshot {
  comments: IssueComment[];
  resolution: ResolutionFeedbackSummary;
}

export interface UserProfileStats {
  reports: number;
  confirmations: number;
  comments: number;
  follows: number;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  role: 'citizen' | 'moderator' | 'official' | 'admin';
  createdAt: string;
  stats: UserProfileStats;
}


export interface IssueHistoryEvent {
  id: string;
  fromStatus: IssueStatus | null;
  toStatus: IssueStatus;
  actorType: 'system' | 'citizen' | 'official' | 'moderator';
  actorLabel?: string | null;
  note: string | null;
  createdAt: string;
}


export interface IssueAuthority {
  id: string;
  name: string;
  slug: string;
  kind: 'municipality' | 'utility' | 'other';
  verifiedAt: string;
  assignedAt: string;
  canUpdateStatus: boolean;
}
