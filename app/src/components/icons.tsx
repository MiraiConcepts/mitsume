// Basil icons (https://icon-sets.iconify.design/basil/) rendered in-app as React
// Native SVG. Path data lives in constants/icon-paths. Props mirror the old
// lucide API (`size`, `color`) to keep call sites simple.
import { SvgXml } from 'react-native-svg';

import { AddOutlineBody, LeafIconBodies } from '@/constants/icon-paths';

import type { LeafIconName } from '@/constants/icon-paths';

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
 * A leaf's rail icon by stored name. Unknown names (e.g. from a newer
 * doc) fall back to the first leaf's icon rather than crashing.
 */
export function LeafIcon({
  name,
  size = 24,
  color,
}: IconProps & { name: string }) {
  const body = LeafIconBodies[name as LeafIconName] ?? LeafIconBodies.book;
  return <SvgXml xml={svg(body, size, color)} />;
}
