import { Arc } from '../arc';
import { Point } from '../point';

describe('Arc angle normalization', () => {
  it('wraps end angle backward for clockwise bulge arcs', () => {
    const arc = Arc.fromBulge(new Point(0, 0), new Point(10, 0), -0.5);
    expect(arc.isClockwise).toBe(true);
    expect(arc.endAngle).toBeLessThan(arc.startAngle);
    expect(arc.tessellate().length).toBeGreaterThan(2);
  });

  it('wraps end angle forward for counterclockwise bulge arcs', () => {
    const arc = Arc.fromBulge(new Point(10, 0), new Point(0, 0), 0.25);
    expect(arc.isClockwise).toBe(false);
    expect(arc.endAngle).toBeGreaterThan(arc.startAngle);
    expect(arc.tessellate().length).toBeGreaterThan(1);
  });

  it('uses computed end point when tessellating octant arcs', () => {
    const arc = Arc.fromOctant(new Point(0, 0), 5, 0, 2, false);
    const points = arc.tessellate(Math.PI / 8);
    expect(points[points.length - 1].x).toBeCloseTo(arc.end.x);
  });
});
