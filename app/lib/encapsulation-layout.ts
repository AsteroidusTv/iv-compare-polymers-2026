// Spread nearby markers horizontally only. Never move their measured y value.
export function pointOffsets(ys: number[]): number[] {
  const lanes = [0, 7, -7, 14, -14, 21, -21, 28, -28];
  const placed: { y: number; x: number }[] = [];
  return ys.map((y) => {
    const collisions = (x: number) => placed.filter((point) => Math.hypot(point.x - x, point.y - y) < 7).length;
    const x = lanes.reduce((best, candidate) => collisions(candidate) < collisions(best) ? candidate : best, 0);
    placed.push({ x, y });
    return x;
  });
}
