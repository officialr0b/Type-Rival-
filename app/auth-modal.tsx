'use client';

import { useState, type FormEvent } from 'react';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '../lib/supabase-browser';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'update';

export default function AuthModal({ open, initialMode = 'signin', onClose, onAuthenticated }: {
  open: boolean;
  initialMode?: AuthMode;
  onClose: () => void;
  onAuthenticated: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const configured = isSupabaseConfigured();

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const client = getSupabaseBrowserClient();
    if (!client) return setError('Supabase connection details have not been added yet.');
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        if (password !== confirmPassword) throw new Error('Those passwords do not match.');
        const { data, error: authError } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/?auth=confirmed` },
        });
        if (authError) throw authError;
        if (data.session) onAuthenticated();
        else setNotice('Check your email to confirm your TypeRival account, then come back and sign in.');
      } else if (mode === 'signin') {
        const { error: authError } = await client.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        onAuthenticated();
      } else if (mode === 'forgot') {
        const { error: authError } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/?auth=reset`,
        });
        if (authError) throw authError;
        setNotice('If that email has an account, a password-reset link is on the way.');
      } else {
        if (password.length < 8) throw new Error('Use at least 8 characters for your new password.');
        if (password !== confirmPassword) throw new Error('Those passwords do not match.');
        const { error: authError } = await client.auth.updateUser({ password });
        if (authError) throw authError;
        window.history.replaceState({}, '', '/');
        setNotice('Password updated. You are signed in.');
        onAuthenticated();
      }
    } catch (caught) {
      setError(friendlyAuthError(caught));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return setError('Supabase connection details have not been added yet.');
    setBusy(true); setError('');
    const { error: authError } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (authError) { setError(friendlyAuthError(authError)); setBusy(false); }
  };

  const title = mode === 'signup' ? 'Create your rival profile.' : mode === 'forgot' ? 'Reset your password.' : mode === 'update' ? 'Choose a new password.' : 'Welcome back, rival.';

  return (
    <div className="modal-backdrop auth-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <section className="auth-modal">
        <button className="auth-close" onClick={onClose} aria-label="Close account window">×</button>
        <span className="wordmark-mark">TR</span>
        <span className="eyebrow">TYPERIVAL ACCOUNT</span>
        <h2 id="auth-title">{title}</h2>
        <p>{mode === 'signup' ? 'Save your progress, enter Ranked, and build your 30-day record.' : mode === 'forgot' ? 'Enter the email connected to your account.' : mode === 'update' ? 'Your new password must contain at least 8 characters.' : 'Sign in to continue your verified history.'}</p>

        {!configured && <div className="auth-config-note"><b>ACCOUNT SETUP PENDING</b><span>The interface is ready. Add the Supabase project URL and publishable key to activate it.</span></div>}

        {(mode === 'signin' || mode === 'signup') && (
          <button className="google-button" onClick={google} disabled={busy || !configured}><b>G</b> CONTINUE WITH GOOGLE</button>
        )}
        {(mode === 'signin' || mode === 'signup') && <div className="auth-divider"><span>OR USE EMAIL</span></div>}

        <form className="auth-form" onSubmit={submit}>
          {mode !== 'update' && <label><span>EMAIL</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.com" /></label>}
          {mode !== 'forgot' && <label><span>{mode === 'update' ? 'NEW PASSWORD' : 'PASSWORD'}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={8} /></label>}
          {(mode === 'signup' || mode === 'update') && <label><span>CONFIRM PASSWORD</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={8} /></label>}
          {error && <div className="auth-message error" role="alert">{error}</div>}
          {notice && <div className="auth-message success" role="status">{notice}</div>}
          <button className="primary-button auth-submit" disabled={busy || !configured}>{busy ? 'WORKING…' : mode === 'signup' ? 'CREATE ACCOUNT' : mode === 'forgot' ? 'SEND RESET LINK' : mode === 'update' ? 'UPDATE PASSWORD' : 'SIGN IN'}</button>
        </form>

        <div className="auth-switches">
          {mode === 'signin' && <><button onClick={() => setMode('forgot')}>Forgot password?</button><button onClick={() => setMode('signup')}>Create an account</button></>}
          {mode === 'signup' && <button onClick={() => setMode('signin')}>Already have an account? Sign in</button>}
          {(mode === 'forgot' || mode === 'update') && <button onClick={() => setMode('signin')}>← Back to sign in</button>}
        </div>
        <small>By continuing, you agree to TypeRival’s beta rules, privacy, and fair-play standards. Players under 13 use private local practice only.</small>
      </section>
    </div>
  );
}

function friendlyAuthError(value: unknown) {
  const message = value instanceof Error ? value.message : 'Account request failed. Please try again.';
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email before signing in.';
  if (/already registered|already been registered/i.test(message)) return 'That email already has an account. Try signing in.';
  if (/rate limit/i.test(message)) return 'Too many attempts. Wait a moment and try again.';
  return message;
}
