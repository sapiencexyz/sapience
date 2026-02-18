import type { MetadataRoute } from 'next';

const manifest = (): MetadataRoute.Manifest => ({
  short_name: 'Sapience',
  name: 'Sapience',
  lang: 'en',
  start_url: '/markets',
  // Use HSL to comply with lint rule disallowing hex literals
  background_color: 'hsl(0 0% 100%)',
  theme_color: 'hsl(240 10% 3.9%)',
  dir: 'ltr',
  display: 'standalone',
  prefer_related_applications: false,
  icons: [
    {
      src: '/favicon.ico',
      purpose: 'any',
      sizes: '48x48 72x72 96x96 128x128 256x256',
    },
  ],
});

export default manifest;
