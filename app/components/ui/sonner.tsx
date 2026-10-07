'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      position="bottom-right"
      expand={true}
      style={
        {
          '--normal-bg': 'var(--color-background-surface)',
          '--normal-text': 'var(--color-text-default)',
          '--normal-border': 'var(--color-border-default)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
