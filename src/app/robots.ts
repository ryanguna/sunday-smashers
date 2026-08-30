import type { MetadataRoute } from 'next'
import { PRIVATE_ROUTE_PREFIXES, SITE_URL, UNINDEXED_PUBLIC_PREFIXES } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // robots.txt matching is prefix-based, so no trailing slash — `/admin`
      // covers both `/admin` itself and everything beneath it.
      disallow: [...PRIVATE_ROUTE_PREFIXES, ...UNINDEXED_PUBLIC_PREFIXES],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
