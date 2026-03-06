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
  const retryEl = document.getElementById('offline-retry');
  const onlineActionEl = document.getElementById('offline-online-action');

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

    const cragPacks = packs.filter(function (pack) { return pack.type === 'crag'; });
    const climbPacks = packs.filter(function (pack) { return pack.type !== 'crag'; });

    function renderGroup(title, description, icon, groupPacks, accentClass) {
      if (!groupPacks.length) return '';

      const cards = groupPacks.map(function (pack) {
        const href = pack.canonicalPath || (pack.type === 'crag' ? '/crag/' + encodeURIComponent(pack.entityId) : '/climb/' + encodeURIComponent(pack.entityId));
        const meta = pack.type === 'crag'
          ? (Number(pack.mediaCount || 0) + ' photos across saved climbs')
          : (Number(pack.mediaCount || 0) + ' photos');
        const action = pack.type === 'crag' ? 'Open folder' : 'Open climb';

        return [
          '<a href="' + href + '" class="group block rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-800">',
          '<div class="flex items-start gap-4">',
          '<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ' + accentClass + '">',
          '<span class="text-xl">' + icon + '</span>',
          '</div>',
          '<div class="min-w-0 flex-1">',
          '<div class="flex items-start justify-between gap-3">',
          '<div class="min-w-0">',
          '<p class="truncate text-base font-semibold text-gray-900 dark:text-gray-100">' + escapeHtml(pack.displayName || 'Saved pack') + '</p>',
          '<p class="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">' + escapeHtml(href) + '</p>',
          '</div>',
          '<span class="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-700 dark:bg-gray-800 dark:text-gray-200">' + escapeHtml(pack.type === 'crag' ? 'Folder' : 'Climb') + '</span>',
          '</div>',
          '<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">',
          '<span>' + meta + '</span>',
          '<span>' + formatBytes(Number(pack.estimatedBytes || 0)) + '</span>',
          '<span class="font-medium text-gray-700 transition group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-white">' + action + '</span>',
          '</div>',
          '</div>',
          '</div>',
          '</a>'
        ].join('');
      }).join('');

      return [
        '<section class="space-y-3">',
        '<div>',
        '<p class="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">' + title + '</p>',
        '<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">' + description + '</p>',
        '</div>',
        '<div class="space-y-3">' + cards + '</div>',
        '</section>'
      ].join('');
    }

    listEl.innerHTML = [
      renderGroup('Crag Folders', 'Open a saved crag, then choose a nested climb pack.', '[]', cragPacks, 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'),
      renderGroup('Standalone Climbs', 'Open individually saved climb packs directly.', '>', climbPacks, 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200')
    ].filter(Boolean).join('<div class="h-3"></div>');
  }

  function setStatus(message, showRetry) {
    if (subtitleEl) subtitleEl.textContent = message;
    if (retryEl) retryEl.hidden = !showRetry;
  }

  function loadPacks() {
    if (!('indexedDB' in window)) {
      setStatus('Offline storage is not available on this device.', false);
      renderPacks([]);
      return;
    }

    function readKey(db, key, onSuccess) {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onerror = function () {
        onSuccess(null);
      };
      request.onsuccess = function () {
        onSuccess(request.result);
      };
    }

    const request = indexedDB.open(DB_NAME);
    request.onerror = function () {
      setStatus('Unable to read offline storage on this device.', true);
      renderPacks([]);
    };
    request.onsuccess = function () {
      const db = request.result;

      readKey(db, PACK_RECORDS_KEY, function (raw) {
        const packs = raw && typeof raw === 'object'
          ? Object.values(raw).sort(function (a, b) {
              return String(a.displayName || '').localeCompare(String(b.displayName || ''));
            })
          : [];
        if (packs.length > 0) {
          renderPacks(packs);
          db.close();
          return;
        }

        readKey(db, LEGACY_PACKS_KEY, function (legacyRaw) {
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
          if (legacyPacks.length === 0) {
            setStatus('No saved offline packs found on this device yet.', false);
          }
          db.close();
        });
      });
    };
  }

  if (navigator.onLine) {
    setStatus('You are back online. Opening the map...', false);
    if (onlineActionEl) onlineActionEl.hidden = false;
    if (onlineActionEl) {
      onlineActionEl.addEventListener('click', function () {
        window.location.replace('/');
      });
    }
    window.setTimeout(function () {
      window.location.replace('/');
    }, 350);
    return;
  }

  if (retryEl) {
    retryEl.addEventListener('click', function () {
      setStatus('Loading saved climbs on this device...', false);
      loadPacks();
    });
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
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Offline library</h1>
          <p id="offline-subtitle" className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Loading saved climbs on this device...
          </p>

          <div className="mt-3 flex flex-wrap gap-3">
            <button id="offline-online-action" hidden className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
              Open map
            </button>
            <button id="offline-retry" hidden className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
              Retry
            </button>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="text-xs font-semibold uppercase tracking-[0.2em]">Crag Folders</p>
              <p className="mt-2">A saved crag opens like a folder with all nested climb packs inside.</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
              <p className="text-xs font-semibold uppercase tracking-[0.2em]">Standalone Climbs</p>
              <p className="mt-2">Single climb downloads open directly to the saved topo image and routes.</p>
            </div>
          </div>

          <div id="offline-empty" className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-300" hidden>
            No saved offline packs found on this device yet.
          </div>

          <div id="offline-pack-list" className="mt-8 space-y-3" />

          <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-300">
            Tip: open a crag folder first when you want the `Crag {'>'} Climb` offline flow. Open a standalone climb when you already know the exact route pack you want.
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: offlinePageScript }} />
    </div>
  )
}
