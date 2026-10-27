const ERROR_MAP: [string, string][] = [
  ["Stream isn't writeable", 'The job queue is temporarily busy — please retry in a moment.'],
  ['enableOfflineQueue', 'Job queue is offline. Please wait a few seconds and retry.'],
  ['ECONNREFUSED', 'Cannot reach the backend service. Ensure all services are running.'],
  ['Rate limit exceeded', "You're dispatching too quickly. Please wait a minute before retrying."],
  ['Unauthorized', 'Your session has expired. Please refresh the page.'],
  ['Server not found', "This server no longer exists or you don't have access to it."],
  ['Missing required', 'Please fill in all required fields before submitting.'],
]

export function toFriendlyJobError(msg: string): string {
  for (const [pattern, friendly] of ERROR_MAP) {
    if (msg.includes(pattern)) return friendly
  }
  return msg
}
