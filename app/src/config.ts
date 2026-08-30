import { Platform } from 'react-native';

// Notes backend (docs/Deploy.md): mitsume-sync (Yjs over websocket) and
// mitsume-blobs (image bytes by SHA-256), both authless behind the same origin.
// Functions, not consts: the web URLs derive from window.location at call time,
// and module scope also runs during static export (Node) where window doesn't
// exist.
//
// EXPO_PUBLIC_* env vars are Metro-inlined at build time; access must stay fully
// dotted (no destructuring / bracket access) or it won't be replaced.

/** Absolute websocket URL of the sync server, or null when unconfigured. */
export function notesSyncUrl(): string | null {
  const raw =
    process.env.EXPO_PUBLIC_SYNC_URL ?? (Platform.OS === 'web' ? '/sync' : '');
  if (!raw) return null;
  if (raw.startsWith('ws')) return raw;
  if (Platform.OS === 'web' && typeof window !== 'undefined')
    return window.location.origin.replace(/^http/, 'ws') + raw;
  return null;
}

/** Base URL for blob GET/HEAD/PUT/DELETE (trailing slash), or null. */
export function blobsBaseUrl(): string | null {
  const raw =
    process.env.EXPO_PUBLIC_BLOBS_URL ??
    (Platform.OS === 'web' ? '/blobs/' : '');
  if (!raw) return null;
  return raw.endsWith('/') ? raw : `${raw}/`;
}
