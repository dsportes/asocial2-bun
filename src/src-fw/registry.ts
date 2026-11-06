import { AppExc } from './base'
import { Descriptor } from './descriptor'
import config from '../config'

export class Registry {
  // Map des classes enregistrées par svc / docCl
  private static constructors: Map<string, Function> = new Map()

  private static descriptorsByDbName: Map<string, Descriptor> = new Map()

  static get allClasses () : string[] {
    return Array.from(this.constructors.keys())
  }

  static getDescriptorByDbName (dbName: string) : Descriptor | undefined {
    return this.descriptorsByDbName.get(dbName)
  }

  static allDescriptors () : Descriptor[] {
    const lst: Descriptor[] = []
    for(const [, cl] of this.constructors)
      lst.push((cl as any).descriptor)
    return lst
  }

  static register (clazz: Function, descriptor: Descriptor) : AppExc | undefined {
    if (descriptor.exc) return descriptor.exc
    this.constructors.set(descriptor.fullName, clazz)
    this.descriptorsByDbName.set(descriptor.dbName, descriptor)
    const cl = clazz as any
    descriptor.clazz = clazz
    cl._descriptor = descriptor
    return undefined
  }

  static registerSubClass (clazz: Function, parentClazz: Function, subCl: string) : AppExc | undefined {
    const pc = parentClazz as any
    const d : Descriptor = (parentClazz as any)['_descriptor'] as Descriptor
    if (!d)
      return new AppExc(3, 'subclass_without_parent_descriptor', 'RegisterSubClass', [clazz.name])
    d.subClasses.set(subCl, clazz)
    const cl = clazz as any
    cl._parentClazz = pc
    cl._subCl = subCl
    return undefined
  }

  static getDescriptor (svc: string, docCl: string) : Descriptor {
    const d = this.getDescriptorNX(svc, docCl)
    if (!d)
      throw new AppExc(3, 'class_without_descriptor', 'getDescriptor', [svc + '/' + docCl])
    return d
  }

  static getDescriptorNX (svc: string, docCl: string) : Descriptor | undefined {
    const cl = this.constructors.get(svc + '/' + docCl) as any
    if (!cl) return undefined
    const d = cl.descriptor || cl.parentClazz.descriptor
    return !d ? undefined : d
  }

  // Construit un document de la SOUS-CLASSE de docCl selon la valeur de son data
  static newD (svc: string, docCl: string, data?: any ) : $ADocument {
    const d = this.getDescriptor(svc, docCl)
    let cl: Function
    if (d.subClassBy) {
      const subCl = data ? data[d.subClassBy] : ''
      if (!subCl)
        throw new AppExc(3, 'subclass_id_not_found', 'newD', [svc + '/' + docCl, d.subClassBy])
      cl = d.subClasses.get(subCl) as Function
      if (!cl)
        throw new AppExc(3, 'subclass_not-registered', 'newD', [svc + '/' + docCl, d.subClassBy, subCl])
    } else {
      cl = d.clazz
    }
    // @ts-expect-error
    return new cl()
  }

  static regOp: Map<string, Function> = new Map()
  static sizeOp () { return this.regOp.size }

  static registerOp (cl: Function) { 
    this.regOp.set(cl.name, cl)
  }
  
  static newOp (name: string) {
    const cl = this.regOp.get(name)
    // @ts-expect-error
    return cl ? new cl() : null
  }
}

export class $ADocument {
  private static _descriptor: Descriptor
  private static _subCl: string
  private static _parentClazz: Function

  static get descriptor () : Descriptor { return this._descriptor || (this._parentClazz as any)['_descriptor'] }
  static get subCl () : string { return this._subCl || '' }
  static get parentClazz() : Function | undefined { return this._parentClazz || undefined}

  get descriptor () : Descriptor { return (this.constructor as any)['descriptor'] }
  get subCl () : string { return (this.constructor as any)['subCl'] }
  get parentClazz () : Function { return (this.constructor as any)['parentClazz'] }

}
