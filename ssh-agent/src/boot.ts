// Imported first so secrets are validated before any worker/module side-effects.
import { validateSecrets } from '@halostack/crypto'
import { initOtel } from './otel'

validateSecrets()
initOtel('halostack-ssh-agent')
