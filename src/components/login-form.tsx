'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authClient } from '@/lib/auth-client';
import { Button } from './ui/button';
const schema = z.object({
  email: z.email(),
  password: z.string().min(12).max(128),
  name: z.string().max(100).optional(),
});
export function LoginForm({ configured }: { configured: boolean }) {
  const [registering, setRegistering] = useState(false),
    [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const submit = handleSubmit(async (values) => {
    setError('');
    if (!configured) {
      setError('Database connection has not been configured for this deployment.');
      return;
    }
    try {
      const result = registering
        ? await authClient.signUp.email({
            email: values.email,
            password: values.password,
            name: values.name?.trim() || 'Demo customer',
          })
        : await authClient.signIn.email({ email: values.email, password: values.password });
      if (result.error) {
        setError(result.error.message ?? 'Authentication failed');
        return;
      }
      const response = await fetch('/api/auth/get-session');
      const session = await response.json();
      window.location.assign(
        session.user?.role === 'BNPL_ADMIN'
          ? '/admin'
          : session.user?.role === 'BANK_ADMIN'
            ? '/bank'
            : '/app',
      );
    } catch {
      setError('Unable to reach authentication. Please try again.');
    }
  });
  return (
    <>
      <div className="tabs">
        <button className={!registering ? 'selected' : ''} onClick={() => setRegistering(false)}>
          Sign in
        </button>
        <button className={registering ? 'selected' : ''} onClick={() => setRegistering(true)}>
          Create account
        </button>
      </div>
      <form onSubmit={submit} className="form-stack">
        {registering && (
          <label>
            Full name
            <input autoComplete="name" {...register('name')} required />
          </label>
        )}
        <label>
          Email address
          <input
            type="email"
            autoComplete="email"
            placeholder="alice@crediflow.demo"
            {...register('email')}
          />
          {errors.email && <span className="field-error">Enter a valid email address.</span>}
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={registering ? 'new-password' : 'current-password'}
            {...register('password')}
          />
          {errors.password && <span className="field-error">Use 12–128 characters.</span>}
        </label>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <Button disabled={isSubmitting}>
          {isSubmitting
            ? 'Connecting…'
            : registering
              ? 'Create fictional account'
              : 'Sign in securely'}
        </Button>
      </form>
      <div className="demo-note">
        <strong>Exploring the demo?</strong>
        <p>
          Use your privately supplied demo password with <code>alice@crediflow.demo</code>,{' '}
          <code>admin@crediflow.demo</code>, or <code>bank@crediflow.demo</code>. Each account has a
          separate role.
        </p>
      </div>
    </>
  );
}
