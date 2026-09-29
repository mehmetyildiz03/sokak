import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  AttributionControl,
  NavigationControl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import { getIssueMapActivity } from '../data/mapActivity';
import type { Issue, MapMode, Point } from '../types';

interface MapViewProps {
  issues: Issue[];
  mode: MapMode;
  focus: (Point & { key: number }) | null;
  selectedIssue: Issue | null;
  followedIssueIds: string[];
  onSelectIssue: (id: string) => void;
  onCenterChange: (point: Point) => void;
}

function setLayerVisibility(map: MapLibreMap, layerId: string, visible: boolean) {
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
}

function applyMapMode(map: MapLibreMap, mode: MapMode) {
  const heatAtAreaLevel = mode === 'heat' && map.getZoom() < 16.5;
  const showIssuePoints = mode === 'issues' || (mode === 'heat' && !heatAtAreaLevel);

  setLayerVisibility(map, 'issue-heat', heatAtAreaLevel);
  setLayerVisibility(map, 'issue-clusters', mode === 'issues');
  setLayerVisibility(map, 'issue-cluster-count', mode === 'issues');
  setLayerVisibility(map, 'issue-halo', showIssuePoints);
  setLayerVisibility(map, 'issue-points', showIssuePoints);
  setLayerVisibility(map, 'issue-recent-report-ring', showIssuePoints);
  setLayerVisibility(map, 'issue-comment-badge', showIssuePoints);
  setLayerVisibility(map, 'issue-comment-count', showIssuePoints);
}

function makeGeoJson(issues: Issue[], followedIssueIds: string[]) {
  const followed = new Set(followedIssueIds);
  const nowMs = Date.now();

  return {
    type: 'FeatureCollection' as const,
    features: issues.map((issue) => {
      const activity = getIssueMapActivity(issue, nowMs);

      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [issue.lng, issue.lat] },
        properties: {
          id: issue.id,
          status: issue.status,
          severity: issue.severity,
          confirms: issue.confirms,
          comments: issue.comments,
          category: issue.category,
          followed: followed.has(issue.id) ? 1 : 0,
          recentReport: activity.recentReport ? 1 : 0,
          recentComment: activity.recentComment ? 1 : 0,
          heatWeight: issue.status === 'Çözüldü' ? 0 : Math.min(
            1,
            (issue.severity / 3) * 0.55 +
            Math.min(0.3, Math.log2(issue.confirms + 1) / 16) +
            (issue.status === 'Uzun süredir açık' ? 0.15 : 0),
          ),
        },
      };
    }),
  };
}

function makeSelectedGeoJson(issue: Issue | null) {
  return {
    type: 'FeatureCollection' as const,
    features: issue ? [{
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [issue.lng, issue.lat] },
      properties: { status: issue.status },
    }] : [],
  };
}

const statusColorExpression = [
  'match',
  ['get', 'status'],
  'Yeni', '#7d8898',
  'Doğrulandı', '#f0a728',
  'Uzun süredir açık', '#de5a45',
  'İşlemde', '#3478c7',
  'Çözüldü', '#2f9d6b',
  '#7d8898',
] satisfies ExpressionSpecification;

export function MapView({
  issues,
  mode,
  focus,
  selectedIssue,
  followedIssueIds,
  onSelectIssue,
  onCenterChange,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectRef = useRef(onSelectIssue);
  const centerRef = useRef(onCenterChange);
  const issuesRef = useRef(issues);
  const followedRef = useRef(followedIssueIds);
  const selectedIssueRef = useRef(selectedIssue);
  const modeRef = useRef(mode);

  useEffect(() => { selectRef.current = onSelectIssue; }, [onSelectIssue]);
  useEffect(() => { centerRef.current = onCenterChange; }, [onCenterChange]);
  useEffect(() => { selectedIssueRef.current = selectedIssue; }, [selectedIssue]);

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
      const data = makeGeoJson(issuesRef.current, followedRef.current);

      map.addSource('issues-clustered', {
        type: 'geojson',
        data,
        cluster: true,
        clusterRadius: 52,
        clusterMaxZoom: 15,
        clusterProperties: {
          followedCount: ['+', ['get', 'followed']],
          longOpenCount: ['+', ['case', ['==', ['get', 'status'], 'Uzun süredir açık'], 1, 0]],
          recentReportCount: ['+', ['get', 'recentReport']],
          recentCommentCount: ['+', ['get', 'recentComment']],
        },
      });

      map.addSource('issues-heat-source', {
        type: 'geojson',
        data,
      });

      map.addSource('selected-issue', {
        type: 'geojson',
        data: makeSelectedGeoJson(selectedIssueRef.current),
      });

      map.addLayer({
        id: 'issue-heat',
        type: 'heatmap',
        source: 'issues-heat-source',
        maxzoom: 22,
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
        id: 'issue-clusters',
        type: 'circle',
        source: 'issues-clustered',
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': ['step', ['get', 'point_count'], 19, 10, 23, 30, 28, 75, 34],
          'circle-color': [
            'case',
            ['>', ['get', 'followedCount'], 0], '#0f4f59',
            ['>', ['get', 'longOpenCount'], 0], '#9b5b45',
            '#145c68',
          ],
          'circle-opacity': 0.92,
          'circle-stroke-width': [
            'case',
            ['>', ['get', 'recentCommentCount'], 0], 5,
            ['>', ['get', 'recentReportCount'], 0], 5,
            ['>', ['get', 'followedCount'], 0], 4,
            3,
          ],
          'circle-stroke-color': [
            'case',
            ['>', ['get', 'recentCommentCount'], 0], '#f0a728',
            ['>', ['get', 'recentReportCount'], 0], '#3bb9b6',
            ['>', ['get', 'followedCount'], 0], '#f6c85f',
            '#ffffff',
          ],
        },
      });

      map.addLayer({
        id: 'issue-cluster-count',
        type: 'symbol',
        source: 'issues-clustered',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
          'text-font': ['Arial', 'Helvetica', 'sans-serif'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,.12)',
          'text-halo-width': 1,
        },
      });

      map.addLayer({
        id: 'issue-halo',
        type: 'circle',
        source: 'issues-clustered',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 19],
          'circle-color': statusColorExpression,
          'circle-opacity': ['case', ['==', ['get', 'followed'], 1], 0.28, 0.18],
          'circle-blur': 0.35,
        },
      });

      map.addLayer({
        id: 'issue-points',
        type: 'circle',
        source: 'issues-clustered',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 6, 16, 9],
          'circle-color': statusColorExpression,
          'circle-stroke-width': ['case', ['==', ['get', 'followed'], 1], 4, 3],
          'circle-stroke-color': ['case', ['==', ['get', 'followed'], 1], '#145c68', '#ffffff'],
        },
      });

      map.addLayer({
        id: 'issue-recent-report-ring',
        type: 'circle',
        source: 'issues-clustered',
        filter: [
          'all',
          ['!', ['has', 'point_count']],
          ['==', ['get', 'recentReport'], 1],
        ],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 16],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#145c68',
          'circle-stroke-opacity': 0.72,
        },
      });

      map.addLayer({
        id: 'issue-comment-badge',
        type: 'circle',
        source: 'issues-clustered',
        filter: [
          'all',
          ['!', ['has', 'point_count']],
          ['>', ['get', 'comments'], 0],
        ],
        paint: {
          'circle-radius': 8,
          'circle-color': [
            'case',
            ['==', ['get', 'recentComment'], 1],
            '#f0a728',
            '#145c68',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-translate': [11, -11],
        },
      });

      map.addLayer({
        id: 'issue-comment-count',
        type: 'symbol',
        source: 'issues-clustered',
        filter: [
          'all',
          ['!', ['has', 'point_count']],
          ['>', ['get', 'comments'], 0],
        ],
        layout: {
          'text-field': ['to-string', ['get', 'comments']],
          'text-size': 9,
          'text-font': ['Arial', 'Helvetica', 'sans-serif'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-translate': [11, -11],
        },
      });

      map.addLayer({
        id: 'selected-issue-halo',
        type: 'circle',
        source: 'selected-issue',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 16, 16, 25],
          'circle-color': '#145c68',
          'circle-opacity': 0.18,
          'circle-blur': 0.25,
        },
      });

      map.addLayer({
        id: 'selected-issue-point',
        type: 'circle',
        source: 'selected-issue',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 8, 16, 12],
          'circle-color': statusColorExpression,
          'circle-stroke-width': 4,
          'circle-stroke-color': '#145c68',
        },
      });

      applyMapMode(map, modeRef.current);

      const selectIssueFromFeature = (event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id as string | undefined;
        if (id) selectRef.current(id);
      };

      map.on('click', 'issue-points', selectIssueFromFeature);
      map.on('click', 'issue-comment-badge', selectIssueFromFeature);
      map.on('click', 'issue-comment-count', selectIssueFromFeature);

      map.on('click', 'issue-clusters', async (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const clusterId = Number(feature?.properties?.cluster_id);
        const coordinates = feature?.geometry?.type === 'Point'
          ? feature.geometry.coordinates
          : null;

        if (!Number.isFinite(clusterId) || !coordinates) return;

        const source = map.getSource('issues-clustered') as GeoJSONSource | undefined;
        if (!source) return;

        try {
          const zoom = await source.getClusterExpansionZoom(clusterId);
          map.easeTo({
            center: [Number(coordinates[0]), Number(coordinates[1])],
            zoom: Math.min(zoom, 17),
            duration: 450,
          });
        } catch {
          // Cluster remains usable even if expansion zoom resolution fails.
        }
      });

      for (const layerId of [
        'issue-points',
        'issue-clusters',
        'issue-comment-badge',
        'issue-comment-count',
      ]) {
        map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
      }
    });

    map.on('moveend', () => {
      const center = map.getCenter();
      centerRef.current({ lng: center.lng, lat: center.lat });
    });
    map.on('zoomend', () => applyMapMode(map, modeRef.current));

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    issuesRef.current = issues;
    followedRef.current = followedIssueIds;

    const map = mapRef.current;
    if (!map) return;

    const data = makeGeoJson(issues, followedIssueIds);
    const clustered = map.getSource('issues-clustered') as GeoJSONSource | undefined;
    const heat = map.getSource('issues-heat-source') as GeoJSONSource | undefined;
    void clustered?.setData(data);
    void heat?.setData(data);
  }, [issues, followedIssueIds]);

  useEffect(() => {
    selectedIssueRef.current = selectedIssue;
    const map = mapRef.current;
    if (!map) return;

    const source = map.getSource('selected-issue') as GeoJSONSource | undefined;
    void source?.setData(makeSelectedGeoJson(selectedIssue));
  }, [selectedIssue]);

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
