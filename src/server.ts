
// import { exit } from 'process'
import { encode, decode } from '@msgpack/msgpack'

import Log from './fw/log'
import config from './config'
import { setup } from './setup'
import { AppExc, STabstract } from './fw/base'
import { MDOperation } from './fw/masterdir'

setup()

const cors = (response: Response) : Response => {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
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

const doOp = async (body: Uint8Array, baseUrl: string) : Promise<Response> => {
  // TODO
  return new Response('OK')
}

const doSafe = async (body: Uint8Array) : Promise<Response> => {
  // TODO
  return new Response('OK')
}

const doMaster = async (body: Uint8Array) : Promise<Response> => {
  let args: any, opName: string = ''
  try {
    args = decode(body)
    opName = args['opName']
  } catch (e) {
    ExcDecode(res, 2)
    return
  }
  try {
    const result = await MDOperation.doOp(opName, args)
    const b = encode(result) as Buffer
    res.status(200).type('application/octet-stream').send(Buffer.from(b))
    if (config.debugLevel === 2) Log.info(opName + ' finished')
  } catch (exc: any) {
    ExcOp(exc, opName, res, 2)
  }
  return new Response('OK')
}

const server = Bun.serve({
  port: config.port,
  routes: {
    "/": { 
      OPTIONS: () => cors(new Response(''))},
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
    '/op': {
      POST: async (req) => {
        let r = checkSvc('op')
        if (r) return r
        r = checkOrigin(req)
        if (r) return r
        const url = new URL(req.url)
        const baseUrl = url.protocol + '://' + url.host
        const body = await req.bytes()
        return doOp(body, baseUrl)
      }
    },
    '/safe': {
      POST: async (req) => {
        let r = checkSvc('safe')
        if (r) return r
        r = checkOrigin(req)
        if (r) return r
        const body = await req.bytes()
        return doSafe(body)
      }
    },
    '/master': {
      POST: async (req) => {
        let r = checkSvc('master')
        if (r) return r
        r = checkOrigin(req)
        if (r) return r
        const body = await req.bytes()
        return doMaster(body)
      }
    }

  },

  // fallback for unmatched routes:
  fetch(req) {
    return new Response('Not Found', { status: 404 });
  }
})

Log.info(`Server running at ${server.url}`)

