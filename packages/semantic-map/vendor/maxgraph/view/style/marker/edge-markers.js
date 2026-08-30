/*
Copyright 2021-present The maxGraph project Contributors
Copyright (c) 2006-2015, JGraph Ltd
Copyright (c) 2006-2015, Gaudenz Alder

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
const isClassicOrClassicThin = (type) => type === 'classic' || type === 'classicThin';
const isDiamond = (type) => type === 'diamond';
/**
 * Generally used to create the "classic" and "block" marker factory methods.
 *
 * Here is an example the registration of a factory edge marker function with `createArrow`:
 * ```js
 * EdgeMarkerRegistry.add('classic', EdgeMarker.createArrow(2));
 * EdgeMarkerRegistry.add('blockThin', EdgeMarker.createArrow(3));
 * ```
 *
 * @since 0.18.0
 */
export const createArrow = (widthFactor) => (canvas, _shape, type, pe, unitX, unitY, size, _source, sw, filled) => {
    // The angle of the forward facing arrow sides against the x axis is
    // 26.565 degrees, 1/sin(26.565) = 2.236 / 2 = 1.118 ( / 2 allows for
    // only half the strokewidth is processed ).
    const endOffsetX = unitX * sw * 1.118;
    const endOffsetY = unitY * sw * 1.118;
    unitX *= size + sw;
    unitY *= size + sw;
    const pt = pe.clone();
    pt.x -= endOffsetX;
    pt.y -= endOffsetY;
    const f = !isClassicOrClassicThin(type) ? 1 : 3 / 4;
    pe.x += -unitX * f - endOffsetX;
    pe.y += -unitY * f - endOffsetY;
    return () => {
        canvas.begin();
        canvas.moveTo(pt.x, pt.y);
        canvas.lineTo(pt.x - unitX - unitY / widthFactor, pt.y - unitY + unitX / widthFactor);
        if (isClassicOrClassicThin(type)) {
            canvas.lineTo(pt.x - (unitX * 3) / 4, pt.y - (unitY * 3) / 4);
        }
        canvas.lineTo(pt.x + unitY / widthFactor - unitX, pt.y - unitY - unitX / widthFactor);
        canvas.close();
        if (filled) {
            canvas.fillAndStroke();
        }
        else {
            canvas.stroke();
        }
    };
};
/**
 * Generally used to create the "open" and "open thin" marker factory methods.
 *
 * Here is an example the registration of a factory edge marker function with `createOpenArrow`:
 * ```js
 * EdgeMarkerRegistry.add('open', createOpenArrow(2));
 * ```
 *
 * @since 0.18.0
 */
export const createOpenArrow = (widthFactor) => (canvas, _shape, _type, pe, unitX, unitY, size, _source, sw, _filled) => {
    // The angle of the forward facing arrow sides against the x axis is
    // 26.565 degrees, 1/sin(26.565) = 2.236 / 2 = 1.118 ( / 2 allows for
    // only half the strokewidth is processed ).
    const endOffsetX = unitX * sw * 1.118;
    const endOffsetY = unitY * sw * 1.118;
    unitX *= size + sw;
    unitY *= size + sw;
    const pt = pe.clone();
    pt.x -= endOffsetX;
    pt.y -= endOffsetY;
    pe.x += -endOffsetX * 2;
    pe.y += -endOffsetY * 2;
    return () => {
        canvas.begin();
        canvas.moveTo(pt.x - unitX - unitY / widthFactor, pt.y - unitY + unitX / widthFactor);
        canvas.lineTo(pt.x, pt.y);
        canvas.lineTo(pt.x + unitY / widthFactor - unitX, pt.y - unitY - unitX / widthFactor);
        canvas.stroke();
    };
};
/**
 * @since 0.18.0
 */
export const oval = (canvas, _shape, _type, pe, unitX, unitY, size, _source, _sw, filled) => {
    const a = size / 2;
    const pt = pe.clone();
    pe.x -= unitX * a;
    pe.y -= unitY * a;
    return () => {
        canvas.ellipse(pt.x - a, pt.y - a, size, size);
        if (filled) {
            canvas.fillAndStroke();
        }
        else {
            canvas.stroke();
        }
    };
};
/**
 * Generally used to create the "diamond" and "diamond thin" marker factory methods.
 *
 * ```js
 * EdgeMarkerRegistry.add('diamond', diamond);
 * EdgeMarkerRegistry.add('diamondThin', diamond);
 * ```
 *
 * @since 0.18.0
 */
export const diamond = (canvas, _shape, type, pe, unitX, unitY, size, _source, sw, filled) => {
    // The angle of the forward facing arrow sides against the x axis is
    // 45 degrees, 1/sin(45) = 1.4142 / 2 = 0.7071 ( / 2 allows for
    // only half the strokewidth is processed ). Or 0.9862 for thin diamond.
    // Note these values and the tk variable below are dependent, update
    // both together (saves trig hard coding it).
    const swFactor = isDiamond(type) ? 0.7071 : 0.9862;
    const endOffsetX = unitX * sw * swFactor;
    const endOffsetY = unitY * sw * swFactor;
    unitX *= size + sw;
    unitY *= size + sw;
    const pt = pe.clone();
    pt.x -= endOffsetX;
    pt.y -= endOffsetY;
    pe.x += -unitX - endOffsetX;
    pe.y += -unitY - endOffsetY;
    // thickness factor for diamond
    const tk = isDiamond(type) ? 2 : 3.4;
    return () => {
        canvas.begin();
        canvas.moveTo(pt.x, pt.y);
        canvas.lineTo(pt.x - unitX / 2 - unitY / tk, pt.y + unitX / tk - unitY / 2);
        canvas.lineTo(pt.x - unitX, pt.y - unitY);
        canvas.lineTo(pt.x - unitX / 2 + unitY / tk, pt.y - unitY / 2 - unitX / tk);
        canvas.close();
        if (filled) {
            canvas.fillAndStroke();
        }
        else {
            canvas.stroke();
        }
    };
};
