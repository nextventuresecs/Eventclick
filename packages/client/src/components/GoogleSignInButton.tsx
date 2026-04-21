import { GoogleLogin } from "@react-oauth/google";

interface Props {
  onToken: (idToken: string) => void;
  disabled?: boolean;
}

export const GoogleSignInButton = ({ onToken, disabled }: Props) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!clientId) {
    return (
      <div className="w-full rounded-md border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground">
        Google sign-in not configured (set VITE_GOOGLE_CLIENT_ID)
      </div>
    );
  }

  return (
    <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
      <GoogleLogin
        onSuccess={(credentialResponse) => {
          if (credentialResponse.credential) onToken(credentialResponse.credential);
        }}
        onError={() => {
          /* noop — user can retry */
        }}
        theme="outline"
        size="large"
        shape="rectangular"
        text="continue_with"
        width="100%"
      />
    </div>
  );
};
