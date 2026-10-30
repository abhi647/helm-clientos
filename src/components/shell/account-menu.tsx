'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { KeyRound, LogOut, Shield } from 'lucide-react'
import { Avatar } from '@/components/ui'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** The avatar button: who is signed in, sign-in settings and sign out. */
export function AccountMenu({ name, email, customer }: { name: string; email: string; customer: boolean }) {
  // outside the menu: the menu unmounts as soon as an item is chosen, before a button inside it could submit
  const signOut = useRef<HTMLFormElement>(null)
  return (
    <>
    <form ref={signOut} action="/auth/signout" method="post" hidden />
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Account: ${name}`}
        className="flex size-9 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:size-10">
        <Avatar name={name} customer={customer} size={30} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2 font-normal">
          <Avatar name={name} customer={customer} size={32} />
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{name}</span><span className="block truncate text-xs text-muted-foreground">{email}</span></span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/account/password" className="no-underline"><KeyRound />Password and passkeys</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/privacy" className="no-underline"><Shield />Privacy</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => signOut.current?.requestSubmit()}><LogOut />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  )
}
