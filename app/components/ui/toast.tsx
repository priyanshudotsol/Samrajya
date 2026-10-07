import { CheckCircle, XCircle, Loader2, Info, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

type ToastType = 'success' | 'error' | 'loading' | 'info' | 'warning';

interface CustomToastOptions {
  type: ToastType;
  title: string;
  message?: string;
  link?: {
    href: string;
    text: string;
  };
  duration?: number;
}

const getToastIcon = (type: ToastType) => {
  const iconProps = { size: 20 };

  switch (type) {
    case 'success':
      return <CheckCircle {...iconProps} />;
    case 'error':
      return <XCircle {...iconProps} />;
    case 'loading':
      return <Loader2 {...iconProps} className="animate-spin" />;
    case 'info':
      return <Info {...iconProps} />;
    case 'warning':
      return <AlertTriangle {...iconProps} />;
    default:
      return null;
  }
};

const getToastColor = (type: ToastType) => {
  switch (type) {
    default:
      return 'text-text-primary bg-background-panel border-border-default';
  }
};

export const CustomToast = ({
  type,
  title,
  message,
  link,
}: Omit<CustomToastOptions, 'duration'>) => {
  return (
    <div className={`flex shadow-lg border w-[364px] items-center p-4 ${getToastColor(type)}`}>
      <div className="flex flex-1 items-center">
        <div className="flex-shrink-0 mr-3">{getToastIcon(type)}</div>
        <div className="w-full">
          <p className="text-sm font-regular">{title}</p>
          {message && <p className="text-sm mt-1 font-light text-text-secondary">{message}</p>}
          {link && (
            <a
              href={link.href}
              className="mt-1 inline-block text-xs font-light text-text-secondary underline hover:no-underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.text}
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export const showToast = (options: CustomToastOptions): string | number => {
  const { type, title, message, link, duration } = options;

  return toast.custom(
    () => <CustomToast type={type} title={title} message={message} link={link} />,
    { duration },
  );
};

export type { ToastType, CustomToastOptions };
