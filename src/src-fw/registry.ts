import { AppExc } from './base'
import { Descriptor } from './descriptor'
import config from '../config'

interface Described {
  get _descriptor () : Descriptor 
}

class FakeDoc implements Described {
  descriptor : Descriptor
  get _descriptor () : Descriptor { return this.descriptor }
  constructor (d: Descriptor) {
    this.descriptor = d
  }
}

export class ClassInfo {
  readonly svc: string
  readonly docCl: string
  readonly subCl: string
  readonly descriptor: Descriptor
  readonly clazz: Function | FakeDoc 

  get fullName () { return this.svc + '/' + this.docCl + (this.subCl ? ('/' + this.subCl) : '')}
  get dbName () { return this.svc + '$' + this.docCl + (this.subCl ? ('@' + this.subCl) : '')}

  constructor (svc: string, docCl: string, subCl: string, descriptor: Descriptor, 
    clazz: Function | FakeDoc) {
    this.svc = svc; this.docCl = docCl; this.subCl = subCl; this.descriptor = descriptor; 
    this.clazz = clazz
  }

  newD () : $ADocument {
    if (this.descriptor.virtual)
      throw new AppExc(3, 'document_not_instantiable', 'Registry.getClassInfo(5)', [this.fullName])
    const f = this.clazz as any
    if (!f._classInfo) f._classInfo = this
    return new f() as $ADocument
  }

  pkValue (src: any, nohash?: boolean) { 
    return this.descriptor.pkValue(src, nohash)  }

  /* Mute un data en fonction de sa release et d'éventuelles options
  Met à jour, supprime ajoute les propriétés requises dans la
  dernière version en fonction de sa release actuell.
  Retourne couple du data (ancien ou celui muté) 
  et de l'indicateur de mutation (false si inchangé)
  */
  mutate (data: any, options?: Object) : [any, boolean] {
    const f = (this.clazz as any)['mutateCl']
    return f ? f(data, options) : [data, false]
  }

  cacheKey (pk: string) : string { return this.svc + '/' + this.docCl + '/' + pk }
}

export class $ADocument {
  get _classInfo () : ClassInfo { return (this.constructor as any)._classInfo }
  get _descriptor () : Descriptor { return (this.constructor as any)._descriptor }
  get _svc () : string { return this._classInfo.svc }
  get _docCl () : string { return this._classInfo.docCl }
  get _subCl () : string { return this._classInfo.subCl }
}
/*
export const subCl = (clazz: string) => {
  const i = clazz.indexOf('_')
  return i === -1 ? '' : clazz.substring(i + 1)
}

export const medCl = (clazz: string) => {
  let i = clazz.indexOf('_')
  const d = i === -1 ? clazz : clazz.substring(0, i)
  i = d.indexOf('$')
  return i === -1 ? d : d.substring(i + 1)
}

export const topCl = (svc: string, docCl: string) : string => {
  const i = docCl.indexOf('_')
  const d = i === -1 ? docCl : docCl.substring(0, i)
  return d.indexOf('$') === -1 ? svc + '$' + d : d
}

export const svcCl = (clazz: string) => {
  const i = clazz.indexOf('$')
  return i === -1 ? '' : clazz.substring(0, i)
}
*/

export class Registry {
  // Map des classes enregistrées par svc / docCl / subCl
  static constructors: Map<string, Function | FakeDoc> = new Map()

  // Set des classes s'étant déclarées "manager"
  static managers : Set<Function> = new Set()

  static registerEnum (descriptor: Descriptor) {
    const fd = new FakeDoc(descriptor)
    const fullName = descriptor.svc + '/' + descriptor.docCl
    Registry.constructors.set(fullName, fd)
  }

  static register (clazz: Function) : AppExc | undefined {
    let exc: AppExc | undefined
    const _descriptor : Descriptor = (clazz as any)['_descriptor'] as Descriptor
    if (!_descriptor)
      exc = new AppExc(3, 'class_without_descriptor', 'Register', [clazz.name])
    if (!exc && _descriptor.exc) exc = _descriptor.exc
    if (!exc) {
      Registry.constructors.set(_descriptor.fullName, clazz)
      if ((clazz as any)['_manager'])
        Registry.managers.add(clazz)
    }
    return exc
  }

  static registerSubClass (clazz: Function, parentClazz: Function, subCl: string) : AppExc | undefined {
    let exc: AppExc | undefined
    const _descriptor : Descriptor = (parentClazz as any)['_descriptor'] as Descriptor
    if (!_descriptor)
      exc = new AppExc(3, 'subclass_without_parent_descriptor', 'RegisterSubClass', [clazz.name])
    if (!exc) {
      const fullName = _descriptor.fullName + '/' + subCl
      if (!Descriptor.isSubName(subCl))
        exc = new AppExc(3, 'subclass_name_syntax', 'RegisterSubClass', [fullName])
      if (!exc) {
        clazz.prototype._parentClazz = parentClazz
        clazz.prototype._subCl = subCl
        Registry.constructors.set(fullName, clazz)
        if ((clazz as any)['_manager']) {
          (clazz as any)['_manager'] = subCl
          Registry.managers.add(clazz)
        }
      }
    }
    return exc
  }

  /* Retourne le ClassInfo,
  - de la classe svc / docCl
  - OU de la SOUS-CLASSE de svc / docCl selon la valeur de la propriété
    de data qui donne le nom de la sous-classe
  */
  static getClassInfo (svc: string, docCl: string, data?: any ) : ClassInfo {
    let clazz = Registry.constructors.get(svc + '/' + docCl)
    if (!clazz)
      throw new AppExc(3, 'class_not_found', 'Registry.getClassInfo(1)', [svc + '/' + docCl])
    const descriptor = (clazz as any)['_descriptor']
    if (!descriptor)
      throw new AppExc(3, 'unregistered_class', 'Registry.getClassInfo(2)', [svc + '/' + docCl])
    let subCl = ''
    if (descriptor.subClassBy) {
      subCl = data ? data[descriptor.subClassBy] : ''
      if (!subCl)
        throw new AppExc(3, 'subclass_property_value_not_found_in_data', 'Registry.getClassInfo(4)',
          [svc + '/' + docCl + ' -- ' + descriptor.subClassBy])
      clazz = Registry.constructors.get(svc + '/' + docCl + '/' + subCl)
      if (!clazz)
        throw new AppExc(3, 'subclass_not_found', 'Registry.getClassInfo(4)', [svc + '/' + docCl + '/' + subCl])
    }
    return new ClassInfo(svc, docCl, subCl, descriptor, clazz)
  }

  // Construit un document de la SOUS-CLASSE de docCl selon la valeur de son data
  static newD (svc: string, docCl: string, data?: Object ) : $ADocument {
    const ci = Registry.getClassInfo(svc, docCl, data)
    return ci.newD() as $ADocument
  }

  static isManager (svc: string, docCl: string) {
    const x = config.SERVICES.get(svc)
    return x !== undefined && (x.indexOf(docCl) !== -1)
  }

  static regOp: Map<string, Function> = new Map()
  static sizeOp () { return Registry.regOp.size }

  static registerOp (cl: Function) { 
    Registry.regOp.set(cl.name, cl)
  }
  
  static newOp (name: string) {
    const cl = Registry.regOp.get(name)
    // @ts-expect-error
    return cl ? new cl() : null
  }
}
