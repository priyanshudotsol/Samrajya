'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ModalType = 'team-win' | 'pledge' | 'leave' | 'switch';

interface ModalContextType {
  openModal: (type: ModalType, props?: any) => void;
  closeModal: (type: ModalType) => void;
  closeAllModals: () => void;
  isModalOpen: (type: ModalType) => boolean;
  getModalProps: (type: ModalType) => any;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

interface ModalState {
  [key: string]: {
    isOpen: boolean;
    props?: unknown;
  };
}

interface ModalProviderProps {
  children: ReactNode;
}

export function ModalProvider({ children }: ModalProviderProps) {
  const [modals, setModals] = useState<ModalState>({});

  const openModal = useCallback((type: ModalType, props?: any) => {
    setModals((prev) => ({
      ...prev,
      [type]: {
        isOpen: true,
        props: props || {},
      },
    }));
  }, []);

  const closeModal = useCallback((type: ModalType) => {
    setModals((prev) => ({
      ...prev,
      [type]: { isOpen: false, props: {} },
    }));
  }, []);

  const closeAllModals = useCallback(() => {
    setModals((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((key) => {
        updated[key] = { ...updated[key], isOpen: false };
      });
      return updated;
    });
  }, []);

  const isModalOpen = useCallback(
    (type: ModalType) => {
      return modals[type]?.isOpen || false;
    },
    [modals],
  );

  const getModalProps = useCallback(
    (type: ModalType) => {
      return modals[type]?.props || {};
    },
    [modals],
  );

  const value = {
    openModal,
    closeModal,
    closeAllModals,
    isModalOpen,
    getModalProps,
  };

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

export function useModal() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}
