import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 no-drag',
  {
    variants: {
      variant: {
        default:
          'bg-accent text-white shadow-accent-sm hover:bg-accent-hover hover:shadow-accent active:scale-[0.97]',
        destructive:
          'bg-error/20 text-error border border-error/30 hover:bg-error/30 active:scale-[0.97]',
        outline:
          'border border-border bg-transparent hover:bg-bg-tertiary hover:border-border-active active:scale-[0.97]',
        ghost:
          'hover:bg-bg-tertiary text-text-secondary hover:text-text-primary active:scale-[0.97]',
        link:
          'text-text-accent underline-offset-4 hover:underline p-0 h-auto',
        success:
          'bg-connected/20 text-connected border border-connected/30 hover:bg-connected/30 active:scale-[0.97]',
      },
      size: {
        sm: 'h-8 px-3 text-xs rounded-lg',
        default: 'h-10 px-4',
        lg: 'h-12 px-6 text-base rounded-2xl',
        icon: 'h-9 w-9 rounded-xl',
        'icon-sm': 'h-7 w-7 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'
