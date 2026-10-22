import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { signOut } from '../identity/sign-out.ts';

/** Not in the design: a quiet icon button at the end of the sidebar's user block. */
export const SignOutButton = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const onSignOut = () => {
    void signOut(queryClient, (options) => navigate(options));
  };
  return (
    <button
      type="button"
      aria-label="Sign out"
      title="Sign out"
      onClick={onSignOut}
      className="ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-md text-tech-blue-100 transition-colors duration-150 hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <LogOut aria-hidden size={18} strokeWidth={2} />
    </button>
  );
};
