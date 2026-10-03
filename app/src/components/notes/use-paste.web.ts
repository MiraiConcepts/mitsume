import { useEffect } from 'react';

import { ingestImage } from '@/notes/ingest.web';

import type { IngestedImage } from '@/notes/types';

const isEditable = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return Boolean(
    el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.isContentEditable)
  );
};

/**
 * Which pastes a listener takes: 'page' = anywhere EXCEPT a text field (the
 * canvas), 'text' = only inside one (the notes, pasting after the chunk you
 * are typing in). Two listeners, never both for one paste.
 */
export type PasteScope = 'page' | 'text';

/**
 * Document-level paste listener: image files run through the ingest pipeline
 * (hash + display rendition + upload queue) and reach the callback one by
 * one; anything else is silently ignored (user decision). `clipboardData.
 * files` first (Safari's surface), `items` as the Chromium fallback. Paste
 * events need no clipboard permission — the keystroke IS the user grant.
 */
export function usePasteImages(
  onIngested: (image: IngestedImage, index: number) => void,
  scope: PasteScope = 'page'
): void {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target) !== (scope === 'text')) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) =>
        f.type.startsWith('image/')
      );
      if (files.length === 0) {
        for (const item of e.clipboardData?.items ?? []) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
      }
      if (files.length === 0) return;
      e.preventDefault();
      files.forEach((file, index) => {
        void ingestImage(file).then((image) => onIngested(image, index));
      });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [onIngested, scope]);
}
