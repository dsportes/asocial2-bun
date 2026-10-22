
import { exit } from 'process'
import Log from './fw/log'
// import config from './config'
import { setup } from './setup'

setup()

Log.info('Server via Bun!')
// TODO

setTimeout(() => {
  exit()
}, 30000)
