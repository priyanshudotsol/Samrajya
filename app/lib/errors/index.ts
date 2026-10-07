export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class UserRejectedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserRejectedRequestError';
  }
}

export class TransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionError';
  }
}

export class ChainSwitchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChainSwitchError';
  }
}
