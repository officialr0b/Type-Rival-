# Miles VRM audit

Audited September 8, 2026.

## Decision

Miles is a valid, well-rigged VRM 0.x humanoid and is a strong functional fit for the TypeRival Academy coach. The September 8 `miles1.vrm` export now allows use by everyone and allows commercial use. It remains a development asset because its author/title attribution is still undefined, its CC BY-ND label must match the rights holder's intended optimization rights, and its geometry and texture footprint are too large for a responsive public web experience.

An exact local development copy is available to the Academy viewer at `public/academy/miles.vrm`. It is explicitly ignored by Git and will not be included in a repository push or deployment.

## File integrity

- Current source: `miles1.vrm`
- Size: 86,963,480 bytes (82.93 MiB)
- SHA-256: `7ef4920a9e034338f36ab70db3cc8ccdb9e013a8e923cdab16b2dcd8bc9521e0`
- Container: valid binary glTF 2.0 with a correct declared length
- Exporter: `saturday06_blender_vrm_exporter_experimental_2.20.23`
- VRM generation: VRM 0.x, spec version `0.0`
- External assets: none; all image data is embedded and structural references resolve

## Visual inspection

The model renders successfully in a local Three.js/VRM viewer. Skin, face, hair, clothing, shoes, eyes, jewelry, and the cross-body bag are present. The character appears in a neutral T-pose with a plausible human scale and no immediately visible exploded geometry, missing textures, or broken skinning.

Approximate model-local dimensions are 1.516 m wide in the T-pose, 1.829 m high, and 0.511 m deep.

## Rig and animation readiness

- 64 scene nodes, 6 skins, and 54 joints per skin
- 53 humanoid bone mappings with no duplicate mapped nodes
- All required VRM humanoid bones are present
- Full arms, hands, individual finger chains, legs, feet, toes, spine, chest, neck, head, and eyes are mapped
- `upperChest` and `jaw` are absent, but they are optional for the planned tutorial
- Rest-pose rotations are neutral and scales are consistently 1
- All skin weights sum to 1, no vertices have zero total weight, and joint indices are valid
- No embedded animation clips, which is acceptable because Academy lesson animations can be supplied separately

The hand and finger mapping is sufficient for animated finger-placement demonstrations. Before production, it should be validated with representative keyboard poses, especially thumb reach, pinky reach, wrist rotation, and hand crossing.

## Face and gaze

- Head mesh exposes 60 morph targets
- 17 VRM expressions exist: five vowels, Blink, Joy, Angry, Sorrow, Fun, four gaze directions, Blink_L, Blink_R, and Neutral
- The general Blink expression is usable
- Blink_L, Blink_R, and Neutral contain no binds and currently do nothing
- Morph targets do not include readable names, which will make facial-animation maintenance harder
- Eye-look behavior is bone-based and the first-person bone is the head

Recommended correction: name the facial morph targets and add valid binds for left blink, right blink, and neutral before building coach dialogue animation.

## Geometry and render cost

- 9 meshes, 32 primitives/draw calls
- About 360,936 unique vertices
- About 602,000 triangles
- The two shoe meshes account for roughly 412,000 triangles and are the largest optimization opportunity
- Other notable meshes include the head at roughly 45,000 triangles, hair at roughly 46,500, pants at roughly 45,000, and bag at roughly 33,500
- 21 materials; all are marked double-sided
- 6 transparent blend materials and 2 masked materials

This is substantially heavier than a coach character should be for mobile web. Double-sided rendering and transparent materials further increase GPU cost.

## Textures and memory

- 32 embedded textures/images
- 3 textures are 4096 pixels; most others are 1024 pixels
- Compressed embedded image payload is about 15.1 MiB
- Estimated uncompressed GPU texture memory is about 339 MiB before runtime overhead

This footprint can cause slow first load, memory pressure, frame drops, tab reloads, and device heating on phones and tablets.

## Secondary motion

The file declares the VRM secondary-animation extension but defines no spring-bone groups or collider groups. Hair and accessories therefore have no actual VRM spring physics. Add only the limited secondary motion that improves the coach presentation; typing lessons should prioritize stable hands, face, and torso.

## Embedded license metadata

The current `miles1.vrm` export reports:

- title, author, contact, and reference: `undefined`
- allowed user: `Everyone`
- commercial usage: `Allow`
- license: `CC_BY_ND`
- violent and sexual usage: `Disallow`

This resolves the original commercial-use block. Before public release, populate the title and author so TypeRival can provide the attribution required by CC BY-ND. Because CC BY-ND normally prohibits distributing modified derivatives, confirm that TypeRival is the underlying rights holder or choose metadata that accurately permits the planned optimized derivative. Keep the source agreement or license record with the project.

## Production target

Create a separate web-optimized derivative while preserving the original high-quality master:

1. Correct creator and license metadata first.
2. Prefer a VRM 1.0 export for the production derivative.
3. Reduce the character to roughly 60,000–100,000 triangles, starting with the shoes and hidden clothing/body faces.
4. Target a downloadable payload below 10–15 MiB.
5. Resize textures to 1K or 2K where visual testing allows, and use KTX2/Basis texture compression.
6. Use mesh compression and consolidate materials/draw calls where safe.
7. Make opaque materials single-sided unless both sides are visibly required.
8. Repair left/right blink and neutral expression bindings and name morph targets.
9. Add a small, tested set of spring bones/colliders only if hair or accessory motion is desired.
10. Test the final derivative on iPhone Safari, Android Chrome, iPad Safari, desktop Safari, Chrome, and Firefox before release.

## Academy recommendation

Use Miles first as an animated, adaptive 3D coach without webcam tracking. The initial lesson set should combine camera framing, pose clips, highlighted hands/fingers, on-screen key guidance, and feedback generated from actual typing timing and error patterns. Keep a static 2D fallback for reduced-motion users, low-memory devices, slow connections, and WebGL failures.

Academy implementation has begun against a stable `/academy/miles.vrm` asset contract. The local high-detail copy supports development and visual testing now; the optimized, fully attributed derivative can replace it later without changing Academy lesson code.
