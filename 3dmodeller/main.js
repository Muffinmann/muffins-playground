"use strict";

// Shader 前置知识：
// 1. WebGL 的绘制分成 CPU 侧 JavaScript 和 GPU 侧 shader。JavaScript 负责准备数据和状态，
//    shader 负责在 GPU 上并行计算每个顶点和每个像素的结果。
// 2. Vertex shader 处理“顶点”。你传入多少个顶点，它通常就运行多少次。
//    它最重要的输出是 gl_Position，也就是这个顶点最终在屏幕裁剪空间里的位置。
// 3. Fragment shader 处理“像素片段”。三角形或线段被光栅化后，覆盖到哪些像素，
//    fragment shader 就会为这些像素计算颜色。
// 4. attribute/in 是“每个顶点不同”的数据，比如位置、颜色、法线、纹理坐标。
//    在 WebGL 2 / GLSL ES 3.00 里，vertex shader 用 in 接收这些数据。
// 5. uniform 是“一次 draw call 内共享”的数据，比如相机矩阵、模型矩阵、材质颜色、灯光方向。
//    JavaScript 通过 gl.uniform... 把 uniform 传进 shader。
// 6. out/in 可以把 vertex shader 的计算结果传给 fragment shader。
//    GPU 会自动对三角形内部的值做插值；画线时也会沿线插值。
// 7. 这里先用最小 shader：顶点只做矩阵变换，像素只输出颜色。
//    后续你可以再加入法线、光照、材质、选中高亮等概念。

// Vertex shader 在 GPU 上对每个顶点运行一次。
// a_position/a_color 是从 JavaScript buffer 读入的 per-vertex 数据。
// u_projection/u_view/u_model 是 CPU 每帧传给 GPU 的矩阵，用来把模型坐标变成屏幕裁剪坐标。
const vertexShaderSource = `#version 300 es
// WebGL 2 使用 GLSL ES 3.00。#version 必须放在 shader 的第一行。

// in 表示这个变量从 JavaScript 绑定的 vertex buffer 读取。
// 每个顶点都会有自己的 a_position，所以它是 attribute 级别的数据。
in vec3 a_position;

// 每个顶点也带一个颜色。当前 buffer 布局是 [x, y, z, r, g, b]。
in vec3 a_color;

// uniform 在一次 drawArrays 调用期间保持不变。
// projection: 相机投影矩阵，把 3D 相机空间压到裁剪空间，制造近大远小。
uniform mat4 u_projection;

// view: 相机视图矩阵，把世界坐标变成“从相机看出去”的坐标。
uniform mat4 u_view;

// model: 当前模型自己的变换矩阵，把模型本地坐标变成世界坐标。
uniform mat4 u_model;

// out 会传给 fragment shader。两个 shader 中变量类型和名字需要匹配。
out vec3 v_color;

void main() {
  // 直接把顶点颜色传下去。光栅化时 GPU 会在端点之间自动插值颜色。
  v_color = a_color;

  // gl_Position 是 vertex shader 必须写入的内置变量。
  // 乘法顺序是 projection * view * model * position：
  // local/model space -> world space -> camera/view space -> clip space。
  // vec4 的 w=1.0 表示这是一个点；如果是方向向量通常会用 w=0.0。
  gl_Position = u_projection * u_view * u_model * vec4(a_position, 1.0);
}
`;

// Fragment shader 在光栅化后对每个像素片段运行一次。
// 这里先只把 vertex shader 传下来的颜色写到 framebuffer，后续可在这里加入光照、材质或选中高亮。
const fragmentShaderSource = `#version 300 es
// fragment shader 需要声明浮点精度。mediump 对颜色足够用，做高精度计算时可考虑 highp。
precision mediump float;

// 这里接收 vertex shader 的 out vec3 v_color。
// 对三角形来说，这个颜色通常已经被 GPU 插值过；对线段则沿线插值。
in vec3 v_color;

// WebGL 2 不再使用 gl_FragColor，而是自己声明输出变量。
out vec4 outColor;

void main() {
  // vec4 是 RGBA。前三个分量来自顶点颜色，alpha=1.0 表示完全不透明。
  outColor = vec4(v_color, 1.0);
}
`;

function createShader(gl, type, source) {
  // createShader 只创建 GPU shader 对象；真正的 GLSL 源码还要通过 shaderSource 绑定进去。
  const shader = gl.createShader(type);
  // shaderSource 把字符串形式的 GLSL 代码交给 WebGL。
  gl.shaderSource(shader, source);
  // compileShader 让浏览器/GPU 驱动编译 GLSL。错误通常是语法、版本或变量名不匹配。
  gl.compileShader(shader);

  // WebGL 的大部分 API 不会直接 throw，所以关键步骤需要主动查询状态。
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${message}`);
  }

  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  // 一个 WebGL program 是 vertex shader + fragment shader 链接后的完整渲染管线。
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  // attachShader 把已编译的 shader 挂到 program 上，linkProgram 会检查两端接口是否匹配。
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  // program 链接成功后，shader 对象可以删除；program 内部已经保留了链接结果。
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
  // Buffer 是 CPU 数组上传到 GPU 后的存储对象；顶点位置、颜色、法线等通常都放在 buffer 里。
  const buffer = gl.createBuffer();
  // WebGL 是状态机：bindBuffer 会把当前 ARRAY_BUFFER 槽位切换到这个 buffer。
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // bufferData 把 TypedArray 数据真正上传到 GPU；STATIC_DRAW 表示数据不常变化。
  gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
  // 解绑不是必须的，但能减少后续代码误操作当前 buffer 的概率。
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return buffer;
}

function createIdentityMatrix() {
  // WebGL 矩阵传给 uniformMatrix4fv 时按 column-major 解释。
  // 这里的数组布局和 GLSL mat4 默认布局一致。
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function createPerspectiveMatrix(fieldOfViewRadians, aspect, near, far) {
  // 透视投影让远处物体变小；near/far 定义可见深度范围，也影响 depth buffer 精度。
  const f = 1.0 / Math.tan(fieldOfViewRadians / 2);
  const rangeInverse = 1 / (near - far);

  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInverse, -1,
    0, 0, near * far * rangeInverse * 2, 0,
  ]);
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
/**
 * 
 *  你的 3D 世界里有很多点：
 *
 *  世界坐标:
 *            y
 *            ^
 *            |
 *            |
 *            +--------> x
 *           /
 *          z
 *
 *  相机也在这个世界里：
 *
 *  eye = 相机位置
 *  target = 相机正在看的点
 *  up = 你希望屏幕上方大概朝哪个方向
 *
 *  比如：
 *
 *  eye = [5, 4, 7]
 *  target = [0, 0, 0]
 *  up = [0, 1, 0]
 *
 *  可以想象成：
 *
 *                      eye 相机
 *                     /|
 *                    / |
 *                   /  |
 *                  v   |
 *  target 原点 <--------+
 *   相机坐标系:
 *
 *            yAxis
 *              ^
 *              |
 *              |
 *              +------> xAxis
 *             /
 *            /
 *         zAxis
 *
 *  这三个轴分别表示：
 *
 *  xAxis = 相机的右边
 *  yAxis = 相机的上方
 *  zAxis = 相机的后方
 *
 *  注意这里 zAxis 是“相机后方”，不是前方
 */
function createLookAtMatrix(eye, target, up) {
  // view matrix 描述“相机怎么看世界”。本质上它把世界坐标变换到相机坐标系。
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
  // 这个网格只是验证渲染管线用的参考对象；正式建模时可以把它留作工作平面。
  // 每个顶点按 [x, y, z, r, g, b] 打包，所以 Node.render 里的 stride 是 6 个 float。
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

class RenderProgram {
  constructor(gl) {
    this.gl = gl;
    this.program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    // attribute location 指向 vertex buffer 中的 per-vertex 字段。
    // uniform location 指向每次 draw call 共享的参数，比如矩阵、材质、灯光。
    this.locations = {
      position: gl.getAttribLocation(this.program, "a_position"),
      color: gl.getAttribLocation(this.program, "a_color"),
      projection: gl.getUniformLocation(this.program, "u_projection"),
      view: gl.getUniformLocation(this.program, "u_view"),
      model: gl.getUniformLocation(this.program, "u_model"),
    };
  }

  use(projection, view) {
    const gl = this.gl;
    // useProgram 切换当前 draw call 使用的 shader program。
    gl.useProgram(this.program);
    // uniformMatrix4fv 把 CPU 侧矩阵传进 shader；第二个参数 false 表示不转置。
    gl.uniformMatrix4fv(this.locations.projection, false, projection);
    gl.uniformMatrix4fv(this.locations.view, false, view);
  }
}

class Transform {
  constructor() {
    // TODO: 把模型的平移、旋转、缩放集中在这里。
    // 之后 Node 不应该手写 modelMatrix，而是从 Transform 生成。
    this.position = [0, 0, 0];
    this.rotation = [0, 0, 0];
    this.scale = [1, 1, 1];
  }

  matrix() {
    // TODO: 实现 translate * rotate * scale 的组合矩阵。
    // 现在先返回 identity，保证脚手架不会改变现有网格的位置。
    return createIdentityMatrix();
  }
}

class Node {
  constructor(vertices, drawMode) {
    // Node 是 scene graph 的最小渲染单元。
    // 你可以从这里拆出 CubeNode/SphereNode/GroupNode，并给每种节点不同的 mesh 和行为。
    this.vertices = vertices;
    this.drawMode = drawMode;
    this.transform = new Transform();
    this.modelMatrix = createIdentityMatrix();
    this.vertexCount = vertices.length / 6;
    this.buffer = null;
  }

  upload(gl) {
    // 延迟上传：只有第一次 render 时才把顶点数据送到 GPU。
    // 后续如果节点几何形状变化，需要重新 bufferData 或换成 DYNAMIC_DRAW。
    this.buffer = createBuffer(gl, this.vertices, gl.STATIC_DRAW);
  }

  hitTest(ray) {
    // TODO: 实现拾取检测。常见做法是先算 AABB，再测试鼠标射线是否穿过包围盒。
    // ray 预期包含 origin/direction，通常由 Interaction 根据鼠标位置和相机矩阵反投影得到。
    void ray;
    return false;
  }

  updateModelMatrix() {
    // TODO: 当 Transform 实现后，用 this.transform.matrix() 取代手动维护 modelMatrix。
    this.modelMatrix = this.transform.matrix();
  }

  render(gl, program) {
    if (!this.buffer) {
      this.upload(gl);
    }

    // stride 表示两个相邻顶点在 buffer 里相隔多少字节。
    // 当前布局是 position(3 floats) + color(3 floats)。
    const stride = 6 * Float32Array.BYTES_PER_ELEMENT;

    // 选择当前节点的顶点 buffer，后续 vertexAttribPointer 都会从这个 ARRAY_BUFFER 读数据。
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    // 开启 a_position 属性，并说明它从 buffer 的第 0 字节开始，每次读 3 个 float。
    gl.enableVertexAttribArray(program.locations.position);
    gl.vertexAttribPointer(program.locations.position, 3, gl.FLOAT, false, stride, 0);
    // 开启 a_color 属性，并说明它从每个顶点的第 4 个 float 开始读取 rgb。
    gl.enableVertexAttribArray(program.locations.color);
    gl.vertexAttribPointer(program.locations.color, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
    // model matrix 是每个节点自己的局部到世界变换。不同节点 draw 前可以传不同矩阵。
    gl.uniformMatrix4fv(program.locations.model, false, this.modelMatrix);
    // drawArrays 根据 drawMode 解释顶点：LINES 画线段，TRIANGLES 画三角面。
    gl.drawArrays(this.drawMode, 0, this.vertexCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
}

class Scene {
  constructor() {
    // TODO: 后续可以把 flat list 升级成 scene graph：
    // GroupNode 持有 children，遍历时把父子 transform 组合起来。
    this.nodes = [];
  }

  add(node) {
    this.nodes.push(node);
    return node;
  }

  remove(node) {
    // TODO: 实现删除节点。删除时还应考虑释放 GPU buffer：gl.deleteBuffer(node.buffer)。
    const index = this.nodes.indexOf(node);
    if (index >= 0) {
      this.nodes.splice(index, 1);
    }
  }

  findByRay(ray) {
    // TODO: 实现从后往前或按距离排序的拾取逻辑，返回鼠标射线命中的最近节点。
    return this.nodes.find((node) => node.hitTest(ray)) || null;
  }

  render(gl, program) {
    // Scene 不直接关心 WebGL 细节，只负责按顺序要求每个节点渲染自己。
    for (const node of this.nodes) {
      node.render(gl, program);
    }
  }
}

class Camera {
  constructor() {
    // eye 是相机位置，target 是看向的点，up 定义“屏幕上方”对应的世界方向。
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
    // canvas 尺寸变化时，投影矩阵必须更新，否则画面会被拉伸。
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
    // 平移 eye 和 target，让相机视角在工作平面上移动。
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
    //  沿 eye -> target 方向移动相机
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

class SelectionManager {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.selectedNode = null;
  }

  select(node) {
    // TODO: 选择节点后，可以给节点设置 selected 状态，并让 fragment shader 做高亮。
    this.selectedNode = node;
  }

  clear() {
    this.selectedNode = null;
  }

  pick(normalizedX, normalizedY) {
    // TODO: 把 0..1 的屏幕坐标反投影成世界空间 ray，然后调用 scene.findByRay(ray)。
    // normalizedX/normalizedY 是 canvas 归一化坐标；需要 WebGL NDC 时按需调用 toNdc。
    const ndc = toNdc(normalizedX, normalizedY);
    void ndc;
    void normalizedX;
    void normalizedY;
    void this.camera;
    return this.scene.findByRay(null);
  }
}

function toNdc(normalizedX, normalizedY) {
  // NDC 是 WebGL 的 -1..1 坐标系。不要把它长期存在 pointer 状态里；
  // 在 picking/unproject 这类真正需要 WebGL 坐标的地方按需派生即可。
  return {
    x: normalizedX * 2 - 1,
    y: 1 - normalizedY * 2,
  };
}

class MeshFactory {
  // 返回立方体顶点数据。用 TRIANGLES，每个顶点包含 position + color。
  static createCube(color = [0.8, 0.35, 0.25]) {
    const [red, green, blue] = color;
    const faces = [
     [[-0.5, -0.5,  0.5], [ 0.5, -0.5,  0.5], [ 0.5,  0.5,  0.5], [-0.5,  0.5,  0.5]], // front
     [[ 0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5,  0.5, -0.5], [ 0.5,  0.5, -0.5]], // back
     [[-0.5, -0.5, -0.5], [-0.5, -0.5,  0.5], [-0.5,  0.5,  0.5], [-0.5,  0.5, -0.5]], // left
     [[ 0.5, -0.5,  0.5], [ 0.5, -0.5, -0.5], [ 0.5,  0.5, -0.5], [ 0.5,  0.5,  0.5]], // right
     [[-0.5,  0.5,  0.5], [ 0.5,  0.5,  0.5], [ 0.5,  0.5, -0.5], [-0.5,  0.5, -0.5]], // top
     [[-0.5, -0.5, -0.5], [ 0.5, -0.5, -0.5], [ 0.5, -0.5,  0.5], [-0.5, -0.5,  0.5]], // bottom
    ]
    // 每个面用两个三角形，注意 winding 顺序要和 CULL_FACE 匹配。
    const vertices = []
    for (const [p0, p1, p2, p3] of faces) {
      for (const point of [p0, p1, p2, p0, p2, p3]) {
        vertices.push(point[0], point[1], point[2], red, green, blue)
      }
    }
    return new Float32Array(vertices)
  }

  static createSphere() {
    // TODO: 用经纬线或细分多面体生成球体顶点。
    throw new Error("MeshFactory.createSphere is a modelling exercise TODO.");
  }

  static createCylinder() {
    // TODO: 生成圆柱侧面和上下盖。注意顶点顺序会影响 back-face culling。
    throw new Error("MeshFactory.createCylinder is a modelling exercise TODO.");
  }
}

const MouseButtons = Object.freeze({
  LEFT: "left",
  MIDDLE: "middle",
  RIGHT: "right",
});

function normalizeMouseButton(button) {
  // DOM 事件里的 button 是浏览器/平台层数字。这里把它翻译成建模器能理解的语义名称。
  // 之后模型层只关心 "left"/"middle"/"right"，不需要知道浏览器使用 0/1/2。
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
    // Adapter 是系统边界：它知道 DOM event、canvas rect、contextmenu、pointer capture。
    // Interaction 只接收归一化后的 modeller input，不直接依赖浏览器事件对象。
    this.canvas = canvas;
    this.interaction = interaction;
    this.install();
  }

  install() {
    this.canvas.addEventListener("contextmenu", (event) => {
      // 禁用 canvas 上的浏览器右键菜单，否则右键拖拽会弹出 Copy Image As / Inspect。
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
      // preventDefault 阻止页面滚动，把滚轮留给 3D 视图做 zoom。
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
    // Interaction 是建模器自己的输入模型，参考 AOSA 里的 pressed/mouse_loc/callbacks。
    // 它不认识 DOM event，也不直接调用 camera/selection；这些都通过 callback 连接。
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
      // AOSA 语义：左键按下先尝试 pick。真正的选择逻辑由 SelectionManager callback 实现。
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
      // AOSA 语义：左键拖动移动已选对象。当前 move 只是事件，模型移动后续实现。
      this.trigger("move", payload);
    } else if (this.pressedButton === MouseButtons.RIGHT) {
      // AOSA 语义：右键拖动旋转视图。当前实现接到 Camera.orbit。
      this.trigger("orbit", payload);
    } else if (this.pressedButton === MouseButtons.MIDDLE) {
      // AOSA 语义：中键拖动平移视图。
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
    // AOSA 里键盘输入会触发 place/scale/rotate_color 等建模器事件。
    // 这里先只建立事件边界，具体命令可以在 Viewer 里注册 callback。
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
    // Viewer 是应用协调者：它拥有 canvas/WebGL context、scene、camera、interaction 和主循环。
    // 具体的建模业务尽量放进 Node/Scene/Interaction，不要塞进 Viewer。
    this.canvas = canvas;
    this.gl = this.createContext(canvas);
    this.program = new RenderProgram(this.gl);
    this.scene = new Scene();
    this.camera = new Camera();
    this.selection = new SelectionManager(this.scene, this.camera);
    this.interaction = new Interaction();
    this.inputAdapter = new BrowserInputAdapter(canvas, this.interaction);
    this.registerInteractionCallbacks();

    this.configureWebGL();
    this.installResizeHandler();
    this.seedScene();
  }

  registerInteractionCallbacks() {
    this.interaction.registerCallback("pick", (pointer) => {
      this.selection.pick(pointer.x, pointer.y);
    });

    this.interaction.registerCallback("move", (pointer) => {
      // TODO: 如果有 selectedNode，把 pointer.deltaX/deltaY 转成世界空间位移。
      void pointer;
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
  }

  createContext(canvas) {
    // webgl2 是现代 WebGL 上下文；如果失败，说明浏览器或环境不支持 WebGL 2。
    const gl = canvas.getContext("webgl2", {
      // antialias 请求浏览器对边缘做抗锯齿。
      antialias: true,
      // depth 开启深度缓冲，让近处几何体遮挡远处几何体。
      depth: true,
      // stencil 当前暂时不用，关闭可以让 context 更简单。
      stencil: false,
    });

    if (!gl) {
      throw new Error("WebGL 2 is not available in this browser.");
    }

    return gl;
  }

  configureWebGL() {
    const gl = this.gl;
    // clearColor 设置每帧 gl.clear 清屏时使用的背景色，范围是 0..1。
    gl.clearColor(0.06, 0.075, 0.095, 1.0);
    // DEPTH_TEST 让 WebGL 根据深度缓冲决定片段前后关系。
    gl.enable(gl.DEPTH_TEST);
    // CULL_FACE 会丢弃背面三角形；建模时要注意顶点 winding 顺序。
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  installResizeHandler() {
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  seedScene() {
    // 初始场景只放一个网格，目的是确认 WebGL 管线、相机和 resize 都正常。
    // TODO: 你可以在这里添加 MeshFactory.createCube() 生成的节点，作为第一个建模对象。
    this.scene.add(new Node(buildGrid(10, 1), this.gl.LINES));
    this.scene.add(new Node(MeshFactory.createCube(), this.gl.TRIANGLES));
  }

  resize() {
    const pixelRatio = window.devicePixelRatio || 1;
    // canvas 的 CSS 尺寸和实际绘图 buffer 尺寸不同；高 DPI 屏幕上需要乘 devicePixelRatio。
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // viewport 告诉 WebGL 把裁剪空间映射到 canvas 的哪块像素区域。
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
    // 每帧都要清掉上一帧的颜色和深度，否则会残留旧画面或旧深度。
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.program.use(this.camera.projectionMatrix, this.camera.viewMatrix);
    this.scene.render(gl, this.program);
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
