import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'
import { Spinner } from './spinner'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-40 no-drag active:translate-y-px',
  {
    variants: {
      variant: {
        // Aurora primary variants
        primary:
          'bg-accent text-white border border-accent hover:bg-accent-hover hover:shadow-accent-sm rounded-md',
        secondary:
          'bg-bg-primary border border-border text-text-primary hover:bg-bg-secondary hover:border-border-strong rounded-md',
        ghost:
          'bg-transparent border border-transparent text-text-secondary hover:bg-bg-secondary hover:text-text-primary rounded-md',
        danger:
          'bg-error/10 text-error border border-error/20 hover:bg-error hover:text-white rounded-md',
        accent:
          'bg-accent/12 text-accent border border-accent/20 hover:bg-accent/20 rounded-md',
        // Legacy aliases (keep existing pages working)
        default:
          'bg-accent text-white border border-accent hover:bg-accent-hover hover:shadow-accent-sm rounded-md',
        destructive:
          'bg-error/10 text-error border border-error/20 hover:bg-error hover:text-white rounded-md',
        outline:
          'bg-bg-primary border border-border text-text-primary hover:bg-bg-secondary hover:border-border-strong rounded-md',
        link:
          'text-accent underline-offset-4 hover:underline p-0 h-auto border-transparent',
        success:
          'bg-connected/12 text-connected border border-connected/25 hover:bg-connected/20 rounded-md',
      },
      size: {
        sm: 'h-7 px-3 text-[12px] rounded-sm',
        md: 'h-9 px-4 text-[13px] rounded-md',
        lg: 'h-11 px-6 text-[14px] rounded-md',
        // Legacy size names
        default: 'h-9 px-4 text-[13px] rounded-md',
        icon: 'h-9 w-9 rounded-md',
        'icon-sm': 'h-7 w-7 rounded-sm',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
  icon?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, icon, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {loading ? <Spinner size="sm" /> : icon}
        {children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'
