import type { PrepareContext } from '@data-fair/types-catalogs'
import type { GristCapabilities } from './capabilities.ts'
import type { GristConfig } from '#types'
import axios from '@data-fair/lib-node/axios.js'

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

  if (!catalogConfig.url) {
    throw new Error('Grist catalog configuration requires a "url" property.')
  }
  try {
    const url = new URL(catalogConfig.url + '/api/orgs')
    await axios(url.toString(), {
      headers: { Authorization: `Bearer ${secrets.apiKey}` }
    })
  } catch (error) {
    console.error(`Error connecting to Grist API: ${error instanceof Error ? error.message : JSON.stringify(error)}`)
    throw new Error('Erreur de connexion à l\'API Grist, vérifiez l\'URL et la clé d\'API.')
  }

  return {
    catalogConfig,
    capabilities,
    secrets
  }
}
