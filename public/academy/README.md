# Academy coach asset

The Academy lesson engine runs with a lightweight coach preview by default. When the production model is ready, add it at `/academy/miles.vrm` and set `NEXT_PUBLIC_ACADEMY_MODEL_URL=/academy/miles.vrm`. No lesson or progress code needs to change.

The current development model is intentionally ignored by Git because it is about 83 MiB, contains roughly 602,000 triangles, and still reports an undefined author/title under CC BY-ND metadata. Do not remove the ignore rule until the public model is optimized and its attribution metadata matches the actual rights record.

Production target:

- VRM 1.0 preferred
- 60,000–100,000 triangles
- less than 10–15 MiB downloadable
- 1K/2K KTX2 textures where practical
- working facial-expression bindings
- populated title, author, and license metadata
