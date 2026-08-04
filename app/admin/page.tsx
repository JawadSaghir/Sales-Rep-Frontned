import { redirect } from 'next/navigation';

// The admin console's entry point is the team overview. This route used to hold
// a client-side roster -> rep history -> SessionDetail dashboard; the console at
// /admin/team covers the same ground with the same data, so /admin now forwards
// there and there is one admin surface instead of two. The old screen is in git
// history if any of it is wanted back.
//
// The rep app's sidebar links here for admins (app/page.tsx), so this redirect
// keeps that link working.
export default function AdminIndex() {
  redirect('/admin/team');
}
