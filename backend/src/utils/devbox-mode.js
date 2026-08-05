export function isDevboxEnabled() {
  if (process.env.npm_lifecycle_event === 'dev') {
    return true;
  }

  return process.execArgv.some((arg) => arg === '--watch' || arg.startsWith('--watch='));
}