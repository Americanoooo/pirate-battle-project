import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { UI } from './format'

export function Panel({ children, className = '', labelledBy }: { children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section className={`panel ${className}`} aria-labelledby={labelledBy}>
      {children}
    </section>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary'; size?: 'normal' | 'small' | 'tiny' }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'normal', className = '', type = 'button', ...rest },
  ref,
) {
  const classes = ['btn', variant === 'secondary' ? 'btn--secondary' : '', size !== 'normal' ? `btn--${size}` : '', className]
    .filter(Boolean)
    .join(' ')
  return <button ref={ref} type={type} className={classes} {...rest} />
})

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; pressed?: boolean }

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, pressed, className = '', type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`icon-btn ${className}`}
      aria-label={label}
      title={label}
      data-pressed={pressed ? 'true' : undefined}
      {...rest}
    >
      <img src={UI(`controls/${icon}.png`)} alt="" draggable={false} />
    </button>
  )
})

export function BrandLogo() {
  return <img className="brand-logo" src={`${import.meta.env.BASE_URL}assets/ui/logo_jungle_gaming.svg`} alt="" aria-hidden="true" />
}
