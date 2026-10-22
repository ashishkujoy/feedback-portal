import { getRouteApi } from '@tanstack/react-router';
import { useSettings } from '../branding/use-settings.ts';
import { Callout } from '../ui/callout.tsx';
import { GoogleSignInButton } from '../ui/google-sign-in-button.tsx';

const route = getRouteApi('/login');

/** Why the API sent the browser back here; anything unexpected reads as a failed sign-in. */
const SignInProblem = ({ error }: Readonly<{ error: string }>) =>
  error === 'unavailable' ? (
    <Callout type="warning" title="Google sign-in isn't set up">
      Ask whoever runs this portal to configure it.
    </Callout>
  ) : (
    <Callout type="issue" title="We couldn't sign you in">
      Check you chose the right Google account, or ask an admin to add your email.
    </Callout>
  );

/**
 * Not in the design: built from Kuat's authentication pattern (a centred card on the muted
 * canvas, one primary action) with the design's flat cards and type scale.
 */
export const LoginPage = () => {
  const { error } = route.useSearch();
  const settings = useSettings();
  return (
    <main className="grid min-h-screen place-items-center bg-muted p-4">
      <div className="flex w-full max-w-[400px] flex-col gap-6 border border-border bg-card p-8">
        <div className="flex flex-col gap-1">
          {/* The sidebar's brand block, recoloured for a light card. */}
          <div className="flex flex-col gap-0.5">
            {settings ? (
              <span className="text-base font-semibold tracking-[-0.2px]">
                {settings.programName}
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">Mentor portal</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            {settings
              ? `Use the ${settings.orgName} Google account an admin added for you.`
              : 'Use the Google account an admin added for you.'}
          </p>
        </div>
        {error ? <SignInProblem error={error} /> : null}
        <GoogleSignInButton />
      </div>
    </main>
  );
};
