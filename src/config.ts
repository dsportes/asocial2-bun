import { env, exit } from 'process'
import keys from './keys.jsonc'
import Log from './fw/log'
import type { BaseConfig } from './fw/types'
import { DbConnector, STabstract } from './fw/base'
import { FilesystemStorage } from './fw/STfilesystem'
import { AppSQLiteConnector } from './app/dbSqlite'
import { schemaExcFW } from './fw/schema'
import { schemaExcAS2 } from './as2/schema'

/* Possibilité d'attacher un log "Google-cloud" au log générique Winston */
// import { LoggingWinston } from '@google-cloud/logging-winston'

const admin1 = 'VpOZWh0Zeh20Tk5C1BNi'
const admin2 = 'Q8v99KlnO04zV41Z1MVx'
const PROD = false

// const sqlb = new AppSQLiteConnector(keys['sqlite_b'], keys['sites']['A'])
// const fs1 = new AppFirestoreConnector(keys['googleCloud'], keys['sites']['A'])

export default {
  BUILD: 'v1.0',
  API: 1,
  APIVERSIONS: [1, 1],

  debugLevel: 3, // 0: aucun, 1: standard: 2: élevé 3: détail DB
  adminAlerts: false, // false: simulation true: envoi de mail
  LOGGER: new Log(PROD, './logs', /* new LoggingWinston() */),
  PROD,
  keys: keys,

  SERVICES: new Set(['AS2']),
  ADMINIDS: { 
    'C5ov-RUbygqXvwKL9TxC' : admin1, 
    '8i3UFqA_HoNWPJB1SrKv' : admin2 },
  ADMINUSERS: new Set([admin1, admin2]),
  MASTERDIRADMINUSERS: new Set([admin1]),
  MASTERDIR_URL: 'http://localhost:8091/master',
  STDSAFE_URL: 'http://localhost:8091/safe',

  STORAGE_EMULATOR_HOST: env['STORAGE_EMULATOR_HOST'] || '',
  FIRESTORE_EMULATOR_HOST: env['FIRESTORE_EMULATOR_HOST'] || '',

  databases: new Map<string, DbConnector>([
    ['masterDB', new AppSQLiteConnector(keys['sqlite_z'], keys['sites']['A'])],
    ['safeDB', new AppSQLiteConnector(keys['sqlite_z'], keys['sites']['A'])],
    ['svcDB', new AppSQLiteConnector(keys['sqlite_a'], keys['sites']['A'])],
    // ['org1_DB', sqlb],
    // ['svcDB', fs1],
  ]),

  storages: new Map<string, STabstract>([
    ['svcST', new FilesystemStorage(keys['storage_a'])],
    // ['org1_ST', new FilesystemStorage(keys['storage_b'])]
  ])

} as BaseConfig

let exc = schemaExcFW()
if (!exc) exc = schemaExcAS2()
if (exc) {
  Log.error(exc.toString())
  exit()
}
