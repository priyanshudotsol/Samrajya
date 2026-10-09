import * as React from 'react';

import { cn } from '@/lib/utils/index';

type CardProps = React.ComponentProps<'div'> & {
  orientation?: 'left' | 'right';
  headerText?: string;
};

function Card({ className, orientation = 'left', ...props }: CardProps) {
  const clipPath =
    orientation === 'left'
      ? 'polygon(30px 0, 100% 0, 100% 100%, 0 100%, 0 30px)'
      : 'polygon(0 0, calc(100% - 30px) 0, 100% 30px, 100% 100%, 0 100%)';

  return (
    <div className="relative h-full w-full">
      <div
        data-slot="card"
        className={cn(
          'relative text-text-primary flex flex-col gap-6 pt-6 bg-background-panel ',
          className,
        )}
        style={{
          clipPath,
          border: '1px solid var(--color-border-default)',
        }}
        {...props}
      >
        {orientation === 'left' ? (
          <>
            <div
              className="absolute top-0 right-0 w-4 h-4"
              style={{
                borderRight: '1px solid var(--color-border-active)',
                borderTop: '1px solid var(--color-border-active)',
              }}
            />
            <div
              className="absolute bottom-0 left-0 w-4 h-4"
              style={{
                borderLeft: '1px solid var(--color-border-active)',
                borderBottom: '1px solid var(--color-border-active)',
              }}
            />
            <div
              className="absolute bottom-0 right-0 w-4 h-4"
              style={{
                borderRight: '1px solid var(--color-border-active)',
                borderBottom: '1px solid var(--color-border-active)',
              }}
            />
          </>
        ) : (
          <>
            <div
              className="absolute top-0 left-0 w-4 h-4"
              style={{
                borderLeft: '1px solid var(--color-border-active)',
                borderTop: '1px solid var(--color-border-active)',
              }}
            />
            <div
              className="absolute bottom-0 left-0 w-4 h-4"
              style={{
                borderLeft: '1px solid var(--color-border-active)',
                borderBottom: '1px solid var(--color-border-active)',
              }}
            />
            <div
              className="absolute bottom-0 right-0 w-4 h-4"
              style={{
                borderRight: '1px solid var(--color-border-active)',
                borderBottom: '1px solid var(--color-border-active)',
              }}
            />
          </>
        )}

        {/* Cut-corner accent */}
        {orientation === 'left' ? (
          <div className="absolute top-0 left-0 w-8 h-8">
            <div
              className="w-full h-0.5 absolute -top-0.5 left-4"
              style={{ backgroundColor: 'var(--color-border-active)' }}
            />
            <div
              className="w-0.5 h-full absolute -left-0.5 top-4"
              style={{ backgroundColor: 'var(--color-border-active)' }}
            />
            <div
              className="w-24 h-0.5 absolute top-7 -left-12 -rotate-45"
              style={{ backgroundColor: 'var(--color-border-active)' }}
            />
          </div>
        ) : (
          <div className="absolute top-0 right-0 w-8 h-8">
            <div
              className="w-full h-0.5 absolute -top-0.5 right-4"
              style={{ backgroundColor: 'var(--color-border-active)' }}
            />
            <div
              className="w-0.5 h-full absolute -right-0.5 top-4"
              style={{ backgroundColor: 'var(--color-border-active)' }}
            />
            <div
              className="w-24 h-0.5 absolute top-7 -right-12 rotate-45"
              style={{ backgroundColor: 'var(--color-border-active)' }}
            />
          </div>
        )}
        <div className="relative flex flex-col gap-6 px-4 pt-4 pb-2 h-full">{props.children}</div>
      </div>
    </div>
  );
}

type CardHeaderProps = React.ComponentProps<'div'> & {
  orientation?: 'left' | 'right';
};

function CardHeader({ className, orientation = 'left', ...props }: CardHeaderProps) {
  const positionClass = orientation === 'left' ? 'right-8' : 'left-8';

  return (
    <div
      data-slot="card-header"
      className={cn(`absolute -top-5 -mt-2 ${positionClass} z-100`, className)}
    >
      {/* Outer border layer */}
      <div
        className="relative"
        style={{
          backgroundColor: 'var(--color-border-default)',
          clipPath:
            'polygon(0 0, 100% 1px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 10px 100%, 0 calc(100% - 8px))',
          padding: '1px',
        }}
      >
        {/* Inner content layer */}
        <div
          className="px-4 w-auto text-xl font-medium text-text-highlight pb-[1px]"
          style={{
            backgroundColor: 'var(--color-background-surface)',
            clipPath:
              'polygon(0 0, 100% 1px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 10px 100%, 0 calc(100% - 8px))',
          }}
          {...props}
        />
      </div>
    </div>
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-semibold', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn(className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-6 [.border-t]:pt-6', className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
