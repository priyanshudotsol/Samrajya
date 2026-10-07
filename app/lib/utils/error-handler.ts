import { showToast } from '../../components/ui/toast';

const ERROR_MESSAGES: Record<string, (message: string) => string> = {
  ValidationError: (msg) => msg,
  AuthenticationError: (msg) => msg,
  NetworkError: () => 'Network error - please try again',
  UserRejectedRequestError: () => 'Transaction cancelled',
  TransactionError: (msg) => msg,
  ChainSwitchError: () => 'Failed to switch network',
  default: () => 'Something went wrong - please try again',
};

export const handleError = (error: unknown): void => {
  const errorName = error instanceof Error ? error.constructor.name : 'default';
  const messageHandler = ERROR_MESSAGES[errorName] || ERROR_MESSAGES.default;
  const userMessage = messageHandler(error instanceof Error ? error.message : '');

  console.error(error);

  showToast({
    type: 'error',
    title: userMessage,
  });
};

export const handleErrorWithCallback = (
  error: unknown,
  onError?: (error: unknown) => void,
): void => {
  handleError(error);
  onError?.(error);
};
