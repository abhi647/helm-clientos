'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { IconCheck as Check, IconUpload as Upload } from '@tabler/icons-react'
import { chooseInitials, choosePhoto } from '@/app/account/profile-actions'
import { Avatar } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { AVATAR_COLORS } from '@/lib/avatar'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/** A centred square crop of the picture, 384px, as WebP: small, sharp on high-density screens. */
async function squareWebp(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('That file is not a picture we can read.')); i.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 384
    canvas.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 384, 384)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare the picture.'))), 'image/webp', 0.88))
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Upload a photo (cropped square in the browser), or make an avatar from your initials in a colour you pick. */
export function AvatarEditor({ userId, name, photo, color }: { userId: string; name: string; photo: string | null; color: string | null }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [preview, setPreview] = useState<{ src: string | null; color: string | null }>({ src: photo, color })

  const upload = (file: File) => start(async () => {
    if (file.size > 15 * 1024 * 1024) { toast.error('Use a picture under 15 MB.'); return }
    try {
      const blob = await squareWebp(file)
      const path = `${userId}/${crypto.randomUUID()}.webp`
      const { error } = await createClient().storage.from('avatars').upload(path, blob, { contentType: 'image/webp', upsert: false })
      if (error) throw new Error('The upload did not work. Please try again.')
      const res = await choosePhoto(path)
      if (!res.ok) throw new Error(res.error)
      setPreview({ src: URL.createObjectURL(blob), color })
      toast.success('Photo updated.')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The photo could not be saved.')
    }
  })

  const pick = (c: string) => start(async () => {
    const res = await chooseInitials(c)
    if (!res.ok) { toast.error(res.error); return }
    setPreview({ src: null, color: c })
    toast.success('Avatar updated.')
    router.refresh()
  })

  return (
    <div className="flex flex-wrap items-center gap-5">
      <Avatar name={name} size={88} src={preview.src} color={preview.color} />
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept="image/*" hidden aria-label="Upload a profile photo"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
          <Button type="button" size="sm" disabled={pending} onClick={() => input.current?.click()}><Upload />{preview.src ? 'Change photo' : 'Upload a photo'}</Button>
          <span className="text-xs text-muted-foreground">JPG, PNG or WebP. We crop it to a square.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{preview.src ? 'Or use your initials instead, in a colour:' : 'Or make one from your initials, in a colour:'}</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Avatar colour">
            {AVATAR_COLORS.map((c) => {
              const on = !preview.src && preview.color === c
              return (
                <button key={c} type="button" role="radio" aria-checked={on} aria-label={`Initials on ${c}`} disabled={pending} onClick={() => pick(c)}
                  style={{ background: c }} className={cn('grid size-7 cursor-pointer place-items-center rounded-full border-0 text-white ring-offset-2 ring-offset-card transition-shadow', on ? 'ring-2 ring-foreground' : 'hover:ring-2 hover:ring-border')}>
                  {on ? <Check className="size-3.5" /> : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
