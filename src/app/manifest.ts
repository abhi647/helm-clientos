import type { MetadataRoute } from 'next'

/** Installable app: "Add to Home Screen" on iPhone, "Install Helm" in Chrome and Edge. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Helm by Seven Billion',
    short_name: 'Helm',
    description: 'Projects, requests, approvals and updates with Seven Billion, in one place.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f4f6f7',
    theme_color: '#0f2a30',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'My Work', url: '/my-work', icons: [{ src: '/brand/icon-192.png', sizes: '192x192' }] },
      { name: 'Requests', url: '/requests', icons: [{ src: '/brand/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
