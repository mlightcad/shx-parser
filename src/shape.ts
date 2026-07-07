import { Point } from './point';

/**
 * Represents a 2D bounding box with minimum and maximum coordinates
 */
export interface Box2d {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function computeFontCellBounds(fontCell: {
  width: number;
  capHeight: number;
  descenderHeight: number;
  origin?: 'baseline' | 'top';
}): Box2d {
  const { width, capHeight, descenderHeight, origin = 'baseline' } = fontCell;
  const totalHeight = capHeight + descenderHeight;
  if (origin === 'top') {
    return { minX: -width / 2, maxX: width / 2, minY: -totalHeight, maxY: 0 };
  }
  return { minX: 0, maxX: width, minY: -descenderHeight, maxY: capHeight };
}

function hasFiniteBbox(bbox: Box2d): boolean {
  return [bbox.minX, bbox.minY, bbox.maxX, bbox.maxY].every(Number.isFinite);
}

function bboxContains(outer: Box2d, inner: Box2d, epsilon = 1e-6): boolean {
  return (
    inner.minX >= outer.minX - epsilon &&
    inner.maxX <= outer.maxX + epsilon &&
    inner.minY >= outer.minY - epsilon &&
    inner.maxY <= outer.maxY + epsilon
  );
}

function mergeBboxes(a: Box2d, b: Box2d): Box2d {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function boxToSvgRect(box: Box2d, strokeColor: string, strokeWidth: string): string {
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  return `<rect x="${box.minX}" y="${-box.maxY}" width="${width}" height="${height}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
}

function boxToSvgFilledRect(box: Box2d, fill: string): string {
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  return `<rect x="${box.minX}" y="${-box.maxY}" width="${width}" height="${height}" fill="${fill}"/>`;
}

function layoutLineToSvg(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeColor: string,
  strokeWidth: string,
  dasharray?: string
): string {
  const dash = dasharray ? ` stroke-dasharray="${dasharray}"` : '';
  return `<line x1="${x1}" y1="${-y1}" x2="${x2}" y2="${-y2}" stroke="${strokeColor}" stroke-width="${strokeWidth}"${dash}/>`;
}

function buildFontCellFrame(
  fontCell: {
    width: number;
    capHeight: number;
    descenderHeight: number;
    origin?: 'baseline' | 'top';
  },
  frameColor: string,
  frameStrokeWidth: string
): string {
  const { capHeight, descenderHeight, origin = 'baseline' } = fontCell;
  const totalHeight = capHeight + descenderHeight;
  const cellBounds = computeFontCellBounds(fontCell);

  let capBounds: Box2d | undefined;
  let descenderBounds: Box2d | undefined;
  let baselineY: number | undefined;

  if (origin === 'top') {
    if (capHeight > 0) {
      capBounds = { minX: cellBounds.minX, maxX: cellBounds.maxX, minY: -capHeight, maxY: 0 };
    }
    if (descenderHeight > 0) {
      descenderBounds = {
        minX: cellBounds.minX,
        maxX: cellBounds.maxX,
        minY: -totalHeight,
        maxY: -capHeight,
      };
    }
    baselineY = -capHeight;
  } else {
    if (capHeight > 0) {
      capBounds = { minX: cellBounds.minX, maxX: cellBounds.maxX, minY: 0, maxY: capHeight };
    }
    if (descenderHeight > 0) {
      descenderBounds = {
        minX: cellBounds.minX,
        maxX: cellBounds.maxX,
        minY: -descenderHeight,
        maxY: 0,
      };
    }
    baselineY = 0;
  }

  const capFill = 'rgba(255, 0, 0, 0.06)';
  const descenderFill = 'rgba(255, 0, 0, 0.14)';
  const parts = [
    capBounds ? boxToSvgFilledRect(capBounds, capFill) : '',
    descenderBounds ? boxToSvgFilledRect(descenderBounds, descenderFill) : '',
    boxToSvgRect(cellBounds, frameColor, frameStrokeWidth),
  ];

  if (baselineY !== undefined && descenderHeight > 0 && capHeight > 0) {
    parts.push(
      layoutLineToSvg(
        cellBounds.minX,
        baselineY,
        cellBounds.maxX,
        baselineY,
        frameColor,
        frameStrokeWidth,
        '4 2'
      )
    );
  }

  return `<g>${parts.join('')}</g>`;
}

/**
 * Represents a shape defined by a collection of polylines and an optional last point.
 * Used to describe the geometry of a character in the SHX font.
 */
export class ShxShape {
  /** The last point in the shape's geometry, if any */
  readonly lastPoint?: Point;
  /** Array of polylines, where each polyline is an array of points */
  readonly polylines: Point[][];
  /**
   * True when the SHX bytecode explicitly defines horizontal advance (pen-up moves,
   * BIGFONT cell primitive #2, etc.). Distinguishes Advance = 0 from "no advance defined".
   */
  readonly hasExplicitAdvance: boolean;
  /** Cached bounding box to avoid recalculation */
  private _bbox?: Box2d;

  constructor(
    lastPoint?: Point,
    polylines: Point[][] = [],
    hasExplicitAdvance = false
  ) {
    this.lastPoint = lastPoint;
    this.polylines = polylines;
    this.hasExplicitAdvance = hasExplicitAdvance;
  }

  /**
   * Get the bounding box of the shape
   * @returns Bounding box of the shape
   */
  get bbox(): Box2d {
    if (this._bbox) {
      return this._bbox;
    }

    // Calculate the bounds of the shape
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    this.polylines.forEach(polyline => {
      polyline.forEach(point => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      });
    });

    this._bbox = { minX, minY, maxX, maxY };
    return this._bbox;
  }

  /**
   * Offset the shape by a point
   * @param p The point to offset the shape by
   * @param isNewInstance Whether to return a new instance of the shape or modify the current instance
   * @returns The offset shape
   */
  offset(p: Point, isNewInstance = true): ShxShape {
    if (isNewInstance) {
      return new ShxShape(
        this.lastPoint?.clone().add(p),
        this.polylines.map(polyline => polyline.map(point => point.clone().add(p))),
        this.hasExplicitAdvance
      );
    } else {
      this.lastPoint?.add(p);
      this.polylines.forEach(polyline => polyline.forEach(point => point.add(p)));
      if (this._bbox) {
        this._bbox.maxX += p.x;
        this._bbox.minX += p.x;
        this._bbox.maxY += p.y;
        this._bbox.minY += p.y;
      }
      return this;
    }
  }

  /**
   * Normalizes a shape so that its bounding box’s bottom-left corner moves to the origin (0,0).
   * It doesn’t change the size or orientation, only repositions the shape.
   * @param isNewInstance Whether to return a new instance of the shape or modify the current instance
   * @returns The offset shape
   */
  normalizeToOrigin(isNewInstance = false) {
    const bbox = this.bbox;
    // Normalize to left-bottom (0,0)
    return this.offset(new Point(-bbox.minX, -bbox.minY), isNewInstance);
  }

  /**
   * Converts the shape to an SVG string
   * @param options SVG rendering options
   * @returns SVG string
   */
  toSVG(
    options: {
      strokeWidth?: string;
      strokeColor?: string;
      isAutoFit?: boolean;
      /** Fixed font-cell frame in layout coordinates (baseline at y = 0). */
      fontCell?: {
        width: number;
        capHeight: number;
        descenderHeight: number;
        padding?: number;
        /** `baseline`: y grows upward from the baseline; `top`: y = 0 at the cell top. */
        origin?: 'baseline' | 'top';
        /** Expand the view box to include glyph ink outside the font cell. */
        expandToFit?: boolean;
        /** Draw the SHX font cell bounds. */
        showFrame?: boolean;
        frameColor?: string;
        frameStrokeWidth?: string;
      };
    } = {}
  ): string {
    const {
      strokeWidth = '0.5%',
      strokeColor = 'black',
      isAutoFit = false,
      fontCell,
    } = options;

    let viewBox: string;
    let paths: string;

    const buildPaths = (mapPoint: (point: Point) => { x: number; y: number }) =>
      this.polylines
        .map(polyline => {
          let d = '';
          polyline.forEach((point, index) => {
            const { x, y } = mapPoint(point);
            d += index === 0 ? `M ${x} ${y} ` : `L ${x} ${y} `;
          });
          return `<path d="${d}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="none"/>`;
        })
        .join('');

    if (fontCell) {
      const {
        padding = 0.1,
        expandToFit = false,
        showFrame = false,
        frameColor = 'red',
        frameStrokeWidth = '0.5%',
      } = fontCell;
      const cellBounds = computeFontCellBounds(fontCell);
      const bbox = this.bbox;
      let viewBounds = cellBounds;

      if (expandToFit && hasFiniteBbox(bbox) && !bboxContains(cellBounds, bbox)) {
        viewBounds = mergeBboxes(cellBounds, bbox);
      }

      const viewWidth = viewBounds.maxX - viewBounds.minX;
      const viewHeight = viewBounds.maxY - viewBounds.minY;
      const padX = viewWidth * padding;
      const padY = viewHeight * padding;
      const minX = viewBounds.minX - padX;
      const maxX = viewBounds.maxX + padX;
      const minY = viewBounds.minY - padY;
      const maxY = viewBounds.maxY + padY;

      paths = buildPaths(point => ({
        x: point.x,
        y: -point.y,
      }));

      const frame = showFrame
        ? buildFontCellFrame(fontCell, frameColor, frameStrokeWidth)
        : '';
      viewBox = `${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`;
      return `<svg width="100%" height="100%" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${frame}${paths}</svg>`;
    } else if (isAutoFit) {
      // Calculate bounds with padding
      const bbox = this.bbox;
      const padding = 0.2; // 20% padding
      // Compute effective width/height; if one axis is zero, mirror the other
      const rawWidth = bbox.maxX - bbox.minX;
      const rawHeight = bbox.maxY - bbox.minY;
      const width = rawWidth === 0 ? rawHeight : rawWidth;
      const height = rawHeight === 0 ? rawWidth : rawHeight;
      const minX = bbox.minX - width * padding;
      const maxX = bbox.maxX + width * padding;
      const minY = bbox.minY - height * padding;
      const maxY = bbox.maxY + height * padding;

      paths = buildPaths(point => ({
        x: point.x,
        y: -point.y,
      }));

      // Set viewBox to match shape bounds
      viewBox = `${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`;
    } else {
      // Use fixed viewBox
      viewBox = '0 0 20 20';
      paths = buildPaths(point => ({
        x: point.x + 5,
        y: -point.y + 15,
      }));
    }

    // Return complete SVG string with 100% width and height
    return `<svg width="100%" height="100%" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${paths}</svg>`;
  }
}
