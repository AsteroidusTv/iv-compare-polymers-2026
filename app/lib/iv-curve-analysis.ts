export interface IVPoint {
  x: number;
  y: number;
  sourceIndex: number;
}

export type SegmentBreakReason = "start" | "voltage_jump" | "direction_change";

export interface IVSegment {
  id: string;
  points: IVPoint[];
  startIndex: number;
  endIndex: number;
  breakReason: SegmentBreakReason;
}

export interface IVCurveAnalysis {
  segments: IVSegment[];
  primaryIndex: number;
  rawPointCount: number;
  primaryPointCount: number;
  jumpCount: number;
  directionChangeCount: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function zeroCrossingX(points: IVPoint[]): number | null {
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (left.y === 0) return left.x;
    if (left.y * right.y > 0 || left.y === right.y) continue;
    const ratio = -left.y / (right.y - left.y);
    return left.x + ratio * (right.x - left.x);
  }
  return null;
}

function segmentScore(segment: IVSegment, expectedVoc?: number | null): number {
  const xs = segment.points.map((point) => point.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const crossing = zeroCrossingX(segment.points);
  let score = Math.min(segment.points.length / 75, 2.5);

  if (minX <= 0 && maxX >= 0) score += 4;
  if (crossing !== null && crossing >= 0) score += 4;
  if (segment.startIndex === 0) score += 2;

  if (typeof expectedVoc === "number" && Number.isFinite(expectedVoc)) {
    if (minX <= expectedVoc && maxX >= expectedVoc) score += 3;
    if (crossing !== null) score += Math.max(0, 2 - Math.abs(crossing - expectedVoc) * 10);
  }

  return score;
}

export function analyzeIVCurve(input: Array<{ x: number; y: number; sourceIndex?: number }>, expectedVoc?: number | null): IVCurveAnalysis {
  const points: IVPoint[] = input.map((point, index) => ({ ...point, sourceIndex: point.sourceIndex ?? index }));
  if (points.length < 2) {
    const segment: IVSegment = { id: "segment-1", points, startIndex: 0, endIndex: Math.max(0, points.length - 1), breakReason: "start" };
    return { segments: points.length ? [segment] : [], primaryIndex: 0, rawPointCount: points.length, primaryPointCount: points.length, jumpCount: 0, directionChangeCount: 0 };
  }

  const absoluteSteps = points
    .slice(0, -1)
    .map((point, index) => Math.abs(points[index + 1].x - point.x))
    .filter((step) => Number.isFinite(step) && step > 1e-7)
    .sort((a, b) => a - b);
  const stableSteps = absoluteSteps.slice(0, Math.max(1, Math.ceil(absoluteSteps.length * 0.8)));
  const typicalStep = median(stableSteps) || 0.01;
  const jumpThreshold = Math.max(0.05, typicalStep * 8);
  const directionThreshold = Math.max(1e-4, typicalStep * 0.35);

  const segments: IVSegment[] = [];
  let startIndex = 0;
  let breakReason: SegmentBreakReason = "start";
  let direction = 0;
  let jumpCount = 0;
  let directionChangeCount = 0;

  const pushSegment = (endIndex: number) => {
    const segmentPoints = points.slice(startIndex, endIndex + 1);
    if (!segmentPoints.length) return;
    segments.push({
      id: `segment-${segments.length + 1}`,
      points: segmentPoints,
      startIndex,
      endIndex,
      breakReason,
    });
  };

  for (let index = 0; index < points.length - 1; index += 1) {
    const delta = points[index + 1].x - points[index].x;
    const stepDirection = Math.abs(delta) >= directionThreshold ? Math.sign(delta) : 0;
    const nextDelta = index + 2 < points.length ? points[index + 2].x - points[index + 1].x : 0;
    const nextDirection = Math.abs(nextDelta) >= directionThreshold ? Math.sign(nextDelta) : 0;
    const voltageJump = Math.abs(delta) > jumpThreshold;
    const confirmedDirectionChange = direction !== 0 && stepDirection !== 0 && stepDirection !== direction && (nextDirection === stepDirection || index + 2 >= points.length);

    if (voltageJump || confirmedDirectionChange) {
      pushSegment(index);
      startIndex = index + 1;
      breakReason = voltageJump ? "voltage_jump" : "direction_change";
      if (voltageJump) jumpCount += 1;
      else directionChangeCount += 1;
      direction = 0;
      continue;
    }

    if (direction === 0 && stepDirection !== 0) direction = stepDirection;
  }
  pushSegment(points.length - 1);

  const primaryIndex = segments.reduce((bestIndex, segment, index) => (
    segmentScore(segment, expectedVoc) > segmentScore(segments[bestIndex], expectedVoc) ? index : bestIndex
  ), 0);

  return {
    segments,
    primaryIndex,
    rawPointCount: points.length,
    primaryPointCount: segments[primaryIndex]?.points.length ?? 0,
    jumpCount,
    directionChangeCount,
  };
}
