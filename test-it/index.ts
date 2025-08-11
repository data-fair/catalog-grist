import { listResources } from '../lib/imports.ts'
import type { GetResourceContext, ListResourcesContext } from '@data-fair/types-catalogs'
import { afterEach, beforeEach, describe, it } from 'node:test'
import nock from 'nock'
import assert from 'node:assert'
import type { Document, GristConfig, Organization, Table, Workspace } from '#types'
import type { GristCapabilities } from '../lib/capabilities.ts'
import { getResource } from '../lib/download.ts'
import fs from 'fs'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
import { logFunctions } from './test-utils.ts'

describe('listResources', () => {
  const catalogConfig = {
    //   /!\ il faut le redéfinir a chaque test (a cause du memoize) à moins d'utiliser un current.resourceId différent à chaque test
    url: 'https://example.com',
    apiKey: 'abcde'
  }

  const context: ListResourcesContext<GristConfig, GristCapabilities> = {
    catalogConfig,
    params: {},
    secrets: { apiKey: 'abcde' }
  }

  beforeEach(() => {
    nock.cleanAll()
    context.params = {}
  })

  describe('tests with mock requests', async () => {
    it('should list Organizations successfully', async () => {
      const mockResponse: Organization[] = [{
        name: 'Personal',
        id: 1,
        domain: 'org-1',
        owner: { name: 'UserTest' }
      }, {
        name: 'orgaTest',
        id: 2,
        domain: 'org-2'
      }]

      nock('https://example.com')
        .get('/api/orgs')
        .reply(200, mockResponse)

      const result = await listResources(context)

      assert.ok(result)
      assert.strictEqual(result.results.length, 2)
      assert.strictEqual(result.path.length, 0)
      assert.ok(result.results.some(orga => orga.title === 'Personal (@UserTest)' && orga.id === '/orgs/1'))
      assert.ok(result.results.some(orga => orga.title === 'orgaTest' && orga.id === '/orgs/2'))
    })

    it('should list workspaces successfully ', async () => {
      context.params.currentFolderId = '/orgs/1'
      const mockResponseWS: Workspace[] = [{
        name: 'wsp 1',
        id: 1,
        docs: [{
          name: 'doc1',
          id: 'd1'
        }]
      }, {
        name: 'wsp 2',
        id: 2,
        docs: []
      }]

      const mockResponseOrg: Organization = {
        name: 'Personal',
        id: 1,
        domain: 'org-1'
      }

      nock('https://example.com')
        .get('/api/orgs/1/workspaces')
        .reply(200, mockResponseWS)

      nock('https://example.com')
        .get('/api/orgs/1')
        .reply(200, mockResponseOrg)

      const result = await listResources(context)
      assert.ok(result)
      assert.strictEqual(result.results.length, 2)

      assert.strictEqual(result.path.length, 1)
    })

    it('should list documents successfully ', async () => {
      context.params.currentFolderId = '/workspaces/1'
      const mockDocs: Workspace = {
        name: 'wsp 1',
        id: 1,
        docs: [{
          name: 'doc1',
          id: 'd1'
        }, {
          name: 'doc2',
          id: 'd2'
        }],
        org: {
          name: 'Personal',
          id: 1,
          domain: 'org-1'
        }
      }

      nock('https://example.com')
        .get('/api/workspaces/1')
        .reply(200, mockDocs)

      const result = await listResources(context)
      assert.ok(result)
      assert.strictEqual(result.results.length, 2)
      assert.ok(result.results.some(doc => doc.title === 'doc1' && doc.id === 'org-1|/docs/d1'))
      assert.ok(result.results.some(doc => doc.title === 'doc2' && doc.id === 'org-1|/docs/d2'))
      assert.strictEqual(result.path.length, 2)
      assert.strictEqual(result.path[0].title, 'Personal')
      assert.strictEqual(result.path[0].id, '/orgs/1')
      assert.strictEqual(result.path[1].title, 'wsp 1')
      assert.strictEqual(result.path[1].id, '/workspaces/1')
    })

    it('should list tables when currentFolderId includes a domain and document ID', async () => {
      context.params.currentFolderId = 'org-1|/docs/d1'
      const mockTables: { tables: Table[] } = {
        tables: [
          { id: 'Table1' },
          { id: 'Table2' }
        ]
      }

      const mockDoc: Document = {
        name: 'doc1',
        id: 'd1',
        workspace: {
          name: 'wsp 1',
          id: 1,
          org: {
            name: 'Personal',
            id: 1,
            domain: 'org-1'
          }
        }
      }

      // Mock the API response for tables
      nock('https://example.com')
        .get('/o/org-1/api/docs/d1/tables')
        .reply(200, mockTables)

      nock('https://example.com')
        .get('/o/org-1/api/docs/d1')
        .reply(200, mockDoc)

      const result = await listResources(context)

      assert.strictEqual(result.count, 2)
      assert.strictEqual(JSON.stringify(result.results), JSON.stringify([
        { id: 'org-1|d1|Table1', title: 'Table1', type: 'resource', format: 'csv' },
        { id: 'org-1|d1|Table2', title: 'Table2', type: 'resource', format: 'csv' }
      ]))
      assert.strictEqual(result.path[0].title, 'Personal')
      assert.strictEqual(result.path[0].id, '/orgs/1')
      assert.strictEqual(result.path[1].title, 'wsp 1')
      assert.strictEqual(result.path[1].id, '/workspaces/1')
      assert.strictEqual(result.path[2].title, 'doc1')
      assert.strictEqual(result.path[2].id, 'org-1|/docs/d1')
    })

    it('should handle API errors', async () => {
      context.params.currentFolderId = '/orgs/3'

      nock('https://example.com')
        .get('/api/orgs/3/workspaces')
        .reply(500, { error: 'Internal Server Error' })

      try {
        await listResources(context)
        assert.fail('Expected an error to be thrown')
      } catch (error) {
        assert.ok(error instanceof Error && error.message.includes('Erreur pendant la récupération des données'))
      }
    })
  })
})

describe('getResource', async () => {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)

  describe('tests with mock requests', () => {
    const catalogConfig = {
      url: 'https://example.com',
      apiKey: 'abcde'
    }

    const secrets = { apiKey: 'abcde' }
    const tmpDir = path.join(__dirname, 'tmp')
    const resourceId = 'domain1|doc1|table1'

    // Ensure the temporary directory exists
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir)
    }

    const context: GetResourceContext<typeof catalogConfig> = {
      catalogConfig,
      secrets,
      resourceId,
      tmpDir,
      importConfig: {},
      log: logFunctions
    }

    beforeEach(() => {
      // Clean up the tmp directory before each test
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true })
      }
      fs.mkdirSync(tmpDir)
    })

    afterEach(() => {
      // Clean up the tmp directory after each test
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true })
      }
    })

    it('should download a resource successfully', async () => {
      const mockResponse = 'csv,data,here'

      nock('https://example.com')
        .get('/o/domain1/api/docs/doc1/download/csv?tableId=table1')
        .reply(200, mockResponse)

      nock('https://example.com')
        .get('/o/domain1/api/docs/doc1/download/table-schema?tableId=table1')
        .reply(200, {
          dialect: { delimiter: ',' },
          name: 'table1',
          title: 'Table1',
          schema: {
            fields: [
              { name: 'field1', description: 'Field 1' },
              { name: 'field2', description: 'Field 2', type: 'array' }
            ]
          }
        })

      const result = await getResource(context)

      assert.ok(result)
      assert.strictEqual(result.id, 'table1')
      assert.strictEqual(result.title, 'Table1')
      assert.strictEqual(result.format, 'csv')
      assert.strictEqual(result.mimeType, 'text/csv')
      assert.strictEqual(result.origin, 'https://example.com/o/domain1/doc1')
      assert.strictEqual(result.filePath, path.join(tmpDir, 'table1.csv'))
      assert.deepEqual(result.schema, [
        { key: 'field1', title: 'field1', description: 'Field 1', separator: undefined },
        { key: 'field2', title: 'field2', description: 'Field 2', separator: ', ' }
      ])

      // Verify that the file was written to the file system
      const fileContent = fs.readFileSync(path.join(tmpDir, 'table1.csv'), 'utf-8')
      assert.strictEqual(fileContent, mockResponse)
    })

    it('should handle API errors', async () => {
      nock('https://example.com')
        .get('/o/domain1/api/docs/doc1/download/csv?tableId=table1')
        .reply(500, { error: 'Internal Server Error' })

      try {
        await getResource(context)
        assert.fail('Expected an error to be thrown')
      } catch (error) {
        console.log(error)
        assert.ok(error instanceof Error && error.message.includes('Erreur pendant la récupération des données'))
      }
    })
  })
})
