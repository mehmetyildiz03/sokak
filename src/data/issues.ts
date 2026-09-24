import type { Issue } from '../types';

export const initialIssues: Issue[] = [
  {
    id: 'iss-1', lng: 30.5525, lat: 37.7670, category: 'road', categoryLabel: 'Yol / Asfalt', emoji: '🕳️',
    title: 'Yolda büyük çukur', place: 'Bahçelievler · 142. Sokak', description: 'Araçlar çukurdan kaçmak için karşı şeride geçiyor.', confirms: 18, comments: 6, age: '4 gün', severity: 2, status: 'Doğrulandı'
  },
  {
    id: 'iss-2', lng: 30.5587, lat: 37.7654, category: 'light', categoryLabel: 'Aydınlatma', emoji: '💡',
    title: 'Sokak lambası çalışmıyor', place: 'Merkez · 119. Cadde', description: 'İki direk geceleri yanmıyor ve yaya geçidi karanlık kalıyor.', confirms: 9, comments: 2, age: '2 gün', severity: 2, status: 'Doğrulandı'
  },
  {
    id: 'iss-3', lng: 30.5489, lat: 37.7609, category: 'trash', categoryLabel: 'Çöp / Temizlik', emoji: '🗑️',
    title: 'Konteyner çevresinde birikme', place: 'Örnek Mahalle · Pazar yanı', description: 'Konteyner dolu ve çevresinde atık birikmiş durumda.', confirms: 27, comments: 11, age: '9 gün', severity: 3, status: 'Uzun süredir açık'
  },
  {
    id: 'iss-4', lng: 30.5630, lat: 37.7707, category: 'sidewalk', categoryLabel: 'Kaldırım', emoji: '🚧',
    title: 'Kaldırım taşı çökmüş', place: 'Merkez · Okul önü', description: 'Yürürken takılma riski oluşturuyor.', confirms: 5, comments: 1, age: '8 saat', severity: 1, status: 'Yeni'
  },
  {
    id: 'iss-5', lng: 30.5458, lat: 37.7726, category: 'water', categoryLabel: 'Su / Kanalizasyon', emoji: '💧',
    title: 'Yolda sürekli su birikiyor', place: 'Örnek Mahalle · Alt geçit', description: 'Yağmur sonrası su uzun süre çekilmiyor ve yaya geçişini kapatıyor.', confirms: 14, comments: 4, age: '6 gün', severity: 2, status: 'Doğrulandı'
  }
];
