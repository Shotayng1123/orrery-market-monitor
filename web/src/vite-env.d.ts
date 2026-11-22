/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_BYPASS?: string;
  readonly VITE_DEV_MOCK?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }

/** The id of this build (vite.config.ts): the commit on GitHub, the build time elsewhere. */
declare const __BUILD_ID__: string;
/** Whether this build carries the paper portfolio (vite.config.ts: every development server; in a build, the value of
 *  PAPER_ON_LIVE_SITE in src/lib/paper.ts). A build's code behind `__PAPER_BUILD__ ? … : …` is dropped when it is false. */
declare const __PAPER_BUILD__: boolean;
