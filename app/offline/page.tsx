import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Offline Climbs',
  description: 'Open climbs you saved for offline viewing.',
  robots: {
    index: false,
    follow: false,
  },
}

const offlinePageScript = `
(function () {
  const DB_NAME = 'keyval-store';
  const STORE_NAME = 'keyval';
  const PACK_RECORDS_KEY = 'offline-pack-records';
  const LEGACY_PACKS_KEY = 'offline-climb-packs';

  const listEl = document.getElementById('offline-pack-list');
  const emptyEl = document.getElementById('offline-empty');
  const subtitleEl = document.getElementById('offline-subtitle');

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderPacks(packs) {
    if (!listEl || !emptyEl || !subtitleEl) return;

    if (!packs.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      subtitleEl.textContent = 'No saved offline packs found on this device yet.';
      return;
    }

    emptyEl.hidden = true;
    subtitleEl.textContent = packs.length === 1
      ? '1 offline pack is ready to open.'
      : packs.length + ' offline packs are ready to open.';

    listEl.innerHTML = packs.map(function (pack) {
      const href = pack.canonicalPath || (pack.type === 'crag' ? '/crag/' + encodeURIComponent(pack.entityId) : '/climb/' + encodeURIComponent(pack.entityId));
      const meta = pack.type === 'crag'
        ? (Number(pack.mediaCount || 0) + ' photos across saved climbs')
        : (Number(pack.mediaCount || 0) + ' photos');
      return [
        '<a href="' + href + '" class="block rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-800">',
        '<div class="flex items-start justify-between gap-4">',
        '<div>',
        '<p class="text-base font-semibold text-gray-900 dark:text-gray-100">' + escapeHtml(pack.displayName || 'Saved pack') + '</p>',
        '<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">' + escapeHtml(href) + '</p>',
        '</div>',
        '<span class="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">' + escapeHtml(pack.type === 'crag' ? 'Crag pack' : 'Climb pack') + '</span>',
        '</div>',
        '<div class="mt-3 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">',
        '<span>' + meta + '</span>',
        '<span>' + formatBytes(Number(pack.estimatedBytes || 0)) + '</span>',
        '</div>',
        '</a>'
      ].join('');
    }).join('');
  }

  function loadPacks() {
    if (!('indexedDB' in window)) {
      renderPacks([]);
      return;
    }

    const request = indexedDB.open(DB_NAME);
    request.onerror = function () {
      renderPacks([]);
    };
    request.onsuccess = function () {
      const db = request.result;
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(PACK_RECORDS_KEY);

      getRequest.onerror = function () {
        renderPacks([]);
      };

      getRequest.onsuccess = function () {
        const raw = getRequest.result;
        const packs = raw && typeof raw === 'object'
          ? Object.values(raw).sort(function (a, b) {
              return String(a.displayName || '').localeCompare(String(b.displayName || ''));
            })
          : [];
        if (packs.length > 0) {
          renderPacks(packs);
          return;
        }

        const legacyRequest = store.get(LEGACY_PACKS_KEY);
        legacyRequest.onerror = function () {
          renderPacks([]);
        };
        legacyRequest.onsuccess = function () {
          const legacyRaw = legacyRequest.result;
          const legacyPacks = legacyRaw && typeof legacyRaw === 'object'
            ? Object.values(legacyRaw).map(function (pack) {
                return {
                  type: 'climb',
                  entityId: pack.climbId,
                  displayName: pack.climbName,
                  canonicalPath: pack.canonicalPath || pack.pageUrl,
                  estimatedBytes: pack.estimatedBytes,
                  mediaCount: pack.mediaCount
                };
              })
            : [];
          renderPacks(legacyPacks);
        };
      };
    };
  }

  loadPacks();
})();
`

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] px-4 py-10 text-gray-900 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#111827_100%)] dark:text-gray-100">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/80 dark:shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">Offline launch</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Saved climbs</h1>
          <p id="offline-subtitle" className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Loading saved climbs on this device...
          </p>

          <div id="offline-empty" className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-300" hidden>
            No saved offline packs found on this device yet.
          </div>

          <div id="offline-pack-list" className="mt-8 space-y-3" />

          <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-300">
            Open any saved crag or climb pack to view topo photos and core climb data while offline.
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: offlinePageScript }} />
    </div>
  )
}
