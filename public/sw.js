// Minimal pass-through service worker — makes Kosha installable as a PWA.
// Real offline caching / write-queueing lands in Phase 6 (KOSHA-PLAN.md §9).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
