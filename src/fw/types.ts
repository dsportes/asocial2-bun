import { DbConnector, STabstract } from './base'

export type BaseConfig = {
  PROD: boolean
  BUILD: string // 'v1.0'
  API: number // 1
  APIVERSIONS: number[] // [1, 1]

  debugLevel: number // 0: aucun, 1: standard: 2: élevé 3: détail DB
  adminAlerts: boolean // false: simulation true: envoi de mail

  keys: any

  serverOps: Set<string>, // Opérations supportées: 'op', 'safe', 'master'

  SERVICES: Set<string> // codes des services hébergés sur le site
  ADMINIDS: any,
  ADMINUSERS: Set<string>
  MASTERDIRADMINUSERS: Set<string>
  MASTERDIR_URL: string
  STDSAFE_URL: string

  STORAGE_EMULATOR_HOST?: string
  FIRESTORE_EMULATOR_HOST?: string

  databases: Map<string, DbConnector> // DbConnector
  dbConnectorClasses: any // Objet : { sqlite: Cl1, ...: cl2 }
  storages: Map<string, STabstract> 

  port: any // 8080
  https: boolean
  origins: Set<string> // new Set<string>(['http://localhost:8080']),

  SUBSMAXLIFEINMINUTES: number[]
  FORMMAXLIFE: number // En minutes - typiquement 10*1440:
  STATUSLAZYNESS: number // En SECONDES, délai de prise en compte d'un changement de Status

}

export interface AbstractOperation {
  opName: string
  org?: string
  result: any
  args: any 
  db?: any
  now: number
  baseUrl?: string

  /* Fixe LA valeur de la propriété 'prop' du résultat (et la retourne)*/
  setRes(prop: string, val: any) : void
}

export interface OperationWC extends AbstractOperation {
  org: string
  svc?: string
  cache?: any
  authRecord?: any

  hbcMode () :  number
  transac () : Promise<void>
}

/************************************************************
Accès au MasterDir et aux Safes depuis les opérations
- soit par appel direct de la fonction si hébergé par la même uRL que l'opération
- soit par un applel HTTP au serveur correspondant
**************************************************************/
export type ICVS = {
  i: string
  c: string
  v: string
  s: string
  dh: number
}
