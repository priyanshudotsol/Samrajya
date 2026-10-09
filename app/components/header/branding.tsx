import { Crown } from 'lucide-react';

export const Branding = ({ className = '' }: { className?: string }) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Crown className="h-6 w-6 text-text-highlight" strokeWidth={1.5} />
      <h1 className="text-3xl font-rozha text-gold-gradient tracking-wide leading-none">SAMRAJYA</h1>
    </div>
  );
};
