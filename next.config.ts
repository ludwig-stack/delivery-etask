import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel packages its own functions; standalone output is for self-hosting.
  output: process.env.VERCEL ? undefined : 'standalone',
  // Include Next's public entrypoints so the isolated server never resolves a
  // second Next installation from a parent checkout (separate request contexts).
  outputFileTracingIncludes: {'/*':['./node_modules/next/**/*']},
  outputFileTracingExcludes: {'/*':['./.data/**','./.data-test-*/**','./**/*.sqlite','./**/*.sqlite-*','./**/*.db','./**/*.db-*','./.handoff/**','./.env*','./.dev.vars*','./.local-accounts.txt','./.wrangler/**','./.npm-cache/**','./dist/**']},
};

export default nextConfig;
