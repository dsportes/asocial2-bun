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
import Log from './fw/log.ts'
import { AppSQLiteConnector } from './app/AppDBsqlite.ts'
import { FilesystemStorage } from './fw/STfilesystem.ts'

import { schemaExcFW } from './fw/schema.ts'
import { schemaExcAS2 } from './as2/schema.ts'

import { loadingDF } from './fw/documents'
import { loadingDA } from './as2/documents'
import { loadingOF } from './fw/operations'
import { loadingOA } from './app/operations'
import { loadingOS } from './fw/safeop'

export const setup = () => {
  config.dbConnectorClasses.sqlite = AppSQLiteConnector

  config.databases.set('masterDB', new AppSQLiteConnector(config.keys['sqlite_z'], config.keys['sites']['A']))
  config.databases.set('safeDB', new AppSQLiteConnector(config.keys['sqlite_z'], config.keys['sites']['A']))
  config.databases.set('svcDB', new AppSQLiteConnector(config.keys['sqlite_z'], config.keys['sites']['A']))

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

  /* Compilation des schémas */
  let exc = schemaExcFW()
  if (!exc) exc = schemaExcAS2()
  if (exc) {
    Log.error(exc.toString())
    exit()
  }

  /* Enregistrement dans Registry des classes de documents */
  loadingDF()
  loadingDA()

  /* Enregistrement dans Registry des classes d'opération */
  loadingOF()
  loadingOA()
  loadingOS()
  
  // webpush.setVapidDetails('https://example.com/', config.keys['vapid_public_key'], config.keys['vapid_private_key'])

}
