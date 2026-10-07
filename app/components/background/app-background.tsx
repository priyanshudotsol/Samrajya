import { PropsWithChildren } from 'react';

export const AppBackground = ({
  children,
  hasGradient = false,
  overflowHidden = true,
}: PropsWithChildren<{ overflowHidden?: boolean; hasGradient?: boolean }>) => {
  return (
    <div
      className={`relative h-screen fade-in text-white ${overflowHidden ? 'overflow-hidden' : ''} min-h-screen`}
    >
      {hasGradient && <div className="background-gradient"></div>}
      {children}
    </div>
  );
};
