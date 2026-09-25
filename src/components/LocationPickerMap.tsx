import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { AttributionControl, type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import type { Point } from '../types';

interface LocationPickerMapProps {
  point: Point;
  onChange: (point: Point) => void;
}

export function LocationPickerMap({ point, onChange }: LocationPickerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const changeRef = useRef(onChange);

  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [point.lng, point.lat],
      zoom: 17,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap katkıda bulunanlar</a>',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
    });

    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

    const markerElement = document.createElement('div');
    markerElement.className = 'report-location-marker';
    markerElement.setAttribute('role', 'img');
    markerElement.setAttribute('aria-label', 'Seçili bildirim konumu');

    const marker = new maplibregl.Marker({
      element: markerElement,
      draggable: true,
      anchor: 'bottom',
    })
      .setLngLat([point.lng, point.lat])
      .addTo(map);

    marker.on('dragend', () => {
      const next = marker.getLngLat();
      changeRef.current({ lng: next.lng, lat: next.lat });
    });

    map.on('click', (event) => {
      const next = { lng: event.lngLat.lng, lat: event.lngLat.lat };
      marker.setLngLat([next.lng, next.lat]);
      changeRef.current(next);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      marker.remove();
      map.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    const current = marker.getLngLat();
    const moved = Math.abs(current.lng - point.lng) > 0.000001 || Math.abs(current.lat - point.lat) > 0.000001;

    if (moved) {
      marker.setLngLat([point.lng, point.lat]);
      map.easeTo({ center: [point.lng, point.lat], duration: 350 });
    }
  }, [point.lat, point.lng]);

  return (
    <div className="report-location-map-wrap">
      <div
        ref={containerRef}
        className="report-location-map"
        aria-label="Bildirim konumu seçme haritası"
      />
      <div className="location-map-hint" aria-hidden="true">Pini sürükle veya haritada bir noktaya dokun</div>
    </div>
  );
}
