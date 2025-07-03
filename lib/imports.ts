import type { CatalogPlugin, ListContext, Folder, GetResourceContext } from '@data-fair/types-catalogs'
import type { MockConfig } from '#types'
import type { MockCapabilities } from './capabilities.ts'

export const list = async ({ catalogConfig, secrets, params }: ListContext<MockConfig, MockCapabilities>): ReturnType<CatalogPlugin['list']> => {
  await new Promise(resolve => setTimeout(resolve, catalogConfig.delay)) // Simulate a delay for the mock plugin

  const clone = (await import('@data-fair/lib-utils/clone.js')).default
  const tree = clone((await import('./resources/datasets-mock.ts')).default)

  /**
   * Extracts folders and resources for a given parent/folder ID
   * @param resources - The resources object containing folders and resources
   * @param targetId - The parent ID for folders or folder ID for resources (undefined for root level)
   * @returns Array of folders and resources matching the criteria
   */
  const getFoldersAndResources = (targetId: string | undefined) => {
    const folders = Object.keys(tree.folders).reduce((acc: Folder[], key) => {
      if (tree.folders[key].parentId !== targetId) return acc // Skip folders that are not under the targetId
      acc.push({
        id: key,
        title: tree.folders[key].title,
        type: 'folder'
      })
      return acc
    }, [])

    // In the mock plugin, we assume that resources are always under a folder
    if (!targetId) return folders

    const resources = tree.folders[targetId]?.resourceIds.reduce((acc: Awaited<ReturnType<CatalogPlugin['list']>>['results'], resourceId) => {
      const resource = tree.resources[resourceId]
      if (!resource) return acc // Skip if resource not found

      acc.push({
        id: resourceId,
        title: resource.title,
        description: resource.description + '\n\n' + secrets.secretField, // Include the secret in the description for demonstration
        format: resource.format,
        mimeType: resource.mimeType,
        origin: resource.origin,
        size: resource.size,
        type: 'resource'
      })
      return acc
    }, [])

    return [...folders, ...resources]
  }

  const path: Folder[] = []
  let res = getFoldersAndResources(params.currentFolderId)
  // Get total count before search and pagination
  const totalCount = res.length

  // Apply search filter if provided
  if (params.q && catalogConfig.searchCapability) {
    const searchTerm = params.q.toLowerCase()
    res = res.filter(item =>
      item.title.toLowerCase().includes(searchTerm) ||
      ('description' in item && item.description?.toLowerCase().includes(searchTerm))
    )
  }

  if (catalogConfig.paginationCapability) {
    // Apply pagination
    const size = params.size || 20
    const page = params.page || 0
    const skip = (page - 1) * size
    res = res.slice(skip, skip + size)
  }

  // Get path to current folder if specified
  if (params.currentFolderId) {
    // Get current folder
    const currentFolder = tree.folders[params.currentFolderId]
    if (!currentFolder) throw new Error(`Folder with ID ${params.currentFolderId} not found`)

    // Get path to current folder (parents folders)
    let parentId = currentFolder.parentId
    while (parentId) {
      const parentFolder = tree.folders[parentId]
      if (!parentFolder) throw new Error(`Parent folder with ID ${parentId} not found`)

      // Add the parent to the start of the list to avoid reversing the path later
      path.unshift({
        id: parentId,
        title: parentFolder.title,
        type: 'folder'
      })
      parentId = parentFolder.parentId
    }

    // Add the current folder to the path
    path.push({
      id: params.currentFolderId,
      title: currentFolder.title,
      type: 'folder'
    })
  }

  return {
    count: totalCount,
    results: res,
    path
  }
}

export const getResource = async ({ catalogConfig, secrets, resourceId, importConfig, tmpDir }: GetResourceContext<MockConfig>): ReturnType<CatalogPlugin['getResource']> => {
  await new Promise(resolve => setTimeout(resolve, catalogConfig.delay))

  // Validate the importConfig
  const { returnValid } = await import('#type/importConfig/index.ts')
  returnValid(importConfig)

  // First check if the resource exists
  const resources = (await import('./resources/datasets-mock.ts')).default
  const resource = resources.resources[resourceId]
  if (!resource) { throw new Error(`Resource with ID ${resourceId} not found`) }

  // Import necessary modules dynamically
  const fs = await import('node:fs/promises')
  const path = await import('node:path')

  // Simulate downloading by copying a dummy file with limited rows
  const sourceFile = path.join(import.meta.dirname, 'resources', 'jdd-mock.csv')
  const destFile = path.join(tmpDir, 'jdd-mock.csv')
  const data = await fs.readFile(sourceFile, 'utf8')

  // Limit the number of rows to importConfig.nbRows (Header excluded)
  const lines = data.split('\n').slice(1, importConfig.nbRows).join('\n')
  await fs.writeFile(destFile, lines, 'utf8')

  return {
    id: resourceId,
    ...resource,
    description: resource.description + '\n\n' + secrets.secretField, // Include the secret in the description for demonstration
    filePath: destFile
  }
}
