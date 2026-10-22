import { exit } from 'process'
import Log from './log'
import config from '../config'
import { setup } from '../config2'

import type { AbstractOperation } from './types'
import type { expList, expListQ } from './DBabstract'
import { testECDH /*, testSH */ } from './crypt'
import { Registry, topCl } from './registry'
import { DocDescriptor } from './docDescriptor'

import { parseArgs } from 'node:util'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'readline'

// import path from 'path'
// import { readFileSync, writeFileSync } from 'node:fs'
// import { decode } from '@msgpack/msgpack'

import { DbConnector } from './base'
import type { DBabstract } from './DBabstract'

/***************************************************************** */

class ToolOperation implements AbstractOperation {
  opName: string = ''
  result: any = {}
  args: any  
  db: any
  org: string = ''
  now: number = 0

  /* Fixe LA valeur de la propriété 'prop' du résultat (et la retourne)*/
  setRes(prop: string, val: any) : void {}
}

type eltCnx = {
  name: string
  dbc: DbConnector
}

export class Tools {

  args: any
  tool: string
  simu: boolean
  connectors: Map<string, eltCnx> = new Map()
  op: ToolOperation | null = null
  cnxIn: DBabstract | null = null
  cnxOut: DBabstract | null = null

  constructor () {
    this.args = parseArgs({
      allowPositionals: true,
      options: {
        in: { type: 'string' },
        out: { type: 'string' },
        dbType: { type: 'string'},
        simulation: { type: 'boolean', short: 's'}
      }
    })
    this.tool = this.args.positionals[0]
    this.simu = this.args.values.simulation
  }

  log2 (l: string) { stdout.write('\r' + l.padEnd(40, ' ')) }

  log (l: string) { stdout.write(l + '\n') }

  prompt (q: string) {
    return new Promise((resolve) => {
      const opt = { input: stdin, output: stdout }
      const readline = createInterface(opt)
      readline.question(q, rep => {
        readline.close()
        resolve(rep)
      })
    })
  }

  async run () {
    try {
      this.log('======================================================')
      // this.cfg = {}
      switch (this.tool) {
        case 'test1' : {
          await this.test1()
          break
        }
        case 'genSchema' : {
          await this.genSchema()
          break
        }
        case 'export-db' : {
          this.op = new ToolOperation()
          this.op.now = Date.now()
          this.getDbs()
          this.cnxIn = await this.setCfgDb('in')
          this.cnxOut = await this.setCfgDb('out')
          await this.exportDb()
          break
        }
        /*
        case 'export-st' : {
          await this.setCfgSt('in')
          await this.setCfgSt('out')
          await this.exportSt()
          break
        }
        case 'purge-db' : {
          await this.setCfgDb('in')
          await this.purgeDb()
          break
        }
        case 'purge-st' : {
          await this.setCfgSt('in')
          await this.purgeSt()
          break
        }
        case 'vapid' : {
          await this.genVapidKeys()
          break
        }
        case 'data' : {
          await this.decodeData()
          break
        }
        */
        default : {
          throw 'Premier argument attendu: test1 export-db export-st vapid. Trouvé [' + this.tool + ']'
        }
      }
      return [0, this.tool + ' OK']
    } catch (e: any) {
      if (typeof e === 'string') return [1, e]
      return [1, e.toString() + '\n' + e.stack]
    }
  }

  getDbs() {
    this.connectors = new Map<string, eltCnx>()
    const names = []
    for (const e of config.databases) {
      names.push(e[0])
      this.connectors.set(e[0], { name: e[0], dbc: e[1]})
    }
    Log.info('Avalable providers: ' + names.join(' '))
  }

  async genSchema () {
    const arg = this.args.values['dbType']
    if (!arg) throw 'Argument --dbType non trouvé'
    const cl = config.dbConnectorClasses[arg]
    if (cl) await cl.genSchema()
    else Log.error(arg + ' connector undeclared')
  }

  async setCfgDb (io: string) : Promise<DBabstract | null> {
    let org: string
    let site: string
    let cryptKey: string
    let eltCnx: eltCnx | undefined
    
    const arg = this.args.values[io]
    if (!arg) throw 'Argument --' + io + ' non trouvé'
    const x = arg.split(' ')

    if (x.length !== 3)
      throw 'Argument --' + io + ' : Syntax error. Expected: org1,sqlite_a,A + ( org,provider,site)'

    org = x[0]
    if (!org || org.length < 4)
      throw 'Argument --' + io + ' : Expected: org,provider,site : org [' + org + ']: less than 4 chars'

    site = x[2]
    cryptKey = config.keys['sites'][site]
    if (!cryptKey)
      throw 'Argument --' + io + ' : Expected: org,provider,site . site [' + site + '] not declared'

    eltCnx = this.connectors.get(x[1])
    if (!eltCnx)
      throw 'Argument --' + io + ' : Expected: org,provider,site : provider [' + x[1] + '] not declared'

    if (this.op) {
      const cnx = await eltCnx.dbc.getConnexion(this.op, org, cryptKey) as DBabstract
      Log.info('DB' + io + ': ' + eltCnx.name + ' connected. org:' + org + ' site:' + site)
      return cnx
    }
    return null
  }

  async exportDb () {
    const st = Date.now()
    let nbr = 0
    let nbrq = 0
    const resp = await this.prompt('Export / Import DB\nValider (o/N) ?')
    if (resp !== 'o' && resp !== 'O') throw 'Exécution interrompue.'

    if (this.cnxIn && this.cnxOut) for(const clazz of Registry.allClasses()) {
      const dt = DocDescriptor.get(topCl('', clazz))
      this.log2('Class ' + clazz)
      let mark = '1'
      let n = 0
      let fin = false
      while (!fin) {
        const {rows, eox, lastMark} = await this.cnxIn.exportRows(clazz, mark, 10) as expList
        if (rows.length) {
          n += rows.length
          if (!this.simu) await this.cnxOut.importRows(clazz, rows)
        }
        fin = eox
        mark = lastMark
        this.log2('Class ' + clazz + ' - exported rows:' + n)
      }
      this.log('')
      nbr += n
      if (dt.hasColls && dt.colls) for(const [colName, ] of dt.colls) {
        this.log2('Class ' + clazz + '@' + colName)
        let mark = '1'
        let n = 0
        let fin = false
        while (!fin) {
          const {rows, eox, lastMark} = await this.cnxIn.exportRowsQ(clazz, colName, mark, 10) as expListQ
          if (rows.length) {
            n += rows.length
            if (!this.simu) await this.cnxOut.importRowsQ(clazz, colName, rows)
          }
          fin = eox
          mark = lastMark
          this.log2('Class ' + clazz + '@' + colName + ' - exported rows:' + n)
        }
        nbrq += n
      }
    }
    const t = Date.now() - st
    this.log('\n============== Export / import completed in ' + t + 'ms - ' + nbr + ' rows - ' + nbrq + ' rowsQ')
  }

  async test1 () : Promise<void> {
    await testECDH()
    // await testSH()
  }
}

setup()

setTimeout(async () => {
  const [n, s] = await (new Tools()).run()
  if (!n) Log.info('' + s); else Log.error('' + s)
  exit()
}, 1)