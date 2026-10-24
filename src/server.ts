
// import { exit } from 'process'
import { encode, decode } from '@msgpack/msgpack'

import Log from './fw/log'
import config from './config'
import { setup } from './setup'
import { AppExc, STabstract } from './fw/base'
import { MDOperation } from './fw/masterdir'
import { SafeOperation } from './fw/safeop'
import { Util } from './fw/util'
import { keyFromB64 } from './fw/b64'
import { Crypt } from './fw/crypt'
import { Registry } from './fw/registry'
import { Operation } from './fw/operation'

setup()

const cors = (response: Response) : Response => {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept')
  return response
}

const ctype = (response: Response, ct?: string) : Response => {
  response.headers.set('Content-Type', ct || 'application/octet-stream')
  return response
}

const checkSvc = (s: string) : Response | null => {
  if (config.serverOps.has(s)) return null
  const e = new AppExc(103, 'operations_not_supported', null, [s])
  if (config.debugLevel === 2)
    Log.info('operations_not_supported: /' + s)
  return ctype(new Response(e.serial(), { status: 401 }))
}

/* Retourne null si "origin" d'une requête est dans la liste autorisée,
sinon génère une response avec un texte d'exception.*/
const checkOrigin = (req: Request) : Response | null => {
  const origs = config.origins
  if (!origs || origs.size === 0) return null
  let origin = req.headers.get('origin')
  if (origin && origs.has(origin)) return null
  if (!origin || origin === 'null') {
    origin = req.headers.get('referer')
    if (origin && origs.has(origin)) return null
  }
  if (!origin || origin === 'null') {
    const url = new URL(req.url)
    const hn = url.hostname
    const port = url.port
    if (origs.has(hn) || origs.has(hn + ':' + port)) return null
  }
  if (!origin) origin = '?'
  const e = new AppExc(103, 'origin_not_authorized', null, [origin])
  if (config.debugLevel === 2)
    Log.info('origin_not_authorized: ' + origin)
  return ctype(new Response(e.serial(), { status: 401 }))
}

const fileGet = async (req: any): Promise<Response> => {
  const name = req.params.name
  const st: STabstract | undefined = config.storages.get(name)
  let msg = st ? '' : 'File not Found'
  if (!msg && st) {
   try {
      const [id1, id2, id3] = st.decode3(req.params.arg)
      const bytes = await st.getFile(null, id1, id2, id3)
      if (!bytes) msg = 'File not Found'
      else return ctype(new Response(bytes, { status: 200 }))
    } catch (e: any) {
      msg = e.toString()
    }
  }
  return new Response(msg, { status: 404, statusText: 'File not Found'})
}

const filePut = async (req: Request): Promise<Response> => {
  const name = (req as any).params.name
  const st: STabstract | undefined = config.storages.get(name)
  let msg = st ? '' : 'File not uploaded'
  if (!msg && st) {
    try {
      const bytes = await req.bytes()
      const [id1, id2, id3] = st.decode3((req as any).params.arg)
      await st.putFile(null, id1, id2, id3, Buffer.from(bytes))
      return new Response('OK')
    } catch (e: any) {
      msg = e.toString()
    }
  }
  return new Response(msg, { status: 404, statusText: 'File not uploaded'})
}

const ExcDecode = (src: number) : Response => {
  const s = ['', 'service', 'masterdir', 'safe'][src]
  if (config.debugLevel === 2)
    Log.info(s + ' terminated on exception arguments NOT decodable')
  const e = new AppExc(105, s + '_arguments_notdecodable', null)
  return ctype(new Response(e.serial(), { status: 401 }))
}

const ExcOp = (exc: any, opName: string, src: number) : Response => {
  if (config.debugLevel >= 2)
    Log.info(opName + ' terminated on exception')
  // 400: AppExc
  // 401: AppExc inattendue
  const e = exc
  let b: Uint8Array
  let st = 400
  if (e instanceof AppExc) {
    b = e.serial()
  } else {
    const s = ['', 'service', 'masterdir', 'safe'][src]
    const e2 = new AppExc(105, s + '_unexpected_exception', null, [e.message], e.stack || '')
    b = e2.serial()
    st = 401
  }
  return ctype(new Response(b, { status: st }))
}

let today = 0
let todayEpoch = 0

const doOp = async (body: Uint8Array, baseUrl: string) : Promise<Response> => {
  let args: any, opName: string = ''
  try { args = decode(body); opName = args['opName']
  } catch (e) { return ExcDecode(1) }

  const now = Date.now()
  const e = Math.floor(now / 86400000)
  if (e !== todayEpoch) { 
    todayEpoch = Math.floor(now / 86400000)
    today = Util.amj(now)
  }

  if (opName.startsWith('CONFIG$')) {
    let obj : Object
    switch (opName) {
      case 'CONFIG$CKey' : 
        const dc = config.keys['DCKeys'][args['name']]
        obj = { key: dc ? dc.pub : '' }
        break
      case 'CONFIG$VKey' : 
        const sv = config.keys['SVKeys'][args['name']]
        obj = { key: sv ? sv.pub : '' }
        break
      case 'CONFIG$Services' :
        obj = { at: Date.now(), services: Array.from(config.SERVICES) }
        break
      case 'CONFIG$AdminID' :
        const k = Crypt.shaS(keyFromB64(args['pwd']))
        const id = config.ADMINIDS[k] || ''
        obj = { at: Date.now(), id }
        break
      default :
        const e = new AppExc(103, 'unknown_config_operation', null, [opName])
        return ctype(new Response(e.serial(), { status: 401 }))
    }
    return new Response(encode(obj), { status: 200 })
  }

  try {
    const op = Registry.newOp(opName) as Operation
    if (!op) throw new AppExc(103, 'unknown_operation', null, [opName])

    op.now = now
    op.today = today
    op.args = args
    op.opName = opName
    op.baseUrl = baseUrl

    const apiv = args['APIVERSION'] || 0
    if (apiv && config.APIVERSIONS && config.APIVERSIONS.length === 2 &&
      (apiv < (config.APIVERSIONS[0] || 0) || apiv > (config.APIVERSIONS[1] || 0)))
      throw new AppExc(103, 'unsupported_API', null, 
        [op.args.svc || '?', config.APIVERSIONS[0], config.APIVERSIONS[1], apiv, config.BUILD])

    if (opName.startsWith('ADMIN$')) {
      op.site = args['site']
      op.dbConnector = config.databases.get('svcDB')
    } else {
      op.svc = args['svc']
      op.org = args['org']
      op.dbConnector = config.databases.get(op.org + '_DB') || config.databases.get('svcDB')
      op.storage = config.storages.get(op.org + '_ST') || config.storages.get('svcST')
    }

    op.init()

    await op.run()

    if (config.debugLevel === 2)
      Log.info(opName + ' finished')

    return new Response(encode(op.result || {}), { status: 200 })
  } catch(exc) {
    return ExcOp(exc, opName, 1)
  }
}

const doSafe = async (body: Uint8Array) : Promise<Response> => {
  let args: any, opName: string = ''
  try { args = decode(body); opName = args['opName']
  } catch (e) { return ExcDecode(3) }
  try {
    const result = await SafeOperation.doOp(opName, args)
    if (config.debugLevel === 2) Log.info(opName + ' finished')
    return new Response(encode(result), { status: 200 })
  } catch (exc: any) { return ExcOp(exc, opName, 2) }
}

const doMaster = async (body: Uint8Array) : Promise<Response> => {
  let args: any, opName: string = ''
  try { args = decode(body); opName = args['opName']
  } catch (e) { return ExcDecode(2) }
  try {
    const result = await MDOperation.doOp(opName, args)
    if (config.debugLevel === 2) Log.info(opName + ' finished')
    return new Response(encode(result), { status: 200 })
  } catch (exc: any) { return ExcOp(exc, opName, 2) }
}

const server = Bun.serve({
  port: config.port,

  tls: config.https ? {
    cert: Bun.file("./cert/cert.pem"),
    key: Bun.file("./cert/key.pem")
  } : undefined,

  routes: {
    // "/": { OPTIONS: () => cors(new Response(''))},
    '/favicon.ico': 
      Bun.file('./favicon.ico'),
    '/robots.txt': {
      GET: () => cors(new Response('User-agent: *\nDisallow: /\n'))
    },
    '/ping': {
      GET: () => cors(new Response(new Date().toISOString() + ' ' + config.BUILD + ' [' + config.APIVERSIONS[0] + '/' + config.APIVERSIONS[1] + ']'))
    },
    '/file/:name/:arg': {
      GET: async (req) => cors(await fileGet(req)),
      PUT: async (req) => cors(await filePut(req))
    },
    '/op/': {
      POST: async (req) => {
        let r = checkSvc('op')
        if (r) return r
        r = checkOrigin(req)
        if (r) return r
        const url = new URL(req.url)
        const baseUrl = url.protocol + '://' + url.host
        const body = await req.bytes()
        return cors(await doOp(body, baseUrl))
      },
      OPTIONS: () => 
        cors(new Response(''))
    },
    '/safe/': {
      POST: async (req) => {
        let r = checkSvc('safe')
        if (r) return r
        r = checkOrigin(req)
        if (r) return r
        const body = await req.bytes()
        return cors(await doSafe(body))
      },
      OPTIONS: () => 
        cors(new Response(''))
    },
    '/master/': {
      POST: async (req) => {
        let r = checkSvc('master')
        if (r) return r
        r = checkOrigin(req)
        if (r) return r
        const body = await req.bytes()
        return cors(await doMaster(body))
      },
      OPTIONS: () => 
        cors(new Response(''))
    }
  },

  // fallback for unmatched routes:
  fetch(req) {
    return new Response('Not Found', { status: 404 });
  }
})

Log.info(`Server running at ${server.url}`)
