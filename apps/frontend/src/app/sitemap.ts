import type { MetadataRoute } from 'next';
import { getCanonicalSiteUrl } from '@/lib/public-url';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getCanonicalSiteUrl();

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];
}
