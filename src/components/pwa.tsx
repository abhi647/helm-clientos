'use client'

import { useEffect } from 'react'

/** Registers the service worker (production only), which makes Helm installable as an app. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* the site works without it */ })
  }, [])
  return null
}
