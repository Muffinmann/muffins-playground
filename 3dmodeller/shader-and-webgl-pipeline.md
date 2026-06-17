# Shader and WebGL Pipeline

This note collects the shader and WebGL rendering comments that were previously
inline in `main.js`.

## Shader Basics

WebGL drawing is split between CPU-side JavaScript and GPU-side shaders.
JavaScript prepares data and render state. Shaders run in parallel on the GPU to
compute vertex positions and pixel colors.

The vertex shader processes vertices. For most draw calls it runs once per input
vertex. Its most important output is `gl_Position`, the final clip-space position
of that vertex.

The fragment shader processes pixel fragments after primitives have been
rasterized. If a triangle or line covers a pixel, the fragment shader computes the
color for that fragment.

`attribute` in WebGL 1, or `in` in WebGL 2 / GLSL ES 3.00 vertex shaders,
represents data that can differ per vertex, such as position, color, normal, or
texture coordinate.

`uniform` represents data shared during one draw call, such as camera matrices,
model matrices, material colors, and light directions. JavaScript sends uniforms
to the shader with `gl.uniform...` calls.

`out` from the vertex shader and matching `in` in the fragment shader pass values
between the shader stages. For triangles, the GPU interpolates those values
across the primitive. For lines, it interpolates along the line.

## Unlit Shader

The unlit vertex shader reads `a_position` and `a_color` from JavaScript buffers.
It also reads `u_projection`, `u_view`, and `u_model`, which the CPU updates per
frame or per draw.

WebGL 2 uses GLSL ES 3.00. `#version 300 es` must be the first line of a shader.

The core transform is:

```glsl
gl_Position = u_projection * u_view * u_model * vec4(a_position, 1.0);
```

The multiplication order is:

```text
local/model space -> world space -> camera/view space -> clip space
```

The `w = 1.0` component means the vector is a point. Direction vectors usually
use `w = 0.0`.

The fragment shader receives `v_color` and writes `outColor`. WebGL 2 no longer
uses `gl_FragColor`; output variables are declared explicitly. `vec4(v_color,
1.0)` means RGB from the vertex color and a fully opaque alpha channel.

## Lit Shader

The lit shader also reads `a_normal`. A normal describes surface direction, which
is needed to decide how directly a face points toward a light.

Normals are directions rather than points, so only the rotation and scale part of
the model matrix should affect them. The current implementation uses
`mat3(u_model)` as a simple version. If non-uniform scaling is added later, this
should become a proper normal matrix.

The fragment shader uses a basic Lambert-style directional light:

```text
normal -> dot(normal, lightDirection) -> diffuse intensity
```

`u_lightDirection` stores only light direction, not light position.
`u_ambientLight` gives a minimum brightness so back-facing surfaces are not fully
black. `u_emission` adds light that is independent of direction, currently used
for selection highlighting.

## Shader Program Lifecycle

`createShader()` creates a GPU shader object. `gl.shaderSource()` attaches the
GLSL source string, and `gl.compileShader()` asks the browser/GPU driver to
compile it. Compilation errors are usually caused by GLSL syntax, version, or
variable-interface mistakes.

Most WebGL calls do not throw JavaScript exceptions directly, so important steps
must be checked explicitly with APIs like `gl.getShaderParameter()` and
`gl.getProgramParameter()`.

A WebGL program is a linked vertex shader plus fragment shader. `attachShader()`
adds compiled shaders to the program, and `linkProgram()` checks that the two
stages fit together. After a successful link, the shader objects can be deleted
because the linked program keeps the result internally.

## Buffers and Draw State

A buffer stores CPU-side arrays on the GPU. Vertex positions, colors, normals,
and similar attributes are commonly stored in buffers.

WebGL is a state machine. `bindBuffer()` switches the current `ARRAY_BUFFER`
binding, and `bufferData()` uploads the typed array to the GPU. `STATIC_DRAW`
signals that the data is not expected to change often.

Unbinding a buffer is not required, but it reduces the chance that later code
accidentally mutates the current binding.

## Context and Frame Setup

The app requests a `webgl2` context. `antialias` asks the browser to smooth
edges. `depth` enables a depth buffer so nearer geometry can hide farther
geometry. `stencil` is currently disabled because the app does not use stencil
operations.

`clearColor()` sets the color used by `gl.clear()`. `DEPTH_TEST` lets WebGL use
the depth buffer when deciding which fragments are visible. `CULL_FACE` discards
back-facing triangles, so mesh winding order matters.

Every frame clears the color and depth buffers before rendering. Otherwise old
color or depth data can remain visible. `viewport()` maps clip/NDC coordinates to
the canvas pixel rectangle.
