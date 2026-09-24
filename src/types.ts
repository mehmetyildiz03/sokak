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
  age: string;
  severity: 1 | 2 | 3;
  status: IssueStatus;
}

export interface ReportDraft extends Point {
  category: IssueCategory | null;
  categoryLabel: string;
  emoji: string;
  description: string;
  photoUrl: string;
}
