import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { AttributionControl, NavigationControl, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import type { Issue, MapMode, Point } from '../types';

interface MapViewProps {
  issues: Issue[];
  mode: MapMode;
  focus: (Point & { key: number }) | null;
  onSelectIssue: (id: string) => void;
  onCenterChange: (point: Point) => void;
}

function applyMapMode(map: MapLibreMap, mode: MapMode) {
  if (!map.getLayer('issue-heat')) return;
  const heat = mode === 'heat';
  map.setLayoutProperty('issue-heat', 'visibility', heat ? 'visible' : 'none');
  map.setLayoutProperty('issue-halo', 'visibility', heat ? 'none' : 'visible');
  map.setLayoutProperty('issue-points', 'visibility', heat ? 'none' : 'visible');
}

function makeGeoJson(issues: Issue[]) {
  return {
    type: 'FeatureCollection' as const,
    features: issues.map((issue) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [issue.lng, issue.lat] },
      properties: {
        id: issue.id,
        status: issue.status,
        severity: issue.severity,
        confirms: issue.confirms,
        category: issue.category,
        heatWeight: Math.min(
          1,
          (issue.severity / 3) * 0.55 +
          Math.min(0.3, Math.log2(issue.confirms + 1) / 16) +
          (issue.status === 'Uzun süredir açık' ? 0.15 : 0),
        ),
      },
    })),
  };
}

export function MapView({ issues, mode, focus, onSelectIssue, onCenterChange }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectRef = useRef(onSelectIssue);
  const centerRef = useRef(onCenterChange);
  const issuesRef = useRef(issues);
  const modeRef = useRef(mode);

  useEffect(() => { selectRef.current = onSelectIssue; }, [onSelectIssue]);
  useEffect(() => { centerRef.current = onCenterChange; }, [onCenterChange]);
  useEffect(() => { issuesRef.current = issues; }, [issues]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [30.5566, 37.7648],
      zoom: 14.2,
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

    map.addControl(new AttributionControl({ compact: true }), 'bottom-left');
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      map.addSource('issues', { type: 'geojson', data: makeGeoJson(issuesRef.current) });
      map.addLayer({
        id: 'issue-heat',
        type: 'heatmap',
        source: 'issues',
        maxzoom: 17,
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': ['get', 'heatWeight'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 2],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 22, 16, 50],
          'heatmap-opacity': 0.72,
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(40,107,118,0)', 0.25, '#7fd0c3', 0.5, '#ffd266', 0.75, '#f38b48', 1, '#d9473f'],
        },
      });
      map.addLayer({
        id: 'issue-halo',
        type: 'circle',
        source: 'issues',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 19],
          'circle-color': ['match', ['get', 'status'], 'Yeni', '#7d8898', 'Doğrulandı', '#f0a728', 'Uzun süredir açık', '#de5a45', 'İşlemde', '#3478c7', 'Çözüldü', '#2f9d6b', '#7d8898'],
          'circle-opacity': 0.18,
          'circle-blur': 0.35,
        },
      });
      map.addLayer({
        id: 'issue-points',
        type: 'circle',
        source: 'issues',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 6, 16, 9],
          'circle-color': ['match', ['get', 'status'], 'Yeni', '#7d8898', 'Doğrulandı', '#f0a728', 'Uzun süredir açık', '#de5a45', 'İşlemde', '#3478c7', 'Çözüldü', '#2f9d6b', '#7d8898'],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });

      applyMapMode(map, modeRef.current);

      map.on('click', 'issue-points', (event: any) => {
        const id = event.features?.[0]?.properties?.id as string | undefined;
        if (id) selectRef.current(id);
      });
      map.on('mouseenter', 'issue-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'issue-points', () => { map.getCanvas().style.cursor = ''; });
    });

    map.on('moveend', () => {
      const center = map.getCenter();
      centerRef.current({ lng: center.lng, lat: center.lat });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    issuesRef.current = issues;
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('issues') as GeoJSONSource | undefined;
    source?.setData(makeGeoJson(issues));
  }, [issues]);

  useEffect(() => {
    modeRef.current = mode;
    const map = mapRef.current;
    if (!map) return;
    applyMapMode(map, mode);
  }, [mode]);

  useEffect(() => {
    if (!focus || !mapRef.current) return;
    mapRef.current.flyTo({ center: [focus.lng, focus.lat], zoom: 16, essential: true });
  }, [focus]);

  return <div ref={containerRef} className="map" aria-label="Şehir sorun haritası" />;
}
