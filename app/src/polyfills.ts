// Import FIRST (see src/app/_layout.tsx). yjs (via lib0) wants
// crypto.getRandomValues for collision-resistant client ids and silently falls
// back to Math.random without it; Hermes has no global crypto at all.
// expo-crypto's implementation is synchronous, so it slots straight in. On web
// the global already exists, so the assignment is a guarded no-op.
import { getRandomValues } from 'expo-crypto';

const g = globalThis as Record<string, unknown>;

const cryptoLike = (g.crypto ?? (g.crypto = {})) as Record<string, unknown>;
if (typeof cryptoLike.getRandomValues === 'undefined')
  cryptoLike.getRandomValues = getRandomValues;
