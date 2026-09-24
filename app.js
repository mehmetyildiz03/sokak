import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs';

const initialIssues = [
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

let issues = [...initialIssues];
let selectedIssueId = null;
let mapMode = 'issues';
let reportStep = 1;
let reportDraft = {
  lng: 30.5566,
  lat: 37.7648,
  category: null,
  categoryLabel: '',
  emoji: '📍',
  description: '',
  photoUrl: ''
};

const map = new maplibregl.Map({
  container: 'map',
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
        attribution: '© OpenStreetMap katkıda bulunanlar'
      }
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
  }
});

map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

map.on('load', () => {
  map.addSource('issues', {
    type: 'geojson',
    data: makeGeoJson()
  });

  map.addLayer({
    id: 'issue-heat',
    type: 'heatmap',
    source: 'issues',
    maxzoom: 17,
    layout: { visibility: 'none' },
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'severity'], 1, 0.35, 3, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 2],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 22, 16, 50],
      'heatmap-opacity': 0.72,
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(40,107,118,0)', 0.25, '#7fd0c3', 0.5, '#ffd266', 0.75, '#f38b48', 1, '#d9473f']
    }
  });

  map.addLayer({
    id: 'issue-halo',
    type: 'circle',
    source: 'issues',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 19],
      'circle-color': ['match', ['get', 'severity'], 1, '#7d8898', 2, '#f0a728', 3, '#de5a45', '#7d8898'],
      'circle-opacity': 0.18,
      'circle-blur': 0.35
    }
  });

  map.addLayer({
    id: 'issue-points',
    type: 'circle',
    source: 'issues',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 6, 16, 9],
      'circle-color': ['match', ['get', 'severity'], 1, '#7d8898', 2, '#f0a728', 3, '#de5a45', '#7d8898'],
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff'
    }
  });

  map.on('click', 'issue-points', (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    openIssue(feature.properties.id);
  });
  map.on('mouseenter', 'issue-points', () => map.getCanvas().style.cursor = 'pointer');
  map.on('mouseleave', 'issue-points', () => map.getCanvas().style.cursor = '');
});

function makeGeoJson() {
  return {
    type: 'FeatureCollection',
    features: issues.map(issue => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [issue.lng, issue.lat] },
      properties: { ...issue }
    }))
  };
}

function refreshIssues() {
  const source = map.getSource('issues');
  if (source) source.setData(makeGeoJson());
}

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const issueSheet = $('#issueSheet');
const reportModal = $('#reportModal');
const toast = $('#toast');

function openIssue(id) {
  const issue = issues.find(item => item.id === id);
  if (!issue) return;
  selectedIssueId = id;
  $('#issueEmoji').textContent = issue.emoji;
  $('#issueCategory').textContent = issue.categoryLabel;
  $('#issueStatus').textContent = issue.status;
  $('#issueTitle').textContent = issue.title;
  $('#issuePlace').textContent = issue.place;
  $('#issueDescription').textContent = issue.description;
  $('#issueConfirms').textContent = issue.confirms;
  $('#issueComments').textContent = issue.comments;
  $('#issueAge').textContent = issue.age;
  issueSheet.classList.add('open');
  issueSheet.setAttribute('aria-hidden', 'false');
}

function closeIssue() {
  issueSheet.classList.remove('open');
  issueSheet.setAttribute('aria-hidden', 'true');
}

$('#sheetClose').addEventListener('click', closeIssue);
$('#confirmIssueButton').addEventListener('click', () => {
  const issue = issues.find(item => item.id === selectedIssueId);
  if (!issue) return;
  issue.confirms += 1;
  $('#issueConfirms').textContent = issue.confirms;
  showToast('Doğrulaman kaydedildi. Teşekkürler.');
});

$$('.mode-btn').forEach(button => {
  button.addEventListener('click', () => {
    mapMode = button.dataset.mode;
    $$('.mode-btn').forEach(item => item.classList.toggle('active', item === button));
    if (!map.getLayer('issue-heat')) return;
    const heat = mapMode === 'heat';
    map.setLayoutProperty('issue-heat', 'visibility', heat ? 'visible' : 'none');
    map.setLayoutProperty('issue-halo', 'visibility', heat ? 'none' : 'visible');
    map.setLayoutProperty('issue-points', 'visibility', heat ? 'none' : 'visible');
    $('#mapLegend').style.display = heat ? 'none' : '';
  });
});

$('#locationButton').addEventListener('click', useCurrentLocation);
$('#useLocationButton').addEventListener('click', useCurrentLocation);

function useCurrentLocation() {
  if (!navigator.geolocation) {
    showToast('Bu cihaz konum özelliğini desteklemiyor.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      reportDraft.lng = coords.longitude;
      reportDraft.lat = coords.latitude;
      map.flyTo({ center: [coords.longitude, coords.latitude], zoom: 16 });
      $('#selectedLocationText').textContent = `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
      $('#regionLabel').textContent = 'Mevcut konum';
      showToast('Konum seçildi.');
    },
    () => showToast('Konum izni alınamadı; harita merkezi kullanılacak.'),
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

$('#reportButton').addEventListener('click', () => {
  closeIssue();
  const center = map.getCenter();
  reportDraft = { lng: center.lng, lat: center.lat, category: null, categoryLabel: '', emoji: '📍', description: '', photoUrl: '' };
  reportStep = 1;
  $('#reportDescription').value = '';
  $('#charCount').textContent = '0 / 240';
  $('#photoPreview').hidden = true;
  $$('.category-option').forEach(btn => btn.classList.remove('selected'));
  $('#selectedLocationText').textContent = `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
  renderStep();
  reportModal.classList.add('open');
  reportModal.setAttribute('aria-hidden', 'false');
});

$('#reportClose').addEventListener('click', closeReport);
reportModal.addEventListener('click', event => { if (event.target === reportModal) closeReport(); });
function closeReport() {
  reportModal.classList.remove('open');
  reportModal.setAttribute('aria-hidden', 'true');
}

$$('.category-option').forEach(button => {
  button.addEventListener('click', () => {
    $$('.category-option').forEach(btn => btn.classList.remove('selected'));
    button.classList.add('selected');
    reportDraft.category = button.dataset.category;
    reportDraft.categoryLabel = button.dataset.label;
    reportDraft.emoji = button.dataset.emoji;
  });
});

$('#reportDescription').addEventListener('input', event => {
  reportDraft.description = event.target.value.trim();
  $('#charCount').textContent = `${event.target.value.length} / 240`;
});

$('#photoInput').addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  reportDraft.photoUrl = url;
  const preview = $('#photoPreview');
  preview.hidden = false;
  preview.style.backgroundImage = `url("${url}")`;
});

$('#prevStep').addEventListener('click', () => {
  if (reportStep > 1) { reportStep -= 1; renderStep(); }
});

$('#nextStep').addEventListener('click', () => {
  if (reportStep === 2 && !reportDraft.category) {
    showToast('Önce bir sorun kategorisi seç.');
    return;
  }
  if (reportStep === 3) {
    reportDraft.description = $('#reportDescription').value.trim();
    if (reportDraft.description.length < 8) {
      showToast('Sorunu birkaç kelimeyle daha net anlat.');
      return;
    }
  }
  if (reportStep < 4) {
    reportStep += 1;
    renderStep();
  } else {
    submitReport();
  }
});

function renderStep() {
  $$('.report-step').forEach(section => section.classList.toggle('active', Number(section.dataset.step) === reportStep));
  const titles = ['Sorun nerede?', 'Ne tür bir sorun?', 'Ne oluyor?', 'Kontrol et ve gönder'];
  $('#stepLabel').textContent = `${reportStep} / 4`;
  $('#reportTitle').textContent = titles[reportStep - 1];
  $('#stepProgress').style.width = `${reportStep * 25}%`;
  $('#prevStep').disabled = reportStep === 1;
  $('#nextStep').textContent = reportStep === 4 ? 'Bildirimi gönder' : 'Devam';
  if (reportStep === 4) {
    $('#reviewEmoji').textContent = reportDraft.emoji;
    $('#reviewCategory').textContent = reportDraft.categoryLabel || 'Kategori seçilmedi';
    $('#reviewDescription').textContent = reportDraft.description || 'Açıklama eklenmedi.';
    $('#similarWarning').hidden = !hasSimilarNearbyIssue();
  }
}

function hasSimilarNearbyIssue() {
  if (!reportDraft.category) return false;
  return issues.some(issue => issue.category === reportDraft.category && distanceMeters(issue.lat, issue.lng, reportDraft.lat, reportDraft.lng) < 160);
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp/2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function submitReport() {
  const issue = {
    id: `iss-${Date.now()}`,
    lng: reportDraft.lng,
    lat: reportDraft.lat,
    category: reportDraft.category,
    categoryLabel: reportDraft.categoryLabel,
    emoji: reportDraft.emoji,
    title: reportDraft.description.length > 44 ? `${reportDraft.description.slice(0, 44)}…` : reportDraft.description,
    place: 'Yeni bildirilen konum',
    description: reportDraft.description,
    confirms: 1,
    comments: 0,
    age: 'şimdi',
    severity: 1,
    status: 'Yeni'
  };
  issues = [issue, ...issues];
  refreshIssues();
  closeReport();
  map.flyTo({ center: [issue.lng, issue.lat], zoom: 16.5 });
  setTimeout(() => openIssue(issue.id), 450);
  showToast('Bildirim haritaya eklendi.');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

$('#notificationsButton').addEventListener('click', () => showToast('Bildirim merkezi sonraki sürümde bağlanacak.'));
$('#cityButton').addEventListener('click', () => showToast('Bölge seçici sonraki sürümde eklenecek.'));

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
