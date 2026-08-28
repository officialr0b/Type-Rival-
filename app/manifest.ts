import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TypeRival — Competitive Typing',
    short_name: 'TypeRival',
    description: 'Practice your speed, challenge friends, and climb the competitive typing ladder.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#050b14',
    theme_color: '#07111f',
    orientation: 'any',
    categories: ['games', 'sports', 'education'],
    icons: [
      {
        src: '/icon.png',
        sizes: '1254x1254',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '1254x1254',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
