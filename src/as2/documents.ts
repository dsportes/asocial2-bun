import d from './descriptors'
import { decode } from '@msgpack/msgpack'
import { $Document } from '../src-fw/document'
import { $Form, ADMIN$Status, $Credential, $Subs, $CredChecker } from '../src-fw/documents'
import Log from '../src-fw/log'
import { Registry } from '../src-fw/registry'
import { AppExc } from '../src-fw/base'
import { Operation } from '../src-fw/operation'
import { filter } from '../src-fw/DBabstract'
import { FormType } from '../src-fw/descriptor'

let nd = 0, nf = 0, exc: AppExc | undefined

if (!exc) { nf++; exc = FormType.register('AS2', 'membrecodir', 'AS2_ad', 'k1', ['A']) }
if (!exc) { nf++; exc = FormType.register('AS2', 'membreredaction', 'AS2_ad', 'k1', ['A']) }
if (!exc) { nf++; exc = FormType.register('AS2', 'auteur', 'AS2_auteurs', 'k2', ['Redaction/1']) }
// Un Auteur peut aussi nommer un co-auteur
if (!exc) { nf++; exc = FormType.register('AS2', 'coauteur', 'AS2_auteurs', 'k2', ['Redaction/1', 'Auteur/$1']) }

class AS2$Status extends ADMIN$Status { 
}
if (!exc) { nd++; exc = Registry.register(AS2$Status, d.AS2$Status) }

class AS2$Subs extends $Subs { 
}
if (!exc) { nd++; exc = Registry.register(AS2$Subs, d.AS2$Subs) }

class AS2$CredChecker extends $CredChecker {
}
if (!exc) { nd++; Registry.register(AS2$CredChecker, d.AS2$CredChecker) }

class AS2$Form extends $Form {
}
if (!exc) { nd++; exc = Registry.register(AS2$Form, d.AS2$Form) }

class AS2$Form_membrecodir extends AS2$Form {
  override getDetail () { return [] }
}
if (!exc) { nd++; exc = Registry.registerSubClass(AS2$Form_membrecodir, AS2$Form, 'membrecodir') }

class AS2$Form_membreredaction extends AS2$Form {
  override getDetail () { return [] }
}
if (!exc) { nd++; exc = Registry.registerSubClass(AS2$Form_membreredaction, AS2$Form, 'membreredaction') }

class AS2$Form_auteur extends AS2$Form {
  override getDetail () { return [] }

  override async validate (op: Operation, newDocs: $Document[]) : Promise<number> { 
    const autid = await AS2$Auteur.autidDeNom(op, this.opts.auteur.nomAuteur)
    if (autid) return  101
    const doc = await op.cache.putDoc('Auteur', this.opts.auteur, true ) as AS2$Auteur | undefined
    if (doc) {
      doc.embedCred(this.opts.credTemplates)
      newDocs.push(doc)
    }
    return 0 
  }
}
if (!exc) { nd++; exc = Registry.registerSubClass(AS2$Form_auteur, AS2$Form, 'auteur') }

class AS2$Form_coauteur extends AS2$Form {
  override getDetail () { return [] }

  override async validate (op: Operation, newDocs: $Document[]) : Promise<number> { 
    const autid = await AS2$Auteur.autidDeNom(op, this.opts.auteur.nomAuteur)
    if (autid !== this.opts.auteur.autid) return  102
    const doc = await op.cache.getDoc('AS2$Auteur', { autid } ) as AS2$Auteur | undefined
    if (doc) {
      doc.embedCred(this.opts.credTemplates)
      newDocs.push(doc)
    }
    return 0 
  }
}
if (!exc) { nd++; exc = Registry.registerSubClass(AS2$Form_coauteur, AS2$Form, 'coauteur') }

class AS2$Credential extends $Credential {
}
if (!exc) { nd++; exc = Registry.register(AS2$Credential, d.AS2$Credential) }

class AS2$Credential_CoDir extends AS2$Credential { }
if (!exc) { nd++; exc = Registry.registerSubClass(AS2$Credential_CoDir, AS2$Credential, 'CoDir') }

class AS2$Credential_Redaction extends AS2$Credential { }
if (!exc) { nd++; exc = Registry.registerSubClass(AS2$Credential_Redaction, AS2$Credential, 'Redaction') }

class AS2$Credential_Auteur extends AS2$Credential { }
if (!exc) { nd++; exc = Registry.registerSubClass(AS2$Credential_Auteur, AS2$Credential, 'Auteur') }

export class AS2$CoDir extends $Document {
}
if (!exc) { nd++; exc = Registry.register(AS2$CoDir, d.AS2$Codir) }

export class AS2$Redaction extends $Document {
}
if (!exc) { nd++; exc = Registry.register(AS2$Redaction, d.AS2$Redaction) }

export class AS2$Auteur extends $Document {

  static release = 0
  static userCredProps = new Set(['trig'])

  nomAuteur: string = ''
  section: string = ''

  static override async mutate (data: any) : Promise<any> {
    return undefined // return newData
  }

  override async compile () { }

  // Liste les credentials attribuable par un administrateur seulement
  static async autidDeNom (op: Operation, nom: string) : Promise<string> {
    const org = op.org
    let autid = ''
    if (nom.length && op.db) await op.db.selectDocs('AS2$Auteur', 'nom', filter.EQ, nom, '', 1, 
      (bin: Uint8Array) => {
        try {
          const c: any = decode(bin)
          autid = c.autid
        } catch(e: any) {
          Log.error(e.toString())
        }    
      }) 
    return autid
  }
}
if (!exc) { nd++; exc = Registry.register(AS2$Auteur, d.AS2$Auteur) }

export const AS2report = () : AppExc | undefined => {
  if (!exc)
    console.log(`AS2loading: ${nd} documents, ${nf} forms`)
  else {
    console.log(`AS2loading FAILED: ${exc.toString()}`)
    return exc
  }
}