import type { MetadataRoute } from 'next';
import { getCanonicalSiteUrl } from '@/lib/public-url';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getCanonicalSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pricing', '/login', '/register', '/verify-email'],
        disallow: ['/r/', '/dashboard/', '/admin/', '/api/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
