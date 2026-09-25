import { describe, expect, it } from 'vitest';
import { formatNominatimAddress } from './reverseGeocode';

describe('reverse geocoding address formatting', () => {
  it('prefers neighbourhood and street for civic issue labels', () => {
    expect(formatNominatimAddress({
      address: {
        neighbourhood: 'Bahçelievler Mahallesi',
        road: '142. Sokak',
        city: 'Isparta',
      },
    })).toBe('Bahçelievler Mahallesi · 142. Sokak');
  });

  it('includes a house number when present', () => {
    expect(formatNominatimAddress({
      address: {
        suburb: 'Çünür Mahallesi',
        road: '102. Cadde',
        house_number: '18',
      },
    })).toBe('Çünür Mahallesi · 102. Cadde 18');
  });

  it('falls back to street and city when neighbourhood is unavailable', () => {
    expect(formatNominatimAddress({
      address: {
        road: 'Mimar Sinan Caddesi',
        city: 'Isparta',
      },
    })).toBe('Mimar Sinan Caddesi · Isparta');
  });

  it('uses a compact display-name fallback when structured parts are absent', () => {
    expect(formatNominatimAddress({
      display_name: 'Birinci Bölüm, İkinci Bölüm, Üçüncü Bölüm, Türkiye',
    })).toBe('Birinci Bölüm · İkinci Bölüm');
  });
});
