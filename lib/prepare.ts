import type { PrepareContext } from '@data-fair/types-catalogs'
import type { GristCapabilities } from './capabilities.ts'
import type { GristConfig } from '#types'

export default async ({ catalogConfig, capabilities, secrets }: PrepareContext<GristConfig, GristCapabilities>) => {
  const apiKey = catalogConfig.apiKey
  if (apiKey && apiKey !== '********') {
    secrets.apiKey = apiKey
    catalogConfig.apiKey = '********'
  } else if (secrets?.apiKey && apiKey === '') {
    delete secrets.apiKey
  } else {
    // The secret is already set, do nothing
  }
  return {
    catalogConfig,
    capabilities,
    secrets
  }
}
