/**
 * @module nodejs
*/

/**
 * @public
 * @namespace module:nodejs
*/

const { resolve, dirname, basename } = require('path')
const { readFileSync } = require('fs')
const { StringDecoder } = require('string_decoder')
const Client = require('@hoctail/query')
const tar = require('tar')
const { Response } = require('node-fetch')
const decoder = new StringDecoder('utf8')
const path = require('path')
const chalk = require('chalk')
const {
  pack,
  checkAppType,
  rollupBundle,
  putFile,
} = require('./utils')


/**
 * User-defined options to Client constructor
 * @typedef {Object.<string, any>} UserOptions
 * @memberOf module:nodejs~NodeClient
 * @public
 * @property {string} endpoint - endpoint URL
 * @property {string} key - API key
 * @property {string} [baseURL] - endpoint URL
 * @property {string} [app] - app name (in 'ownerName/appName' format)
 * @property {string} [logLevel] - log level
 */

/**
 * A Hoctail client for NodeJS.
 * Use this API when you need to manipulate you applications programmatically
 * @public
 * @extends module:nodejs~Client
 * @example
 * const { NodeClient } = require('@hoctail/client')
 * const client = new NodeClient({ app: 'myApp', logLevel: 'INFO' })
 * (async () => {
 *   const me = await client.call('public.whoami')
 *   console.log(me)
 *   const data = await client.query(`select * from myTable`)
 *   console.log(data)
 *   await client.close()
 * })()
 *
 */
class NodeClient extends Client {
  /**
   * @param {module:nodejs~NodeClient.UserOptions} options - client connection options
   * @param {string[]} [args] - command line arguments, default: process.argv
   */
  constructor (options, args = process.argv) {
    super(initOptions(options), console.log)
    this.argv = args.slice(0)
  }

  /**
   * Returns endpoint URL
   * @public
   * @return {string}
   */
  get url () {
    return this.baseURL
  }

  /**
   * App name (will reconnect if name is changed)
   * @type {string}
   * @public
   * */
  get app () {
    return super.app
  }

  set app (appName) {
    const current = super.app
    if (appName === 'public') {
      this.schema = 'public'
      this._app = null
    } else if (appName != null) {
      this.schema = null
      this._app = appName
    }
    if (current !== super.app) {
      // app changed, reconnect on next call
      this.close()
    }
  }

  /**
   * Close the connection
   * @public
   * @return {Promise<void>}
   */
  async close () {
    return this.terminate()
  }

  /**
   * Get application state on server
   *
   * __Note: only the app owner will get a non-null result__
   * @public
   * @param {string} [name] - app name, optional, current app name if unset
   * @return {Promise<object>}
   * @example
   * {
   *   id: '8d150da1-9e1a-4172-b2d8-f58adad97d15',
   *   owner: 'username',
   *   name: 'appName',
   *   app: 'owner/appName',
   *   state: 'started'
   * }
   */
  async getAppState (name) {
    if (!this.app) {
      throw new Error(`Target app undefined`)
    }
    name = name || parseApp(this.app).name
    const appState = await this.call('http_server.get_state', name)
    if (appState == null) {
      throw new Error(`App "${name}" does not exist`)
    }
    return appState
  }

  /**
   * Get app type.
   * 
   * Must be in init state already.
   * @public
   * @return {Promise<string>}
   */
  async getAppType () {
    return await this.wait(() => {
      const { serverSideTx } = require('@hoctail/patch-interface')
      let appType = ''
      serverSideTx(hoc, ({ store }) => {
        const { AppRecordSpace } = require('@hoc/apps.api')
        const app = AppRecordSpace.create({ record: store.system.schemaRecord.id })
        appType = app.appTypeName
      })
      return appType
    })
  }

  /**
   * Ensure that app was initialized (first time)
   * @param {NodeClient} client
   * @returns {Promise<void>}
   * @private
   */
   async _ensureApp () {
    if (!this.app) {
      throw new Error(`Target app undefined, see --help`)
    }
    const appState = await this.getAppState()
    if (appState.state === 'created') {
      console.log(`${chalk.green('Will initialize app → ')} ${chalk.cyan(this.app)} :\n`)
      await this.initApp()
    }
  }

  /**
   * Initialize application
   *
   * Should be executed once if you're creating an app manually.
   * CLI or UI commands will usually do it for you
   * @public
   * @return {Promise<void>}
   */
  async initApp () {
    const initialized = await this.wait(() => hoc.hasTree())
    if (!initialized) {
      await this.wait('public.init_schema')
      await this.call('public.rebase')
    }
  }

  /**
   * Data on installed package
   * @typedef {Object} InstalledItem
   * @memberOf module:nodejs~NodeClient
   * @public
   * @property {string} name - package name on server
   * @property {string} path - local src path
   * @property {string} bundle - local bundled code path
   */

  /**
   * Install an npm package on server
   * @example
   * // install a package from node_modules
   * const result = await client.install('./node_modules/lodash.pick')
   * await client.wait(() => typeof require('lodash.pick'))
   * console.log(result)
   * {
   *   name: 'lodash.pick',
   *   path: '/home/user/project/node_modules/lodash.pick/index.js',
   *   bundle: '/home/user/project/node_modules/lodash.pick/.hoctail/bundle.js'
   * }
   *
   * // install a package from node_modules with a different name
   * await client.install('./node_modules/lodash.pick', 'lodash-pick')
   * await client.wait(() => typeof require('lodash-pick'))
   *
   * // install js file as a package
   * await client.install('./myFile.js', null, null, { name: 'my-package', version: 1.0.0, description: 'my package', ... })
   * await client.wait(() => require('my-package'))
   *
   * @public
   * @param {string} [src] - src package dir or entry-point .js file, default: .
   * @param {any} [options] - install options, additional `rollup` options if needed, can be omitted
   * @param {string} [name] - server-side package name, optional
   * @param {object} [pkg] - optional package metadata (as in `package.json`)
   * @return {Promise<module:nodejs~NodeClient.InstalledItem>}
   */
  async install (src, options, name, pkg) {
    src = resolve(src || process.cwd())
    if (typeof name === 'object') {
      pkg = name
      name = options
      options = null
    }
    if (typeof options === 'string') {
      name = options
      options = null
    }
    options = Object.assign( { onwarn: (warn) => console.error(warn.message) }, options)
    const config = await pack(src, this, options)
    if (!pkg) {
      pkg = config.pkg
    }
    if (!name) {
      name = pkg.name
    }
    // restart the app before changing the package
    // if we restart after, user cannot fix bugs in startup/setup of their package
    await this.restartApp()
    await this.call('npm.install', name, readFileSync(config.output.file).toString(), pkg)
    return {
      name,
      path: config.input.input,
      bundle: config.output.file,
    }
  }

  /**
   * Create and install bundle to a 'mini' app type.
   * @param {string} filePath path to js file to bundle or path to bundle
   * @param {boolean} [bundled=false] set true if filePath is already bundled
  */
  async installMini (filePath, bundled = false) {
    await this._ensureApp()
    console.log(`${chalk.green(`Will update 'mini' app → `)} ${chalk.cyan(this.app)} :\n`)
    if(await checkAppType(this, 'mini')) {
      let bundledName
      if (bundled) bundledName = filePath
      else {
        const bundles = await rollupBundle(
          filePath,
          path.resolve(__dirname, '..', 'rollup.mini.config.js'),
        )
        if (bundles.length) {
          const { fileName } = bundles[0]
          bundledName = fileName
        }
      }
      await putFile (this, bundledName, '/miniapp.js')
    }
  }

  /**
   * Upload and install expressjs app
   * @example
   * await client.serve('./server.js')
   *
   * @public
   * @param [src] - src package dir or entry-point .js file, default: .
   * @param [options] - install options, additional `rollup` options if needed
   * @returns {Promise<{name: string, path: string}>} path: local src path, name: package name on server
   */
  async serve (src, options) {
    return this.install(src, options, './server')
  }

  /**
   * Get the latest logs from server
   * @public
   * @param {number} [latestLogsNumber]
   * @param {string|number} [logLevel] - highest log level to get, {@see NodeClient.LOG}
   * @return {Promise<Array<string>>} log lines as array of strings
  */
  async tailLogs (latestLogsNumber = 10, logLevel) {
    logLevel = NodeClient.paseLogLevel(logLevel)
    if (!Number.isSafeInteger(latestLogsNumber) || Math.abs(latestLogsNumber) !== latestLogsNumber) {
      throw new Error(`Number of log lines should be integer > 0`)
    }
    const logs = await this.query(
      `with t as (select ts, ord, severity, message from logs where severity >= $1
                    order by ts desc, ord desc limit ${latestLogsNumber}
                 )
                 select ts, severity, message from t order by ts, ord`,
      [logLevel])
    return logs.map(({ ts, severity, message }) =>
      `${ts.toISOString()} ${NodeClient.LOG[severity]} ${JSON.stringify(message)}`)
  }

  /**
   * Get http logs for server or client
   * @example
   * // server log entry
   * await client.tailHttpLogs('server')
   [{
      req_ts: 2021-04-22T08:32:08.942Z,
      res_ts: 2021-04-22T08:32:09.560Z,
      req_id: 'ce95a208-0d94-48b8-8dc7-4636dbf24de0',
      res_id: 'e284f327-a61e-4abe-a60a-126a9287c338',
      method: 'POST',
      path: '/login',
      req_headers: {
        host: 'localhost:3000',
        connection: 'close',
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': '27',
        'accept-encoding': 'gzip, deflate'
      },
      status: 302,
      reason: 'Found',
      res_headers: {
        vary: 'Accept',
        location: '/',
        'set-cookie': [Array],
        'content-type': 'text/plain; charset=utf-8',
        'x-powered-by': 'Express',
        'content-length': '23'
      },
      req_data: 'username=tj&password=foobar',
      res_data: 'Found. Redirecting to F'
   }]
   * // client log entry
   * await client.tailHttpLogs('client')
   [{
    req_ts: 2021-04-22T08:32:17.629Z,
    res_ts: 2021-04-22T08:32:18.546Z,
    req_id: '41a38c45-675e-4a1d-97aa-57cf1a2dab8c',
    res_id: '7f608139-441d-4d0d-abe9-87e94e294806',
    request: {
      method: 'GET',
      path: '/',
      host: 's3.us-east-1.amazonaws.com',
      hostname: 's3.us-east-1.amazonaws.com',
      port: 443,
      protocol: 'https:',
      headers: [Object]
    },
    response: {
      httpVersionMajor: 1,
      httpVersionMinor: 1,
      httpVersion: '1.1',
      headers: [Object],
      statusCode: 200,
      statusMessage: 'OK'
    },
    req_data: '',
    res_data: '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Owner><ID>aaaa11111fffffddddd23432q</ID><DisplayName>user</DisplayName></Owner><Buckets><Bucket><Name>my-bucket</Name><CreationDate>2021-04-01T17:27:21.000Z</CreationDate></Bucket></Buckets></ListAllMyBucketsResult>',
    req_error: null,
    res_error: null
   }]
   * @public
   * @param {('client'|'server')} type - 'server' or 'client' logs
   * @param {number} [latestLogsNumber] - number of log lines, only the 1 last request by default
   * @param {...string} [cols] - optional: names of columns
   * @return {Promise<Array<*>>} log objects as an Array
   */
  async tailHttpLogs (type, latestLogsNumber = 1, ...cols) {
    let table = 'http_srv_log'
    switch (type) {
      case 'server':
        table = 'http_srv_log'
        break
      case 'client':
        table = 'http_client_log'
    }
    if (cols.length > 0 && cols.indexOf('req_ts') === -1) {
      cols.unshift('req_ts')
    }
    const fields = cols.length > 0 ? cols.join(', ') : '*'
    const logs = await this.query(
      `with l as (
                select ${fields} from "${table}" order by req_ts desc limit ${latestLogsNumber}
            ) select * from l order by req_ts asc`)
    return logs.map(entry => {
      if (entry.req_data) {
        entry.req_data = _uintToString(entry.req_data)
      }
      if (entry.res_data) {
        entry.res_data = _uintToString(entry.res_data)
      }
      return entry
    })
  }

  /**
   * Copy a file or directory to server (filesystem)
   * Files can be accessed from the `express` app using the usual `fs` module
   * Each app has its own root filesystem and usually starts in `/`, unless `process.cwd()` is used
   * @example
   * await client.copy('./dir')
   * // ./dir/file -> /dir/file
   *
   * await client.copy('./dir/')
   * // ./dir/file -> /file
   *
   * await client.copy('./dir/file')
   * // ./dir/file -> /file
   *
   * await client.copy('./localDir', '/remoteDir')
   * // ./localDir/file -> /remoteDir/localDir/file
   *
   * await client.copy('./localDir/', '/remoteDir')
   * // ./localDir/file -> /remoteDir/file
   *
   * @public
   * @param {string} src - source file or dir (local)
   * @param {string} dst - destination path (remote)
   * @return {Promise<string[]>} - destination paths
   */
  async copy (src, dst = '/') {
    let cwd, srcPath
    if (src.endsWith('/')) {
      cwd = src
      srcPath = '.'
    } else {
      cwd = dirname(src)
      srcPath = basename(src)
    }
    // create a `tar.gz` file stream with all the file attributes
    const tarStream = tar.create({ cwd, gzip: true } , [srcPath])
    const buffer = await new Response(tarStream).buffer()
    // sends the stream to `untar()` on server
    return this.wait('untar', buffer, dst)
  }
}

function _uintToString(uintArray) {
  if (uintArray == null) {
    return null
  }
  return decoder.end(Buffer.from(uintArray))
}

/**
 * Init default connection options from config files and env vars
 * @public
 * @param {UserOptions} [options] - additional user-supplied options
 * @return {Client.ClientOptions} options for `@hoctail/query` constructor
 */
function initOptions (options= {}) {
  const baseURL = options.baseURL || options.endpoint || process.env.HOCTAIL_ENDPOINT || 'wss://api.hoctail.io'
  const key = options.key || process.env.HOCTAIL_API_KEY
  const app = options.app || process.env.HOCTAIL_APP
  let logLevel = options.logLevel || process.env.HOCTAIL_LOG_LEVEL
  const schema = app != null ? null : 'public'
  if (!baseURL) {
    throw new Error(`No endpoint defined, check config`)
  }
  return Object.assign({}, options, { baseURL, key, app, schema, logLevel })
}

/**
 * Parse app string
 * @param {string} appName - application name string
 * @return {{owner: string|undefined, name: string}} app {owner, name} tuple
 * @public
 */
function parseApp (appName) {
  let [owner, name] = appName.split('/')
  if (name == null) {
    name = owner
    owner = undefined
  }
  return {
    owner,
    name,
  }
}

module.exports = {
  NodeClient,
  initOptions,
  parseApp,
}
