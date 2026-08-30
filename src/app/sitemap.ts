import type { MetadataRoute } from 'next'
import { PUBLIC_ROUTES, SITE_URL, routePriority } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route === '/' ? '' : route}`,
    lastModified,
    changeFrequency: route === '/live' ? ('hourly' as const) : ('weekly' as const),
    priority: routePriority(route),
  }))
}
