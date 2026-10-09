'use client';

import { useEffect, useState } from 'react';

import AccentIcon from '@/lib/assets/accent-icon';

interface CountdownTimerProps {
  epochDuration: number;
  epochStartTime: number;
  /** Caption under the time. */
  label?: string;
  /** Shown when the timer reaches 0. */
  endedLabel?: string;
}

export function CountdownTimer({
  epochDuration,
  epochStartTime,
  label = 'Time left before battle resolve',
  endedLabel = 'Battle Ended',
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now() / 1000;
      const epochEndTime = Number(epochStartTime) + Number(epochDuration);
      return Math.max(0, Math.ceil(epochEndTime - now));
    };

    setTimeLeft(calculateTimeLeft());

    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 250);

    return () => clearInterval(interval);
  }, [epochDuration, epochStartTime]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col pt-2">
      <div className="flex items-center gap-2">
        <AccentIcon color="var(--color-text-highlight)" />
        {timeLeft === 0 ? (
          <div className="text-sm text-text-highlight text-nowrap">{endedLabel}</div>
        ) : (
          <div className="font-clash font-medium text-text-primary text-lg tabular-nums">
            {formatTime(timeLeft)}
          </div>
        )}
      </div>
      {timeLeft > 0 && (
        <div className="text-text-secondary text-xs font-regular text-nowrap">
          {label}
        </div>
      )}
    </div>
  );
}
