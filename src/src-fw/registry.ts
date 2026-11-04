import { AppExc, $ADocument } from './base'
import { Descriptor } from './descriptor'
import { DocDescriptor } from './docDescriptor'

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

  constructor (svc: string, docCl: string, subCl: string, descriptor: Descriptor, 
    clazz: Function | FakeDoc) {
    this.svc = svc; this.docCl = docCl; this.subCl = subCl; this.descriptor = descriptor; 
    this.clazz = clazz
  }

  newD () : $ADocument {
    if (this.descriptor.virtual)
      throw new AppExc(3, 'document_not_instantiable', 'Registry.getClassInfo(5)', [this.fullName])
    const f = this.clazz
    // @ts-expect-error
    return new f() as $ADocument
  }

  pkValue (src?: any, nohash?: boolean) : string{ return this.pkValue(src, nohash)}

  get fullName () { return this.svc + '/' + this.docCl + (this.subCl ? ('/' + this.subCl) : '')}

}

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

  static classes : Map<string, Function> = new Map()

  static managersOfSvc (svc: string) : Set<string> {
    const s: Set<string> = new Set()
    for(const x of Registry.managers) {
      const i = x.indexOf('_')
      if (x.substring(0, i) === svc + '$Credential') s.add(x.substring(i + 1))
    }
    return s
  }

  static allClasses () : string[] { return Array.from(Registry.classes.keys()) }

  static regOp = new Map()
  static sizeOp () { return Registry.regOp.size }

  static register (clazz: Function) { 
    const topcl = topCl('', clazz.name)
    // const subCl = i === -1 ? '' : clazz.name.substring(i + 1)
    const i = clazz.name.indexOf('$')
    const svc = topcl.substring(0, i)
    const docCl = topcl.substring(i + 1)
    if (!svc || !docCl)
      throw new AppExc(103, 'invalid_class_name', null, [clazz.name])
    if (!(clazz as any)['_unregistered'])
      (clazz as any)['_docDescriptor'] = DocDescriptor.get(topcl)
    if ((clazz as any)['manager']) 
      Registry.managers.add(clazz.name)
    this.classes.set(clazz.name, clazz)
  }

  // Retourne le constructor de la SOUS-CLASSE de docCl selon la valeur de son data
  static getClass (svc: string, docCl: string, data?: any, nohash?: boolean ) : Function {
    const topcl = topCl(svc, docCl)
    let cln = topcl
    if (data) {
      const subClassBy = DocDescriptor.get(topcl).subClassBy
      cln += (subClassBy ? '_' + data[subClassBy] : '')
    }
    const cl = Registry.classes.get(cln)
    if (!cl) {
      const trace = new Error("Captured for inspection")
      throw new AppExc(103, 'not_configured_doc_class', Registry.getClass, [cln], trace.stack)
    }
    return cl
  }

  // Construit un document de la SOUS-CLASSE de docCl selon la valeur de son data
  static newD (svc: string, docCl: string, data?: Object ) : $ADocument {
    const cl = Registry.getClass(svc, docCl, data)
    // @ts-expect-error
    const d = new cl() as $ADocument
    return d
  }

  static registerOp (cl: Function) { 
    Registry.regOp.set(cl.name, cl)
  }
  
  static newOp (name: string) {
    const cl = Registry.regOp.get(name)
    return cl ? new cl() : null
  }
}
