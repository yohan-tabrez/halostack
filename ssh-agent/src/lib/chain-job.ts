/** Insert shape for a chain-enqueued command_job (includes issued_by from the run). */
export function chainJobInsertValues(
  serverId: string,
  command: string,
  runStepId: string,
  issuedBy: string | null
) {
  return {
    server_id: serverId,
    command,
    status: 'queued' as const,
    chain_run_step_id: runStepId,
    issued_by: issuedBy,
  }
}
