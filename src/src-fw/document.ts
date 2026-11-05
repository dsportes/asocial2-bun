import { encode, decode } from '@msgpack/msgpack'

import type { row } from './DBabstract'
import { Registry, ClassInfo, $ADocument } from './registry'
import { $CredTempl } from './documents'

export enum DocStatus { NONE, UPD, NEW, DEL }

export class $Document extends $ADocument {
  // get _classInfo _descriptor _svc _docCl _subCl
  _org: string = ''
  _status?: DocStatus
  _before?: Map<string, string[]> // Map des valeurs des collections AVANT
  _deleted?: boolean

  v: number = 0
  release: number = 0 // numéro de release de la structure de l'objet
  maxLife?: number // EPOCH en MINUTES de fin de vie logique du document
  embedCreds?: any
  
  /* Mute un data en fonction de sa release et d'éventuelles options
  Met à jour, supprime ajoute les propriétés requises dans la
  dernière version en fonction de sa release actuell.
  Retourne couple du data (ancien ou celui muté) 
  et de l'indicateur de mutation (false si inchangé)
  
  static mutate (svc: string, docCl: string, data: any, options?: Object) : [any, boolean] {
    const cl = Registry.getClassInfo(svc, docCl, data).clazz
    const f = (cl as any)['mutateCl']
    return f ? f(data, options) : [data, false]
  }
  */

  // Numéro de release de la structure de la classe
  get classRelease() : number {
    return (this.constructor as any)['release']
  }

  // true si le Document est de la dernière release
  get hasLastRelease () : boolean {
    return this.release === this.classRelease
  }

  // Retourne la VALEUR HASH de pk (séparation par / PUIS hash)
  get myPk () : string { return this._descriptor.pkValue(this)}

  // Retourne la VALEUR NON HACHEE de pk (séparation par /)
  get myPkNH () : string { return this._descriptor.pkValue(this, true)}

  // Retourne true si le document n'est pas _zombi_ et n'a pas dépassé sa maxLife
  isAlive (now: number) : boolean {
    if (this._deleted) return false
    return !this.maxLife || (this.maxLife * 60000 > now)
  }

  get isZombi () : boolean {
    return this._deleted || this._status === DocStatus.DEL
  }

  /* Retourne la VALEUR de la propriété "collection" nommée name:
  C'est un STRING[] des valeurs hachées.
  Quand la propriété de collection N'EST PAS une liste, sa valeur est [0]
  */
  collValue (name: string) : string[] { return this._descriptor.getCollId(this, name)}

  /* Retourne la VALEUR la propriété d'index nommée name:
  Selon le type de cette propriété c'est:
  - string : pour les type STRING HASH
  - number : pour les types INTEGER FLOAT
  - string[] : pour le type LIST
  */
  idxValue (name: string) : any { return this._descriptor.getIdx(this, name)}

  /* Invoqué après lecture de DB, désérialisation du data et création
  du Document associé. Traitement éventuel, pour génération de propriétés
  d'aide / techniques faciltant les consultations / mises à jour applicatives.
  FACULTATIF: compile () { }
  */

  /* Invoqué pour sérialisation un Document à destination de l'application terminale.
  Passe dans le "résultat" de l'opération.
  A défaut de surcharge applicative:
  - transmet org et clazz et 
  - toutes les propriétés du document dont le nom ne commencent pas par _
  */
  serialForApp (clazz: string) : Uint8Array { 
    const d: any = { clazz }
    // @ts-expect-error
    for (const k of Object.keys(this)) if (k.charAt[0] !== '_') d[k] = this[k]
    return encode(d)
  }

  // Surchargé par classe
  async compile () {}

  /* Méthodes INTERNES au FW ***************************************************/

  embedCred (credTemplates: Object) {
    if (!this.embedCreds) this.embedCreds = {}
    if (credTemplates) 
      for(let credId in credTemplates) {
        const c = new $CredTempl((credTemplates as any)[credId])
        if (this._docCl === c.docCl && this.myPk === c.docPk)
          (this.embedCreds as any)[credId] = c.toEmbedCred()
      }
  }

  /* Création de l'instance de "Document" depuis des valeurs initiales de propriétés,
  - row lu de la DB
  - propriétés de création.
  Retourne le Document.
  */
  static newDoc (classInfo: ClassInfo, status: DocStatus, initVals: Object) : $Document {
    const doc = classInfo.newD() as $Document
    doc._status = status
    doc.release = (doc.constructor as any)['release']
    doc.v = 0
    for (const [key, value] of Object.entries(initVals)) 
      if (!key.startsWith('_')) (doc as any)[key] = value
    doc.compile()
    /* _before: Map: traçant les collections
      - clé: nom de la collection
      - valeur: valeur de la propriété clé de la collection dans le document 
        AVANT mise à jour éventuelle de cette valeur
    */
    if (doc._status !== DocStatus.NEW && classInfo.descriptor.colls)
      doc._before = classInfo.descriptor.extractColls(doc)
    return doc
  }

  /* Construit un $Document et son row depuis un row.
    - son _status est DocStatus.NEW
    - le row d'entrée a si nécessaire été muté dans la dernière release
    - le document est compilé
  */
  static async rowToDoc (classInfo: ClassInfo, _row: row)
    : Promise<{ doc: $Document | undefined, row: row }> {
    let row = _row
    let doc: $Document | undefined = undefined
    if (row.data)
      try {
        const m = (classInfo.clazz as any)['mutateCl']
        let data = decode(row.data)
        if (m) data = await m(data)
        doc = await $Document.newDocument(classInfo, data)
        if (doc) {
          if (_row._org) doc._org = _row._org 
          row = doc.toRow()
        }
      } catch (e) { }
    return { doc, row }
  }

  // Construit un document depuis un objet de propriétés
  static async newDocument (classInfo: ClassInfo, data: any) 
  : Promise<$Document | undefined> {
    try {
      const doc = classInfo.newD() as $Document
      doc.release = (doc.constructor as any)['release']
      doc.v = data.v || 0
      for (const [key, value] of Object.entries(data)) 
        if (!key.startsWith('_')) (doc as any)[key] = value
      await doc.compile()
      doc._status !== DocStatus.NEW
      return doc
    } catch (e) {
      return undefined
    }
  }

  /* Construit un "row" pour DB depuis un document - data encodé pas crypté */
  toRow (now?: number) {
    const d: any = {}
    // @ts-expect-error
    for (const k of Object.keys(this)) if (k.charAt(0) !== '_') d[k] = this[k]
    const v = now || d['v']
    d['v'] = v
    const x = encode(d)
    const row: row = { v, pk: this.myPk, data: x }
    const ml = this['maxLife']; if (ml) row.maxLife = ml
    const dt = this._descriptor
    if (dt.colls) for (const [n, c] of dt.colls) 
      (row as any)[n] = c.list ? this.collValue(n) : this.collValue(n)[0]
    if (dt.indexes) for (const [n, ] of dt.indexes) 
      (row as any)[n] = this.idxValue(n)
    return row
  }

  /* Construit un "row minimal" pour DB - data null */
  toZombiRow (now: number) : row {
    return { deleted: true, v: now, pk: this.myPk, data: null }
  }

}
