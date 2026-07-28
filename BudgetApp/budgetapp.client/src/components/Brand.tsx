import { useState, type ReactNode } from 'react'

const primaryLogoPath = '/brand/logo-primary.png'
const markLogoPath = '/brand/logo-mark.png'

interface BrandImageProps {
  className: string
  src: string
  alt: string
  fallback: ReactNode
}

function BrandImage({ className, src, alt, fallback }: BrandImageProps) {
  const [failed, setFailed] = useState(false)

  if (failed) return fallback

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
    />
  )
}

export function BrandMark() {
  return (
    <BrandImage
      className="brand-mark-image"
      src={markLogoPath}
      alt=""
      fallback={<span className="brand-mark" aria-hidden="true">MC</span>}
    />
  )
}

export function BrandLockup() {
  return (
    <div className="brand-lockup">
      <BrandMark />
      <span>MC Budget</span>
    </div>
  )
}

export function BrandLogo() {
  return (
    <BrandImage
      className="brand-primary-image"
      src={primaryLogoPath}
      alt="MC Budget"
      fallback={<BrandLockup />}
    />
  )
}
