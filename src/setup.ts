/* Setup de la configuration:
- des connectors d'accès aux DB
- des Storages
- des schemas des documenrs
- des classes de documents
- des classes d'opération

Les configurations se retrouvent stockées:
- dans config.ts : DB et storages
- dans DocDescriptor (schémas)
- dans Registry (classes de documents et d'opération)

Si web-push peut être importé, sa configuration est fixée
*/

import { exit } from 'process'
// import webpush from 'web-push'
import config from './config.ts'
import Log from './src-fw/log.ts'
import { AppSQLiteConnector } from './app/AppDBsqlite.ts'
import { FilesystemStorage } from './src-fw/STfilesystem.ts'

import { FWreport } from './src-fw/documents.ts'
import { AS2report } from './as2/documents.ts'

import { loadingOF } from './src-fw/operations.ts'
import { loadingOA } from './app/operations'
import { loadingOS } from './src-fw/safeop.ts'

export const setup = () => {
  config.dbConnectorClasses.sqlite = AppSQLiteConnector

  config.databases.set('masterDB', new AppSQLiteConnector(config.keys['sqlite_z'], config.keys['sites']['A']))
  config.databases.set('safeDB', new AppSQLiteConnector(config.keys['sqlite_z'], config.keys['sites']['A']))
  config.databases.set('svcDB', new AppSQLiteConnector(config.keys['sqlite_a'], config.keys['sites']['A']))

  /* DB spécifiques par organisation
  const sqlb = new AppSQLiteConnector(config.keys['sqlite_b'], config.keys['sites']['A'])
  const fs1 = new AppFirestoreConnector(config.keys['googleCloud'], config.keys['sites']['A'])
  config.databases.set('org1_DB', sqlb)
  config.databases.set('org2_DB', fs1)
  */

  config.storages.set('svcST', new FilesystemStorage(config.keys['storage_a']))
  /* Storages spécifiques par organisation
  config.storages.set('org1_ST', new FilesystemStorage(config.keys['storage_b']))
  */
  
  // Enregistrement dans Registry des classes de documents
  let exc = AS2report()
  if (!exc) exc = FWreport()
  // Enregistrement dans Registry des classes d'opération 
  loadingOF()
  loadingOA()
  loadingOS()

  if (exc) throw exc

  // webpush.setVapidDetails('https://example.com/', config.keys['vapid_public_key'], config.keys['vapid_private_key'])

}
