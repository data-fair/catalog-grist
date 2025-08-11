import type CatalogPlugin from '@data-fair/types-catalogs'
import { configSchema, assertConfigValid, type GristConfig } from '#types'
import { type GristCapabilities, capabilities } from './lib/capabilities.ts'

// Since the plugin is very frequently imported, each function is imported on demand,
// instead of loading the entire plugin.
// This file should not contain any code, but only constants and dynamic imports of functions.

const plugin: CatalogPlugin<GristConfig, GristCapabilities> = {
  async prepare (context) {
    const prepare = (await import('./lib/prepare.ts')).default
    return prepare(context)
  },

  async listResources (context) {
    const { listResources } = await import('./lib/imports.ts')
    return listResources(context)
  },

  async getResource (context) {
    const { getResource } = await import('./lib/download.ts')
    return getResource(context)
  },

  metadata: {
    title: 'Catalog Grist',
    description: 'Grist plugin for Data Fair Catalog',
    thumbnailPath: './lib/resources/thumbnail.svg',
    capabilities
  },

  configSchema,
  assertConfigValid
}
export default plugin
