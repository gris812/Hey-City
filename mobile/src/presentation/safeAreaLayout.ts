export function exploreTopLayout(topInset: number, spacingMd = 16): {
  controlTop: number;
  searchTop: number;
  statusTop: number;
} {
  const safeTop = Math.max(0, Number.isFinite(topInset) ? topInset : 0);
  const controlTop = safeTop + spacingMd;
  const searchTop = controlTop + 60;
  const statusTop = searchTop + 66;
  return { controlTop, searchTop, statusTop };
}
