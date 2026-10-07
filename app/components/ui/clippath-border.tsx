'use client';

import React from 'react';

import { cn } from '@/lib/utils';

export interface ClipPathBorderProps {
  children: React.ReactNode;
  clipPath: string;
  borderColor?: string;
  backgroundColor?: string;
  borderThickness?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  disabled?: boolean;
}

export const ClipPathBorder: React.FC<ClipPathBorderProps> = ({
  children,
  clipPath,
  className,
  borderColor = '#07C800',
  backgroundColor = '#07C800',
  borderThickness = '1px',
  style,
  onClick,
  disabled = false,
}) => {
  return (
    <div
      className={cn('relative', className)}
      style={style}
      onClick={disabled ? undefined : onClick}
    >
      {/* Outer border layer */}
      <div
        className="relative w-full"
        style={{
          backgroundColor: borderColor,
          clipPath,
          padding: borderThickness,
        }}
      >
        {/* Inner content layer */}
        <div
          className={cn('relative h-full w-full', disabled && 'opacity-50 cursor-not-allowed')}
          style={{
            backgroundColor,
            clipPath,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

// Predefined clip-path variants for common use cases
export const clipPaths = {
  message: 'polygon(0 0, 95% 0, 100% 15%, 100% 100%, 5% 100%, 0 90%)',
  button: 'polygon(0 0, 65% 0, 100% 20%, 100% 100%, 0 100%)',
  card: 'polygon(30px 0, 100% 0, 100% 100%, 0 100%, 0 30px)',
  cardRight: 'polygon(0 0, calc(100% - 60px) 0, 100% 60px, 100% 100%, 0 100%)',
  input: 'polygon(0 0, 95% 0, 100% 15%, 100% 100%, 5% 100%, 0 90%)',
} as const;
