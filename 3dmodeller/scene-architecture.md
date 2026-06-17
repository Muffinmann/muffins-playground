# Scene Architecture

This note describes the responsibilities of the rendering classes in `main.js`.

## Grid

The grid is a reference object used to verify the rendering pipeline. It can also
remain as the modelling work plane. Its vertices are packed as:

```text
[x, y, z, r, g, b]
```

That means each grid vertex has a stride of 6 floats.

## ShaderProgram

`ShaderProgram` owns the GPU program itself. Its job is compile/link/use and
attribute/uniform location lookup. It should not know what an object means, which
material it uses, or what business concept a geometry represents.

## Geometry

`Geometry` owns vertex data, GPU buffer upload, attribute layout, and the draw
call. Attribute layout offsets are expressed in floats in the class API and are
converted to bytes when passed to WebGL.

## Material

`Material` decides how a node is drawn. It chooses a shader and sets uniforms
before drawing. The geometry decides where vertex data is read from.

## Node

`Node` is the smallest renderable scene unit. It combines:

```text
transform + geometry + material
```

It should not own shader or buffer details directly.

## Scene

`Scene` stores nodes, selection state, hit testing, placement, and object movement
state. It does not need to know WebGL details. Rendering a scene means asking each
node to render itself in order.

The current scene uses a flat list. A later scene graph could introduce group
nodes with children and combine parent/child transforms during traversal.

## Viewer

`Viewer` is the application coordinator. It owns the canvas, WebGL context, scene,
camera, interaction model, input adapter, and main loop. Modelling behavior should
prefer living in `Node`, `Scene`, or `Interaction` rather than growing inside
`Viewer`.

The initial scene creates a grid and a cube to confirm that the WebGL pipeline,
camera, picking, and resize behavior are working.
