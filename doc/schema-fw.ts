import Log from '../src/src-fw/log'
import type { idx } from '../src/src-fw/docDescriptor'
import { DocDescriptor, FormType, propType } from '../src/src-fw/docDescriptor'

let exc: Error | null = null

let svc = DocDescriptor.declareService('ADMIN')

try {
  const nd = DocDescriptor.size()
  const nf = FormType.size()

  new DocDescriptor(svc,
    { name: 'Status', sync: true, pk: ['svc'], nohash: true }
  )
  
  new DocDescriptor(svc,
    { name: 'Task', sync: false, pk: ['process', 'target'] },
    null,
    new Map<string, idx>([
      ['startTime',  { type: propType.STRING, global: true }]
    ])
  )

  Log.info('FW document descriptors:' + (DocDescriptor.size() - nd) 
    + ' forms descriptors:' + (FormType.size() - nf))

} catch (e: any) {
  exc = e
}

export const schemaExcFW = () : Error | null => {
  if (exc)  Log.error('Schema Exception: ' + exc.toString())
  return exc
}
