# Coordinate Systems and Picking

This note describes the coordinate spaces used by `main.js`, how vertices move from
mesh data to the canvas, and how mouse picking reverses part of that process.

## Rendering Coordinate Flow

The rendering pipeline transforms every vertex through this chain:

```text
local/model space
  -> world space
  -> view/camera space
  -> clip space
  -> NDC
  -> viewport/screen pixels
```

In the vertex shader this appears as:

```glsl
gl_Position = u_projection * u_view * u_model * vec4(a_position, 1.0);
```

Matrix multiplication is evaluated from right to left.

## Local / Model Space

Local space is the mesh's own coordinate system. For example, the cube geometry in
`MeshFactory.createCube()` uses vertices around the origin:

```js
[-0.5, -0.5, 0.5]
[ 0.5, -0.5, 0.5]
```

These coordinates only describe the shape of the cube itself. They do not say
where the cube is in the scene.

The model matrix moves a point from local space to world space:

```text
worldPosition = modelMatrix * localPosition
```

`modelMatrix` represents the node's translation, rotation, and scale.

## World Space

World space is the shared coordinate system for the whole scene. Nodes, the grid,
and the camera all live in this space.

For example:

```js
camera.eye = [5, 4, 7];
camera.target = [0, 0, 0];
```

The view matrix moves world-space points into the camera's coordinate system:

```text
viewPosition = viewMatrix * worldPosition
```

Conceptually, this applies the inverse of the camera transform to the whole world,
so the camera can be treated as if it were at the origin.

## Camera Look-At Matrix

The camera is defined by:

```text
eye    = camera position
target = point the camera is looking at
up     = the approximate world direction that should appear upward on screen
```

For example:

```js
eye = [5, 4, 7];
target = [0, 0, 0];
up = [0, 1, 0];
```

The look-at matrix builds a camera basis:

```text
xAxis = camera right
yAxis = camera up
zAxis = camera back
```

The `zAxis` points behind the camera, not forward. This matches the usual
OpenGL/WebGL camera convention where the camera looks down negative z in view
space.

## View / Camera Space

View space is the scene as seen from the camera. In the usual OpenGL/WebGL
convention:

```text
camera position: origin
camera right:    +X
camera up:       +Y
camera forward:  -Z
```

Objects in front of the camera usually have a negative view-space z value.

The projection matrix moves view-space positions into clip space:

```text
clipPosition = projectionMatrix * viewPosition
```

For a perspective camera, the projection matrix is what creates the near-large,
far-small effect.

The near and far planes also affect depth-buffer precision. A needlessly tiny
near plane or extremely distant far plane can make depth conflicts more visible.

## Clip Space

Clip space is a 4D homogeneous coordinate:

```text
[x, y, z, w]
```

Before a point becomes a normalized screen coordinate, the GPU uses clip space to
decide whether primitives are inside the view frustum:

```text
-w <= x <= w
-w <= y <= w
-w <= z <= w
```

Then the GPU performs the perspective divide:

```text
ndcX = x / w
ndcY = y / w
ndcZ = z / w
```

## NDC

NDC means normalized device coordinates. In WebGL/OpenGL style, the visible range
is:

```text
x: -1 left,  +1 right
y: -1 bottom, +1 top
z: -1 near,  +1 far
```

The helper in `main.js` converts normalized canvas pointer coordinates to NDC:

```js
function toNdc(normalizedX, normalizedY) {
  return {
    x: normalizedX * 2 - 1,
    y: 1 - normalizedY * 2,
  };
}
```

The y value is flipped because DOM pointer coordinates normally use:

```text
y = 0 at the top
y = 1 at the bottom
```

WebGL NDC uses:

```text
y = +1 at the top
y = -1 at the bottom
```

`main.js` keeps pointer state in normalized DOM/canvas coordinates and only
derives NDC at the point where picking or unprojection needs WebGL coordinates.

## Viewport / Screen Pixels

The viewport maps NDC into actual canvas pixels. In `Viewer.resize()` this is set
with:

```js
gl.viewport(0, 0, width, height);
```

Conceptually:

```text
screenX = (ndcX + 1) / 2 * width
screenY = (ndcY + 1) / 2 * height
```

Browser pointer coordinates and WebGL viewport coordinates differ in y direction,
which is why pointer input is flipped when converting to NDC.

On high-DPI screens, the canvas CSS size differs from the drawing-buffer size.
The drawing-buffer size needs to be multiplied by `devicePixelRatio`, and the
camera projection must be updated when the canvas size changes so the image does
not stretch.

## Picking Flow

Picking reverses the camera/projection part of rendering:

```text
pointer normalized 0..1
  -> NDC x/y
  -> clip-space near point [x, y, -1, 1]
  -> clip-space far point  [x, y,  1, 1]
  -> inverse(projection * view)
  -> world-space near/far points
  -> world-space ray
  -> scene intersection
```

A `SelectionManager` implementation can create a ray like this:

```js
createRayFromPointer(normalizedX, normalizedY) {
  const ndc = toNdc(normalizedX, normalizedY);

  const viewProjection = multiplyMatrix4(
    this.camera.projectionMatrix,
    this.camera.viewMatrix,
  );
  const inverseViewProjection = invertMatrix4(viewProjection);

  const nearWorld = unproject(inverseViewProjection, [ndc.x, ndc.y, -1, 1]);
  const farWorld = unproject(inverseViewProjection, [ndc.x, ndc.y, 1, 1]);

  return {
    origin: nearWorld,
    direction: normalizeVector(subtractVectors(farWorld, nearWorld)),
  };
}
```

The implementation in `main.js` uses the near plane as the ray origin. That is
the visible frustum start and is closer to the idea of "this exact pixel on the
screen" than using `camera.eye` directly.

`unproject()` must multiply by the inverse view-projection matrix and then divide
by `w`:

```js
function unproject(inverseViewProjection, point) {
  const world = multiplyMatrix4Vector4(inverseViewProjection, point);

  return [
    world[0] / world[3],
    world[1] / world[3],
    world[2] / world[3],
  ];
}
```

The resulting ray can be passed to the scene:

```js
pick(normalizedX, normalizedY) {
  const ray = this.createRayFromPointer(normalizedX, normalizedY);
  const node = this.scene.findByRay(ray);

  if (node) {
    this.select(node);
  } else {
    this.clear();
  }

  return node;
}
```

## Scene Intersection

The common first implementation is CPU ray picking:

```text
ray -> each node's bounding volume -> closest hit wins
```

A simple version tests each node's axis-aligned bounding box (AABB). This is the
approach used by the AOSA 500 Lines modeller. It is fast and simple, but it is an
approximation: clicking an empty corner of a sphere's bounding box can still select
the sphere.

For higher precision, the usual progression is:

```text
ray vs bounding sphere/AABB
  -> ray vs triangle mesh
  -> acceleration structure such as BVH/octree for large scenes
```

Another common approach is GPU ID picking: render object IDs to an offscreen
buffer and read the pixel under the pointer. That can match the visible result
well, but it introduces extra rendering work and `readPixels` synchronization
costs.

`main.js` currently uses the slab method for ray/AABB tests: compute the ray's
enter and exit interval for the x, y, and z axis-aligned slabs. If the three
intervals overlap, the ray passes through the AABB.

Object movement projects the pointer ray onto a movement plane. Camera panning
moves both `eye` and `target`, so the view slides across the work plane. Camera
zoom moves `eye` along the `eye -> target` direction while clamping the distance.

## Matrix Storage

WebGL and GLSL interpret `mat4` data passed to `uniformMatrix4fv()` as
column-major. The helper matrices in `main.js` use the same layout.

In a column-major transform matrix, the translation components live in the last
column:

```text
[ ..., ..., ..., tx,
  ..., ..., ..., ty,
  ..., ..., ..., tz,
  ..., ..., ...,  1 ]
```

The matrix multiplication helper returns the same result as GLSL `a * b`.
Picking needs the inverse of `projection * view` to unproject clip-space points
back into world space.

## Short Summary

Rendering goes forward:

```text
local -> world -> camera -> clip -> NDC -> screen
```

Picking goes backward:

```text
screen -> NDC -> clip -> world ray -> scene hit test
```
