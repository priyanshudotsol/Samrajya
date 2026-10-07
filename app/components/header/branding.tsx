import { Crown } from 'lucide-react';

export const Branding = ({ className = '' }: { className?: string }) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Crown className="h-6 w-6 text-text-highlight" strokeWidth={1.5} />
      <div className="flex items-baseline gap-2 leading-none">
        <h1 className="text-3xl font-rozha text-gold-gradient tracking-wide">SAMRAJYA</h1>
        <span className="font-tiro text-lg text-text-highlight/80" lang="hi">
          साम्राज्य
        </span>
      </div>
    </div>
  );
};
