interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  retryableErrors: ['overloaded_error', 'rate_limit_error', 'api_error']
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= opts.maxRetries!; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      const errorType = error?.error?.type || error?.type || '';
      const errorMessage = error?.message || error?.error?.message || '';
      const statusCode = error?.status || error?.statusCode || 0;
      
      const isRetryable = opts.retryableErrors!.some(e => 
        errorType.includes(e) || errorMessage.toLowerCase().includes(e.replace('_', ' '))
      );
      
      const isOverloaded = statusCode === 529 || 
                           errorType === 'overloaded_error' ||
                           errorMessage.toLowerCase().includes('overloaded');
      
      const isRateLimit = statusCode === 429 ||
                          errorType === 'rate_limit_error' ||
                          errorMessage.toLowerCase().includes('rate limit');
      
      if (!isRetryable && !isOverloaded && !isRateLimit) {
        console.error(`[Retry] Non-retryable error (type: ${errorType}, status: ${statusCode}):`, errorMessage);
        throw error;
      }
      
      if (attempt < opts.maxRetries!) {
        const jitter = Math.random() * 500;
        const delay = Math.min(
          opts.initialDelayMs! * Math.pow(2, attempt - 1) + jitter,
          opts.maxDelayMs!
        );
        
        console.log(`[Retry] Attempt ${attempt}/${opts.maxRetries} failed with ${errorType || 'error'}. Retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`[Retry] All ${opts.maxRetries} attempts failed`);
      }
    }
  }
  
  throw lastError;
}

export async function withRetryStream<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return withRetry(fn, {
    ...options,
    maxRetries: options.maxRetries ?? 2,
    initialDelayMs: options.initialDelayMs ?? 500,
  });
}
