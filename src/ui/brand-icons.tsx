/** Provider brand marks (monochrome, currentColor). Lucide dropped brand icons; these stay tiny and
 * dependency-free so the onboarding and profile rows render the same glyphs everywhere. */
type IconProps={size?:number;className?:string};

/** Twitch glitch mark. */
export function TwitchIcon({size=18,className}:IconProps){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className} focusable="false">
    <path d="M4.3 3 3 6.4v12.2h3.9V21h2.5l2.4-2.4h3.2l4.1-4.1V3H4.3Zm14.2 10.4-2.4 2.4h-3.9l-2.1 2.1v-2.1H6.2V4.7h12.3v8.7Z"/>
    <path d="M9.6 7.2h1.7v5h-1.7v-5Zm4.2 0h1.7v5h-1.7v-5Z"/>
  </svg>;
}

/** Google "G" mark in its canonical four colors (falls back to currentColor in monochrome contexts). */
export function GoogleIcon({size=18,className}:IconProps){
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className} focusable="false">
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"/>
    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.3v3.1A12 12 0 0 0 12 24Z"/>
    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z"/>
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"/>
  </svg>;
}

/** Phantom wallet ghost mark. */
export function PhantomIcon({size=18,className}:IconProps){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className} focusable="false">
    <path d="M12 2.4c-4.6 0-8.3 3.7-8.3 8.3v8.2c0 1.6 1.3 2.9 2.9 2.9 1 0 1.9-.5 2.5-1.3.5.8 1.4 1.3 2.4 1.3 1 0 2-.6 2.5-1.5.5.9 1.5 1.5 2.5 1.5 1.6 0 2.9-1.3 2.9-2.9V10.7c0-4.6-3.7-8.3-8.4-8.3Zm-3 8.1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Zm6 0a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"/>
  </svg>;
}
