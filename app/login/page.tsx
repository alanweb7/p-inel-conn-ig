
import { LoginForm } from '@/components/auth/LoginForm'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Login - OpenClaw',
  description: 'Acesse sua conta',
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-24 bg-gray-50">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">OpenClaw</h1>
        <p className="text-gray-500 mt-2">Gerenciamento de Integrações</p>
      </div>
      <LoginForm />
    </div>
  )
}
