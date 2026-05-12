/**
 * Production-build detection. Vite resolves `import.meta.env.PROD` at build
 * time: `true` when emitted by `npm run build` (the bundle that gets deployed
 * to the Pi), `false` when running under `npm run dev`.
 *
 * Wrapped in a function so tests can mock the module rather than fighting
 * Vite's compile-time constant inlining.
 */
export function isProductionBuild(): boolean {
  return import.meta.env.PROD;
}
