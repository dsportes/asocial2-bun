import { encode, decode } from '@msgpack/msgpack'

import config from '../config'
import adminAlert from './adminAlert'
import Log from './log'
import type { AbstractOperation } from './types'

/* Classe AppExc ********************************************************/
export class AppExc {
  /* codes:
  Détecté par l'application
  1: erreur fonctionnelle APP
  2: erreur fonctionnelle FW
  3: assertion FW - BUG: 
  4: assertion APP - BUG:
  8: FW : Exception technique DB / réseau
  9: APP: Exception technique DB / réseau
  10: FW : Exception technique DB / réseau : configuration suspectée
  11: APP: Exception technique DB / réseau : configuration suspectée
  99: Interruption actionnée par l'utilisateur

  Remonté d'un service - assertions 13...16 transmises à l'adiministarteur
  101: erreur fonctionnelle FW : non détectable par l'application
  102: erreur fonctionnelle APP : non détectable par l'application
  103: assertion FW - BUG: l'erreur fonctionnelle est censée avoir été bloquée par l'application
  104: assertion APP - BUG: l'erreur fonctionnelle est censée avoir été bloquée par l'application
  105: assertions FW - Données incohérentes non détectables par l'application
  106: assertions APP - Données incohérentes non détectables par l'application
  108: FW : Exception technique DB / réseau
  109: APP : Exception technique DB / réseau
  110: FW : Exception technique DB / réseau : configuration suspectée
  111: APP : Exception technique DB / réseau : configuration suspectée
  */

  public code: number
  public label: string
  public opName: string
  public org: string
  public stack: string
  public args: string[]

  static important = new Set([103, 104, 108, 109, 110, 111])

  constructor (code: number, label: string, op: any, args?: string[], stack?: string) {
    this.label = label
    this.code = code
    this.opName = op ? (op.opName || '') : ''
    this.org = op && op['org'] ? op['org'] : ''
    this.args = args || []
    this.stack = stack || ''
    if (code > 103) Log.error(this.message)
    else { if (config.debugLevel > 0) Log.debug(this.toString()) }
    if (AppExc.important.has(code)) 
      adminAlert(op, this.message, this.stack)
  }

  serial () { 
    return JSON.stringify({
      code: this.code, 
      label: this.label, 
      opName: this.opName,
      org: this.org, 
      stack: this.stack, 
      args: this.args})
  }

  get message () { return 'AppExc: ' + this.code + ':' + this.label + 
    (this.opName ? '@' + this.opName + ':' : '') 
    + JSON.stringify(this.args || []) }

  toString () { return this.message + (this.stack ? '\n' + this.stack : '')}
}

export class $ADocument {
  get _docDescriptor () { return (this.constructor as any)['_docDescriptor'] }
}

/*
export abstract class DbGeneric {
  org?: string
  async getConnexion (op: AbstractOperation, org?: string, cryptKey?: string) : Promise<DbConnexion | null> {
    return null
  }
  async connect () : Promise<void> {
  }
}
*/

export abstract class DbConnector {

  public key: Buffer
  public credentials: any
  public factory: Function = () => {}

  constructor (credentials: any, cryptKey: string) {
    if (!credentials)
      throw new AppExc(110, 'DbConnector_credentials_not_found', null, [this.constructor.name])
    if (!cryptKey) 
      throw new AppExc(110, 'DbConnector_missing_crypt_key', null, [this.constructor.name])
    this.key = Buffer.from(cryptKey, 'base64')
    this.credentials = credentials
  }

  async getConnexion (op: AbstractOperation, org?: string, cryptKey?: string) 
  : Promise<DbConnexion> {
    const cnx = this.factory(this, op, cryptKey) as DbConnexion
    cnx.org = org || '' 
    await cnx.connect()
    op.db = cnx
    return cnx
  }
}

export abstract class DbConnexion {
  public connector: DbConnector
  public op: AbstractOperation
  public key: Buffer
  public org?: string
  public transaction: any

  constructor (connector: DbConnector, op: AbstractOperation, cryptKey?: string) {
    this.connector = connector
    this.key = !cryptKey ? this.connector.key : Buffer.from(cryptKey, 'base64')
    this.op = op
  }

  quarter (d: Date) : number {
    const y = d.getUTCFullYear() % 2000
    const q = Math.floor(d.getUTCMonth() / 4)
    return (y * 4) + q
  }

  /* Connexion à la DB */
  async connect () : Promise<void> {}

  /* Déconnexion de la DB */
  async disconnect () : Promise<void> {}
}

/* Interface d'accès générique au Storage */
export abstract class STabstract {
  public credentials: any
  public name: string

  constructor (credentials: any, name: string) {
    this.credentials = credentials
    this.name = name
  }

  encode3 (id1: string, id2: string, id3: string) : string {
    const b = Buffer.from(encode([id1, id2, id3])).toString('base64')
    return b.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  }

  decode3 (b64: string) : any { // [id1, id2, id3]
    const x = Buffer.from(b64, 'base64')
    return decode(x)
  }

  async ping (op: AbstractOperation) : Promise<[number, string]>  { return  [0, '0'] }
  getUrl (op: AbstractOperation, id1: string, id2: string, id3: string): string { return '' }
  putUrl (op: AbstractOperation, id1: string, id2: string, id3: string): string { return '' }
  async getFile (op: AbstractOperation, id1: string, id2: string, id3:string) : Promise<Buffer | null> { return null }
  async putFile (op: AbstractOperation, id1: string, id2: string, id3:string, data: Buffer) : Promise<void> { }
  async delFiles (op: AbstractOperation, id1: string, id2: string, lidf: string[]) : Promise<void> { }
  async delId (op: AbstractOperation, id1: string, id2: string) : Promise<void> { }
  async delOrg (op: AbstractOperation, id1: string) : Promise<void> { }
  async listFiles (op: AbstractOperation, id1: string, id2: string) : Promise<string[]> { return [] }
  async listIds (op: AbstractOperation, id1: string) : Promise<string[]> { return [] }
}
