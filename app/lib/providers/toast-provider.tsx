'use client';

import { useCallback, createContext, useContext, ReactNode } from 'react';
import { toast } from 'sonner';

import { CustomToast, CustomToastOptions as ToastOptions } from '../../components/ui/toast';

interface ToastContextType {
  addToast: (options: ToastOptions) => string | number;
  updateToast: (id: string | number, updates: Partial<ToastOptions>) => void;
  removeToast: (id: string | number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const addToast = useCallback((options: ToastOptions): string | number => {
    const { type, title, message, link, duration } = options;

    return toast.custom(
      () => <CustomToast type={type} title={title} message={message} link={link} />,
      { duration },
    );
  }, []);

  const updateToast = useCallback((id: string | number, updates: Partial<ToastOptions>): void => {
    const { type, title, message, link, duration } = updates;

    if (type && title) {
      toast.custom(() => <CustomToast type={type} title={title} message={message} link={link} />, {
        id,
        duration,
      });
    }
  }, []);

  const removeToast = useCallback((id: string | number): void => {
    toast.dismiss(id);
  }, []);

  const value: ToastContextType = {
    addToast,
    updateToast,
    removeToast,
  };

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};
