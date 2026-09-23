const LOG_FILE = "slideshow.log";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

let currentLevel: LogLevel = "INFO";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

async function writeToFile(message: string): Promise<void> {
  try {
    await Deno.writeTextFile(LOG_FILE, message + "\n", { append: true });
  } catch (error) {
    console.error("Failed to write to log file:", error);
  }
}

function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}:${hours}:${minutes}`;
}

function formatMessage(level: LogLevel, message: string): string {
  const timestamp = formatTimestamp();
  // Only show level prefix for non-INFO levels
  if (level === "INFO") {
    return `${timestamp} ${message}`;
  }
  return `${timestamp} [${level}] ${message}`;
}

export function info(message: string): void {
  if (!shouldLog("INFO")) return;
  const formatted = formatMessage("INFO", message);
  console.log(formatted);
  writeToFile(formatted);
}

export function warn(message: string): void {
  if (!shouldLog("WARN")) return;
  const formatted = formatMessage("WARN", message);
  console.warn(formatted);
  writeToFile(formatted);
}

export function error(message: string): void {
  if (!shouldLog("ERROR")) return;
  const formatted = formatMessage("ERROR", message);
  console.error(formatted);
  writeToFile(formatted);
}

export function debug(message: string): void {
  if (!shouldLog("DEBUG")) return;
  const formatted = formatMessage("DEBUG", message);
  console.log(formatted);
  writeToFile(formatted);
}

export const logger = { info, warn, error, debug, setLogLevel, getLogLevel };
