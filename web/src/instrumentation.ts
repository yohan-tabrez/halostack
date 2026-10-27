// Next.js runs register() once at server startup — the right place to fail fast on
// unsafe secrets, rather than at module load (which would also run in the edge/build
// contexts and can't be recovered from during a rotation).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateSecrets } = await import('@halostack/crypto')
    validateSecrets()
    const { initOtel } = await import('./otel')
    initOtel('halostack-web')
  }
}
