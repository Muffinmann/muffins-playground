# Input and Interaction

This note collects the browser-input and modelling-interaction comments that were
previously inline in `main.js`.

## Mouse Button Normalization

DOM mouse and pointer events expose browser/platform button numbers. The app
translates those numbers into modelling names:

```text
0 -> left
1 -> middle
2 -> right
```

After that translation, the modelling layer only needs to care about
`"left"`, `"middle"`, and `"right"`.

## BrowserInputAdapter

`BrowserInputAdapter` is the system boundary for browser events. It knows about:

```text
DOM events
canvas bounding rectangles
contextmenu
pointer capture
wheel event passiveness
```

`Interaction` receives normalized modeller input and does not need direct access
to browser event objects.

The adapter disables the canvas context menu so right-drag can orbit the view
without opening the browser menu. It also calls `preventDefault()` on wheel events
so scrolling is reserved for 3D view zooming.

## Interaction Model

`Interaction` is the modeller's input model, similar to the `pressed`,
`mouse_loc`, and callback structure in the AOSA 500 Lines modeller. It does not
directly call camera or selection code. It emits semantic events and lets
registered callbacks connect those events to application behavior.

Current pointer semantics:

```text
left down       -> pick
left drag       -> move selected object
right drag      -> orbit camera
middle drag     -> pan camera
wheel           -> zoom camera
```

Current keyboard semantics:

```text
s          -> place sphere
c          -> place cube
ArrowUp    -> scale up
ArrowDown  -> scale down
ArrowLeft  -> rotate/color forward
ArrowRight -> rotate/color backward
```

Some command callbacks are only event boundaries for now and can be implemented
later in `Viewer` or a dedicated command layer.
