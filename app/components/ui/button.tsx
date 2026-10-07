import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils/index';

const clipPathMap = {
  sm: '8px',
  default: '10px',
  lg: '12px',
} as const;

const generateClipPath = (corners: string[], clipSize: keyof typeof clipPathMap) => {
  const size = clipPathMap[clipSize];
  const points = [];

  if (!corners.includes('top-left')) {
    points.push(`0 0`);
  } else {
    points.push(`0 ${size}`);
    points.push(`${size} 0`);
  }

  if (!corners.includes('top-right')) {
    points.push('100% 0');
  } else {
    points.push(`calc(100% - ${size}) 0`);
    points.push(`100% ${size}`);
  }

  if (!corners.includes('bottom-right')) {
    points.push('100% 100%');
  } else {
    points.push(`100% calc(100% - ${size})`);
    points.push(`calc(100% - ${size}) 100%`);
  }

  if (!corners.includes('bottom-left')) {
    points.push('0 100%');
  } else {
    points.push(`${size} 100%`);
    points.push(`0 calc(100% - ${size})`);
  }

  return `polygon(${points.join(', ')})`;
};

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-regular transition-all disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-button-highlight text-text-inverse hover:bg-button-highlight/90 disabled:opacity-50',
        ghost: 'hover:bg-button-muted hover:text-default disabled:opacity-50',
        outline:
          'bg-background-panel text-text-highlight hover:bg-button-highlight hover:text-text-inverse disabled:opacity-80',
      },
      size: {
        default: 'h-8 px-4 py-2 min-w-18 has-[>svg]:px-3',
        sm: 'h-6 gap-1.5 px-4 has-[>svg]:px-2.5',
        lg: 'h-[38px] px-6 has-[>svg]:px-4',
        icon: 'size-8',
      },
      clipCorners: {
        none: '',
        'top-left': '',
        'top-right': '',
        'bottom-left': '',
        'bottom-right': '',
        'top-left-bottom-right': '',
        'top-right-bottom-left': '',
        top: '',
        bottom: '',
        left: '',
        right: '',
        all: '',
      },
      clipSize: {
        sm: '',
        default: '',
        lg: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      clipCorners: 'none',
      clipSize: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  clipCorners = 'none',
  clipSize = 'default',
  asChild = false,
  children,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  const getCornerArray = (corners: string | null) => {
    if (!corners || corners === 'none') return [];
    if (corners === 'all') return ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    if (corners === 'top-left-bottom-right') return ['top-left', 'bottom-right'];
    if (corners === 'top-right-bottom-left') return ['top-right', 'bottom-left'];
    if (corners === 'top') return ['top-left', 'top-right'];
    if (corners === 'bottom') return ['bottom-left', 'bottom-right'];
    if (corners === 'left') return ['top-left', 'bottom-left'];
    if (corners === 'right') return ['top-right', 'bottom-right'];
    return [corners];
  };

  const cornerArray = getCornerArray(clipCorners);
  const clipPath =
    cornerArray.length > 0 ? generateClipPath(cornerArray, clipSize || 'default') : undefined;

  if (variant === 'outline') {
    return (
      <div
        className="relative"
        style={{
          backgroundColor: 'var(--color-border-active)',
          clipPath,
          padding: '1px',
        }}
      >
        <Comp
          data-slot="button"
          className={cn(buttonVariants({ variant, size, clipCorners, clipSize, className }))}
          style={{
            clipPath,
            ...props.style,
          }}
          {...props}
        >
          {children}
        </Comp>
      </div>
    );
  }

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, clipCorners, clipSize, className }))}
      style={{ clipPath, ...props.style }}
      {...props}
    >
      {children}
    </Comp>
  );
}

export { Button, buttonVariants };
