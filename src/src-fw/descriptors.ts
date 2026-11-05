import {Descriptor, type collection, type idx, propType } from '../src-fw/descriptor'

Descriptor.registerService('ADMIN')

export default {
  ADMIN$Status: Descriptor.doc('ADMIN', 'Status', { pk: ['svc'], nohash: true }),

  ADMIN$Task: Descriptor.doc('ADMIN', 'Task', { sync: false, pk: ['process', 'target'] },
      undefined,
      new Map<string, idx>([
        ['startTime',  { type: propType.STRING, global: true }]
      ])
    )
}
