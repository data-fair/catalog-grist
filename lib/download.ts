import type { GetResourceContext, Resource } from '@data-fair/types-catalogs'
import type { GristConfig } from '#types'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

/**
 * Retrieves a specific Grist resource based on its ID and download it.
 * @param context - Context containing configuration, secrets, resource ID, and temporary directory.
 * @param context.resourceId - the resourceId of the resource to fetch. Must have the format :  `domain|docId|tableId` (separated by pipes `|`)
 * @returns A Resource object containing details of the downloaded resource containing the downloaded file path
 * @throws An error if the resource download fails.
 */
export const getResource = async ({ catalogConfig, secrets, resourceId, tmpDir }: GetResourceContext<GristConfig>): Promise<Resource> => {
  try {
    const [domain, docId, tableId] = resourceId.split('|', 3)
    let url: string
    if (catalogConfig.url.includes('.getgrist.com')) {
      // if the domain is .getgrist.com, then the url is different to fetch docuements
      url = `${catalogConfig.url}/api/docs/${docId}/download/csv?tableId=${tableId}`
    } else {
      url = `${catalogConfig.url}/o/${domain}/api/docs/${docId}/download/csv?tableId=${tableId}`
    }

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

    await new Promise<void>((resolve, reject) => {
      res.data.pipe(writer)
      writer.on('finish', () => resolve())
      writer.on('error', (error) => reject(error))
    })

    const origin = (catalogConfig.url.includes('.getgrist.com')) ? `${catalogConfig.url}/${docId}` : `${catalogConfig.url}/o/${domain}/${docId}`

    const resource: Resource = {
      id: resourceId,
      title: tableId,
      format: 'csv',
      mimeType: 'text/csv',
      origin,
      size: fs.statSync(destFile).size,
      filePath: destFile
    }

    return resource
  } catch (error) {
    console.error(`Error in getResource: ${error instanceof Error ? error.message : JSON.stringify(error)}`)
    throw new Error(`Erreur pendant la récupération des données: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
