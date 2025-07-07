import type { CatalogPlugin, ListContext, Folder } from '@data-fair/types-catalogs'
import type { Document, GristConfig, Organization, Table, Workspace } from '#types'
import type { GristCapabilities } from './capabilities.ts'
import axios from 'axios'
import memoize from 'memoize'

/**
 * Alias for the type of lists of Folder/Resources from the list method.
 */
type ResourceList = Awaited<ReturnType<CatalogPlugin['list']>>['results']

/**
 * Sends an HTTP request to a given URL with an API key for authorization.
 * @param url - The URL to which the request is sent.
 * @param apiKey - The API key used for authorization.
 * @returns A promise that resolves with the response data if the request is successful.
 * @throws An error if the request fails or if the response status is not 200.
 */
const sendRequest = memoize(async (url: string, apiKey: string): Promise<any> => {
  try {
    const rep = await axios(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })

    if (rep.status !== 200) {
      throw new Error(`HTTP ${rep.status}, ${JSON.stringify(rep.data)}`)
    }

    return rep.data
  } catch (err) {
    console.error(`Error while fetching data: ${err instanceof Error ? err.message : JSON.stringify(err)}`)
    throw new Error('Erreur pendant la récupération des données, pensez à vérifier si l\'url ou la clé d\'API est correcte')
  }
}, { maxAge: 1000 * 60 * 5 })

/**
 * Lists available Grist resources based on the current folder ID.
 * @param  context - Context containing configuration, secrets, and parameters.
 * @returns An object containing the count of resources, the results, and the path.
 */
export const list = async ({ catalogConfig, secrets, params }: ListContext<GristConfig, GristCapabilities>): ReturnType<CatalogPlugin['list']> => {
  let url = catalogConfig.url
  const folders: ResourceList = []
  let path: Folder[] = []

  if (!params.currentFolderId) {
    // List organizations (to select one)
    url += '/api/orgs'
    const res : Organization[] = await sendRequest(url, secrets.apiKey)
    res.forEach((element: Organization) => {
      const addName = (element.name === 'Personal') ? ` (@${element.owner?.name})` : ''
      folders.push({
        id: '/orgs/' + element.id,
        title: element.name + addName,
        type: 'folder'
      } as Folder)
    })
    path = []
  } else if (params.currentFolderId.includes('/orgs/')) {
    // List workspaces of an organization
    url += '/api' + params.currentFolderId + '/workspaces'
    const res: Workspace[] = await sendRequest(url, secrets.apiKey)
    res.forEach((element: Workspace) => {
      folders.push({
        id: '/workspaces/' + element.id,
        title: element.name,
        type: 'folder'
      } as Folder)
    })

    const resPath: Organization = await sendRequest(url.substring(0, url.indexOf('/workspaces')), secrets.apiKey)
    path = [{
      id: params.currentFolderId,
      title: resPath.name,
      type: 'folder'
    }]
  } else if (params.currentFolderId.includes('/workspaces/')) {
    // List documents of a workspace
    url += '/api' + params.currentFolderId
    const res: Workspace = await sendRequest(url, secrets.apiKey)
    const domain = res.org?.domain
    res.docs?.forEach((element: Document) => {
      folders.push({
        // id contains the domain, the document id (separated by a '|')
        id: `${domain}|/docs/${element.id}`,
        title: element.name,
        type: 'folder'
      } as Folder)
    })
    path = [{
      id: '/orgs/' + res.org?.id,
      title: res.org?.name ?? '',
      type: 'folder'
    }, {
      id: params.currentFolderId,
      title: res.name,
      type: 'folder'
    }]
  } else {
    // list tables of a document
    const [domain, docUrl] = params.currentFolderId.split('|', 2)
    if (catalogConfig.url.includes('.getgrist.com')) {
      // if the domain is .getgrist.com, then the url is different to fetch docuements
      url += `/api${docUrl}/tables`
    } else {
      url += `/o/${domain}/api${docUrl}/tables`
    }

    const res: Table[] = (await sendRequest(url, secrets.apiKey)).tables
    res.forEach((element: Table) => {
      folders.push({
        // id contains the domain, the document id, and the table id (separated by '|')
        id: `${domain}|${docUrl.substring(6)}|${element.id}`,  // substring(6) to remove the '/docs/'
        title: element.id,
        type: 'resource',
        format: 'csv'
      } as ResourceList[number])
    })

    const resPath: Document = await sendRequest(url.substring(0, url.indexOf('/tables')), secrets.apiKey)
    path = [{
      id: '/orgs/' + resPath.workspace?.org?.id,
      title: resPath.workspace?.org?.name ?? '',
      type: 'folder'
    }, {
      id: '/workspaces/' + resPath.workspace?.id,
      title: resPath.workspace?.name ?? '',
      type: 'folder'
    }, {
      id: params.currentFolderId,
      title: resPath.name,
      type: 'folder'
    }]
  }

  return {
    count: folders.length,
    results: folders,
    path
  }
}
