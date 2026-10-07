'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface CollapsibleProps {
  side?: 'left' | 'right';
  width?: number;
  disabled?: boolean;
  children: React.ReactNode;
}

export function Collapsible({
  side = 'left',
  width = 260,
  disabled = false,
  children,
}: CollapsibleProps) {
  const [open, setOpen] = useState(true);
  const isLeft = side === 'left';

  return (
    <div
      className={`absolute top-4 ${isLeft ? 'left-4' : 'right-4'} z-50 flex items-start ${!open ? 'pointer-events-none' : ''}`}
    >
      <motion.div
        initial={{ x: isLeft ? -width : width }}
        animate={{ x: open ? 0 : isLeft ? -width : width }}
        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        style={{ width }}
      >
        {children}
      </motion.div>

      {/* Handle */}
      <motion.div
        initial={{ x: isLeft ? -width : width }}
        animate={{ x: open ? 0 : isLeft ? -width : width }}
        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        className="absolute top-16"
      >
        {!disabled && (
          <Button
            size="icon"
            className="h-6 w-6 bg-background border border-border-default text-text-highlight pointer-events-auto"
            style={{ transform: `translateX(${isLeft ? width - 8 : -14}px)` }}
            onClick={() => setOpen((prev) => !prev)}
          >
            {open ? (
              isLeft ? (
                <ChevronLeft size={18} />
              ) : (
                <ChevronRight size={18} />
              )
            ) : isLeft ? (
              <ChevronRight size={18} />
            ) : (
              <ChevronLeft size={18} />
            )}
          </Button>
        )}
      </motion.div>
    </div>
  );
}
