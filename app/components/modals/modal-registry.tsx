'use client';

import { useModal } from '@/lib/providers/modal-provider';
import { TeamWinModal } from '../team-win';

// TODO(Step 14): register Pledge / Leave (−20%) / Switch (−40%) confirm modals here.
export function ModalRegistry() {
  const { isModalOpen, closeModal, getModalProps } = useModal();

  return (
    <>
      <TeamWinModal
        {...getModalProps('team-win')}
        isOpen={isModalOpen('team-win')}
        onClose={() => closeModal('team-win')}
      />
    </>
  );
}
