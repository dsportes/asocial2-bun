import { exit } from 'process'
import config from './config.ts'
import Log from './fw/log'
import { AppSQLiteConnector } from './app/AppDBsqlite'
import { FilesystemStorage } from './fw/STfilesystem'

import { schemaExcFW } from './fw/schema'
import { schemaExcAS2 } from './as2/schema'

config.databases.set('masterDB', new AppSQLiteConnector(config.keys['sqlite_z'], config.keys['sites']['A']))
config.databases.set('safeDB', new AppSQLiteConnector(config.keys['sqlite_z'], config.keys['sites']['A']))
config.databases.set('svcDB', new AppSQLiteConnector(config.keys['sqlite_z'], config.keys['sites']['A']))

/* DB spécifiques par organisation
const sqlb = new AppSQLiteConnector(config.keys['sqlite_b'], config.keys['sites']['A'])
const fs1 = new AppFirestoreConnector(config.keys['googleCloud'], config.keys['sites']['A'])
config.databases.set('org1_DB', sqlb)
config.databases.set('org2_DB', fs1)
*/

config.storages.set('svcST', new FilesystemStorage(config.keys['storage_a']))
/* Storages spécifiques par organisation
config.storages.set('org1_ST', new FilesystemStorage(config.keys['storage_b']))
*/

/*
import { loadingDF } from '../src-fw/documents'
loadingDF()

import { loadingDA } from '../src-as2/documents'
loadingDA()

import { loadingOF } from '../src-fw/operations'
loadingOF()

import { loadingOA } from './operations'
loadingOA()

import { loadingOS } from '../src-fw/safeop'
loadingOS()
*/

let exc = schemaExcFW()
if (!exc) exc = schemaExcAS2()
if (exc) {
  Log.error(exc.toString())
  exit()
}

export const setup = () => {
  Log.info('config2 complete')
}