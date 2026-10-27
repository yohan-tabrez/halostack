'use client'

import { useId } from 'react'
import Link from 'next/link'

type LogoProps = {
  /** Show wordmark next to the mark */
  withWordmark?: boolean
  /** Link target; pass false to render a non-link mark */
  href?: string | false
  className?: string
  markClassName?: string
  wordmarkClassName?: string
}

function Mark({ className, gradientId }: { className?: string; gradientId: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M18.5 14.2A22 22 0 1 1 14.2 18.5"
        stroke={`url(#${gradientId})`}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <rect x="20" y="21" width="24" height="6.5" rx="3.25" fill="#22D3EE" />
      <rect x="20" y="30.75" width="24" height="6.5" rx="3.25" fill="#2563EB" />
      <rect x="20" y="40.5" width="24" height="6.5" rx="3.25" fill="#2563EB" />
      <defs>
        <linearGradient
          id={gradientId}
          x1="14"
          y1="14"
          x2="50"
          y2="50"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#22D3EE" />
          <stop offset="0.45" stopColor="#2563EB" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function Logo({
  withWordmark = true,
  href = '/',
  className = '',
  markClassName = 'h-8 w-8 shrink-0',
  wordmarkClassName = 'text-base font-semibold tracking-tight text-foreground',
}: LogoProps) {
  const gradientId = useId().replace(/:/g, '')
  const content = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark className={markClassName} gradientId={`halo-${gradientId}`} />
      {withWordmark ? <span className={wordmarkClassName}>HALOStack</span> : null}
    </span>
  )

  if (href === false) {
    return (
      <span role="img" aria-label="HALOStack">
        {content}
      </span>
    )
  }

  return (
    <Link
      href={href}
      aria-label={withWordmark ? undefined : 'HALOStack home'}
      className="inline-flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </Link>
  )
}

export function LogoMark({ className = 'h-8 w-8 shrink-0' }: { className?: string }) {
  const gradientId = useId().replace(/:/g, '')
  return <Mark className={className} gradientId={`halo-mark-${gradientId}`} />
}
