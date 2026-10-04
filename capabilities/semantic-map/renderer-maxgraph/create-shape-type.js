import Shape from '../vendor/maxgraph/view/shape/Shape.js';

export const createShapeType = paintVertexShape => {
  const ShapeType = function (...args) {
    return Reflect.construct(Shape, args, new.target ?? ShapeType);
  };
  Object.setPrototypeOf(ShapeType, Shape);
  ShapeType.prototype = Object.create(Shape.prototype, {
    constructor: { configurable: true, value: ShapeType, writable: true },
    paintVertexShape: { configurable: true, value: paintVertexShape, writable: true },
  });
  return ShapeType;
};
