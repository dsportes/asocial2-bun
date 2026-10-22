/* Implémentation de l'accès au Storage par File-System */
import Bun from 'bun'

import { writeFile, readFile } from 'node:fs/promises'
import { existsSync, unlinkSync, rmSync, readdirSync, mkdirSync } from 'node:fs'
import path from 'node:path'

import Log from './log'
import { STabstract, AppExc } from './base'

import type { AbstractOperation } from './types'

/*********************************************************************/
export class FilesystemStorage extends STabstract {
  public rootpath: string

  constructor (credentials: any) {
    super(credentials, 'fileSystem')
    this.rootpath = path.resolve(this.credentials['path'])
    if (!existsSync(this.rootpath))
      throw new AppExc(110, 'FilesystemStorage_path_not_found', null, [this.rootpath])
    Log.info('FilesystemStorage - path:[' + this.rootpath) + ']'
  }

  override async ping (op: AbstractOperation) : Promise<[number, string]> {
    try {
      const txt = new Date().toISOString()
      const data = Buffer.from(txt)
      const p = path.resolve(this.rootpath, 'ping.txt')
      await writeFile(p, data)
      return [0, 'File-System ping OK: ' + txt]
    } catch (e: any) {
      return [1, 'File-System ping KO: ' +e.toString]
    }
  }

  override getUrl (op: AbstractOperation, id1: string, id2: string, id3: string) { 
    return op.baseUrl + '/file/' + this.name + '/' + this.encode3(id1, id2, id3)
  }

  override putUrl (op: AbstractOperation, id1: string, id2: string, id3: string) {
    return op.baseUrl + '/file/'  + this.name + '/' + this.encode3(id1, id2, id3)
  }

  override async getFile (op: AbstractOperation | null, id1: string, id2: string, id3:string) : Promise<Buffer | null>{
    try {
      const p = path.resolve(this.rootpath, id1, id2, id3)
      return await readFile(p)
    } catch (err: any) {
      Log.error(err.toString())
      return null
    }
  }

  override async putFile (op: AbstractOperation | null, id1: string, id2: string, id3:string, data: Buffer) : Promise<void> {
    try {
      const dir = path.resolve(this.rootpath, id1, id2)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const p = path.resolve(dir, id3)
      await writeFile(p, Buffer.from(data))
    } catch (err: any) {
      Log.error(err.toString())
      throw err
    }
  }

  override async delFiles (op: AbstractOperation, id1: string, id2: string, lidf: string[]) : Promise<void> {
    if (!lidf || !lidf.length) return
    try {
      const dir = path.resolve(this.rootpath, id1, id2)
      if (existsSync(dir)) {
        for (let i = 0; i < lidf.length; i++) {
          const idf = lidf[i]
          if (idf) {
            const p = path.resolve(dir, idf)
            try {
              unlinkSync(p)
            } catch (e) { /* rien*/ }
          }
        }
      }
    } catch (err: any) {
      Log.error(err.toString())
      throw err
    }
  }

  override async delId (op: AbstractOperation, id1: string, id2: string) : Promise<void> {
    try {
      const dir = path.resolve(this.rootpath, id1, id2)
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true })
      }
    } catch (err: any) {
      Log.error(err.toString())
      throw err
    }
  }

  override async delOrg (op: AbstractOperation, id1: string) : Promise<void>  {
    try {
      const dir = path.resolve(this.rootpath, id1)
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true })
      }
    } catch (err: any) {
      Log.error(err.toString())
      throw err
    }
  }

  override async listFiles (op: AbstractOperation, id1: string, id2: string) : Promise<string[]> {
    try {
      const lst: string[] = []
      const dir = path.resolve(this.rootpath, id1, id2)
      if (existsSync(dir)) {
        const files = readdirSync(dir)
        if (files && files.length) files.forEach(name => { 
          lst.push(name) 
        })
      }
      return lst
    } catch (err: any) {
      Log.error(err.toString())
      throw err
    }
  }

  override async listIds (op: AbstractOperation, id1: string) : Promise<string[]> {
    try {
      const lst: string[] = []
      const dir = path.resolve(this.rootpath, id1)
      if (existsSync(dir)) {
        const files = readdirSync(dir)
        if (files && files.length) files.forEach(name => {
          lst.push(name) 
        })
      }
      return lst
    } catch (err: any) {
      Log.error(err.toString())
      throw err
    }
  }

}
