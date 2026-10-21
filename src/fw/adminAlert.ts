import config from '../config.ts'
import Log from './log'
import type { AbstractOperation } from './types'

export default function adminAlert ( op: AbstractOperation, subject: string, text: string) {
  const org = op && op['org'] ? op['org'] : ''
  const al = config.keys['adminAlerts']
  if (al['adminAlerts'] === 0) return
  const s = (org ? 'org:' + org + ' - ' : '') 
    + (op ? 'op:' + op.opName + ' - ' : '') 
    + subject
  Log.info('Mail sent to:' + al.to + ' subject:' + s + (text ? '\n' + text : ''))

  if (!config.adminAlerts) return

  setTimeout(async () => {
    // Test avec le script server.php
    try {
      const response = await fetch(al.url, {
        method: 'POST',
        headers:{
          'Content-Type': 'application/x-www-form-urlencoded'
        },    
        body: new URLSearchParams({ 
          mailer: 'A',
          mdp: al.pwd, 
          subject: s, 
          to: al.to, 
          text:  text || '-'
        })
      })
      const t = await response.text()
      if (!t.startsWith('OK'))
        Log.error('Send mail error: [' + al.url + '] -  ' + t)
    } catch (e: any) {
      Log.error('Send mail exception: [' + al.url + '] -  ' + e.toString())
    }
  }, 1)
}
