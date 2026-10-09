'use client';

import dynamic from 'next/dynamic';

const Showcase = dynamic(() => import('@/components/arena/WarriorShowcase'), { ssr: false });

/** `/dev/warriors`: every gear's swing, guard, flinch and fall with the battle VFX (a preview). */
export default function WarriorsPage() {
  return (
    <div className="fixed inset-0 bg-[#8fb3d9]">
      <Showcase />
    </div>
  );
}
