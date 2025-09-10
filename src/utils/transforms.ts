export function getTranslateX(el: Element): number {
  const m = getComputedStyle(el as HTMLElement).transform;
  if (!m || m === 'none') return 0;

  const m2d = m.match(/matrix\(([-0-9.,\s]+)\)/);
  if (m2d && m2d[1]) {
    const nums = m2d[1].split(',').map(Number);
    return nums[4] || 0;
  }

  const m3d = m.match(/matrix3d\(([-0-9.,\s]+)\)/);
  if (m3d && m3d[1]) {
    const nums = m3d[1].split(',').map(Number);
    return nums[12] || 0;
  }

  return 0;
}
