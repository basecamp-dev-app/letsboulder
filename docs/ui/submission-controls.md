# Submission Controls

These are the reusable controls used by the draft and published submission editors. Source behavior is authoritative; accessibility gaps below are current limitations, not intended contracts.

## Canonical Components

### `GradePicker`

Source: [`features/grades/components/GradePicker.tsx`](../../features/grades/components/GradePicker.tsx). Canonical caller: [`RouteEditSidebar.tsx`](../../features/route-editor/components/RouteEditSidebar.tsx).

- Props: controlled `isOpen`; required `onClose` and `onSelect`; optional current grade, climb type or explicit grade system, vote/consensus data, and `select|vote` mode.
- State: search and pending selection reset when an open session or its `currentGrade` changes. Display options are deduplicated in the active user grade system, but `onSelect` returns the canonical stored French grade.
- Side effects: focuses search on open; Save calls `onSelect` then `onClose`; Cancel, Escape from the search input, and a guarded backdrop click close without selection.
- Accessibility: the canonical caller wraps it in a Radix `Dialog` with `DialogTitle`; the picker itself has no dialog semantics or focus trap and should not be mounted as a standalone modal. Grade buttons expose visible text, but selection is visual rather than `aria-pressed`/`aria-selected`.

### `ImagePicker`

Source: [`features/submissions/components/ImagePicker.tsx`](../../features/submissions/components/ImagePicker.tsx). Canonical caller: [`DraftIntakeView.tsx`](../../features/submissions/components/DraftIntakeView.tsx).

- Props: `onFilesSelected(File[])` may be async; `disabled` defaults false.
- State: tracks drag styling and local validation error. Each selection filters to image MIME types or `.heic/.heif`, takes at most 20, and clears the native input so the same file can be chosen again.
- Side effects: click selection and drop invoke the callback; upload/session behavior belongs to the caller, not this component.
- Accessibility: a generated ID binds the visually hidden multiple file input to the drop-zone label; keyboard focus is shown through `peer-focus-visible`; validation uses `role="alert"`; disabled state reaches both the input and `aria-disabled` label.

### `DraftUploadQueue`

Source: [`features/media-upload/components/DraftUploadQueue.tsx`](../../features/media-upload/components/DraftUploadQueue.tsx). Canonical caller: [`app/logbook/drafts/[draftId]/edit/page.tsx`](../../app/logbook/drafts/%5BdraftId%5D/edit/page.tsx).

- Props: controlled upload items plus target-scoped pending/error queries and retry, remove, pause, and resume callbacks. It does not own upload state or perform network requests.
- State: renders nothing for an empty list and hides an attached item only after that item is also `READY`; callers may pass queued, active, failed, and terminal entries despite the historical `pendingDraftUploads` name.
- Side effects: user actions delegate to the upload manager. Remove may discard a remote upload session, so callers must preserve the manager's ownership checks rather than treating it as a local-only list operation.
- Accessibility: actions are native named buttons and previews use the filename as alt text. Progress and status changes are not currently exposed through `role="progressbar"` or an `aria-live` region; consumers should not assume announcements that the component does not implement.

The queue's lifecycle, provider lifetime, retry behavior, and draft-versus-crag attachment timing are documented in [Media Pipeline](../media-pipeline.md#client-upload-queue).

### `CragSelector`

Source: [`features/submissions/components/CragSelector.tsx`](../../features/submissions/components/CragSelector.tsx). Canonical caller: [`DraftMetadataPanel.tsx`](../../features/draft-editor/components/DraftMetadataPanel.tsx).

- Props: optional coordinates and selected ID; required `onSelect`; optional `onCreateNew` runs after a newly created crag is also selected.
- State: owns query/results, nearby/create panels, region suggestions, messages, request cache, and loading flags. `selectedCragId` marks external selection but does not control the query text.
- Side effects: search debounces 600 ms and caches for two minutes; region lookup debounces 300 ms; nearby lookup is on demand. Atlas detection may auto-select a nearby crag and can therefore call `onSelect` without a click. Search requests and auto-selection are aborted when superseded/unmounted. Creation uses `POST /api/crags` via `csrfFetch`.
- Accessibility: the search field has a placeholder but no programmatic label; result/create behavior is delegated to the section components. Consumers must not assume combobox semantics or full keyboard navigation that the current custom UI does not expose.

### `SectorSelector`

Source: [`features/submissions/components/SectorSelector.tsx`](../../features/submissions/components/SectorSelector.tsx). Canonical caller: [`DraftMetadataPanel.tsx`](../../features/draft-editor/components/DraftMetadataPanel.tsx).

- Props: controlled nullable `cragId` and `value`, required `onChange`, optional placeholder. There is no explicit clear action.
- State: owns open/loading/create state and fetched sectors. Changing `cragId` refetches (or clears) options; a `value` not present in the loaded list displays the placeholder.
- Side effects: GETs `/api/crags/[id]/sectors`; creation POSTs the same endpoint with `csrfFetch`, appends/selects the result, and closes. A document `mousedown` listener closes the popup.
- Accessibility: controls are native buttons/input; Enter submits and Escape cancels only in the create input. The trigger currently lacks `aria-expanded`/`aria-controls`, and the custom popup has no listbox/menu semantics or trigger-level Escape/arrow-key handling.
- Persistence caveat: draft metadata records the selected sector, but current draft promotion does not transfer it to published image or climb sector columns. See [Submission Workflow](../submission-workflow.md#publication).

### `RouteEditorRail`

Source: [`features/route-editor/components/RouteEditorRail.tsx`](../../features/route-editor/components/RouteEditorRail.tsx). Canonical caller: [`SubmissionWorkstation.tsx`](../../features/submissions/components/SubmissionWorkstation.tsx).

- Props: ordered `routes`, controlled nullable `selectedRouteId`, required `onSelectRoute`, and optional `onReorderRoutes(routeIds)`.
- State: no business state; grade labels follow user preferences. It renders nothing for an empty route list. Supplying `onReorderRoutes` is the capability flag that enables drag sensors and grip UI.
- Side effects: click selects; drag end computes the complete reordered ID list and delegates persistence. Mouse drag activates after 6 px; touch after 120 ms within 8 px tolerance.
- Accessibility: each chip is a named button with `aria-pressed`; color dots are hidden from assistive technology. Reordering relies on dnd-kit attributes, but there are no explicit move buttons or live announcement in this component, so do not remove a separate accessible reorder path if one is added.
