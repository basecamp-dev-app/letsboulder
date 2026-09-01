# Offline Field Guide Device Release Checklist

Run this checklist for each release candidate. The automated Chromium reliability suite is a mandatory CI gate, but it is not evidence that an installed PWA works on physical iOS or Android hardware.

## Automated Browser Gate

- [ ] `npm run test:e2e:offline` passes without fixture URLs, credentials, secrets, hosted data, or caller-supplied environment variables.
- [ ] The suite installs the repository-owned Signal Lost Cove pack through the production manifest parser, IndexedDB repository, pack manager, Cache Storage media cache, and offline reader.
- [ ] Interruption, resume, media eviction, failed update, auth-state change, new-page reopen, and service-worker restart scenarios pass.
- [ ] `npm run lint`, `npm run typecheck`, `bash docs/verify.sh`, relevant Vitest suites, and architecture checks pass.

These checks use Playwright Chromium. They do not simulate installation from Safari's Share sheet, iOS process management, Android launcher behavior, or operating-system storage eviction.

## Physical iOS PWA

Record the iPhone model, iOS version, Safari version, free storage before install, build commit, start time, and result.

- [ ] Open the release candidate in Safari, use **Add to Home Screen**, and launch only from the Home Screen icon.
- [ ] While connected, install Signal Lost Cove and confirm the guide is usable.
- [ ] Confirm access notes, low-tide warning, granite rock type, Channel Islands location, and crag coordinates render.
- [ ] Open Harbour Wall and West Headland content.
- [ ] Open Shared Signal, Airplane Traverse, and the text-only No Photo Needed entry.
- [ ] Open both north-face and west-face topo images; confirm Shared Signal appears on both and Airplane Traverse shares the north-face image.
- [ ] Enable airplane mode and confirm Wi-Fi and cellular data are unavailable.
- [ ] Fully terminate the installed PWA process from the app switcher.
- [ ] Relaunch from the Home Screen icon and open the library, Signal Lost Cove, every fixture climb, and both topos without reconnecting.
- [ ] Record cold-launch-to-interactive time and any missing, delayed, or incorrect content.

## Physical Android PWA

Record the phone model, Android version, Chrome version, free storage before install, build commit, start time, and result.

- [ ] Install the release candidate as a PWA in Chrome and launch only from the device launcher icon.
- [ ] While connected, install Signal Lost Cove and confirm the guide is usable.
- [ ] Confirm access notes, low-tide warning, granite rock type, Channel Islands location, and crag coordinates render.
- [ ] Open Harbour Wall and West Headland content.
- [ ] Open Shared Signal, Airplane Traverse, and the text-only No Photo Needed entry.
- [ ] Open both north-face and west-face topo images; confirm Shared Signal appears on both and Airplane Traverse shares the north-face image.
- [ ] Enable airplane mode and confirm Wi-Fi and cellular data are unavailable.
- [ ] Fully terminate the installed PWA process from Android's recent-apps screen, then force-stop it from App info.
- [ ] Relaunch from the device launcher and open the library, Signal Lost Cove, every fixture climb, and both topos without reconnecting.
- [ ] Record cold-launch-to-interactive time and any missing, delayed, or incorrect content.

## Release Record

Attach the completed iOS and Android records to the release candidate. A Playwright pass cannot be substituted for either physical-device record. Any required-content failure blocks the release; record it with the device, OS/browser version, pack state, missing item, and whether a subsequent online repair recovered it.

Pack v2 digest validation and migration, the dedicated field-guide shell, individual offline climb routes, final climb UI, and payload-budget enforcement remain later-phase gates. Their absence must not be described as installed-PWA validation.
