export class Point {
  x: number;
  y: number;

  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  set(x: number, y: number): Point {
    this.x = x;
    this.y = y;
    return this;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize(): Point {
    const length = this.length();
    if (length !== 0) {
      this.x /= length;
      this.y /= length;
    }
    return this;
  }

  clone(): Point {
    return new Point(this.x, this.y);
  }

  add(point: Point): Point {
    this.x += point.x;
    this.y += point.y;
    return this;
  }

  subtract(point: Point): Point {
    this.x -= point.x;
    this.y -= point.y;
    return this;
  }

  multiply(scalar: number): Point {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  divide(scalar: number): Point {
    if (scalar !== 0) {
      this.x /= scalar;
      this.y /= scalar;
    }
    return this;
  }

  distanceTo(point: Point): number {
    const dx = this.x - point.x;
    const dy = this.y - point.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
