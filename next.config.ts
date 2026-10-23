import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Include Next's public entrypoints so the isolated server never resolves a
  // second Next installation from a parent checkout (separate request contexts).
  outputFileTracingIncludes: {'/*':['./node_modules/next/**/*']},
  outputFileTracingExcludes: {'/*':['./.data/**','./.data-test-*/**','./.handoff/**','./.env*','./.dev.vars*','./.local-accounts.txt','./.wrangler/**','./.npm-cache/**','./dist/**']},
};

export default nextConfig;
