import { env, exit } from 'process'
import keys from './keys.jsonc'
import Log from './fw/log'
import type { BaseConfig } from './fw/types'
import { DbConnector, STabstract } from './fw/base'
import { AppSQLiteConnector } from './app/AppDBsqlite'
import { schemaExcFW } from './fw/schema'
import { schemaExcAS2 } from './as2/schema'

/* Possibilité d'attacher un log "Google-cloud" au log générique Winston */
// import { LoggingWinston } from '@google-cloud/logging-winston'

const admin1 = 'VpOZWh0Zeh20Tk5C1BNi'
const admin2 = 'Q8v99KlnO04zV41Z1MVx'
const PROD = false

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

  databases: new Map<string, DbConnector>(),

  dbConnectorClasses: {
    sqlite: AppSQLiteConnector
    // firestore: AppFirestoreConnector,
  },

  storages: new Map<string, STabstract>()

} as BaseConfig
