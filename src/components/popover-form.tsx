'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** A button that opens a small form in a popover (overtrue/shadcn), in place of a hand-made dropdown panel. */
export function PopoverForm({ trigger, children, width = 340, align = 'end', variant = 'default', size = 'default' }: {
  trigger: ReactNode; children: ReactNode; width?: number; align?: 'start' | 'center' | 'end'; variant?: 'default' | 'outline'; size?: 'default' | 'sm'
}) {
  return (
    <Popover>
      <PopoverTrigger asChild><Button type="button" variant={variant} size={size}>{trigger}</Button></PopoverTrigger>
      <PopoverContent align={align} className="p-3" style={{ width }}>{children}</PopoverContent>
    </Popover>
  )
}
