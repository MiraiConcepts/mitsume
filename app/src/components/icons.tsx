// Basil icons (https://icon-sets.iconify.design/basil/) rendered in-app as React
// Native SVG. Path data lives in constants/icon-paths. Props mirror the old
// lucide API (`size`, `color`) to keep call sites simple.
import { SvgXml } from 'react-native-svg';

import { AddOutlineBody, CanvasIconBodies } from '@/constants/icon-paths';

import type { CanvasIconName } from '@/constants/icon-paths';

type IconProps = { size?: number; color: string };

const svg = (body: string, size: number, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">${body.replace(
    /currentColor/g,
    color
  )}</svg>`;

export function AddIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(AddOutlineBody, size, color)} />;
}

/**
 * A canvas's CanvasBar icon by stored name. Unknown names (e.g. from a newer
 * doc) fall back to the default canvas icon rather than crashing.
 */
export function CanvasIcon({
  name,
  size = 24,
  color,
}: IconProps & { name: string }) {
  const body =
    CanvasIconBodies[name as CanvasIconName] ?? CanvasIconBodies.book;
  return <SvgXml xml={svg(body, size, color)} />;
}
