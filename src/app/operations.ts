import { decode } from '@msgpack/msgpack'

import { Operation } from '../fw/operation'
import { Registry, topCl } from '../fw/registry'
import { $Credential } from '../fw/documents'
import Log from '../fw/log'
import { DocStatus } from '../fw/document'
import { DocDescriptor } from '../fw/docDescriptor'
import { AS2$Auteur } from '../as2/documents'
import { filter } from '../fw/DBabstract'

export function loadingOA () {
  Log.info('app operations loading: ' + Registry.sizeOp())
}

/* Retourne l'id autid d'un auteur d'après son "nom" */
class AutidDeNom extends Operation {
  _nom: string = ''
  override init () {
    super.init()
    this._nom = this.stringValue('nom', true)
  }
  override async phase2 () {
    const autid = await AS2$Auteur.autidDeNom(this, this._nom)
    this.setRes('autid', autid)
  }
}
Registry.registerOp(AutidDeNom)

/* Retourne un Auteur depuis son id */
class AuteurDeId extends Operation {
  _autid: string = ''
  _autPk: string = ''
  src: Object = ''
  override init () {
    super.init()
    this._autid = this.stringValue('autid', false)
    this._autPk = this.stringValue('autPk', false)
    this.src = this._autid ?  { autid: this._autid } :  { pk: this._autPk }
  }
  override async phase2 () {
    this.requireAuth()
    const pk = DocDescriptor.get('AS2$Auteur').pkValue(this.src)
    this.getCredRef('Auteur', pk)
    const aut = await this.cache.getDoc('AS2$Auteur', this.src)
    this.setRes('auteur', aut || null)
  }
}
Registry.registerOp(AuteurDeId)

/* Met à jour le nom et la section d'un auteur */
class MajAuteur extends Operation {
  _autpk: string = ''
  _nomAuteur: string = ''
  _section: string = ''
  override init () {
    super.init()
    this._autpk = this.stringValue('autpk', true)
    this._nomAuteur = this.stringValue('nomAuteur', false)
    this._section = this.stringValue('section', false)
  }
  override async phase2 () {
    this.requireAuth()
    // const pk = DocDescriptor.get('AS2$Auteur').pkValue({ autid: this._autid })
    let c = this.getCredRef('Redaction', '1', true)
    if (!c || c.isSuspended) {
      c = this.getCredRef('Auteur', this._autpk, true, true)
    }
    const aut = await this.cache.getDoc('AS2$Auteur', { pk: this._autpk }) as AS2$Auteur
    if (!aut) { this.setRes('status', 1); return }
    let m = false
    if (this._nomAuteur && this._nomAuteur !== aut.nomAuteur) {
      m = true
      aut.nomAuteur = this._nomAuteur
    }
    if (this._section && this._section !== aut.section) {
      m = true
      aut.section = this._section
    }
    if (m) aut._status = DocStatus.UPD
    this.setRes('maj', { nomAuteur: aut.nomAuteur, section: aut.section })
  }
}
Registry.registerOp(MajAuteur)

class ListeAuteursSection extends Operation {
  _section: string = ''
  override init () {
    super.init()
    this._section = this.stringValue('section', true)
  }
  override async phase2 () {
    this.requireAuth()
    const ml = Math.floor(this.now / 60000)
    const c = this.getCredRef('Redaction', '1')
    const dd = DocDescriptor.get('AS2$Auteur')
    const v = dd.getCollId( { section: this._section }, 'section')
    const vx = v && v.length ? v[0] : ''
    const lst: any[] = []   
    if (this.db && vx) await this.db.selectDocs('AS2$Auteur', 'section', filter.EQ, vx, '', 0, 
      (bin: Uint8Array) => {
        try {
          const a: any = decode(bin)
          const creds: any = {}
          for(const credId in a.embedCreds) {
            const p = a.embedCreds[credId].props
            if (!p.limit || p.limit > ml)
              creds[credId] = p
          }
          lst.push({ 
            nomAuteur: a.nomAuteur, 
            section: a.section,
            autid: a.autid,
            creds
          })
        } catch (e: any) {
          console.log(e.toString())
        }
      })
    this.setRes('lst', lst)
  }
}
Registry.registerOp(ListeAuteursSection)

class UpdateCredentialSusp extends Operation {
  _credId: string = ''
  _docCl: string = ''
  _docPk: string = ''
  // @ts-expect-error
  _props: Object; _reqCred: $Credential

  override init () {
    super.init()
    this._credId = this.stringValue('credId', true)
    this._docCl = this.stringValue('docCl', true)
    this._docPk = this.stringValue('docPk', true)
    // @ts-expect-error
    this._props = this.objectValue('props', true)
    this._reqCred = this.objectValue('reqCred', false) as $Credential
  }
  override async phase2 () {
    this.requireAuth()
    if (!this._reqCred) this.requireAdmin()
    else this.getCredRef(this._reqCred.docCl, this._reqCred.docPk)
    let status = 0
    const doc = await $Credential.update(this, this._credId, this._docCl, this._docPk, this._props)
    if (!doc) status = 2
    this.setRes('status', status)
  }
}
Registry.registerOp(UpdateCredentialSusp)
