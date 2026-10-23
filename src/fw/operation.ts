// @ts-ignore
import { encode, decode } from '@msgpack/msgpack'

import type { OperationWC } from './types'
import { MDandSafe } from './mdandsafe'
import config from '../config'
import Log from './log'
import { AppExc, DbConnector, STabstract } from './base'
import { DBabstract, cloneRow } from './DBabstract'
import type { row, srvStatus } from './DBabstract'
import { updType } from './DBabstract'
import { medCl, topCl } from './registry'
import { DocDescriptor } from './docDescriptor'
import { $Document, DocStatus } from './document'
import { $Credential } from './documents'
import type { $Cred, Embed$Cred } from './documents'
import { Publisher } from './publisher'
import { Util } from './util'
import { Crypt } from './crypt'
import { keyFromB64 } from './b64'

// const encoder = new TextEncoder()

type conso = {
  ndr: number, // nombre de documents lus
  ndw: number, // nombre de documents écrits
  vdr: number, // volume de documents lus
  vdw: number, // volume de documents écrits
  nfr: number, // nombre de fichiers lus
  nfw: number, // nombre de fichiers écrits
  vfr: number, // volume de fichiers lus
  vfw: number, // volume de fichiers écrits
}

class CacheItem {
  clazz: string
  pk: string
  // En cache globale: détention sous forme row (data décrypté mais sérialisé)
  row: row
  // En chache d'une opération: détention d'un Document (pas d'un row)
  private doc?: $Document

  constructor (clazz: string, pk: string, row: row) {
    this.clazz = clazz; this.pk = pk
    this.row = row
  }

  get hasDoc () : boolean { return this.doc !== undefined }
  getDoc () : $Document { AppExc.assert(this.doc, 'doc')
    // @ts-expect-error
    return this.doc }
  resetDoc () { delete this.doc }

  get status () : DocStatus {
    return !this.doc ? DocStatus.NONE : (this.doc._status || DocStatus.NONE)
  }

  static key (clazz: string, pk: string) { 
    return clazz + '/' + pk 
  }

  /* Contruit une instance de "Document" depuis le row issu de lecture DB
  Retourne le document compilé
  */
  init () : void {
    const rdata = this.row.data
    AppExc.assert(rdata, 'data')
    // @ts-expect-error
    const d = decode(rdata)
    const [data, b] = $Document.mutate(this.clazz, d)
    this.doc = $Document.newDoc(this.clazz, DocStatus.NONE, data)
    this.doc._org = this.row._org || ''
  }

}

export class Operation implements OperationWC {
  public static factories = new Map<string, Function>()

  static new (opName: string) {
    const f = Operation.factories.get(opName)
    return f ? f() : null
  }

  static register (opName: string, factory: Function) {
    Operation.factories.set(opName, factory)
  }

  opName: string = ''
  result: any
  args: any 
  now: number = 9
  svc: string = ''
  org: string = ''
  site: string = ''

  public acceptBadCredential : boolean = false

  public hasPhase2 = true
  public hasPhase3 = false
  public baseUrl: string = ''
  public today: number = 0
  public msSlow : number = 0

  public dbConnector?: DbConnector
  public storage?: STabstract
  public authRecord?: AuthRecord
  public hbc?: string // heart beat count
  public auths?: Set<string> // Set des codes des autorisations accordées
  public sessionId?: string
  public db?: DBabstract

  public conso?: conso
  public updates?: CacheItem[]
  public hasUpdates: boolean = false
  public impactedSubs?: ImpactedSubs
  public hasTasks: boolean = false

  private _cache: Cache | undefined
  get cache () : Cache { if (!this._cache) this._cache = new Cache(this); return this._cache }

  get SUBSSHORTMAXLIFE() { return Math.floor(this.now / 60000) + (config.SUBSMAXLIFEINMINUTES[0] || 3 * 24 * 60) }
  get SUBSLONGMAXLIFE() { return Math.floor(this.now / 60000) + (config.SUBSMAXLIFEINMINUTES[1] || 1 * 24 * 60) }

  assertKO (src: string, args: string[]) {
    const x = args && args.length ? JSON.stringify(args) : ''
    const msg = `ASSERT : ${src} - ${x} - 105`
    const t = new Date().toISOString()
    Log.error(msg)
    if (args) args.unshift(src)
    return new AppExc(105, 'ASSERT', this, args)
  }

  trace (src: string, id: string, info: string, err: boolean) {
    const msg = `${src} - ${id} - ${info}`
    if (err) Log.error(msg); else Log.info(msg)
    return msg
  }

  init () {
    this.result = { now: this.now, srvBUILD: config.BUILD }
    this.msSlow = 0
    if (config.debugLevel > 1) 
      Log.info(this.opName + ' : ' + new Date(this.now).toISOString())
  }

  async phase2 (args: any) { }
  async phase3 () { }

  /* Fixe LA valeur de la propriété 'prop' du résultat (et la retourne)*/
  setRes(prop: string, val: any) { this.result[prop] = val; return val }

  delRes(prop: string) { delete this.result[prop] }

  /* AJOUTE la valeur en fin de la propriété Array 'prop' du résultat (et la retourne)*/
  addRes(prop: string, val: any) {
    let l = this.result[prop]; if (!l) { l = []; this.result[prop] = l }
    l.push(val)
    return val
  }

  requireAdmin () {
    if (!this.authRecord || !this.authRecord.isAdmin) 
      throw new AppExc(101, 'operation_admin_required', this)
  }

  requireAuth () {
    if (!this.authRecord || !this.authRecord.userId) 
      throw new AppExc(101, 'operation_authentication_required', this, [this.opName])
  }

  requireR () {
    const s = this.authRecord ? this.authRecord.svcOrgStatus : 0
    if (s === 0 || s === 9) 
      throw new AppExc(101, 'operation_svcorg_read_required', this, 
        [this.args.svc || '?', this.args.org || '?', this.opName, '' + s])
  }

  requireRW () {
    const s = this.authRecord ? this.authRecord.svcOrgStatus : 9
    if (s === 0 || s === 2 || s === 9) 
      throw new AppExc(101, 'operation_svcorg_readwrite_required', this, 
        [this.args.svc || '?', this.args.org || '?', this.opName, '' + s])
  }

  /* Retourne le Cred dont la signature a été vérifié
  et relatif à ce rôle et cet id de document.
  Si noex, retourne null plutôt que de sortir en exception si aucun n'a été trouvé.
  */
  getCredRef (docCl: string, docPk: string, noex?: boolean, checkSusp?: boolean) 
  : CredRef | null {
    this.requireAuth()
    return !this.authRecord ? null : this.authRecord.getCredRef(docCl, docPk, noex || false, checkSusp || false)
  }

  async transac (): Promise<void> {
    const authRecord = new AuthRecord(this)
    if (authRecord.userId)
      await authRecord.process()
    
    await this.phase2(this.args)
    this.cache.commit()
  }

  async run () : Promise<void>{
    try {
      if (this.hasPhase2) for (let retry = 0; retry < 3; retry++) {
        if (retry) {
          this.now = Date.now()
          this.today = Math.floor(this.now / 86400000)
        }
        if (this.dbConnector) await this.dbConnector.getConnexion(this, this.org)
        this.msSlow = 0
        this.updates = []
        this.hasTasks = false
        this.cache.reinit()
        this.conso = { ndr: 0, ndw: 0, vdr: 0, vdw: 0, nfr: 0, nfw: 0, vfr: 0, vfw: 0 }
        this.result = { now: this.now, srvBUILD: config.BUILD }
        
        let hbc = null
        let err = null
        if (this.db) {
          const x = await this.db.doTransaction() // Fait un appel à transac
          hbc = x[0]
          err = x[1]
        }

        if (!err) {
          if (hbc) 
            this.setRes('hbc', hbc)
          if (this.updates) this.updates.forEach(ci => {
            Cache.updateCache(this, ci)
            ci.resetDoc
          })
          Cache._purge(this)
          break 
        }

        // st === 1 - DB lock / contention
        if (retry === 2) {
          this.trace ('Op.run.phase2', 'DB lock', err, true)
          throw new AppExc(110, 'DB_lock', this, [this.opName, this.args.svc || '?', this.args.site || '?', err])
        }

        if (this.db) this.db.disconnect()
        await Util.sleep(2000)
      }

      if (this.hasPhase3) {
        if (!this.db && this.dbConnector)
          await this.dbConnector.getConnexion(this, this.org)
        await this.phase3() // peut ajouter des résultats et db HORS transaction
      }

      if (this.impactedSubs && this.impactedSubs.all.size) {
        const publisher = new Publisher(this)
        for(const [,is] of this.impactedSubs.all) await publisher.publish(is)
        // notification : { title body url defs: 'def1 def2 ...' }
        const notification = await publisher.getSessionNotifs()
        if (notification) this.setRes('notification', notification)
        setTimeout(async () => { 
          await publisher.sendNotifications() }, 1)
      }

      this.setRes('conso', this.conso)

      // if (this.hasTasks) Taches.prochTache(this.db, this.storage)
      
      if (this.db) await this.db.disconnect()

      if (this.msSlow) await Util.sleep(this.msSlow)
      
      return this.result
    } catch (e: any) {
      if (this.db) await this.db.disconnect()
      if (config.debugLevel > 1) 
        Log.error(this.opName + ' : ' + new Date(this.now).toISOString() + ' : ' + e.toString())
      throw e
    }
  }

  // Contrôle des types d'arguments
  type (par: string, req: boolean) : [boolean, any, string] { // present, value, type
    if (par === undefined) throw new AppExc(103, 'missing_argument_name', null, [this.opName, this.args.svc || '', '?'])
    const v = this.args[par]
    if (v === undefined) {
      if (req) throw new AppExc(103, 'missing_argument', null, [this.opName, this.args.svc || '', par])
      return [false, null, '']
    }
    return [true, v, typeof v]
  }

  invalid (par: string) { 
    throw new AppExc(103, 'invalid_argument', this, [this.opName, this.args.svc || '', par]) }

  objectValue (par: string, req: boolean) : Object | null {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return null
    if (present && type !== 'object')
      throw new AppExc(103, 'invalid_object_argument', this, [this.opName, this.args.svc || '', par])
    return value
  }

  binValue (par: string, req: boolean) : Uint8Array | null {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return null
    if (present && type !== 'object' && !(value instanceof Uint8Array))
      throw new AppExc(103, 'invalid_bin_argument', this, [this.opName, this.args.svc || '', par])
    return value
  }

  arrayValue (par: string, req: boolean) : Object {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return ''
    if (present && !Array.isArray(value))
      throw new AppExc(103, 'invalid_array_argument', this, [this.opName, this.args.svc || '', par])
    return value
  }

  stringValue (par: string, req: boolean, minlg?: number, maxlg?: number) : string {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return ''
    if (present && type !== 'string'
      || (minlg !== undefined && value.length < minlg) 
      || (maxlg !== undefined && value.length > maxlg)) {
        throw new AppExc(103, 'invalid_string_argument', this, [this.opName, this.args.svc || '', par])
      }
    return value
  }

  stringArrayValue (par: string, req: boolean) : string[] {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return []
    if (present && !Array.isArray(value))
      throw new AppExc(103, 'invalid_string_array_argument', this, [this.opName, this.args.svc || '', par])
    return value
  }

  intValue (par: string, req: boolean, min?: number, max?: number) : number {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return 0
    if (type !== 'number' || !Number.isInteger(value)
      || (min !== undefined && value < min) 
      || (max !== undefined && value > max)) {
        throw new AppExc(103, 'invalid_int_argument', this, [this.opName, this.args.svc || '', par])
      }
    return value
  }

  boolValue (par: string, req: boolean) : boolean {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return false
    if (type !== 'boolean')
      throw new AppExc(103, 'invalid_bool_argument', this, [this.opName, this.args.svc || '', par])
    return value
  }

  orgValue (req: boolean) : string {
    return this.stringValue('org', req, 4, 16)
  }

  // 1: souscription, 2:synchronisation, 3: heart beat 4: op avec notif
  hbcMode () :  number {
    if (this.opName === 'FW$setSubscription') return 1
    if (this.opName === 'FW$Sync') return 2
    if (this.opName === 'FW$HeartBeat') return 3
    return this.impactedSubs && this.impactedSubs.all.size ? 4 : 0
  }
}

export class CredRef {
  isEmbed: boolean
  doc: $Document // Le credential lui-même OU le document maître (isEmbed est true)
  cred: $Cred

  constructor (doc: $Document, ec: Embed$Cred, isEmbed: boolean) {
    this.doc = doc
    this.isEmbed = isEmbed
    this.cred = {
      credId: ec.credId,
      svc: doc._svc,
      org: doc._org,
      docCl: isEmbed ? this.doc._docCl : (this.doc as any)['docCl'],
      docPk: this.doc.myPk,
      props: ec.props,
      pubv: ec.pubv,
      pubc: ec.pubc
    }
  }

  get isValid () {
    const p = this.cred.props
    return p && (!p.limit || (p.limit * 60000) >= Date.now())
  }

  get isSuspended () {
    const n = Date.now()
    const p = this.cred.props
    if (!p || !p.susp) return false
    const d = p.susp[0] * 60000
    const f = p.susp[1] * 60000
    if (d === 0 && f === 0) return true
    if (d === 0) return f >= n
    if (f === 0) return d <= n
    return d <= n && f >= n
  }
  
}

export class AuthRecord {
  // devAppToken: string // token identifiant l'exécution de l'application
  op: Operation
  org: string = ''
  svc: string = ''
  args: any
  userId: string
  sessionId?: string
  time?: number
  userSign?: Uint8Array
  signatures?: any
  challenge?: Uint8Array
  isAdmin?: boolean
  svcOrgStatus: number = 0
  // pemC: string // clé publique de cryptage du userId
  // pemV: string // clé publique de vérification du userId

  /* Clé: ref : docCl/docId - Cred dont la signature est ok*/
  creds: Map<string, CredRef> = new Map()
  /* ref SANS Credential OU dont la signature est KO */
  koCreds: Set<string> = new Set()

  constructor (op: Operation) {
    this.op = op
    this.op.authRecord = this
    const ar = op.args['authRecord']
    if (ar && ar.userId) {
      this.userId = ar.userId
      this.op.sessionId = ar.sessionId
      this.sessionId = ar.sessionId
      this.time = ar.time
      this.userSign = ar.userSign
      this.signatures = ar.signatures
      this.challenge = Buffer.from(this.userId + '/' + this.time)
      this.isAdmin = config.ADMINUSERS.has(this.userId)
    } else {
      this.userId = ''
      this.isAdmin = false
    }
  }

  async getSvcOrgStatus () : Promise<number> {
    let ci = await Cache.getRow(this.op, 'ADMIN$Status', { svc: this.op.args.svc}, config.STATUSLAZYNESS)
    if (!ci) return 0
    ci.init()

    let doc = ci.getDoc() as $Document
    type ObjectKey = keyof typeof doc
    const s = doc['st' as ObjectKey]
    if (s === 9) return 9

    ci = await Cache.getRow(this.op, this.op.args.svc + '$Status', { pk: '1' }, config.STATUSLAZYNESS)
    if (!ci) return 0
    ci.init()
    doc = ci.getDoc() as $Document
    return doc['st' as ObjectKey] || 0 
  }

  getCredRef (docCl: string, docPk: string, noex?: boolean, checkSusp?: boolean) : CredRef | null {
    const cr = this.creds ? this.creds.get(docCl + '/' + docPk) : null
    if (!cr) {
      if (noex) return null
      throw new AppExc(103, 'missing_credential', this.op, 
        [this.op.opName, this.op.args.svc || '?', this.op.args.org || '?', docCl, docPk])
    }
    if (!checkSusp) return cr
    if (!cr.isSuspended) return cr
    const su = cr.cred.props.susp
    const s = su[0] ? new Date(su[0] * 60000).toISOString() : '2000-01-01 00:00:00'
    const e = su[1] ? new Date(su[1] * 60000).toISOString() : '2099-31-12 23:59:59'
    throw new AppExc(103, 'suspended_credential', this.op, 
      [this.op.opName, this.op.args.svc || '?', this.op.args.org || '?', docCl, docPk, s, e])
  }

  async process () : Promise<void> {
    if (!this.signatures) return
    const cvs = await MDandSafe.getCVS(this.op, this.userId)
    if (!cvs) throw new AppExc(101, 'operation_no_user_keys_cv', this.op, [this.op.opName, this.userId])
    const v = cvs[1]
    const ok = this.userSign && this.challenge ? await Crypt.verify(keyFromB64(v), this.userSign, this.challenge) : false
    if (!ok) throw new AppExc(101, 'operation_bad_signature', this.op, [this.op.opName, this.userId])
    
    for (const ref in this.signatures) {
      const [credId, sign] = this.signatures[ref]
      const i = ref.indexOf('/')
      const docCl = i === -1 ? ref : ref.substring(0, i)
      const docPk = i === -1 ? '' : ref.substring(i + 1)
      const dt = DocDescriptor.get(topCl(this.op.svc, docCl))
      let credRef: CredRef | undefined
      if (dt.embedCreds) { // Recherche du Credential dans le creds du document
        const d = !this.op.cache ? null : await this.op.cache.getDoc(this.op.svc + '$' + docCl, { pk: docPk }) as $Document
        if (d && d.embedCreds) {
          const ec = (d.embedCreds as any)[credId]
          if (ec) credRef = new CredRef(d, ec, true)
        }
      } else { // Recherche du Credential par sa pk
        const c = !this.op.cache ? null : await this.op.cache.getDoc(this.op.svc + '$Credential', { credId, docCl }) as $Credential
        if (c && c.docCl === docCl && c.docPk === docPk) {
          if (c.cred) {
            credRef = new CredRef(c, c.cred, false)
            if (!credRef.isValid && this.op.cache)
              this.op.cache.delDoc(this.svc + '$Credential', c.myPk)
          }
        }
      }
      const ok = !credRef || !credRef.isValid || !credRef.cred.pubv || !this.challenge ? false 
        : await Crypt.verify(Buffer.from(credRef.cred.pubv), sign, this.challenge)
      if (ok && this.creds && credRef) this.creds.set(ref, credRef) 
      else this.koCreds.add(ref)
      this.svcOrgStatus = await this.getSvcOrgStatus()
    }

    if (config.debugLevel > 1) {
      const dbg = []
      if (!this.userId) dbg.push('NONE')
      else if (this.isAdmin) dbg.push('ADMIN')
      for (const [ref, r] of this.creds)
        dbg.push('Status:[' + (this.koCreds.has(ref) ? 'KO' : 'OK') + '] - [' + ref + ']')
      Log.debug('Auth status: ' + dbg.join('\n'))
    }
      
    if (this.koCreds.size && !this.op.acceptBadCredential) 
      throw new AppExc(101, 'operation_bad_credentials', this.op,
        [this.op.opName, this.userId, Array.from(this.koCreds).join('\n')])
  }
}

type cacheItem = {
  lru: number // last recent use
  time: number // time lecture
  row: row
}

/* 
Chaque opération dispose d'un cache des instances de "Document":
- soit qu'elle veut verrouiller pour mise à jour ou des truction,
- soit qu'elle a créé et qui sera inséré dans la base.
En fin de phase 2, un "commit" de ce cache est lancé afin de mettre
à jour la base de données par les documents créés / mis à jour / supprimés

Le cache est peuplé:
- depuis lecture de la base : oneRow
- depuis un "Document" nouveau : addDoc
- depuis un "dataSer" récupéré d'une liste de sélection
  et compilé en "Document" : addDataSer
Ces méthodes retourn en "Document":
- soit celui qui était déjà en cache (get...),
- soit celui ajouté (add...)

Un cache "global" de "dataSer" réduit le nombre d'accès en base
quand la document y figure (sa version est néanmoins vérifiée par accès à l'index).
*/
export class Cache {

  // Cache locale à l'opération
  op: Operation
  conso?: number[]
  docs: Map<string, CacheItem>

  get db () : DBabstract { 
    AppExc.assert(this.op.db, 'db')
    // @ts-expect-error
    return this.op.db }

  static MAX_CACHE_SIZE = 1000
  static LAZY_MS = 5000

  // Cache globale
  static globCache: Map<string, Map<string, cacheItem>> = new Map()
  static srvStatus: srvStatus | null = null

  static orgCache(op: Operation) : Map<string, cacheItem> {
    const org = op.org || (op.opName.startsWith('ADMIN') ? 'ADMIN$' :'')
    let oc = Cache.globCache.get(org)
    if (!oc) {
      oc = new Map<string, cacheItem>()
      Cache.globCache.set(org, oc)
    }
    return oc
  }

  /* Retourne le row  déjà en cache ou va le chercher en base et l'inscrit en cache.
  Si le row actuellement en cache est le plus récent on a évité une lecture effective
   (ça s'est limité à un filtre sur index).
  Si le row n'était pas en cache ou que la version lue est plus récente : IL Y EST MIS:
  Certes la transaction peut échouer, mais au pire on a lu une version plus récente.
  - lazy: nombre de SECONDES d'ancienneté accepté pour une lecture non bloquante
  */
  static async getRow(op: Operation, clazz: string, src: Object, lazy?: number)
    : Promise<CacheItem | undefined> {
    if (!op.db) return undefined
    const topClazz = topCl(op.svc, clazz)
    const oc = Cache.orgCache(op)
    const now = Date.now()
    const pk = DocDescriptor.get(topClazz).pkValue(src)
    const k = CacheItem.key(clazz, pk)
    let item = oc.get(k)
    if (item && lazy && ((now - item.time) < (lazy * Cache.LAZY_MS))) {
      item.lru = now
      return new CacheItem(topClazz, pk, cloneRow(item.row))
    }

    if (item) { // trouvé en cache, lecture pour recherche d'un éventuel plus récent
      item.lru = now
      const row = await op.db.oneRow(topClazz, pk, item.row.v)
      if (row && row.v > item.row.v) { // celui lu est plus récent
        item.row = row
        if (row.deleted) return undefined
      }
      return new CacheItem(topClazz, pk, cloneRow(item.row))
    }

    // Pas trouvé en cache - recherche en base
    // @ts-expect-error
    const row = await op.db.oneRow(topClazz, pk, item ? item.row.v : 0)
    if (!row) return undefined // Pas trouvé en base
    // trouvé en base, mis en cache
    item = { lru: now, time: now, row } 
    oc.set(k, item)
    return row.deleted ? undefined : new CacheItem(topClazz, pk, cloneRow(row))
  }

  static updateCache (op: Operation, ci: CacheItem) {
    const oc = Cache.orgCache(op)
    const k = CacheItem.key(ci.clazz, ci.pk)
    let item = oc.get(k)
    if (ci.status === DocStatus.DEL) { // suppression
      if (item) {
        item.lru = op.now
        item.row.deleted = true
        item.row.data = encode({ deleted: true, v: op.now, _pk: item.row.pk, _clazz: ci.clazz })
      }
    } else {
      if (item) { // remplacement éventuel
        if (ci.row.v > item.row.v) {
          item.row = ci.row
          item.lru = op.now
          item.time = op.now
        }
      } else { // insertion d'un nouveau
        item = { lru: op.now, time: op.now, row: ci.row }
      }
    }
    if (item) oc.set(k, item)
  }

  static _purge (op: Operation) {
    const oc = Cache.orgCache(op)
    if (oc.size > Cache.MAX_CACHE_SIZE) {
      const t: any[] = []
      oc.forEach((value, key) => { t.push({ lru: value.lru, k: key }) } )
      t.sort((a, b) => { return a.lru < b.lru ? -1 : (a.lru > b.lru ? 1 : 0) })
      for (let i = 0; i < Cache.MAX_CACHE_SIZE / 2; i++) {
        const k = t[i].k
        oc.delete(k)
      }
    }
  }

  constructor (operation: Operation) {
    this.op = operation
    this.docs = new Map<string, CacheItem>()
  }

  reinit () {
    this.docs.clear()
  }

  /* Retourne ou lit de la base le Document cité par src:
  - src : objet contenant les propriétés de la pk
  */
  async getDoc (clazz: string, src?: any, assert?: string) : Promise<$Document | undefined> {
    const topClazz = topCl(this.op.svc, clazz)
    const dx = DocDescriptor.get(topClazz)
    const pk = dx.pkValue(src)
    const k = CacheItem.key(clazz, pk)
    let ci = this.docs.get(k)
    if (ci && ci.hasDoc) return ci.getDoc()
    ci = await Cache.getRow(this.op, clazz, src)
    if (!ci) {
      if (assert) this.op.assertKO(assert, [clazz, dx.pkValue(src, false)])
      return undefined
    }
    ci.init()
    this.docs.set(k, ci)
    return ci.getDoc()
  }

  /* Met en cache un row issu de la lecture en mode "report" de la DB.
  Si le document était déjà présent et plus récent, il est CONSERVE.
  Retourne le document.
  */
  putRow (clazz: string, row: row) : $Document | null {
    const k = CacheItem.key(clazz, row.pk)
    let ci = this.docs.get(k)
    if (ci && ci.hasDoc) return ci.getDoc()
    ci = new CacheItem(clazz, row.pk, row)
    ci.init()
    this.docs.set(k, ci)
    // @ts-expect-error
    return ci.doc
  }

  /* Met en cache un NOUVEAU document (création) depuis un objet source.
  Toutefois SI le document était déjà présent et plus récent, il est CONSERVE.
  Retourne le document.
  */
  newDoc (clazz: string, src?: Object) : $Document {
    const topClazz = topCl(this.op.svc, clazz)
    const pk = DocDescriptor.get(topClazz).pkValue(src)
    const k = CacheItem.key(clazz, pk)
    let ci = this.docs.get(k)
    if (ci) return ci.getDoc()
    const dx = $Document.newDoc(clazz, DocStatus.NEW, src || {}) 
    AppExc.assert(dx, 'dx')
    dx._org = this.op.org
    // @ts-expect-error
    ci = new CacheItem(clazz, pk, dx)
    this.docs.set(k, ci)
    return dx
  }

  /* Marque le document identifié par sa pk 
  IL DOIT avoir été lu auparavent !
  - si c'est un document synchronisable, le mettra à jour en "zombi"
  - sinon l'inscrit pour suppression effective.
  - si le document a status NEW, il est retiré (ne sera pas créé).
  - sinon son status est à DEL.
  */
  delDoc (clazz: string, pk: string) {
    const k = CacheItem.key(clazz, pk)
    let ci = this.docs.get(k)
    if (ci) {
      if (ci.status === DocStatus.NEW) this.docs.delete(k)
      else ci.getDoc()._status = DocStatus.DEL
    }
  }

  /* Prépare les écritures en base depuis la liste des documents ayant changé
  - constitue la liste op.updates pour notification aux sessions abonnées.
  */
  commit () {
    AppExc.assert(this.db, 'db')
    // @ts-expect-error
    const db: DBabstract = this.op.db
    this.op.impactedSubs = new ImpactedSubs()
    this.op.updates = []
    for (const [k, ci] of this.docs) {
      if (ci.status === DocStatus.NONE) continue
      const doc = ci.getDoc()
      ci.row = doc._status === DocStatus.UPD || doc._status === DocStatus.NEW ?
        doc.toRow(this.op.now) : doc.toZombiRow(this.op.now)
      this.op.updates.push(ci)
      if (doc._status === DocStatus.UPD)
        db.writeRow(updType.UPDATE, ci.clazz, ci.row)
      else if (doc._status === DocStatus.NEW)
        db.writeRow(updType.CREATE, ci.clazz, ci.row)
      else { // DocStatus.DEL
        if (doc._docDescriptor.sync) db.writeRow(updType.UPDATE, ci.clazz, ci.row)
        else db.deleteRow(ci.clazz, ci.pk)
      }
      if (doc._docDescriptor.sync && doc._docDescriptor.colls) {
        const is = this.op.impactedSubs.getEntry(ci.clazz, ci.pk)
        if (ci.row) this.manageColls(db, ci.clazz, doc, ci.row, is)
      }
    }
    this.op.hasUpdates = this.op.updates.length !== 0
  }

  /* Traitement des collections créées / modifiées / supprimées:
    - inscription dans impactedSubs
    - création des rowQ : trace des disparitions des collections "mutables"
  */
  manageColls (db: DBabstract, clazz: string, doc: $Document, row: row, is: ImpactedSub) {

    for (const [n, collection] of doc._docDescriptor.colls) {
    
      // b, a : valeurs de la propriété clé de la collection n AVANT / APRES mise à jour éventuelle

      // Si null, la propriété n'avait pas de valeur AVANT
      const b = doc._before ? doc._before.get(n) : null
      if (b) is.setColl(n, b)

      // Si null, la propriété n'a pas de valeur APRES
      const a = doc._status !== DocStatus.DEL ? doc.collValue(n) : null
      if (a) is.setColl(n, a)
      
      if (!collection.mutable) continue
      if (doc._status === DocStatus.NEW) continue

      // Inscription dans les rowQ : seulement pour les mutables ayant changé (pouvant avoir quitté)
      // Ceux qui n'étaient pas AVANT n'ont pas à être inscrit en rowQ
      if (!b) continue

      if (doc._status === DocStatus.DEL) { 
        // le ou les termes "before" quittent le ou les (list) documents
        if (collection.list) for (const x of b) db.writeRowQ(clazz, n, row.pk, row.v, x)
        else db.writeRowQ(clazz, n, row.pk, row.v, b[0] || '')
        continue
      }

      // Il y avait une valeur AVANT (b existe): diffère-t-elle de celle APRES ?
      // Tous les termes "before" qui y étaient AVANT 
      // et ne le sont plus MAINTENANT quittent le document
      if (collection.list) {
        const as = a ? new Set(a) : new Set()
        for (const x of b) 
          if (!as.has(x)) db.writeRowQ(clazz, n, row.pk, row.v, x)
      } else if (a && (a[0] !== b[0])) 
        db.writeRowQ(clazz, n, row.pk, row.v, b[0] || '')
    }
  }
} 

/* Contient la liste des documents créés / mis à jour / supprimés d'une opération
afin que le publisher recherche les souscriptions correspondantes à notifier.
Voir manageColls() ci-dessus.
Map : 
- key: clazz/pk - identifiant du document impacté
- value: ImpactedSub { clazz, pk, colls }
  - colls:  Map de ses collections impactées (s'il en a)
    - key: nom collection (colName) 
    - value: colValues 
*/
export class ImpactedSubs {
  all : Map<string, ImpactedSub>

  constructor () {
    this.all = new Map()
  }

  getEntry (clazz: string, pk: string) : ImpactedSub {
    const k = CacheItem.key(clazz, pk)
    let is = this.all.get(k)
    if (!is) {
      is = new ImpactedSub(clazz, pk)
      this.all.set(k, is)
    }
    return is
  }
}

export class ImpactedSub {

  clazz: string // du document
  pk: string // du document 
  colls: Map<string, Set<string>> 
  /* key: nom de la collection (colName)
    value: colValues - set des valeurs impactées (ajoutées et retirées)
  */

  constructor (clazz: string, pk: string) {
    this.clazz = medCl(clazz)
    this.pk = pk
    this.colls = new Map()
  }

  setColl (name: string, vals: string[]) {
    let c = this.colls.get(name)
    if (!c) {
      c = new Set()
      this.colls.set(name, c)
    }
    for (const s of vals) c.add(s)
  }
}

/*
import { initializeApp } from 'firebase-admin/app'
const app = initializeApp()
var admin = require("firebase-admin");

import admin from 'firebase-admin'
import { getMessaging } from 'firebase/messaging'

const serviceAccount = config.keys['adminSDK-service-account']
// var serviceAccount = require("path/to/serviceAccountKey.json");

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})
const messaging = getMessaging(app)
*/