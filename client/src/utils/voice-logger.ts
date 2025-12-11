type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const CURRENT_LOG_LEVEL: LogLevel = 
  import.meta.env.MODE === 'production' ? 'warn' : 'debug';

class VoiceLogger {
  private prefix = '[Custom Voice]';
  
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LOG_LEVEL];
  }
  
  debug(...args: unknown[]) {
    if (this.shouldLog('debug')) {
      console.log(this.prefix, '🔍', ...args);
    }
  }
  
  info(...args: unknown[]) {
    if (this.shouldLog('info')) {
      console.log(this.prefix, 'ℹ️', ...args);
    }
  }
  
  warn(...args: unknown[]) {
    if (this.shouldLog('warn')) {
      console.warn(this.prefix, '⚠️', ...args);
    }
  }
  
  error(...args: unknown[]) {
    if (this.shouldLog('error')) {
      console.error(this.prefix, '❌', ...args);
    }
  }
  
  critical(...args: unknown[]) {
    console.error(this.prefix, '🚨', ...args);
  }
  
  timed(label: string, startTime: number) {
    if (this.shouldLog('debug')) {
      const elapsed = Date.now() - startTime;
      console.log(this.prefix, '⏱️', `${label}: ${elapsed}ms`);
    }
  }
}

export const voiceLogger = new VoiceLogger();
