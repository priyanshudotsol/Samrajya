import React, { useEffect, useRef } from 'react';

interface PulseWaveLoaderProps {
  size?: number;
  className?: string;
}

interface DotRing {
  radius: number;
  count: number;
}

export const PulseWaveLoader: React.FC<PulseWaveLoaderProps> = ({ size = 180, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationIdRef = useRef<number | null>(null);
  const timeRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX: number = canvas.width / 2;
    const centerY: number = canvas.height / 2;

    // Create dots in concentric rings (without visible circles)
    const dotRings: DotRing[] = [
      { radius: 15, count: 6 },
      { radius: 30, count: 12 },
      { radius: 45, count: 18 },
      { radius: 60, count: 24 },
      // { radius: 75, count: 30 },
    ];

    const animate = (timestamp: number): void => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const deltaTime: number = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;
      timeRef.current += deltaTime * 0.001;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw center
      ctx.beginPath();
      ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();

      // Draw dots in concentric circles with wave effect
      dotRings.forEach((ring: DotRing, ringIndex: number) => {
        for (let i: number = 0; i < ring.count; i++) {
          const angle: number = (i / ring.count) * Math.PI * 2;

          // Calculate position with pulsing radius
          const radiusPulse: number = Math.sin(timeRef.current * 2 - ringIndex * 0.4) * 3;
          const x: number = centerX + Math.cos(angle) * (ring.radius + radiusPulse);
          const y: number = centerY + Math.sin(angle) * (ring.radius + radiusPulse);

          // Calculate opacity with wave effect
          const opacityWave: number =
            0.4 + Math.sin(timeRef.current * 2 - ringIndex * 0.4 + i * 0.2) * 0.6;

          // Draw dot
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${opacityWave})`;
          ctx.fill();
        }
      });

      animationIdRef.current = requestAnimationFrame(animate);
    };

    animationIdRef.current = requestAnimationFrame(animate);

    // Cleanup function
    return (): void => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, []);

  return (
    <div className={`pulse-wave-container ${className}`}>
      <div className="pulse-wave-canvas-wrapper">
        <canvas ref={canvasRef} width={size} height={size} className="pulse-wave-canvas" />
      </div>

      <style jsx>{`
        .pulse-wave-container {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: ${size + 40}px;
          height: ${size + 60}px;
          padding: 10px;
          transition: border-color 0.3s ease;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        }

        .pulse-wave-container:hover {
          border-color: rgba(255, 255, 255, 0.3);
        }

        .pulse-wave-title {
          margin-bottom: 10px;
          font-size: 12px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          text-align: center;
          color: #f0f0f0;
        }

        .pulse-wave-canvas-wrapper {
          position: relative;
          width: ${size}px;
          height: ${size}px;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .pulse-wave-canvas {
          position: absolute;
          left: 0;
          top: 0;
        }

        /* Corner decorations that appear on hover */
        .pulse-wave-container::before,
        .pulse-wave-container::after {
          content: '';
          position: absolute;
          width: 16px;
          height: 16px;
          opacity: 0;
          transition: opacity 0.3s ease;
          background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolygon points='448,224 288,224 288,64 224,64 224,224 64,224 64,288 224,288 224,448 288,448 288,288 448,288' fill='white'/%3E%3C/svg%3E");
          background-size: contain;
          z-index: 10;
          pointer-events: none;
        }

        .pulse-wave-container::before {
          top: -8px;
          left: -8px;
        }

        .pulse-wave-container::after {
          top: -8px;
          right: -8px;
          transform: rotate(90deg);
        }

        .pulse-wave-container:hover::before,
        .pulse-wave-container:hover::after {
          opacity: 1;
        }
      `}</style>
    </div>
  );
};

export default PulseWaveLoader;
