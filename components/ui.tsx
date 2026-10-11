import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function Spinner() {
  return (
    <div role="status" className="flex justify-center p-12 text-ink-soft">
      Lädt …
    </div>
  )
}

type Variant = 'primary' | 'secondary' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-teal text-white hover:bg-teal-dark',
  secondary: 'bg-white text-ink border border-line hover:bg-paper',
  danger: 'bg-white text-danger border border-danger/40 hover:bg-danger/5',
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  )
}

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold">{label}</span>
      <input {...props} className="min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-ink placeholder:text-ink-soft/60" />
      {hint && <span className="mt-1 block text-sm text-ink-soft">{hint}</span>}
    </label>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-card p-5 ${className}`}>{children}</section>
}

export function Notice({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-danger/40 bg-danger/5 text-danger',
    success: 'border-teal/40 bg-teal/5 text-teal-dark',
    info: 'border-line bg-paper text-ink-soft',
  }[kind]
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 ${styles}`}>
      {children}
    </p>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#16232f" />
      <path d="M9 11h5.2a3 3 0 1 1 5.6 0H25v5.2a3 3 0 1 0 0 5.6V25H9z" fill="#2fb3bd" />
    </svg>
  )
}
