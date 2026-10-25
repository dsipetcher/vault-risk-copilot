interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  const isUnreachable = /unreachable|Failed to fetch/i.test(message);

  return (
    <div className="rounded-md bg-red-50 p-4 my-4" data-testid="error-message">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-red-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800">
            {isUnreachable ? 'Cannot reach the API' : 'Error'}
          </h3>
          <div className="mt-2 text-sm text-red-700">{message}</div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              data-testid="error-retry"
              className="mt-3 inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-red-800 bg-red-100 hover:bg-red-200"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
