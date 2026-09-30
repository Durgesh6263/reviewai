import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://reviewai.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pricing', '/login', '/register', '/verify-email'],
        disallow: ['/r/', '/dashboard/', '/admin/', '/api/'],
      },
    ],
    sitemap: `${baseUrl.replace(/\/$/, '')}/sitemap.xml`,
  };
}
