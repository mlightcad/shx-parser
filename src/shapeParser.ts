import { Point } from './point';
import { ShxFontData, ShxFontType } from './fontData';
import { Arc } from './arc';
import { ShxFileReader } from './fileReader';
import { ShxShape } from './shape';

/**
 * Scaling options for shape parsing
 */
export interface ScalingOptions {
  /** Scale by a uniform factor */
  factor?: number;
  /** Scale by specific height and width */
  height?: number;
  width?: number;
}

const CIRCLE_SPAN = Math.PI / 18;

/**
 * Parses SHX font data into shapes on demand. To improve performance, the shape is parsed on demand by
 * character code and font size. Parsed shapes are cached.
 */
export class ShxShapeParser {
  /** Font data of the font file */
  private readonly fontData: ShxFontData;
  /** Cached shapes for performance. Key is character code. */
  private shapeCache: Map<number, ShxShape> = new Map();
  /** Shapes data. Key is the char code */
  private shapeData: Map<number, ShxShape> = new Map();

  constructor(fontData: ShxFontData) {
    this.fontData = fontData;
  }

  /**
   * Releases parsed shapes and cached shapes
   */
  release(): void {
    this.shapeCache.clear();
    this.shapeData.clear();
  }

  /**
   * Parses a character's shape with the given font size.
   * @param code - The character code
   * @param size - The font size
   * @returns The parsed shape or undefined if the character is not found
   */
  getCharShape(code: number, size: number): ShxShape | undefined {
    const scale = size / this.fontData.content.height;
    return this.parseAndScale(code, { factor: scale });
  }

  /**
   * Parses a character's shape with scaling options
   * @param code - The character code
   * @param options - Scaling options (factor or height/width)
   * @returns The parsed shape or undefined if the character is not found
   */
  private parseAndScale(code: number, options: ScalingOptions): ShxShape | undefined {
    if (code === 0) {
      return undefined;
    }

    // Get or parse the base shape
    let baseShape: ShxShape | undefined;
    if (this.shapeCache.has(code)) {
      baseShape = this.shapeCache.get(code)!;
    } else {
      const codes = this.fontData.content.data;
      if (codes[code]) {
        const data = codes[code];
        baseShape = this.parseShape(data);
        this.shapeData.set(code, baseShape);
        this.shapeCache.set(code, baseShape);
      }
    }

    if (!baseShape) {
      return undefined;
    }

    // Apply scaling based on options
    if (options.factor !== undefined) {
      return this.scaleShapeByFactor(baseShape, options.factor);
    } else if (options.height !== undefined) {
      const targetWidth = options.width ?? options.height;
      return this.scaleShapeByHeightAndWidth(baseShape, options.height, targetWidth);
    } else {
      // No scaling options provided, return original shape
      return baseShape;
    }
  }

  /**
   * Scales a shape according to the given scale factor
   * @param shape - The shape to scale
   * @param factor - The scale factor
   * @returns The scaled shape
   */
  private scaleShapeByFactor(shape: ShxShape, factor: number): ShxShape {
    return new ShxShape(
      shape.lastPoint?.clone().multiply(factor),
      shape.polylines.map(line => line.map(point => point.clone().multiply(factor)))
    );
  }

  /**
   * Scales a shape according to the given height and width
   * @param shape - The shape to scale
   * @param height - The target height
   * @param width - The target width
   * @returns The scaled shape
   */
  private scaleShapeByHeightAndWidth(shape: ShxShape, height: number, width: number): ShxShape {
    const bbox = shape.bbox;
    const shapeHeight = bbox.maxY - bbox.minY;
    const shapeWidth = bbox.maxX - bbox.minX;

    // Calculate scale factors based on the shape's actual dimensions
    const heightScale = shapeHeight > 0 ? height / shapeHeight : 1;
    const widthScale = shapeWidth > 0 ? width / shapeWidth : 1;

    const scaledLastPoint = shape.lastPoint?.clone();
    if (scaledLastPoint) {
      scaledLastPoint.x *= widthScale;
      scaledLastPoint.y *= heightScale;
    }

    const scaledPolylines = shape.polylines.map(line =>
      line.map(point => {
        const scaledPoint = point.clone();
        scaledPoint.x *= widthScale;
        scaledPoint.y *= heightScale;
        return scaledPoint;
      })
    );

    return new ShxShape(scaledLastPoint, scaledPolylines);
  }

  /**
   * Parses the shape of a character.
   * @param data - The data of the character
   * @returns The parsed shape
   */
  private parseShape(data: Uint8Array): ShxShape {
    let currentPoint = new Point();
    const polylines: Point[][] = [];
    let currentPolyline: Point[] = [];
    const sp: Point[] = [];
    let isPenDown = false;

    const state = {
      currentPoint,
      polylines,
      currentPolyline,
      sp,
      isPenDown,
      scale: 1,
    };

    for (let i = 0; i < data.length; i++) {
      const cb = data[i];

      if (cb <= 0x0f) {
        i = this.handleSpecialCommand(cb, data, i, state);
      } else {
        this.handleVectorCommand(cb, state);
      }
    }

    return new ShxShape(state.currentPoint, state.polylines);
  }

  /**
   * Please refer to special codes reference in the following link for more information.
   * https://help.autodesk.com/view/OARX/2023/ENU/?guid=GUID-06832147-16BE-4A66-A6D0-3ADF98DC8228
   * @param command - The command byte
   * @param data - The data of the character
   * @param index - The index of the command byte
   * @param state - The state of the parser
   * @returns The index of the next command byte
   */
  private handleSpecialCommand(
    command: number,
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      polylines: Point[][];
      currentPolyline: Point[];
      sp: Point[];
      isPenDown: boolean;
      scale: number;
    }
  ): number {
    let i = index;

    switch (command) {
      case 0: // End of shape definition
        state.currentPolyline = [];
        state.isPenDown = false;
        break;
      case 1: // Activate Draw mode (pen down)
        state.isPenDown = true;
        state.currentPolyline.push(state.currentPoint.clone());
        break;
      case 2: // Deactivate Draw mode (pen up)
        state.isPenDown = false;
        if (state.currentPolyline.length > 1) {
          state.polylines.push(state.currentPolyline.slice());
        }
        state.currentPolyline = [];
        break;
      case 3: // Divide vector lengths
        i++;
        state.scale /= data[i];
        break;
      case 4: // Multiply vector lengths
        i++;
        state.scale *= data[i];
        break;
      case 5: // Push current location
        if (state.sp.length === 4) {
          throw new Error('The position stack is only four locations deep');
        }
        state.sp.push(state.currentPoint.clone());
        break;
      case 6: // Pop current location
        state.currentPoint = (state.sp.pop() as Point) ?? state.currentPoint;
        break;
      case 7: // Draw subshape
        i = this.handleSubshapeCommand(data, i, state);
        break;
      case 8: // X-Y displacement
        i = this.handleXYDisplacement(data, i, state);
        break;
      case 9: // Multiple X-Y displacements
        i = this.handleMultipleXYDisplacements(data, i, state);
        break;
      case 10: // Octant arc
        i = this.handleOctantArc(data, i, state);
        break;
      case 11: // Fractional arc
        i = this.handleFractionalArc(data, i, state);
        break;
      case 12: // Arc with bulge
        i = this.handleBulgeArc(data, i, state);
        break;
      case 13: // Multiple bulge arcs
        i = this.handleMultipleBulgeArcs(data, i, state);
        break;
      case 14: // Vertical text
        i = this.skipCode(data, ++i);
        // According to [special codes reference](https://help.autodesk.com/view/OARX/2023/ENU/?guid=GUID-06832147-16BE-4A66-A6D0-3ADF98DC8228),
        // If the orientation is vertical, the next code is processed. However, it results in current pos in state changes. Many font characters
        // in extended big font can be rendered correctly. So I comment out them for now. After I figure out the root cause, then add the following
        // logic back.
        //
        // i++;
        // if (this.fontData.content.orientation === 'horizontal') {
        //   i = this.skipCode(data, i);
        // } else {
        //   const next = data[i];
        //   if (next <= 0x0f) {
        //     i = this.handleSpecialCommand(next, data, i, state);
        //   } else {
        //     this.handleVectorCommand(next, state);
        //   }
        // }
        break;
    }

    return i;
  }

  private handleVectorCommand(
    command: number,
    state: {
      currentPoint: Point;
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): void {
    const len = (command & 0xf0) >> 4;
    const dir = command & 0x0f;
    const vec = this.getVectorForDirection(dir);

    state.currentPoint.add(vec.multiply(len * state.scale));
    if (state.isPenDown) {
      state.currentPolyline.push(state.currentPoint.clone());
    }
  }

  /**
   * Get the vector for the given direction code. Please refer to the following link for more information.
   * https://help.autodesk.com/view/OARX/2023/ENU/?guid=GUID-0A8E12A1-F4AB-44AD-8A9B-2140E0D5FD23
   * @param dir - The direction code of the vector
   * @returns Returns the vector for the given direction code
   */
  private getVectorForDirection(dir: number): Point {
    const vec = new Point();
    switch (dir) {
      case 0:
        vec.x = 1;
        break;
      case 1:
        vec.x = 1;
        vec.y = 0.5;
        break;
      case 2:
        vec.x = 1;
        vec.y = 1;
        break;
      case 3:
        vec.x = 0.5;
        vec.y = 1;
        break;
      case 4:
        vec.y = 1;
        break;
      case 5:
        vec.x = -0.5;
        vec.y = 1;
        break;
      case 6:
        vec.x = -1;
        vec.y = 1;
        break;
      case 7:
        vec.x = -1;
        vec.y = 0.5;
        break;
      case 8:
        vec.x = -1;
        break;
      case 9:
        vec.x = -1;
        vec.y = -0.5;
        break;
      case 10:
        vec.x = -1;
        vec.y = -1;
        break;
      case 11:
        vec.x = -0.5;
        vec.y = -1;
        break;
      case 12:
        vec.y = -1;
        break;
      case 13:
        vec.x = 0.5;
        vec.y = -1;
        break;
      case 14:
        vec.x = 1;
        vec.y = -1;
        break;
      case 15:
        vec.x = 1;
        vec.y = -0.5;
        break;
    }
    return vec;
  }

  private handleSubshapeCommand(
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      polylines: Point[][];
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): number {
    let i = index;
    let subCode = 0;
    let shape;
    let height = state.scale * this.fontData.content.height;
    let width = height;
    const origin = state.currentPoint.clone();

    if (state.currentPolyline.length > 1) {
      state.polylines.push(state.currentPolyline.slice());
      state.currentPolyline = [];
    }

    switch (this.fontData.header.fontType) {
      case ShxFontType.SHAPES:
        i++;
        subCode = data[i];
        break;
      case ShxFontType.BIGFONT:
        i++;
        subCode = data[i];
        // How to parse subcode here?
        //
        // - For a non-Unicode font the specification byte following code 7 is a shape number from 1 to 255.
        // - For a unicode font, code 7 is followed by a Unicode shape number from 1 to 65535. Unicode shape
        //   numbers should be counted as two bytes.
        // - For a non-extended big font, I didn't find document to describe it yet.
        // - For a extended big font, code is alway two bytes 7, 0 so that it can use the subshape feature.
        //   The format is as follows.
        // ...
        // 7,0,primitive#,basepoint-x,basepoint-y,width,height,
        // ...
        // ...
        // 7,0,primitive#,basepoint-x,basepoint-y,width,height,
        // .
        // terminator
        // +---------------+-------+----------+-----------------------------+
        // | Field         | Value | Byte Size| Description                 |
        // +---------------+-------+----------+-----------------------------+
        // | shape-number  | xxxx  | 2 bytes  | Character code              |
        // | code          | 7,0   | 2 bytes  | Extended font definition    |
        // | primitive#    | xxxx  | 2 bytes  | Refer to subshape number    |
        // | basepoint-x   |       | 1 byte   | Primitive X origin          |
        // | basepoint-y   |       | 1 byte   | Primitive Y origin          |
        // | width         |       | 1 byte   | Scale of primitive width    |
        // | height        |       | 1 byte   | Scale of primitive height   |
        // | terminator    | 0     | 1 byte   | End of shape definition     |
        // +---------------+-------+----------+-----------------------------+
        //
        // Please refer to the following article for more details.
        // About Defining an Extended Big Font File
        // https://help.autodesk.com/view/OARX/2023/ENU/?guid=GUID-00ED0CC6-A4BE-4591-93FA-598CC40AA43D
        if (subCode === 0) {
          i++;
          subCode = (data[i++] << 8) | data[i++];
          origin.x = ShxFileReader.byteToSByte(data[i++]) * state.scale;
          origin.y = ShxFileReader.byteToSByte(data[i++]) * state.scale;
          if (this.fontData.content.isExtended) {
            // Extended big font has seperated width and height value
            width = data[i++] * state.scale;
            height = data[i] * state.scale;
          } else {
            height = data[i] * state.scale;
          }
        }
        break;
      case ShxFontType.UNIFONT:
        i++;
        subCode = (data[i++] << 8) | data[i++];
        break;
    }

    if (subCode !== 0) {
      shape = this.getScaledSubshapeAtInsertPoint(subCode, width, height, origin);
      if (shape) {
        state.polylines.push(...shape.polylines.slice());
        // According to Autodesk SHP font specificaiton, I don't know whether the current position
        // should be changed after inserting one subshape. For now, it looks like that it should
        // not change current position.
        // state.currentPoint = shape.lastPoint ? shape.lastPoint.clone() : origin.clone();
      }
    }

    state.currentPolyline = [];
    // TBD: Not sure whether pen down should be reset here.
    // According to special code reference in AutoCAD help document.
    // https://help.autodesk.com/view/OARX/2023/ENU/?guid=GUID-06832147-16BE-4A66-A6D0-3ADF98DC8228
    // It mentions draw mode is not reset for the new shape.
    // When the subshape is complete, drawing the current shape resumes.
    // state.isPenDown = false;
    return i;
  }

  private handleXYDisplacement(
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): number {
    let i = index;
    const vec = new Point();
    vec.x = ShxFileReader.byteToSByte(data[++i]);
    vec.y = ShxFileReader.byteToSByte(data[++i]);
    state.currentPoint.add(vec.multiply(state.scale));
    if (state.isPenDown) {
      state.currentPolyline.push(state.currentPoint.clone());
    }
    return i;
  }

  private handleMultipleXYDisplacements(
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): number {
    let i = index;
    while (true) {
      const vec = new Point();
      vec.x = ShxFileReader.byteToSByte(data[++i]);
      vec.y = ShxFileReader.byteToSByte(data[++i]);
      if (vec.x === 0 && vec.y === 0) {
        break;
      }
      state.currentPoint.add(vec.multiply(state.scale));
      if (state.isPenDown) {
        state.currentPolyline.push(state.currentPoint.clone());
      }
    }
    return i;
  }

  private handleOctantArc(
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): number {
    let i = index;
    const radius = data[++i] * state.scale;
    const flag = ShxFileReader.byteToSByte(data[++i]);
    const startOctant = (flag & 0x70) >> 4;
    let octantCount = flag & 0x07;
    const isClockwise = flag < 0;
    const startRadian = (Math.PI / 4) * startOctant;
    const center = state.currentPoint
      .clone()
      .subtract(new Point(Math.cos(startRadian) * radius, Math.sin(startRadian) * radius));

    const arc = Arc.fromOctant(center, radius, startOctant, octantCount, isClockwise);

    if (state.isPenDown) {
      const arcPoints = arc.tessellate();
      state.currentPolyline.pop();
      state.currentPolyline.push(...arcPoints.slice());
    }
    state.currentPoint = arc.tessellate().pop()?.clone() as Point;
    return i;
  }

  private handleFractionalArc(
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): number {
    let i = index;
    const startOffset = data[++i];
    const endOffset = data[++i];
    const hr = data[++i];
    const lr = data[++i];
    const r = (hr * 255 + lr) * state.scale;
    const flag = ShxFileReader.byteToSByte(data[++i]);
    const n1 = (flag & 0x70) >> 4;
    let n2 = flag & 0x07;
    if (n2 === 0) {
      n2 = 8;
    }
    if (endOffset !== 0) {
      n2--;
    }

    const pi_4 = Math.PI / 4;
    let span = pi_4 * n2;
    let delta = CIRCLE_SPAN;
    let sign = 1;
    if (flag < 0) {
      delta = -delta;
      span = -span;
      sign = -1;
    }

    let startRadian = pi_4 * n1;
    let endRadian = startRadian + span;
    startRadian += ((pi_4 * startOffset) / 256) * sign;
    endRadian += ((pi_4 * endOffset) / 256) * sign;

    const center = state.currentPoint
      .clone()
      .subtract(new Point(r * Math.cos(startRadian), r * Math.sin(startRadian)));

    state.currentPoint = center
      .clone()
      .add(new Point(r * Math.cos(endRadian), r * Math.sin(endRadian)));

    if (state.isPenDown) {
      let currentRadian = startRadian;
      const points = [];
      points.push(
        center.clone().add(new Point(r * Math.cos(currentRadian), r * Math.sin(currentRadian)))
      );
      if (delta > 0) {
        while (currentRadian + delta < endRadian) {
          currentRadian += delta;
          points.push(
            center.clone().add(new Point(r * Math.cos(currentRadian), r * Math.sin(currentRadian)))
          );
        }
      } else {
        while (currentRadian + delta > endRadian) {
          currentRadian += delta;
          points.push(
            center.clone().add(new Point(r * Math.cos(currentRadian), r * Math.sin(currentRadian)))
          );
        }
      }
      // Always add the end point
      points.push(center.clone().add(new Point(r * Math.cos(endRadian), r * Math.sin(endRadian))));
      state.currentPolyline.push(...points);
    }
    return i;
  }

  private handleBulgeArc(
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): number {
    let i = index;
    const vec = new Point();
    vec.x = ShxFileReader.byteToSByte(data[++i]);
    vec.y = ShxFileReader.byteToSByte(data[++i]);
    const bulge = ShxFileReader.byteToSByte(data[++i]);
    state.currentPoint = this.handleArcSegment(
      state.currentPoint,
      vec,
      bulge,
      state.scale,
      state.isPenDown,
      state.currentPolyline
    );
    return i;
  }

  private handleMultipleBulgeArcs(
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): number {
    let i = index;
    while (true) {
      const vec = new Point();
      vec.x = ShxFileReader.byteToSByte(data[++i]);
      vec.y = ShxFileReader.byteToSByte(data[++i]);
      if (vec.x === 0 && vec.y === 0) {
        break;
      }
      const bulge = ShxFileReader.byteToSByte(data[++i]);
      state.currentPoint = this.handleArcSegment(
        state.currentPoint,
        vec,
        bulge,
        state.scale,
        state.isPenDown,
        state.currentPolyline
      );
    }
    return i;
  }

  private skipCode(data: Uint8Array, index: number) {
    const cb = data[index];
    switch (cb) {
      case 0x00:
        break;
      case 0x01:
        break;
      case 0x02:
        break;
      case 0x03:
      case 0x04:
        index++;
        break;
      case 0x05:
        break;
      case 0x06:
        break;
      case 0x07:
        switch (this.fontData.header.fontType) {
          case ShxFontType.SHAPES:
            index++;
            break;
          case ShxFontType.BIGFONT:
            {
              index++;
              const subCode = data[index];
              if (subCode === 0) {
                // Skip primitive#, basepoint-x, basepoint-y, width/height
                // primitive# is 2 bytes, basepoint-x 1, basepoint-y 1,
                // extended fonts have both width and height (2 bytes),
                // non-extended have only height (1 byte)
                index += this.fontData.content.isExtended ? 6 : 5;
              }
            }
            break;
          case ShxFontType.UNIFONT:
            index += 2;
            break;
        }
        break;
      case 0x08:
        index += 2;
        break;
      case 0x09:
        {
          const tmp = true;
          while (tmp) {
            const x = data[++index];
            const y = data[++index];
            if (x === 0 && y === 0) {
              break;
            }
          }
        }
        break;
      case 0x0a:
        index += 2;
        break;
      case 0x0b:
        index += 5;
        break;
      case 0x0c:
        index += 3;
        break;
      case 0x0d:
        {
          const tmp = true;
          while (tmp) {
            const x = data[++index];
            const y = data[++index];
            if (x === 0 && y === 0) {
              break;
            }
            index++;
          }
        }
        break;
      case 0x0e:
        break;
      default:
        break;
    }
    return index;
  }

  private getScaledSubshapeAtInsertPoint(
    code: number,
    width: number,
    height: number,
    insertPoint: Point
  ): ShxShape | undefined {
    // Obtain the unscaled subshape (local coordinates)
    let baseShape = this.shapeCache.get(code);
    if (!baseShape) {
      const data = this.fontData.content.data[code];
      if (!data) {
        return undefined;
      }
      baseShape = this.parseShape(data);
      this.shapeData.set(code, baseShape);
      this.shapeCache.set(code, baseShape);
    }

    const bbox = baseShape.bbox;

    // Normalize to left-bottom (0,0) before scaling and inserting its in parent space
    const normalized = baseShape.offset(new Point(-bbox.minX, -bbox.minY));
    const scaled = this.scaleShapeByHeightAndWidth(normalized, height, width);
    return scaled.offset(insertPoint);
  }

  /**
   * Handles drawing an arc segment with the given vector and bulge
   * @param currentPoint The starting point of the arc
   * @param vec The displacement vector
   * @param bulge The bulge value (will be normalized by 127.0)
   * @param scale The current scale factor
   * @param isPenDown Whether the pen is currently down (drawing)
   * @param currentPolyline The current polyline being built
   * @returns The new current point after the arc
   */
  private handleArcSegment(
    currentPoint: Point,
    vec: Point,
    bulge: number,
    scale: number,
    isPenDown: boolean,
    currentPolyline: Point[]
  ): Point {
    // Apply scale to vector
    vec.x *= scale;
    vec.y *= scale;

    // Clamp bulge value
    if (bulge < -127) {
      bulge = -127;
    }

    // Update current point position
    const newPoint = currentPoint.clone();
    if (isPenDown) {
      if (bulge === 0) {
        currentPolyline.push(newPoint.clone().add(vec));
      } else {
        // Create arc and get tessellated points
        const end = newPoint.clone().add(vec);
        const arc = Arc.fromBulge(newPoint, end, bulge / 127.0);
        const arcPoints = arc.tessellate();
        // Add all points except the first one (since currentPoint is already in the polyline)
        currentPolyline.push(...arcPoints.slice(1));
      }
    }
    newPoint.add(vec);
    return newPoint;
  }
}
