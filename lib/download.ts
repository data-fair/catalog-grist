import type { GetResourceContext, Resource } from '@data-fair/types-catalogs'
import type { GristConfig } from '#types'
import axios from '@data-fair/lib-node/axios.js'
import fs from 'fs'
import path from 'path'
import slug from 'slugify'

/**
 * Retrieves a specific Grist resource based on its ID and download it.
 * @param context - Context containing configuration, secrets, resource ID, and temporary directory.
 * @param context.resourceId - the resourceId of the resource to fetch. Must have the format :  `domain|docId|tableId` (separated by pipes `|`)
 * @returns A Resource object containing details of the downloaded resource containing the downloaded file path
 * @throws An error if the resource download fails.
 */
export const getResource = async (context: GetResourceContext<GristConfig>): Promise<Resource> => {
  const { catalogConfig, secrets, resourceId, tmpDir, log } = context
  try {
    const [domain, docId, tableId] = resourceId.split('|', 3)
    let url: string
    if (catalogConfig.url.includes('.getgrist.com')) {
      // if the domain is .getgrist.com, then the url is different to fetch docuements
      url = `${catalogConfig.url}/api/docs/${docId}/download/csv?tableId=${tableId}`
    } else {
      url = `${catalogConfig.url}/o/${domain}/api/docs/${docId}/download/csv?tableId=${tableId}`
    }

    await log.step('Import de la ressource Grist')
    const res = await axios(url, {
      responseType: 'stream',
      headers: {
        Authorization: `Bearer ${secrets.apiKey}`
      }
    })

    if (res.status !== 200) {
      console.error(`Failed to fetch resource: HTTP ${res.status}`, res.data)
      throw new Error(`Erreur pendant la récupération des données (erreur HTTP ${res.status})`)
    }

    const destFile = path.join(tmpDir, `${tableId}.csv`)
    const writer = fs.createWriteStream(destFile)

    await log.task(`Downloading ${tableId}`, 'Télécargement de la ressource', NaN)

    let downloaded = 0
    const logInterval = 500 // ms
    let lastLogged = Date.now()

    res.data.on('data', (chunk: Buffer) => {
      downloaded += chunk.length
      if (Date.now() - lastLogged > logInterval) {
        log.progress(`Downloading ${tableId}`, downloaded)
        lastLogged = Date.now()
      }
    })

    await new Promise<void>((resolve, reject) => {
      res.data.pipe(writer)
      writer.on('finish', () => resolve())
      writer.on('error', (error) => reject(error))
    })

    await log.progress(`Downloading ${tableId}`, downloaded, downloaded)
    const resource = await getMetadataOnFields(context)
    resource.filePath = destFile

    return resource
  } catch (error) {
    await log.error(`Failed to fetch resource: HTTP ${error instanceof Error ? error.message : JSON.stringify(error)}`)
    console.error(`Error in getResource: ${error instanceof Error ? error.message : JSON.stringify(error)}`)
    throw new Error(`Erreur pendant la récupération des données: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Retrieves metadata for a Grist resource based on its ID.
 *
 * This function fetches the schema and other details of the resource. The schema returned
 * will include information about the fields in the resource: `key`, `title`, `description`, and `separator` if applicable.
 *
 * @param catalogConfig - The catalog configuration containing the Grist URL.
 * @param secrets - The secrets containing the API key.
 * @param resourceId - The resource ID in the format `domain|docId|tableId`.
 * @param log - The logging functions to use for progress and error messages.
 * @throws An error if the metadata retrieval fails or if the HTTP request returns a non-200 status code.
 */
const getMetadataOnFields = async ({ catalogConfig, secrets, resourceId, log }: GetResourceContext<GristConfig>): Promise<Resource> => {
  log.info('Récupération des métadonnées')

  const [domain, docId, tableId] = resourceId.split('|', 3)
  let url: string
  if (catalogConfig.url.includes('.getgrist.com')) {
    // if the domain is .getgrist.com, then the url is different to fetch docuements
    url = `${catalogConfig.url}/api/docs/${docId}/download/table-schema?tableId=${tableId}`
  } else {
    url = `${catalogConfig.url}/o/${domain}/api/docs/${docId}/download/table-schema?tableId=${tableId}`
  }

  const res = await axios(url, {
    headers: { Authorization: `Bearer ${secrets.apiKey}` }
  })

  if (res.status !== 200) {
    console.error(`Failed to fetch resource metadata: HTTP ${res.status}`, res.data)
    throw new Error(`Erreur pendant la récupération des métadonnées (erreur HTTP ${res.status})`)
  }

  const data = res.data
  const origin = (catalogConfig.url.includes('.getgrist.com')) ? `${catalogConfig.url}/${docId}` : `${catalogConfig.url}/o/${domain}/${docId}`
  const resource: Resource = {
    id: data.name,
    title: data.title || data.name,
    format: 'csv',
    mimeType: 'text/csv',
    origin,
    filePath: ''
  }

  resource.schema = (data.schema?.fields || []).map((field: any) => {
    let separator: undefined | string
    if (field.type === 'array') {
      if (!field.dialect?.delimiter || field.dialect?.delimiter === ',') {
        separator = ', '
      } else {
        separator = field.dialect?.delimiter
      }
    }
    return {
      key: slug.default(field.name, { lower: true, strict: true, replacement: '_' }),
      title: field.name,
      description: field.description,
      separator,
    }
  })

  return resource
}
