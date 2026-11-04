import { encode, decode } from '@msgpack/msgpack'

import { AppExc } from './base'
import config from '../config'
import { Operation } from './operation'
import type { ICVS } from './types'
import { MDOperation, getSafeUrl } from './masterdir'
import { SafeOperation } from './safeop'

export class MDandSafe {
  static icvsCache : Map<string, ICVS> = new Map()
  static lastClean : number = Date.now()

  static cleanCache () : number{
    const now: number = Date.now()
    if ((now - MDandSafe.lastClean) < 3600000) return now
    for (const [id, x] of MDandSafe.icvsCache)
      if ((now - x.dh) > 1800000) MDandSafe.icvsCache.delete(id)
    MDandSafe.lastClean = now
    return now
  }

  static headers = {
    'Content-Type': 'application/octet-stream',  // sent request
    'Accept':       'application/octet-stream'   // expected data sent back
  }

  static async postMDS (op: Operation, url: string, args: any) : Promise<Object> {
    const maxRetries = 3
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const body = Buffer.from(encode(args))
        /* Interface fetch */
        const response = await fetch(url, {
          method: 'POST', headers: MDandSafe.headers, body
        })
        const buf = await response.bytes()
        
        /* Interface axios 
        const response = await axios.post(url, body, { 
          headers: MDandSafe.headers,
          responseType: 'arraybuffer',
          timeout: 600000
        })
        const buf = Buffer.from(response.data)
        */

        const obj = decode(buf) as Object
        if (response.status === 200) return obj
        const txt = new TextDecoder().decode(buf)
        throw new AppExc(108, 'remote_md_safes_access_status', args, 
          [op.opName, op.args.svc || '?', op.args.org || '?', (url || '?'), '' + response.status, txt])

      } catch (error: any) {

        // Check if it's a connection reset error
        const ec = error.code || error.cause.code
        const isResetError = 
          ec === 'ECONNRESET' ||
          ec === 'EPIPE' ||
          ec === 'ECONNABORTED' ||
          ec === 'ETIMEDOUT'
        if (!isResetError || attempt === maxRetries) {
          if (error instanceof AppExc) throw error
          throw new AppExc(108, 'remote_md_safes_access_exc', args, 
            [op.opName, op.args.svc || '?', op.args.org || '?', (url || '?'), error.toString()], error.stack)
        }
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
        const jitter = Math.floor(Math.random() * 250)
        console.log(`Connection reset, retrying in ${delay + jitter}ms (attempt ${attempt}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, delay + jitter))

      }
    }
    return {} // On ne passe jamais ici
  }

  static async getCVS (op: Operation, userId: string) : Promise<[string, string, string] | null> {
    const now = MDandSafe.cleanCache()
    let icvs = MDandSafe.icvsCache.get(userId)
    if (icvs) return [icvs.c, icvs.v, icvs.s]
    const args = {
      opName: '$mdUserGetICVS',
      userId: userId
    }
    const res: any = await MDandSafe.doMDOp(op, '$mdUserGetICVS', args)
    icvs = res.icvs
    if (!icvs) return null
    icvs.dh = now
    if (icvs.c) // ne stocke pas les IDs en invitation
      MDandSafe.icvsCache.set(userId, icvs)
    /* Test accès Safe
    const r: any = await MDandSafe.doSafeOp(op, userId, '$Ping', {})
    Log.info(r.ping)
    */
    return [icvs.c, icvs.v, icvs.s]
  }

  static async doSafeOp (op: Operation, userId: string, opName: string, args: any) 
  : Promise<Object> {
    const cvs = await MDandSafe.getCVS(op, userId)
    if (!cvs) return { status: 101 }
    const url = await getSafeUrl(op, cvs[2])
    args.opName = opName
    if (op.baseUrl + '/safe' !== url)
      return await MDandSafe.postMDS(op, url, args)
    const result = await SafeOperation.doOp(opName, args)
    return result
  }

  static async doMDOp (op: Operation, opName: string, args: any) : Promise<Object> {
    args.opName = opName
    if (op.baseUrl + '/master' !== config.MASTERDIR_URL)
      return await MDandSafe.postMDS(op, config.MASTERDIR_URL, args)
    const result = await MDOperation.doOp(opName, args)
    return result
  }
}
