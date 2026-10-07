'use client';

import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';

import { cn } from '@/lib/utils';

type Props = React.ComponentProps<typeof ToggleGroupPrimitive.Root> & {
  frameClassName?: string;
  cut?: number;
  borderWidth?: number;
  borderColor?: string;
  innerBg?: string;
};

function ToggleGroup({
  className,
  frameClassName = 'clip-tlbr',
  cut = 10,
  borderWidth = 1,
  borderColor = 'var(--color-border-active)',
  innerBg = 'var(--color-background)',
  children,
  ...props
}: Props) {
  const frameStyle: React.CSSProperties = {
    ['--cut' as any]: `${cut}px`,
    ['--bw' as any]: `${borderWidth}px`,
    ['--bc' as any]: borderColor,
    ['--bg' as any]: innerBg,
  };

  return (
    <div className={cn('frame', frameClassName, className)} style={frameStyle}>
      <div className="frame-inner">
        <ToggleGroupPrimitive.Root className="relative z-10 flex overflow-hidden" {...props}>
          {children}
        </ToggleGroupPrimitive.Root>
      </div>
    </div>
  );
}

function ToggleGroupItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        'flex-1 px-6 py-1 text-md font-regular transition-colors',
        'data-[state=on]:bg-button-highlight data-[state=on]:text-text-inverse',
        'data-[state=off]:bg-button-secondary data-[state=off]:text-text-highlight',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
