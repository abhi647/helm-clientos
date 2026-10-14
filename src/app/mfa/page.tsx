import { redirect } from 'next/navigation'

/** Two-step sign-in was removed; old links and bookmarks land on the home page. */
export default function Mfa() {
  redirect('/')
}
