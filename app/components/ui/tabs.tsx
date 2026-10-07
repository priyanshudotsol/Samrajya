'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils/index';

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex h-9 w-fit items-center justify-center -mb-2 rounded-tl-sm',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-background-panel)',
      }}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "group relative inline-flex h-[calc(100%)] flex-1 items-center justify-center gap-1.5 text-sm font-light whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 pl-2 pr-6 py-2",
        'data-[state=active]:text-[var(--color-text-inverse)]',
        'data-[state=inactive]:text-[var(--color-text-primary)]',
        className,
      )}
      {...props}
    >
      {/* Border div - inactive tabs (normal border) */}
      <div
        className="absolute inset-0 border-background-panel group-data-[state=inactive]:block hidden"
        style={{
          backgroundColor: 'var(--color-border-active)',
          clipPath:
            'polygon(0 0, calc(100% - 20px) 0, 100% 100%, 100% 100%, 0 100%, 0 calc(100% - 8px))',
        }}
      />

      <div
        className="absolute inset-0 group-data-[state=active]:block hidden"
        style={{
          backgroundColor: 'var(--color-border-active)',
          clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 100%, 100% 100%, 0 100%)',
        }}
      />

      <div
        className="absolute inset-[1px] flex items-center justify-center group-data-[state=inactive]:block hidden"
        style={{
          backgroundColor: 'var(--color-background-panel)',
          clipPath:
            'polygon(0 0, calc(100% - 20px) 0, 100% 100%, 100% 100%, 0 100%, 0 calc(100% - 8px))',
        }}
      />

      <div
        className="absolute z-40 inset-[1px] flex items-center justify-center group-data-[state=active]:block hidden"
        style={{
          backgroundColor: 'var(--color-border-active)',
          clipPath:
            'polygon(0 0, calc(100% - 20px) 0, 100% 100%, 100% 100%, 0 100%, 0 calc(100% - 8px))',
        }}
      />

      {/* Content */}
      <span className="relative z-40">{props.children}</span>

      {/* Active tab indicator - two tilted vertical lines */}
      {/* <div className="hidden group-data-[state=active]:flex justify-center items-center relative z-40">
        <TabAccentIcon size={30} />
      </div> */}
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        'flex-1 outline-none border-[1px] border-border-primary bg-[var(--color-background-tertiary)] p-4 py-6',
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
