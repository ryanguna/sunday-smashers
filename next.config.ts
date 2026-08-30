import type { NextConfig } from "next";

// Allow next/image to optimise photos served from the Supabase Storage bucket.
// The hostname is project-specific, so it is derived from the public Supabase
// URL rather than hardcoded. When the env var is absent (demo mode and CI) the
// list is empty, which is correct — there is no bucket to load from.
const supabaseHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https" as const,
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
