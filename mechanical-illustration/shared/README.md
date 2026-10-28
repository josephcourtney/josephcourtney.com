# Unified geometry-native SVG renderer

Both the [mechanical illustration](../) and [mesh studies](../stanford-bunny/) use
\`vector-core.js\`. It is the authoritative geometry/visibility/line and SVG
path kernel; no marching squares, raster sampling, or WebGL is used to generate
exported vector paths.

## Input contract

The scene adapter supplies **projected** surfaces, occluders and features:

- \`surfaces\`: \`{id,owner,poly,plane,bb?,minDepth?}\`. A polygon vertex contains
  \`x,y\` and the relevant depth coordinate. It may also carry \`light\`.
- \`occluders\`: \`{id,owner,source?,pts,plane,bb?,maxDepth?}\`, with convex
  projected faces (typically triangles).
- \`features\`: \`{id,owner,kind,points,adjacentIds?}\`, e.g. authored
  mechanical rims, mesh silhouettes or sharp creases.

Use \`depthKey:'d'\` for orthographic projection; \`depthKey:'inv'\` for
perspective. The depth planes are affine in screen coordinates in either
representation. The common \`renderProjectedScene\` resolves visible surface
fragments and clipped feature lines, grouped by semantic owner.

\`compileSVG\` produces a standalone semantic SVG. \`pathData\`,
\`mergedFillPath\`, and \`thresholdPolygon\` are shared by scene-specific
SVG presentations to retain existing authored materials, gradients and
UI overlays.

The mechanical frontend retains its articulated scene graph, inverse
kinematics, per-part caching, incremental DOM updates, and off-main-thread
workers. The mesh frontend retains its perspective camera and mesh-derived
features. These are **adapters and presentation policies**, not separate
visibility kernels.

## Verification

\`\`\`sh
node mechanical-illustration/shared/core.test.js
\`\`\`

Check the live pages in a browser for different orbit angles, CSS edits,
SVG export, and Safari touch interactions. The optional mechanical raster
motion preview is never used as the source of SVG geometry.

The versioned \`?v=2\` URL also ensures the main thread and Blob-backed
workers load the same kernel after deployment.
