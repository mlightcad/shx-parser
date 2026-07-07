import { Point } from '../point';
import { ShxShape } from '../shape';

describe('ShxShape', () => {
  const line = new ShxShape(new Point(4, 0), [[new Point(0, 0), new Point(4, 0)]]);

  it('computes bounding box', () => {
    expect(line.bbox).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 0 });
    expect(line.bbox).toBe(line.bbox);
  });

  it('offsets as a new instance', () => {
    const moved = line.offset(new Point(1, 2));
    expect(moved).not.toBe(line);
    expect(moved.lastPoint!.x).toBe(5);
    expect(moved.polylines[0][0].x).toBe(1);
  });

  it('offsets in place and updates cached bbox', () => {
    const copy = new ShxShape(new Point(1, 1), [[new Point(0, 0), new Point(1, 1)]]);
    copy.bbox;
    const result = copy.offset(new Point(2, 3), false);
    expect(result).toBe(copy);
    expect(copy.bbox.minX).toBe(2);
    expect(copy.lastPoint!.x).toBe(3);
  });

  it('normalizes to origin', () => {
    const normalized = line.normalizeToOrigin(true);
    expect(normalized.bbox.minX).toBe(0);
    expect(normalized.bbox.minY).toBe(0);
  });

  it('renders SVG with fixed and auto-fit view boxes', () => {
    const fixed = line.toSVG();
    expect(fixed).toContain('viewBox="0 0 20 20"');
    expect(fixed).toContain('<path');

    const vertical = new ShxShape(new Point(0, 5), [[new Point(0, 0), new Point(0, 5)]]);
    const auto = vertical.toSVG({ isAutoFit: true, strokeColor: 'red' });
    expect(auto).toContain('viewBox=');
    expect(auto).toContain('stroke="red"');
  });

  it('handles zero-width bbox in auto-fit mode', () => {
    const horizontal = new ShxShape(new Point(3, 0), [[new Point(0, 0), new Point(3, 0)]]);
    const svg = horizontal.toSVG({ isAutoFit: true });
    expect(svg).toContain('<svg');
  });

  it('renders SVG with a fixed font-cell view box', () => {
    const baseline = line.toSVG({
      fontCell: {
        width: 10,
        capHeight: 8,
        descenderHeight: 2,
      },
    });
    expect(baseline).toContain('viewBox="-1 -9 12 12"');

    const top = line.toSVG({
      fontCell: {
        width: 10,
        capHeight: 8,
        descenderHeight: 2,
        origin: 'top',
      },
    });
    expect(top).toContain('viewBox="-6 -1 12 12"');
  });

  it('draws top-origin font-cell frame with cap and descender bands', () => {
    const svg = line.toSVG({
      fontCell: {
        width: 10,
        capHeight: 8,
        descenderHeight: 2,
        origin: 'top',
        showFrame: true,
      },
    });
    expect(svg).toContain('stroke-dasharray="4 2"');
    expect(svg).toContain('rgba(255, 0, 0, 0.06)');
    expect(svg).toContain('rgba(255, 0, 0, 0.14)');
  });

  it('expands font-cell view box and draws frame when glyph overflows', () => {
    const overflow = new ShxShape(new Point(20, 0), [
      [new Point(0, 0), new Point(20, 0), new Point(20, 20), new Point(0, 20), new Point(0, 0)],
    ]);
    const svg = overflow.toSVG({
      fontCell: {
        width: 10,
        capHeight: 8,
        descenderHeight: 2,
        expandToFit: true,
        showFrame: true,
      },
    });
    expect(svg).toContain('stroke="red"');
    expect(svg).toContain('stroke-dasharray="4 2"');
    expect(svg).toContain('rgba(255, 0, 0, 0.06)');
    expect(svg).toContain('rgba(255, 0, 0, 0.14)');
    expect(svg).toContain('viewBox="-2 -22.2 24 26.4"');
  });

  it('keeps font-cell view box when glyph fits inside the frame', () => {
    const inside = new ShxShape(new Point(4, 2), [[new Point(1, 1), new Point(4, 2)]]);
    const svg = inside.toSVG({
      fontCell: {
        width: 10,
        capHeight: 8,
        descenderHeight: 2,
        expandToFit: true,
        showFrame: true,
      },
    });
    expect(svg).toContain('viewBox="-1 -9 12 12"');
  });
});
