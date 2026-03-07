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
  const LEGACY_PACKS_KEY = 'offline-climb-packs';
  const CLIMB_MANIFESTS_KEY = 'offline-climb-manifests';
  const CRAG_MANIFESTS_KEY = 'offline-crag-manifests';

  const subtitleEl = document.getElementById('offline-subtitle');
  const emptyEl = document.getElementById('offline-empty');
  const retryEl = document.getElementById('offline-retry');
  const onlineActionEl = document.getElementById('offline-online-action');
  const cragListEl = document.getElementById('offline-crag-list');
  const climbListEl = document.getElementById('offline-climb-list');

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

  function readKey(db, key) {
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onerror = function () { resolve(null); };
      request.onsuccess = function () { resolve(request.result || null); };
    });
  }

  function buildLegacyStandaloneClimbs(legacyRaw) {
    const values = legacyRaw && typeof legacyRaw === 'object' ? Object.values(legacyRaw) : [];
    return values.map(function (pack) {
      return {
        climbId: pack.climbId,
        ownerPackIds: [pack.packId],
        pinnedStandalone: true,
        manifest: pack,
      };
    });
  }

  function renderEmptyState() {
    if (emptyEl) emptyEl.hidden = false;
    if (cragListEl) cragListEl.innerHTML = '';
    if (climbListEl) climbListEl.innerHTML = '';
  }

  function renderLibrary(crags, climbs) {
    const standaloneClimbs = climbs.filter(function (entry) { return !!entry.pinnedStandalone; });
    const savedCount = crags.length + standaloneClimbs.length;

    if (subtitleEl) {
      subtitleEl.textContent = savedCount === 0
        ? 'No saved offline packs found on this device yet.'
        : savedCount + ' saved offline pack' + (savedCount === 1 ? '' : 's') + ' ready to open.';
    }

    if (savedCount === 0) {
      renderEmptyState();
      return;
    }

    if (emptyEl) emptyEl.hidden = true;

    const climbsByOwner = new Map();
    climbs.forEach(function (entry) {
      (entry.ownerPackIds || []).forEach(function (ownerPackId) {
        const group = climbsByOwner.get(ownerPackId) || [];
        group.push(entry);
        climbsByOwner.set(ownerPackId, group);
      });
    });

    if (cragListEl) {
      cragListEl.innerHTML = crags.map(function (crag) {
        const childClimbs = (climbsByOwner.get(crag.manifest.packId) || []).slice().sort(function (a, b) {
          return String(a.manifest.climbName || '').localeCompare(String(b.manifest.climbName || ''));
        });
        const coverImageUrl = crag.manifest.savedPins && crag.manifest.savedPins[0] ? crag.manifest.savedPins[0].coverImageUrl : null;

        return [
          '<article class="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">',
          '<a href="' + escapeHtml(crag.manifest.canonicalPath) + '" class="block">',
          '<div class="relative aspect-[16/8] bg-gray-200 dark:bg-gray-800">',
          coverImageUrl
            ? '<img src="' + escapeHtml(coverImageUrl) + '" alt="' + escapeHtml(crag.manifest.cragName + ' cover') + '" class="h-full w-full object-cover" />'
            : '<div class="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">Saved crag</div>',
          '<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 py-4 text-white">',
          '<p class="text-lg font-semibold">' + escapeHtml(crag.manifest.cragName) + '</p>',
          '<p class="mt-1 text-xs text-white/80">' + childClimbs.length + ' saved climb' + (childClimbs.length === 1 ? '' : 's') + ' · ' + formatBytes(Number(crag.manifest.estimatedBytes || 0)) + ' · ' + Number((crag.manifest.tileManifest && crag.manifest.tileManifest.tileCount) || 0) + ' tiles</p>',
          '</div>',
          '</div>',
          '</a>',
          '<div class="space-y-3 p-4">',
          '<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">',
          childClimbs.map(function (climb) {
            const href = climb.manifest.canonicalPath || climb.manifest.pageUrl;
            return [
              '<a href="' + escapeHtml(href) + '" class="group overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 transition hover:border-gray-300 hover:bg-white dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700 dark:hover:bg-gray-900">',
              '<div class="aspect-[4/3] bg-gray-200 dark:bg-gray-800">',
              climb.manifest.coverImageUrl
                ? '<img src="' + escapeHtml(climb.manifest.coverImageUrl) + '" alt="' + escapeHtml(climb.manifest.climbName) + '" class="h-full w-full object-cover" />'
                : '',
              '</div>',
              '<div class="p-3">',
              '<p class="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-gray-100">' + escapeHtml(climb.manifest.climbName) + '</p>',
              '</div>',
              '</a>'
            ].join('');
          }).join(''),
          '</div>',
          '</div>',
          '</article>'
        ].join('');
      }).join('');
    }

    if (climbListEl) {
      climbListEl.innerHTML = standaloneClimbs.map(function (climb) {
        const href = climb.manifest.canonicalPath || climb.manifest.pageUrl;
        return [
          '<a href="' + escapeHtml(href) + '" class="group overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700">',
          '<div class="aspect-[4/3] bg-gray-200 dark:bg-gray-800">',
          climb.manifest.coverImageUrl
            ? '<img src="' + escapeHtml(climb.manifest.coverImageUrl) + '" alt="' + escapeHtml(climb.manifest.climbName) + '" class="h-full w-full object-cover" />'
            : '',
          '</div>',
          '<div class="space-y-2 p-4">',
          '<p class="text-base font-semibold text-gray-900 dark:text-gray-100">' + escapeHtml(climb.manifest.climbName) + '</p>',
          '<p class="text-sm text-gray-500 dark:text-gray-400">' + Number(climb.manifest.mediaCount || 0) + ' photo' + (Number(climb.manifest.mediaCount || 0) === 1 ? '' : 's') + ' · ' + formatBytes(Number(climb.manifest.estimatedBytes || 0)) + ' · ' + Number(climb.manifest.tileCount || 0) + ' tiles</p>',
          '<p class="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">' + ((climb.ownerPackIds || []).length > 1 ? 'Shared across packs' : 'Saved directly') + '</p>',
          '</div>',
          '</a>'
        ].join('');
      }).join('');
    }
  }

  async function loadPacks() {
    if (!('indexedDB' in window)) {
      if (subtitleEl) subtitleEl.textContent = 'Offline storage is not available on this device.';
      renderEmptyState();
      return;
    }

    const request = indexedDB.open(DB_NAME);
    request.onerror = function () {
      if (subtitleEl) subtitleEl.textContent = 'Unable to read offline storage on this device.';
      renderEmptyState();
    };

    request.onsuccess = async function () {
      const db = request.result;
      try {
        const [cragRaw, climbRaw, legacyRaw] = await Promise.all([
          readKey(db, CRAG_MANIFESTS_KEY),
          readKey(db, CLIMB_MANIFESTS_KEY),
          readKey(db, LEGACY_PACKS_KEY)
        ]);

        const crags = cragRaw && typeof cragRaw === 'object' ? Object.values(cragRaw) : [];
        const climbs = climbRaw && typeof climbRaw === 'object'
          ? Object.values(climbRaw)
          : buildLegacyStandaloneClimbs(legacyRaw);

        renderLibrary(crags, climbs);
      } catch (error) {
        console.error('Failed to load offline library:', error);
        if (subtitleEl) subtitleEl.textContent = 'Unable to load saved offline packs right now.';
        renderEmptyState();
      } finally {
        db.close();
      }
    };
  }

  if (navigator.onLine) {
    if (subtitleEl) subtitleEl.textContent = 'You are back online. Opening the map...';
    if (onlineActionEl) {
      onlineActionEl.hidden = false;
      onlineActionEl.addEventListener('click', function () { window.location.replace('/'); });
    }
    window.setTimeout(function () { window.location.replace('/'); }, 350);
    return;
  }

  if (retryEl) {
    retryEl.addEventListener('click', function () {
      if (subtitleEl) subtitleEl.textContent = 'Loading saved climbs on this device...';
      loadPacks();
    });
  }

  loadPacks();
})();
`

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] px-4 py-10 text-gray-900 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#111827_100%)] dark:text-gray-100">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/80 dark:shadow-black/30">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">Offline</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Offline library</h1>
              <p id="offline-subtitle" className="mt-2 text-sm text-gray-600 dark:text-gray-300">Loading saved climbs on this device...</p>
            </div>
            <div className="flex gap-3">
              <button id="offline-online-action" hidden className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Open map</button>
              <button id="offline-retry" className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Retry</button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="text-xs font-semibold uppercase tracking-[0.2em]">Crag folders</p>
              <p className="mt-2">Browse saved crags by thumbnail, then open individual climb pages.</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
              <p className="text-xs font-semibold uppercase tracking-[0.2em]">Standalone climbs</p>
              <p className="mt-2">Open individually pinned climbs directly from this device.</p>
            </div>
          </div>

          <div id="offline-empty" className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-300" hidden>
            No saved offline packs found on this device yet.
          </div>

          <section className="mt-8 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">Saved crags</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Open a saved crag and use the topo thumbnails to jump straight to the climb page.</p>
            </div>
            <div id="offline-crag-list" className="grid gap-5 lg:grid-cols-2"></div>
          </section>

          <section className="mt-8 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">Standalone climbs</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">These climbs stay available even if you later remove a crag pack.</p>
            </div>
            <div id="offline-climb-list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"></div>
          </section>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: offlinePageScript }} />
    </div>
  )
}
