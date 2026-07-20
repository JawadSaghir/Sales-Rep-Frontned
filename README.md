# Sales Rep Training — Next.js export

Converted from the HTML/DC prototype into a working Next.js 14 (App Router) app.

## Structure
- `app/page.tsx` — main dashboard (sidebar nav, roleplay type / buyer persona / profile / difficulty / emotion selectors, Analytics placeholder tab)
- `app/roleplay/page.tsx` — voice training call screen (WebGL reactive orb, live transcript, timer, mute, End Call → redirects to `/?tab=analytics`)
- `lib/data.ts` — shared static data (nav items, roleplay types, personas, profiles, script)

## Run
```
cd nextjs-export
npm install
npm run dev
```

## Notes
- Mic access (`getUserMedia`) drives the orb's energy/pitch; falls back to a simulated pulse if denied/unavailable — same behavior as the prototype.
- Styling is inline (`style={{}}`) mirroring the original — swap in your own CSS/Tailwind/design system as needed.
- Analytics tab is a placeholder; wire up real call scoring data when available.
