import type { Metadata } from 'next';
import Image from 'next/image';
import { signIn } from '../../auth';
import { Icon } from '../../lib/icons';
import { GoogleSignInButton } from '../../components/google-sign-in-button';

export const metadata: Metadata = {
  title: 'Sign in | AI Cast Member',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string | string[]; error?: string | string[] };
}) {
  const callbackUrl = Array.isArray(searchParams.callbackUrl)
    ? searchParams.callbackUrl[0]
    : searchParams.callbackUrl;
  const error = Array.isArray(searchParams.error) ? searchParams.error[0] : searchParams.error;
  const redirectTo = getSafeRedirect(callbackUrl);

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <div className="auth-brand">
          <Image
            src="/insidesuccess-logo.jpg"
            alt="Inside Success"
            width={72}
            height={72}
            priority
            className="auth-mark"
          />
        </div>

        <section className="card auth-card">
          <h1 className="auth-title">
            Welcome to AI Cast <span className="accent">Member</span>
          </h1>
          <p className="auth-sub">Sign in to start your sales roleplay training.</p>

          {error ? (
            <div className="auth-error">
              This Google account is not approved for AI Cast Member. Use your Inside Success TV,
              Inside Success, Mawer Capital, or Next Level CEO TV email.
            </div>
          ) : null}

          <form
            action={async () => {
              'use server';
              await signIn('google', { redirectTo });
            }}
          >
            <GoogleSignInButton />
          </form>

          <p className="auth-note">
            <Icon name="lock" size={14} strokeWidth={2.2} />
            Use your company Google account
          </p>
        </section>
      </div>
    </main>
  );
}

function getSafeRedirect(value: string | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  if (value.startsWith('/sign-in')) return '/';
  return value;
}
