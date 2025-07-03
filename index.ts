import type CatalogPlugin from '@data-fair/types-catalogs'
import { importConfigSchema, configSchema, assertConfigValid, type MockConfig } from '#types'
import { type MockCapabilities, capabilities } from './lib/capabilities.ts'
import Debug from 'debug'
const debug = Debug('catalog-mock')

// Since the plugin is very frequently imported, each function is imported on demand,
// instead of loading the entire plugin.
// This file should not contain any code, but only constants and dynamic imports of functions.

const plugin: CatalogPlugin<MockConfig, MockCapabilities> = {
  async prepare (context) {
    const prepare = (await import('./lib/prepare.ts')).default
    return prepare(context)
  },

  async list (context) {
    const { list } = await import('./lib/imports.ts')
    return list(context)
  },

  async getResource (context) {
    const { getResource } = await import('./lib/imports.ts')
    return getResource(context)
  },

  async publishDataset ({ dataset, publication }) {
    debug('Publishing dataset ' + dataset.id)
    publication.remoteDataset = {
      id: 'my-mock-' + dataset.id,
      title: dataset.title,
      url: 'https://example.com/dataset/' + dataset.id,
    }
    return publication
  },

  async deleteDataset () {
    debug('Deleting dataset...')
  },

  metadata: {
    title: 'Catalog Mock',
    description: 'Mock plugin for Data Fair Catalog',
    thumbnailPath: './lib/resources/thumbnail.svg',
    capabilities
  },

  importConfigSchema,
  configSchema,
  assertConfigValid
}
export default plugin
