/*
Copyright 2021-present The maxGraph project Contributors

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
import Cell from '../cell/Cell.js';
import Geometry from '../geometry/Geometry.js';
// @ts-expect-error The properties of PartialGraph are defined elsewhere.
export const VertexMixin = {
    vertexLabelsMovable: false,
    allowNegativeCoordinates: true,
    isAllowNegativeCoordinates() {
        return this.allowNegativeCoordinates;
    },
    setAllowNegativeCoordinates(value) {
        this.allowNegativeCoordinates = value;
    },
    insertVertex(...args) {
        let parent;
        let id;
        let value;
        let x;
        let y;
        let width;
        let height;
        let style;
        let relative;
        let geometryClass;
        if (args.length === 1 && typeof args[0] === 'object') {
            const params = args[0];
            parent = params.parent;
            id = params.id;
            value = params.value;
            x = 'x' in params ? params.x : params.position?.[0];
            y = 'y' in params ? params.y : params.position?.[1];
            width = 'width' in params ? params.width : params.size?.[0];
            height = 'height' in params ? params.height : params.size?.[1];
            style = params.style;
            relative = params.relative;
            geometryClass = params.geometryClass;
        }
        else {
            // Otherwise treat as arguments
            [parent, id, value, x, y, width, height, style, relative, geometryClass] = args;
        }
        const vertex = this.createVertex(parent, id, value, x, y, width, height, style, relative, geometryClass);
        return this.addCell(vertex, parent);
    },
    createVertex(_parent, id, value, x, y, width, height, style, relative = false, geometryClass = Geometry) {
        // Creates the geometry for the vertex
        const geometry = new geometryClass(x, y, width, height);
        geometry.relative = relative;
        // Creates the vertex
        const vertex = new Cell(value, geometry, style);
        vertex.setId(id); // this is not an issue to set undefined here. If so, the id will be auto-generated when adding the cell to the model
        vertex.setVertex(true);
        vertex.setConnectable(true);
        return vertex;
    },
    getChildVertices(parent) {
        return this.getChildCells(parent, true, false);
    },
    isVertexLabelsMovable() {
        return this.vertexLabelsMovable;
    },
    setVertexLabelsMovable(value) {
        this.vertexLabelsMovable = value;
    },
};
