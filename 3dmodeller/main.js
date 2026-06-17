"use strict";

const vertexShaderSource = `#version 300 es
in vec3 a_position;
in vec3 a_color;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_model;

out vec3 v_color;

void main() {
  v_color = a_color;
  gl_Position = u_projection * u_view * u_model * vec4(a_position, 1.0);
}
`;

const fragmentShaderSource = `#version 300 es
precision mediump float;

in vec3 v_color;

out vec4 outColor;

void main() {
  outColor = vec4(v_color, 1.0);
}
`;

const litVertexShaderSource = `#version 300 es
in vec3 a_position;
in vec3 a_normal;
in vec3 a_color;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_model;

out vec3 v_color;
out vec3 v_normal;

void main() {
  v_color = a_color;
  v_normal = mat3(u_model) * a_normal;

  gl_Position = u_projection * u_view * u_model * vec4(a_position, 1.0);
}
`;

const litFragmentShaderSource = `#version 300 es
precision mediump float;

in vec3 v_color;
in vec3 v_normal;

uniform vec3 u_lightDirection;
uniform vec3 u_ambientLight;
uniform vec3 u_emission;

out vec4 outColor;

void main() {
  vec3 normal = normalize(v_normal);
  vec3 lightDirection = normalize(u_lightDirection);
  float diffuse = max(dot(normal, lightDirection), 0.0);
  vec3 litColor = v_color * (u_ambientLight + diffuse);

  outColor = vec4(litColor + u_emission, 1.0);
}
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${message}`);
  }

  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program linking failed: ${message}`);
  }

  return program;
}

function createBuffer(gl, data, usage) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return buffer;
}

function createIdentityMatrix() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function createTranslationMatrix(position) {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    position[0], position[1], position[2], 1,
  ]);
}

function createRotationXMatrix(radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return new Float32Array([
    1, 0, 0, 0,
    0, cosine, sine, 0,
    0, -sine, cosine, 0,
    0, 0, 0, 1,
  ]);
}

function createRotationYMatrix(radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return new Float32Array([
    cosine, 0, -sine, 0,
    0, 1, 0, 0,
    sine, 0, cosine, 0,
    0, 0, 0, 1,
  ]);
}

function createRotationZMatrix(radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return new Float32Array([
    cosine, sine, 0, 0,
    -sine, cosine, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function createRotationMatrix(rotation) {
  const rotationX = createRotationXMatrix(rotation[0]);
  const rotationY = createRotationYMatrix(rotation[1]);
  const rotationZ = createRotationZMatrix(rotation[2]);

  return multiplyMatrix4(rotationZ, multiplyMatrix4(rotationY, rotationX));
}

function createScaleMatrix(scale) {
  return new Float32Array([
    scale[0], 0, 0, 0,
    0, scale[1], 0, 0,
    0, 0, scale[2], 0,
    0, 0, 0, 1,
  ]);
}

function createPerspectiveMatrix(fieldOfViewRadians, aspect, near, far) {
  const f = 1.0 / Math.tan(fieldOfViewRadians / 2);
  const rangeInverse = 1 / (near - far);

  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInverse, -1,
    0, 0, near * far * rangeInverse * 2, 0,
  ]);
}

function multiplyMatrix4(a, b) {
  const result = new Float32Array(16);

  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;

      for (let index = 0; index < 4; index += 1) {
        sum += a[index * 4 + row] * b[column * 4 + index];
      }

      result[column * 4 + row] = sum;
    }
  }

  return result;
}

function invertMatrix4(matrix) {
  const m00 = matrix[0], m01 = matrix[1], m02 = matrix[2], m03 = matrix[3];
  const m10 = matrix[4], m11 = matrix[5], m12 = matrix[6], m13 = matrix[7];
  const m20 = matrix[8], m21 = matrix[9], m22 = matrix[10], m23 = matrix[11];
  const m30 = matrix[12], m31 = matrix[13], m32 = matrix[14], m33 = matrix[15];

  const tmp0 = m22 * m33;
  const tmp1 = m32 * m23;
  const tmp2 = m12 * m33;
  const tmp3 = m32 * m13;
  const tmp4 = m12 * m23;
  const tmp5 = m22 * m13;
  const tmp6 = m02 * m33;
  const tmp7 = m32 * m03;
  const tmp8 = m02 * m23;
  const tmp9 = m22 * m03;
  const tmp10 = m02 * m13;
  const tmp11 = m12 * m03;
  const tmp12 = m20 * m31;
  const tmp13 = m30 * m21;
  const tmp14 = m10 * m31;
  const tmp15 = m30 * m11;
  const tmp16 = m10 * m21;
  const tmp17 = m20 * m11;
  const tmp18 = m00 * m31;
  const tmp19 = m30 * m01;
  const tmp20 = m00 * m21;
  const tmp21 = m20 * m01;
  const tmp22 = m00 * m11;
  const tmp23 = m10 * m01;

  const t0 = (tmp0 * m11 + tmp3 * m21 + tmp4 * m31) - (tmp1 * m11 + tmp2 * m21 + tmp5 * m31);
  const t1 = (tmp1 * m01 + tmp6 * m21 + tmp9 * m31) - (tmp0 * m01 + tmp7 * m21 + tmp8 * m31);
  const t2 = (tmp2 * m01 + tmp7 * m11 + tmp10 * m31) - (tmp3 * m01 + tmp6 * m11 + tmp11 * m31);
  const t3 = (tmp5 * m01 + tmp8 * m11 + tmp11 * m21) - (tmp4 * m01 + tmp9 * m11 + tmp10 * m21);
  const determinant = m00 * t0 + m10 * t1 + m20 * t2 + m30 * t3;

  if (Math.abs(determinant) < 0.000001) {
    return null;
  }

  const inverseDeterminant = 1 / determinant;

  return new Float32Array([
    inverseDeterminant * t0,
    inverseDeterminant * t1,
    inverseDeterminant * t2,
    inverseDeterminant * t3,
    inverseDeterminant * ((tmp1 * m10 + tmp2 * m20 + tmp5 * m30) - (tmp0 * m10 + tmp3 * m20 + tmp4 * m30)),
    inverseDeterminant * ((tmp0 * m00 + tmp7 * m20 + tmp8 * m30) - (tmp1 * m00 + tmp6 * m20 + tmp9 * m30)),
    inverseDeterminant * ((tmp3 * m00 + tmp6 * m10 + tmp11 * m30) - (tmp2 * m00 + tmp7 * m10 + tmp10 * m30)),
    inverseDeterminant * ((tmp4 * m00 + tmp9 * m10 + tmp10 * m20) - (tmp5 * m00 + tmp8 * m10 + tmp11 * m20)),
    inverseDeterminant * ((tmp12 * m13 + tmp15 * m23 + tmp16 * m33) - (tmp13 * m13 + tmp14 * m23 + tmp17 * m33)),
    inverseDeterminant * ((tmp13 * m03 + tmp18 * m23 + tmp21 * m33) - (tmp12 * m03 + tmp19 * m23 + tmp20 * m33)),
    inverseDeterminant * ((tmp14 * m03 + tmp19 * m13 + tmp22 * m33) - (tmp15 * m03 + tmp18 * m13 + tmp23 * m33)),
    inverseDeterminant * ((tmp17 * m03 + tmp20 * m13 + tmp23 * m23) - (tmp16 * m03 + tmp21 * m13 + tmp22 * m23)),
    inverseDeterminant * ((tmp14 * m22 + tmp17 * m32 + tmp13 * m12) - (tmp16 * m32 + tmp12 * m12 + tmp15 * m22)),
    inverseDeterminant * ((tmp20 * m32 + tmp12 * m02 + tmp19 * m22) - (tmp18 * m22 + tmp21 * m32 + tmp13 * m02)),
    inverseDeterminant * ((tmp18 * m12 + tmp23 * m32 + tmp15 * m02) - (tmp22 * m32 + tmp14 * m02 + tmp19 * m12)),
    inverseDeterminant * ((tmp22 * m22 + tmp16 * m02 + tmp21 * m12) - (tmp20 * m12 + tmp23 * m22 + tmp17 * m02)),
  ]);
}

function transformPoint4(matrix, point) {
  return [
    matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12] * point[3],
    matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13] * point[3],
    matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14] * point[3],
    matrix[3] * point[0] + matrix[7] * point[1] + matrix[11] * point[2] + matrix[15] * point[3],
  ];
}

function homogeneousDivide(point) {
  return [
    point[0] / point[3],
    point[1] / point[3],
    point[2] / point[3],
  ];
}

function intersectRayAabb(ray, bounds) {
  let tMin = 0;
  let tMax = Infinity;

  for (let axis = 0; axis < 3; axis += 1) {
    const origin = ray.origin[axis];
    const direction = ray.direction[axis];
    const min = bounds.min[axis];
    const max = bounds.max[axis];

    if (Math.abs(direction) < 0.000001) {
      if (origin < min || origin > max) {
        return null;
      }

      continue;
    }

    let t1 = (min - origin) / direction;
    let t2 = (max - origin) / direction;

    if (t1 > t2) {
      const temp = t1;
      t1 = t2;
      t2 = temp;
    }

    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);

    if (tMin > tMax) {
      return null;
    }
  }

  return tMin;
}

function intersectRayPlane(ray, point, normal) {
  const denominator = dotVectors(ray.direction, normal);

  if (Math.abs(denominator) < 0.000001) {
    return null;
  }

  const distance = dotVectors(subtractVectors(point, ray.origin), normal) / denominator;

  if (distance < 0) {
    return null;
  }

  return [
    ray.origin[0] + ray.direction[0] * distance,
    ray.origin[1] + ray.direction[1] * distance,
    ray.origin[2] + ray.direction[2] * distance,
  ];
}

function transformBounds(matrix, bounds) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const point = transformPoint4(matrix, [x, y, z, 1]);
        const worldPoint = homogeneousDivide(point);

        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], worldPoint[axis]);
          max[axis] = Math.max(max[axis], worldPoint[axis]);
        }
      }
    }
  }

  return { min, max };
}

function normalizeVector(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);

  if (length === 0) {
    return [0, 0, 0];
  }

  return [
    vector[0] / length,
    vector[1] / length,
    vector[2] / length,
  ];
}

function subtractVectors(a, b) {
  return [
    a[0] - b[0],
    a[1] - b[1],
    a[2] - b[2],
  ];
}

function crossVectors(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dotVectors(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function createLookAtMatrix(eye, target, up) {
  const zAxis = normalizeVector(subtractVectors(eye, target));
  const xAxis = normalizeVector(crossVectors(up, zAxis));
  const yAxis = crossVectors(zAxis, xAxis);

  return new Float32Array([
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -dotVectors(xAxis, eye), -dotVectors(yAxis, eye), -dotVectors(zAxis, eye), 1,
  ]);
}

function buildGrid(size, step) {
  const vertices = [];
  const half = size / 2;
  const axisColor = [0.78, 0.85, 0.95];
  const gridColor = [0.28, 0.34, 0.42];

  for (let value = -half; value <= half; value += step) {
    const color = Math.abs(value) < 0.0001 ? axisColor : gridColor;

    vertices.push(
      -half, 0, value, color[0], color[1], color[2],
      half, 0, value, color[0], color[1], color[2],
      value, 0, -half, color[0], color[1], color[2],
      value, 0, half, color[0], color[1], color[2],
    );
  }

  return new Float32Array(vertices);
}

class ShaderProgram {
  constructor(gl, vertexSource, fragmentSource) {
    this.gl = gl;
    this.program = createProgram(gl, vertexSource, fragmentSource);
    this.attributeLocations = new Map();
    this.uniformLocations = new Map();
  }

  use() {
    this.gl.useProgram(this.program);
  }

  attributeLocation(name) {
    if (!this.attributeLocations.has(name)) {
      this.attributeLocations.set(name, this.gl.getAttribLocation(this.program, name));
    }

    return this.attributeLocations.get(name);
  }

  uniformLocation(name) {
    if (!this.uniformLocations.has(name)) {
      this.uniformLocations.set(name, this.gl.getUniformLocation(this.program, name));
    }

    return this.uniformLocations.get(name);
  }

  setMatrix4(name, matrix) {
    const location = this.uniformLocation(name);
    if (location) {
      this.gl.uniformMatrix4fv(location, false, matrix);
    }
  }

  setVector3(name, vector) {
    const location = this.uniformLocation(name);
    if (location) {
      this.gl.uniform3fv(location, vector);
    }
  }
}

class Geometry {
  constructor(vertices, drawMode, layout) {
    this.vertices = vertices;
    this.drawMode = drawMode;
    this.layout = layout;
    this.vertexSize = layout.reduce((size, attribute) => {
      return Math.max(size, attribute.offset + attribute.size);
    }, 0);
    this.vertexCount = vertices.length / this.vertexSize;
    this.bounds = this.computeLocalBounds();
    this.buffer = null;
  }

  computeLocalBounds() {
    const positionAttribute = this.layout.find((attribute) => attribute.name === "a_position");

    if (!positionAttribute) {
      return null;
    }

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    for (let vertex = 0; vertex < this.vertexCount; vertex += 1) {
      const base = vertex * this.vertexSize + positionAttribute.offset;

      for (let axis = 0; axis < 3; axis += 1) {
        const value = this.vertices[base + axis];
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }

    return { min, max };
  }

  upload(gl) {
    this.buffer = createBuffer(gl, this.vertices, gl.STATIC_DRAW);
  }

  bind(gl, shaderProgram) {
    if (!this.buffer) {
      this.upload(gl);
    }

    const stride = this.vertexSize * Float32Array.BYTES_PER_ELEMENT;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

    for (const attribute of this.layout) {
      const location = shaderProgram.attributeLocation(attribute.name);

      if (location === -1) {
        continue;
      }

      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(
        location,
        attribute.size,
        gl.FLOAT,
        false,
        stride,
        attribute.offset * Float32Array.BYTES_PER_ELEMENT,
      );
    }
  }

  draw(gl, shaderProgram) {
    this.bind(gl, shaderProgram);
    gl.drawArrays(this.drawMode, 0, this.vertexCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
}

class Material {
  constructor(shaderProgram) {
    this.program = shaderProgram;
  }

  applyBaseUniforms(renderState, node) {
    this.program.use();
    this.program.setMatrix4("u_projection", renderState.projectionMatrix);
    this.program.setMatrix4("u_view", renderState.viewMatrix);
    this.program.setMatrix4("u_model", node.modelMatrix);
  }

  apply(renderState, node) {
    this.applyBaseUniforms(renderState, node);
  }
}

class UnlitMaterial extends Material {
}

class LambertMaterial extends Material {
  constructor(shaderProgram, options = {}) {
    super(shaderProgram);
    this.lightDirection = normalizeVector(options.lightDirection || [0.4, 0.8, 0.6]);
    this.ambientLight = options.ambientLight || [0.25, 0.25, 0.25];
  }

  apply(renderState, node) {
    super.apply(renderState, node);
    this.program.setVector3("u_lightDirection", this.lightDirection);
    this.program.setVector3("u_ambientLight", this.ambientLight);
    this.program.setVector3("u_emission", node.selected ? [0.25, 0.25, 0.18] : [0, 0, 0]);
  }
}

class Transform {
  constructor() {
    this.position = [0, 0, 0];
    this.rotation = [0, 0, 0];
    this.scale = [1, 1, 1];
  }

  matrix() {
    const translation = createTranslationMatrix(this.position);
    const rotation = createRotationMatrix(this.rotation);
    const scale = createScaleMatrix(this.scale);

    return multiplyMatrix4(translation, multiplyMatrix4(rotation, scale));
  }
}

class Node {
  static fromLitMesh(vertices, drawMode, material) {
    const geometry = new Geometry(
      vertices,
      drawMode,
      [
        { name: "a_position", size: 3, offset: 0 },
        { name: "a_normal", size: 3, offset: 3 },
        { name: "a_color", size: 3, offset: 6 },
      ],
    );

    return new Node(geometry, material);
  }

  static cube(drawMode, material) {
    return Node.fromLitMesh(MeshFactory.createCube(), drawMode, material);
  }

  static sphere(drawMode, material) {
    return Node.fromLitMesh(MeshFactory.createSphere(), drawMode, material);
  }

  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.transform = new Transform();
    this.modelMatrix = createIdentityMatrix();
    this.selected = false;
  }

  hitTest(ray) {
    if (!(this.material instanceof LambertMaterial) || !this.geometry.bounds) {
      return null;
    }

    const worldBounds = transformBounds(this.modelMatrix, this.geometry.bounds);

    return intersectRayAabb(ray, worldBounds);
  }

  updateModelMatrix() {
    this.modelMatrix = this.transform.matrix();
  }

  render(gl, renderState) {
    this.material.apply(renderState, this);
    this.geometry.draw(gl, this.material.program);
  }
}

class Scene {
  constructor() {
    // TODO: 后续可以把 flat list 升级成 scene graph：
    // GroupNode 持有 children，遍历时把父子 transform 组合起来。
    this.nodes = [];
    this.selectedNode = null;
    this.lastMovePoint = null;
    this.movePlanePoint = null;
    this.movePlaneNormal = null;
  }

  add(node) {
    this.nodes.push(node);
    return node;
  }

  remove(node) {
    // TODO: 实现删除节点。删除时还应考虑释放 geometry buffer。
    const index = this.nodes.indexOf(node);
    if (index >= 0) {
      this.nodes.splice(index, 1);
    }

    if (node === this.selectedNode) {
      this.clearSelection();
    }
  }

  findByRay(ray) {
    let nearestNode = null;
    let nearestDistance = Infinity;

    for (const node of this.nodes) {
      const distance = node.hitTest(ray);

      if (distance !== null && distance < nearestDistance) {
        nearestDistance = distance;
        nearestNode = node;
      }
    }

    return nearestNode;
  }

  select(node) {
    if (this.selectedNode) {
      this.selectedNode.selected = false;
    }

    this.selectedNode = node;

    if (node) {
      node.selected = true;
    }
  }

  clearSelection() {
    if (this.selectedNode) {
      this.selectedNode.selected = false;
    }

    this.selectedNode = null;
    this.lastMovePoint = null;
    this.movePlanePoint = null;
    this.movePlaneNormal = null;
  }

  pick(ray, movePlaneNormal) {
    if (!ray) {
      this.clearSelection();
      return null;
    }

    const node = this.findByRay(ray);

    if (node) {
      this.select(node);
      this.movePlanePoint = [...node.transform.position];
      this.movePlaneNormal = movePlaneNormal;
      this.lastMovePoint = intersectRayPlane(ray, this.movePlanePoint, this.movePlaneNormal);
    } else {
      this.clearSelection();
    }

    return node;
  }

  moveSelected(ray, fallbackMovePlaneNormal) {
    if (!this.selectedNode || !ray) {
      return null;
    }

    if (!this.movePlanePoint || !this.movePlaneNormal) {
      this.movePlanePoint = [...this.selectedNode.transform.position];
      this.movePlaneNormal = fallbackMovePlaneNormal;
    }

    const currentPoint = intersectRayPlane(ray, this.movePlanePoint, this.movePlaneNormal);

    if (!currentPoint) {
      return null;
    }

    if (!this.lastMovePoint) {
      this.lastMovePoint = currentPoint;
      return this.selectedNode.transform.position;
    }

    const delta = subtractVectors(currentPoint, this.lastMovePoint);
    const position = this.selectedNode.transform.position;
    this.selectedNode.transform.position = [
      position[0] + delta[0],
      position[1] + delta[1],
      position[2] + delta[2],
    ];
    this.selectedNode.updateModelMatrix();
    this.lastMovePoint = currentPoint;

    return this.selectedNode.transform.position;
  }

  placeNode(node, ray) {
    if (!node || !ray) {
      return null;
    }

    const position = intersectRayPlane(ray, [0, 0, 0], [0, 1, 0]);

    if (!position) {
      return null;
    }

    node.transform.position = position;
    node.updateModelMatrix();

    this.add(node);
    this.select(node);

    return node;
  }

  render(gl, renderState) {
    for (const node of this.nodes) {
      node.render(gl, renderState);
    }
  }
}

class Camera {
  constructor() {
    this.eye = [5, 4, 7];
    this.target = [0, 0, 0];
    this.up = [0, 1, 0];
    this.fieldOfView = Math.PI / 4;
    this.near = 0.1;
    this.far = 100;
    this.projectionMatrix = createIdentityMatrix();
    this.viewMatrix = createLookAtMatrix(this.eye, this.target, this.up);
  }

  resize(width, height) {
    this.projectionMatrix = createPerspectiveMatrix(this.fieldOfView, width / height, this.near, this.far);
  }

  updateViewMatrix() {
    this.viewMatrix = createLookAtMatrix(this.eye, this.target, this.up);
  }

  orbit(deltaX, deltaY) {
    const offset = subtractVectors(this.eye, this.target);
    const radius = Math.hypot(offset[0], offset[1], offset[2]);
    let theta = Math.atan2(offset[0], offset[2]);
    let phi = Math.acos(offset[1] / radius);
    const sensitivity = Math.PI;

    theta -= deltaX * sensitivity;
    phi -= deltaY * sensitivity;
    phi = clamp(phi, 0.01, Math.PI - 0.01);

    this.eye = [
      this.target[0] + radius * Math.sin(phi) * Math.sin(theta),
      this.target[1] + radius * Math.cos(phi),
      this.target[2] + radius * Math.sin(phi) * Math.cos(theta),
    ];
    this.updateViewMatrix();
  }

  pan(deltaX, deltaY) {
    const offset = subtractVectors(this.eye, this.target)
    const distance = Math.hypot(offset[0], offset[1], offset[2])
    const zAxis = normalizeVector(offset)
    const xAxis = normalizeVector(crossVectors(this.up, zAxis))
    const yAxis = crossVectors(zAxis, xAxis)

    const speed = distance * 1.5;

    const movement = [
      (-xAxis[0] * deltaX + yAxis[0] * deltaY) * speed,
      (-xAxis[1] * deltaX + yAxis[1] * deltaY) * speed,
      (-xAxis[2] * deltaX + yAxis[2] * deltaY) * speed,
    ]
    this.eye = [
      this.eye[0] + movement[0],
      this.eye[1] + movement[1],
      this.eye[2] + movement[2],
    ]

    this.target = [
      this.target[0] + movement[0],
      this.target[1] + movement[1],
      this.target[2] + movement[2],
    ]

    this.updateViewMatrix()
  }

  zoom(delta) {
    const offset = subtractVectors(this.eye, this.target)
    const distance = Math.hypot(offset[0], offset[1], offset[2])

    const speed = distance * 0.001
    const amount = delta * speed

    const minDistance = 0.5
    const maxDistance = 100
    const nextDistance = clamp(distance + amount, minDistance, maxDistance)

    const direction = normalizeVector(offset)

    this.eye = [
      this.target[0] + direction[0] * nextDistance,
      this.target[1] + direction[1] * nextDistance,
      this.target[2] + direction[2] * nextDistance,
    ]

    this.updateViewMatrix()
  }

}

function toNdc(normalizedX, normalizedY) {
  return {
    x: normalizedX * 2 - 1,
    y: 1 - normalizedY * 2,
  };
}

class MeshFactory {
  static createCube(color = [0.8, 0.35, 0.25]) {
    const [red, green, blue] = color;
    const faces = [
      {
        normal: [0, 0, 1],
        points: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]],
      },
      {
        normal: [0, 0, -1],
        points: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]],
      },
      {
        normal: [-1, 0, 0],
        points: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]],
      },
      {
        normal: [1, 0, 0],
        points: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]],
      },
      {
        normal: [0, 1, 0],
        points: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]],
      },
      {
        normal: [0, -1, 0],
        points: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]],
      },
    ];
    const vertices = [];
    for (const { normal, points } of faces) {
      const [p0, p1, p2, p3] = points;
      for (const point of [p0, p1, p2, p0, p2, p3]) {
        vertices.push(
          point[0], point[1], point[2],
          normal[0], normal[1], normal[2],
          red, green, blue,
        );
      }
    }
    return new Float32Array(vertices);
  }

  static createSphere(color = [0.25, 0.55, 0.9], radius = 0.5, latitudeBands = 16, longitudeBands = 24) {
    const [red, green, blue] = color;
    const vertices = [];

    const spherePoint = (latitude, longitude) => {
      const theta = (latitude / latitudeBands) * Math.PI;
      const phi = (longitude / longitudeBands) * Math.PI * 2;
      const sinTheta = Math.sin(theta);
      const normal = [
        sinTheta * Math.cos(phi),
        Math.cos(theta),
        sinTheta * Math.sin(phi),
      ];

      return {
        position: [
          normal[0] * radius,
          normal[1] * radius,
          normal[2] * radius,
        ],
        normal,
      };
    };

    const pushVertex = (point) => {
      vertices.push(
        point.position[0], point.position[1], point.position[2],
        point.normal[0], point.normal[1], point.normal[2],
        red, green, blue,
      );
    };

    for (let latitude = 0; latitude < latitudeBands; latitude += 1) {
      for (let longitude = 0; longitude < longitudeBands; longitude += 1) {
        const topLeft = spherePoint(latitude, longitude);
        const topRight = spherePoint(latitude, longitude + 1);
        const bottomLeft = spherePoint(latitude + 1, longitude);
        const bottomRight = spherePoint(latitude + 1, longitude + 1);

        for (const point of [topLeft, topRight, bottomRight, topLeft, bottomRight, bottomLeft]) {
          pushVertex(point);
        }
      }
    }

    return new Float32Array(vertices);
  }

  static createCylinder() {
    // TODO: 生成圆柱侧面和上下盖。
    throw new Error("MeshFactory.createCylinder is a modelling exercise TODO.");
  }
}

const MouseButtons = Object.freeze({
  LEFT: "left",
  MIDDLE: "middle",
  RIGHT: "right",
});

function normalizeMouseButton(button) {
  if (button === 0) {
    return MouseButtons.LEFT;
  }

  if (button === 1) {
    return MouseButtons.MIDDLE;
  }

  if (button === 2) {
    return MouseButtons.RIGHT;
  }

  return null;
}

class BrowserInputAdapter {
  constructor(canvas, interaction) {
    this.canvas = canvas;
    this.interaction = interaction;
    this.install();
  }

  install() {
    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    this.canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.interaction.handlePointerDown(this.createPointerInput(event));
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener("pointermove", (event) => {
      this.interaction.handlePointerMove(this.createPointerInput(event));
    });

    this.canvas.addEventListener("pointerup", (event) => {
      this.interaction.handlePointerUp(this.createPointerInput(event));
      this.canvas.releasePointerCapture(event.pointerId);
    });

    this.canvas.addEventListener("pointercancel", (event) => {
      this.interaction.handlePointerUp(this.createPointerInput(event));
    });

    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.interaction.handleWheel({
        ...this.createPointerInput(event),
        delta: event.deltaY,
      });
    }, { passive: false });

    window.addEventListener("keydown", (event) => {
      this.interaction.handleKey({
        key: event.key,
        code: event.code,
        pointer: this.interaction.pointer,
      });
    });
  }

  createPointerInput(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    return {
      x,
      y,
      button: normalizeMouseButton(event.button),
      pointerId: event.pointerId,
    };
  }
}

class Interaction {
  constructor() {
    this.pointer = {
      x: 0,
      y: 0,
    };
    this.previousPointer = null;
    this.pressedButton = null;
    this.callbacks = Object.create(null);
  }

  registerCallback(name, handler) {
    if (!this.callbacks[name]) {
      this.callbacks[name] = [];
    }

    this.callbacks[name].push(handler);
  }

  trigger(name, payload) {
    for (const handler of this.callbacks[name] || []) {
      handler(payload);
    }
  }

  handlePointerDown(input) {
    this.pressedButton = input.button;
    this.pointer = input;
    this.previousPointer = input;

    if (input.button === MouseButtons.LEFT) {
      this.trigger("pick", input);
    }
  }

  handlePointerMove(input) {
    const previous = this.previousPointer || input;
    const payload = {
      ...input,
      deltaX: input.x - previous.x,
      deltaY: input.y - previous.y,
      pressedButton: this.pressedButton,
    };

    this.pointer = input;
    this.previousPointer = input;

    if (this.pressedButton === MouseButtons.LEFT) {
      this.trigger("move", payload);
    } else if (this.pressedButton === MouseButtons.RIGHT) {
      this.trigger("orbit", payload);
    } else if (this.pressedButton === MouseButtons.MIDDLE) {
      this.trigger("pan", payload);
    }
  }

  handlePointerUp(input) {
    this.pointer = input;
    this.previousPointer = null;
    this.pressedButton = null;
  }

  handleWheel(input) {
    this.pointer = input;
    this.trigger("zoom", input);
  }

  handleKey(input) {
    if (input.key === "s") {
      this.trigger("place", { shape: "sphere", pointer: input.pointer });
    } else if (input.key === "c") {
      this.trigger("place", { shape: "cube", pointer: input.pointer });
    } else if (input.key === "ArrowUp") {
      this.trigger("scale", { up: true });
    } else if (input.key === "ArrowDown") {
      this.trigger("scale", { up: false });
    } else if (input.key === "ArrowLeft") {
      this.trigger("rotate_color", { forward: true });
    } else if (input.key === "ArrowRight") {
      this.trigger("rotate_color", { forward: false });
    }
  }
}

class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = this.createContext(canvas);
    this.unlitShader = new ShaderProgram(this.gl, vertexShaderSource, fragmentShaderSource);
    this.lambertShader = new ShaderProgram(this.gl, litVertexShaderSource, litFragmentShaderSource);
    this.unlitMaterial = new UnlitMaterial(this.unlitShader);
    this.lambertMaterial = new LambertMaterial(this.lambertShader);
    this.scene = new Scene();
    this.camera = new Camera();
    this.interaction = new Interaction();
    this.inputAdapter = new BrowserInputAdapter(canvas, this.interaction);
    this.registerInteractionCallbacks();

    this.configureWebGL();
    this.installResizeHandler();
    this.seedScene();
  }

  registerInteractionCallbacks() {
    this.interaction.registerCallback("pick", (pointer) => {
      const ray = this.createRayFromPointer(pointer.x, pointer.y);
      this.scene.pick(ray, this.cameraMovePlaneNormal());
    });

    this.interaction.registerCallback("move", (pointer) => {
      const ray = this.createRayFromPointer(pointer.x, pointer.y);
      this.scene.moveSelected(ray, this.cameraMovePlaneNormal());
    });

    this.interaction.registerCallback("orbit", (pointer) => {
      this.camera.orbit(pointer.deltaX, pointer.deltaY);
    });

    this.interaction.registerCallback("pan", (pointer) => {
      this.camera.pan(pointer.deltaX, pointer.deltaY);
    });

    this.interaction.registerCallback("zoom", (input) => {
      this.camera.zoom(input.delta);
    });

    this.interaction.registerCallback("place", ({ shape, pointer }) => {
      const ray = this.createRayFromPointer(pointer.x, pointer.y);
      const node = this.createNodeForShape(shape);
      this.scene.placeNode(node, ray);
    });
  }

  cameraMovePlaneNormal() {
    return normalizeVector(subtractVectors(this.camera.eye, this.camera.target));
  }

  createRayFromPointer(normalizedX, normalizedY) {
    const ndc = toNdc(normalizedX, normalizedY);
    const viewProjection = multiplyMatrix4(this.camera.projectionMatrix, this.camera.viewMatrix);
    const inverseViewProjection = invertMatrix4(viewProjection);

    if (!inverseViewProjection) {
      return null;
    }

    const nearClip = [ndc.x, ndc.y, -1, 1];
    const farClip = [ndc.x, ndc.y, 1, 1];
    const nearWorld = homogeneousDivide(transformPoint4(inverseViewProjection, nearClip));
    const farWorld = homogeneousDivide(transformPoint4(inverseViewProjection, farClip));

    return {
      origin: nearWorld,
      direction: normalizeVector(subtractVectors(farWorld, nearWorld)),
    };
  }

  createNodeForShape(shape) {
    if (shape === "cube") {
      return Node.cube(this.gl.TRIANGLES, this.lambertMaterial);
    }

    if (shape === "sphere") {
      return Node.sphere(this.gl.TRIANGLES, this.lambertMaterial);
    }

    return null;
  }

  createContext(canvas) {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      depth: true,
      stencil: false,
    });

    if (!gl) {
      throw new Error("WebGL 2 is not available in this browser.");
    }

    return gl;
  }

  configureWebGL() {
    const gl = this.gl;
    gl.clearColor(0.06, 0.075, 0.095, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  installResizeHandler() {
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  seedScene() {
    const gridGeometry = new Geometry(
      buildGrid(10, 1),
      this.gl.LINES,
      [
        { name: "a_position", size: 3, offset: 0 },
        { name: "a_color", size: 3, offset: 3 },
      ],
    );
    const cubeNode = this.createNodeForShape("cube");

    this.scene.add(new Node(gridGeometry, this.unlitMaterial));
    if (cubeNode) {
      this.scene.add(cubeNode);
    }
  }

  resize() {
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.gl.viewport(0, 0, width, height);
    this.camera.resize(width, height);
  }

  start() {
    const frame = () => {
      this.render();
      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }

  render() {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.scene.render(gl, {
      projectionMatrix: this.camera.projectionMatrix,
      viewMatrix: this.camera.viewMatrix,
    });
  }
}

function showError(error) {
  const errorNode = document.createElement("div");
  errorNode.id = "webgl-error";
  errorNode.textContent = error.message;
  document.body.appendChild(errorNode);
  console.error(error);
}

function main() {
  const canvas = document.querySelector("#viewport");

  try {
    const viewer = new Viewer(canvas);
    window.modeller = viewer;
    viewer.start();
  } catch (error) {
    showError(error);
  }
}

main();
