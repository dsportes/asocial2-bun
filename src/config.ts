import { env, exit } from 'process'
import keys from './keys.jsonc'
import Log from './fw/log'
import type { BaseConfig } from './fw/types'
import { DbConnector, STabstract } from './fw/base'

const admin1 = 'VpOZWh0Zeh20Tk5C1BNi'
const admin2 = 'Q8v99KlnO04zV41Z1MVx'
const PROD = false

/* Possibilité d'attacher un log "Google-cloud" au log générique Winston */
// import { LoggingWinston } from '@google-cloud/logging-winston'
new Log(PROD, './logs', /* new LoggingWinston() */)

export default {
  PROD,
  BUILD: 'v1.0',
  API: 1,
  APIVERSIONS: [1, 1],

  debugLevel: 3, // 0: aucun, 1: standard: 2: élevé 3: détail DB
  adminAlerts: false, // false: simulation true: envoi de mail

  keys: keys,

  SERVICES: new Set(['AS2']),
  ADMINIDS: { 
    'C5ov-RUbygqXvwKL9TxC' : admin1, 
    '8i3UFqA_HoNWPJB1SrKv' : admin2 
  },
  ADMINUSERS: new Set([admin1, admin2]),
  MASTERDIRADMINUSERS: new Set([admin1]),
  MASTERDIR_URL: 'http://localhost:8091/master',
  STDSAFE_URL: 'http://localhost:8091/safe',

  STORAGE_EMULATOR_HOST: env['STORAGE_EMULATOR_HOST'] || '',
  FIRESTORE_EMULATOR_HOST: env['FIRESTORE_EMULATOR_HOST'] || '',

  dbConnectorClasses: { },
  databases: new Map<string, DbConnector>(),
  storages: new Map<string, STabstract>(),

  port: env['PORT'] || 8080,
  https: false,
  origins: new Set<string>(),

  SUBSMAXLIFEINMINUTES: [3 * 24 * 60, 1 * 24 * 60],
  FORMMAXLIFE: 10 * 86400, // 10 jours
  STATUSLAZYNESS: 3 * 60 // 3 minutes de prise en compte des changements de status

} as BaseConfig
