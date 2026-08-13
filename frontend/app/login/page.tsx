import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '@/components/auth/AuthForm';

export const metadata: Metadata = { title: 'Sign In — RailGaadi' };

export default function LoginPage() {
  return (
    <div className="py-10">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  );
}
