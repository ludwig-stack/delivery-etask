import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.STAGE_ONE_LOCAL_PREVIEW ? {distDir:'.next-stage1'} : {}),
  // Vercel packages its own functions; standalone output is for self-hosting.
  output: process.env.VERCEL ? undefined : 'standalone',
  // The Vercel launcher loads Next's node-environment before route execution.
  // Trace those runtime files and their external helpers explicitly. The same
  // files keep standalone servers from resolving a parent Next installation.
  outputFileTracingIncludes: {'/*':[
    './node_modules/next/**/*',
    './node_modules/@swc/helpers/**/*',
    './node_modules/tslib/**/*',
    './node_modules/@next/env/**/*',
    './node_modules/styled-jsx/**/*',
    './node_modules/react/**/*',
    './node_modules/react-dom/**/*',
    './node_modules/react-server-dom-webpack/**/*',
    './node_modules/scheduler/**/*',
    './node_modules/client-only/**/*',
    './node_modules/baseline-browser-mapping/**/*',
    './node_modules/caniuse-lite/**/*',
  ]},
  outputFileTracingExcludes: {'/*':['./.next-stage1/**','./.data/**','./.data-test-*/**','./**/*.sqlite','./**/*.sqlite-*','./**/*.db','./**/*.db-*','./.handoff/**','./.env*','./.dev.vars*','./.local-accounts.txt','./.wrangler/**','./.npm-cache/**','./dist/**']},
};

export default nextConfig;
