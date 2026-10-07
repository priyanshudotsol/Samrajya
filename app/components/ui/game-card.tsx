'use client';

import React from 'react';

type GameCardProps = {
  topRightLabel: string;
  title?: string;
  description?: string;
  buttons?: React.ReactNode;
  children?: React.ReactNode;
};

export function GameCard({ topRightLabel, title, description, buttons, children }: GameCardProps) {
  return (
    <div className="relative animate-card-enter px-4 sm:px-6 max-w-[580px] md:h-[500px] h-full">
      <div
        className="relative bg-background-panel w-full h-full flex flex-col items-center justify-center text-center"
        style={{
          clipPath: 'polygon(60px 0, 100% 0, 100% 100%, 0 100%, 0 60px)',
          border: '1px solid var(--color-border-default)',
          backgroundColor: 'var(--color-border-active)',
        }}
      >
        {/* Green corner accents */}
        <div
          className="absolute top-0 right-0 w-8 h-8"
          style={{
            borderRight: '1px solid var(--color-border-active)',
            borderTop: '1px solid var(--color-border-active)',
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-8 h-8"
          style={{
            borderLeft: '1px solid var(--color-border-active)',
            borderBottom: '1px solid var(--color-border-active)',
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-8 h-8"
          style={{
            borderRight: '1px solid var(--color-border-active)',
            borderBottom: '1px solid var(--color-border-active)',
          }}
        />

        {/* Cut-corner accent */}
        <div className="absolute top-0 left-0 w-8 h-8">
          <div
            className="w-full h-0.5 absolute -top-0.5 left-12"
            style={{ backgroundColor: 'var(--color-border-active)' }}
          />
          <div
            className="w-0.5 h-full absolute -left-0.5 top-12"
            style={{ backgroundColor: 'var(--color-border-active)' }}
          />
          <div
            className="w-32 h-1 absolute top-10 -left-12 -rotate-45"
            style={{ backgroundColor: 'var(--color-border-active)' }}
          />
        </div>

        {/* Content */}
        <div
          className="flex flex-col items-center justify-end h-full pb-12 text-center"
          style={{ backgroundColor: 'var(--color-background-surface)' }}
        >
          {/* Top right label */}
          <div className="absolute -top-2 right-16">
            <div
              className="relative"
              style={{
                backgroundColor: 'var(--color-border-default)', // border color (outer layer)
                clipPath:
                  'polygon(0 0, 100% 1px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 10px 100%, 0 calc(100% - 8px))',
                padding: '1px', // border thickness
              }}
            >
              <div
                className="px-4 py-2 text-md sm:text-2xl whitespace-nowrap font-clash text-text-highlight font-semibold font-clash"
                style={{
                  backgroundColor: 'var(--color-background)',
                  clipPath:
                    'polygon(0 0, 100% 1px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 10px 100%, 0 calc(100% - 8px))',
                }}
              >
                {topRightLabel}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center w-3/4 md:w-2/3 pt-16  md:pt-14 gap-6 md:gap-8">
            {/* Title */}
            {children}

            {title && (
              <h2 className="text-xl sm:text-2xl md:text-3xl font-rozha font-normal text-gold-gradient">
                {title}
              </h2>
            )}

            {/* Description */}
            {description && (
              <p
                className="mx-auto max-w-xl text-xs sm:text-sm leading-relaxed"
                style={{ color: '#cccccc' }}
              >
                {description}
              </p>
            )}

            {/* Buttons */}
            <div className={`flex justify-center w-full gap-4`}>{buttons}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
