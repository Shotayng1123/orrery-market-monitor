/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_BYPASS?: string;
  readonly VITE_DEV_MOCK?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }

/** The id of this build (vite.config.ts): the commit on GitHub, the build time elsewhere. */
declare const __BUILD_ID__: string;
