import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '@/components/auth/AuthForm';

export const metadata: Metadata = { title: 'Create Account — RailGaadi' };

export default function RegisterPage() {
  return (
    <div className="py-10">
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </div>
  );
}
