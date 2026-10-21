/* Implémentation SQLite d'accès à l'application */

// import Log from '../fw/log'
// import { AppExc } from '../fw/base'
import type { AbstractOperation } from '../fw/types'
import { SQLiteConnexion, SQLiteConnector } from '../fw/DBsqlite'

export class AppSQLiteConnector extends SQLiteConnector {
  static override async genSchema () { await SQLiteConnector.genSchema() }

  constructor (credentials: string, cryptKey: string) {
    super(credentials, cryptKey)
    this.factory = AppSQLiteConnexion.newConnexion
  }
}

export class AppSQLiteConnexion extends SQLiteConnexion {
  public static override newConnexion (connector: AppSQLiteConnector, op: AbstractOperation) {
    return new AppSQLiteConnexion(connector, op)
  }
  constructor (connector: AppSQLiteConnector, op: AbstractOperation) {
    super(connector, op)
  }

  /* Méthodes spécifiques de l'application */

  async fakeForTest () : Promise<[number, string]> {
    return [0, '0']
  }
  
}
