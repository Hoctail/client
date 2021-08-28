const { resolve, join, dirname, basename } = require('path')
const os = require('os')
const { readFileSync, realpathSync, writeFileSync } = require('fs')
const repl = require('repl')
const commander = require('commander')
const { spawn } = require('child_process')
const chalk = require('chalk')
const updateNotifier = require('update-notifier')
const { findPkgDir, rollupBundle } = require('./utils')
const path = require('path')

const { NodeClient } = require('./NodeClient')

const _path = resolve(__dirname)
const pkg = require(join(_path, '..', 'package.json'))
updateNotifier({ pkg }).notify()

/**
 * @callback CliCommand
 * @param {NodeClient} client - client to use for the command
 * @param {...*} [args] - arguments to the command action
 * @return Promise<void>
 * @protected
 */

/**
 *
 */
class Cli {
  /**
   * @constructor
   */
  constructor (config) {
    this.program = new commander.Command()
    this.program
      .version(pkg.version)
      .name('hoctail')
      .option('--endpoint <endpoint_url>', 'Hoctail Endpoint url, env: HOCTAIL_ENDPOINT')
      .option('--key <api_key>', 'Hoctail API key, env: HOCTAIL_API_KEY')
      .option('--app <app_name>', `Hoctail app name, format: 'owner/name', env: HOCTAIL_APP`)
      .option('--log-level <log_level>', 'Minimal log level, default: LOG, env: HOCTAIL_LOG_LEVEL')
      .option('--opts <items>', `comma separated list. Supported values:
      \t\t\tdryrun - works with 'mini' command. Create bundle and skip submission.
      \t\t\treact - works with 'mini' command. Bundle with react & styled-components.
      \t\t\tbundled - works with 'mini' command. Provide prepared bundle.
      `, val => {
        const res = {}
        val.split(',').map(s => s.trim().toLowerCase()).forEach(key => {
          res[key] = true
        })
        return res
      })
    this.config = config || {}
  }

  /**
   * Setup the cli arguments/options
   */
  setup () {
    this._setupEnv()
    this._setupServe()
    this._setupInstall()
    this._setupMini()
    this._setupRepl()
  }

  /**
   * Run the cli command
   */
  run () {
    this.program.parseAsync(process.argv).catch((e) => {
      console.error(e.message)
      process.exit(1)
    })
  }

  /**
   * Helper for wrapping common commands
   * @param {CliCommand} command
   * @param {boolean} withClient
   * @return {function(...[*]): Promise<void>}
   */
  _wrap (command, withClient=true) {
    return async (...args) => {
      const cmdObj = args[args.length - 1]
      const client = withClient ? await this.createClient(cmdObj) : null
      try {
        await command(client, ...args)
        if (withClient) {
          await client.close()
        }
        process.exit(0)
      } catch (e) {
        console.error(e.message)
        process.exit(1)
      }
    }
  }

  /**
   * Create a new client
   * @param {commander.Command} cmdObj
   * @return {Promise<NodeClient>}
   * @protected
   */
  async createClient (cmdObj) {
    const client = new NodeClient(cmdObj.parent, cmdObj.args)
    if (!client.token) {
      throw new Error(`No api key was found, use HOCTAIL_API_KEY env variable`)
    }
    if (client.logLevel < NodeClient.LOG.LOG) {
      console.error(`Using endpoint: ${client.url} ...`)
    }
    if (!client.app) {
      throw new Error(`Please define --app or use HOCTAIL_APP env variable`)
    }
    return client
  }

  /**
   * Install a local package/file into remote app
   * @param {NodeClient} client
   * @param {string} path - local path to entry point (file/dir)
   * @param {string} name - remote package name
   * @param {Object} [pkg] - package info (from package.json)
   * @returns {Promise<void>}
   * @protected
   */
  async _install (client, path, name, pkg) {
    const options = {
      onwarn: (warning) => console.warn('  ' + chalk.yellow(warning.message))
    }
    const app = await client.install(path, options, name, pkg)
    console.log('  ' + chalk.cyan(`${app.path} → ${app.name}\n`))
  }

  /**
   * Add the `install` command
   * @protected
   */
  _setupInstall () {
    const action = this._wrap(async (client, path, serverPath) => {
      try {
        console.log('')
        await client._ensureApp()
        console.log(`${chalk.green('Will install → ')} ${chalk.cyan(client.app)} :\n`)
        let pkg
        const pkgDir = findPkgDir(path)
        if (!serverPath) {
          pkg = require(join(pkgDir, 'package.json'))
          serverPath = pkg.name
        }
        await this._install(client, path, serverPath, pkg)
      } catch (e) {
        console.error(e.stack)
        throw e
      }
    })
    this.program
      .command('install <path> [serverPath]')
      .description(
        `install a local npm pkg/module on server, optionally use a server path
        \t\t\texamples:
        \t\t\t  ${this.program.name()} install ./index.js : install a package from an entrypoint file
        \t\t\t  ${this.program.name()} install some-package : install a local npm package
        \t\t\t  ${this.program.name()} install ./module.js ./module : install a local entrypoint as require('./module')`)
      .action(action)
  }

  _setupMini () {
    // if dryrun specified then we have no client
    const action = this._wrap(async (client, filePath, cmdObj) => {
      const { opts } = cmdObj.parent
      try {
        await client.installMini(filePath, opts)
      } catch (e) {
        console.error(e.stack)
        throw e
      }
    })
    this.program
      .command('mini <path>')
      .description(`install UI app type = 'mini'. path - is path to single js file or npm package.
      \t\t\tif --opts=dryrun specified it will only create a bundle.
      \t\t\tif --opts=react when having explicit react dependencies.
      \t\t\tif --opts=bundled just upload provided bundle.
      \t\t\texamples:
      \t\t\t  ${this.program.name()} mini ./index.js : use single js file
      \t\t\t  ${this.program.name()} mini some-package : use a local npm module`)
      .action(action)
  }

  /**
   * Add the `serve` command
   * @protected
   */
  _setupServe () {
    const action = this._wrap(async (client, path) => {
      try {
        console.log('')
        await client._ensureApp()
        console.log(`${chalk.green('Will serve at → ')} ${chalk.cyan(client.app)} :\n`)
        await this._install(client, path, './server')
        const url = await client.wait(() => { return require('@hoc/http-server').url() })
        console.log(`${chalk.green('Your app is serving at:')} ${chalk.cyan(url)}\n`)
      } catch (e) {
        console.error(e.stack)
        throw e
      }
    })
    this.program
      .command('serve [path]')
      .description('serve a local `expressjs` app on server, default: [path] = .')
      .action(action)
  }

  /**
   * Add the default repl command
   * @protected
   */
  _setupRepl () {
    const action = async (script, cmdObj) => {
      if (!process.execArgv.includes('--experimental-repl-await')) {
        const args = []
        args.push(...process.execArgv, '--experimental-repl-await', ...process.argv.slice(1))
        spawn(process.argv[0], args, { stdio: 'inherit' })
      } else {
        let replServer
        let client
        try {
          client = await this.createClient(cmdObj)
          try {
            await client.connect()
          } catch (e) {
            console.error(e.message)
            process.exit(1)
          }
        } catch (err) {
          this.program.outputHelp()
          console.error('\nError:')
          throw err
        }

        function die () {
          if (!script) {
            console.error(`Exiting...`)
          }
          const t = setTimeout(() => {
            process.exit(0)
          }, 5000)
          client.terminate(1001, 'User interrupt').then(() => {
            clearTimeout(t)
            process.exit(0)
          })
        }

        process.on('SIGINT', die.bind(null))
        process.on('SIGTERM', die.bind(null))
        client.argv = cmdObj.args.slice(script ? 1 : 0)
        if (script) {
          const fileData = readFileSync(script).toString('utf8')
          const scriptDir = realpathSync(dirname(script))
          const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
          // should not try to `init_schema` if there is no app (ex. `public`)
          if (client.app) {
            await client._ensureApp()
          }
          const scriptFunc = new AsyncFunction('hoctail', '__dirname', '__filename', 'require', 'process', fileData)
          scriptFunc(client, scriptDir, join(scriptDir, basename(script)), require, process)
            .then(() => die())
            .catch(err => {
              console.error(err)
              die()
            })
        } else {
          const prompt = await _getPrompt(client)
          replServer = _launchRepl(client, prompt)
          replServer.on('exit', die.bind(null))
        }
      }
    }
    this.program
      .command('repl [script]', { isDefault: true })
      .allowUnknownOption()
      .description('launch repl')
      .action(action)
    this.program.on('--help', () => {
      console.log('')
      console.log('Simple call will launch repl:')
      console.log('  $ hoctail')
      console.log('  hoctail> ')
    })
  }

  /**
   * Get the local env vars from .env parser
   * @returns {Object<string, string>}
   * @private
   */
  _getEnv () {
    const env = {}
    for (let [k, v] of Object.entries(this.config)) {
      k = k.toUpperCase()
      if (!k.startsWith('HOCTAIL_')) {
        env[k] = v
      }
    }
    return env
  }

  /**
   * Add the `env` command
   * @protected
   */
  _setupEnv () {
    const action = this._wrap(async (client, cmd) => {
      try {
        await client._ensureApp()
        const remote = await client.getEnv()
        const local = this._getEnv()
        switch (cmd) {
          case 'push': {
            await client.setEnv(local)
            for (const k of Object.keys(remote)) {
              if (local[k] == null) {
                await client.delEnv(k)
              }
            }
            console.log(await client.getEnv())
          }
            break
          case 'pull': {
            const conf = []
            for (let [k, v] of Object.entries(this.config)) {
              if (k.startsWith('HOCTAIL_')) {
                conf.push(`${k}='${v}'`)
              }
            }
            for (let [k, v] of Object.entries(remote)) {
              conf.push(`${k}='${v}'`)
            }
            writeFileSync(resolve(process.cwd(), '.env'), conf.join('\n') + '\n')
            console.log(remote)
          }
            break
          case 'show': {
            console.log(remote)
          }
            break
          default:
            throw new Error(`Unknown env command: ${cmd}`)
        }
      } catch (e) {
        console.error(e.stack)
        throw e
      }
    })
    this.program
      .command('env <cmd>')
      .description(
        `manipulate env variables
        \t\t\texamples:
        \t\t\t  ${this.program.name()} env show : show all the remote app env variables
        \t\t\t  ${this.program.name()} env push : replace app env variables with the contents of local .env file
        \t\t\t  ${this.program.name()} env pull : download remote app variables to a local .env file
        `)
      .action(action)
  }
}

/**
 * Customize repl prompt
 * @param {NodeClient} rClient
 * @return {Promise<string>}
 * @private
 */
async function _getPrompt (rClient) {
  const user = await rClient.user()
  let app = rClient.app ? `@${rClient.app}` : ''
  let username = user.username
  if (username.includes('@')) {
    username = `[${username}]`
  }
  if (app.startsWith(`@${user.username}/`)) {
    app = app.replace(/.*\//, '@')
  }
  return `${username}${app}> `
}

/**
 * Launch repl server
 * @param {NodeClient} client
 * @param {string} prompt
 * @return {REPLServer}
 * @private
 */
function _launchRepl (client, prompt) {
  const r = repl.start({
    prompt,
    breakEvalOnSigint: true,
  })
  r.context.hoctail = client
  r.defineCommand('sql', {
    help: 'Run SQL query',
    action (query) {
      this.clearBufferedCommand()
      client.query(query).then(res => {
        console.dir(res, { depth: null })
      }).catch(e => {
        console.error(e)
      }).finally(() => this.displayPrompt())
    }
  })
  r.defineCommand('logs', {
    help: 'Get last N log lines, N=5 by default, optionally specify the log level, default: LOG',
    action (arg) {
      let [num, logLevel] = arg.replace(/,/gi, ' ').split(/\s+/)
      num = num ? Number.parseInt(num) : 5
      this.clearBufferedCommand()
      client.tailLogs(num, logLevel).then(logs => {
        logs.forEach(logLine => console.dir(logLine, { depth: null }))
      }).catch(e => {
        console.error(e)
      }).finally(() => this.displayPrompt())
    }
  })
  r.defineCommand('http_server_log', {
    help: 'Get last N http-server requests, N=1 by default, optionally specify columns list',
    action (arg) {
      _readHttpLogs.call(this, arg, 'server', client)
    }
  })
  r.defineCommand('http_client_log', {
    help: 'Get last N http-client (fetch) requests, N=1 by default, optionally specify columns list',
    action (arg) {
      _readHttpLogs.call(this, arg, 'client', client)
    }
  })
  r.defineCommand('relations', {
    help: 'Get tables/view',
    action (num) {
      this.clearBufferedCommand()
      client.wait(() => hoc.schema).then(appSchema => {
        client.call('public.relations').then(relations => {
          relations.forEach(({ schemaname, relationname, type }) => {
            const table = schemaname === appSchema ?
              quote_ident(relationname)
              : `${quote_ident(schemaname)}.${quote_ident(relationname)}`
            console.log(`${type}\t${table}`)
          })
        }).catch(e => {
          console.error(e)
        }).finally(() => this.displayPrompt())
      }).catch(e => {
        console.error(e)
      }).finally(() => this.displayPrompt())
    }
  })
  if (typeof r.setupHistory === 'function') {
    // let's setup cli history file
    const historyPath = process.env.HOCTAIL_HISTORY || join(os.homedir(), '.hoctail.history')
    r.setupHistory(historyPath, (err) => {
      if (err) {
        console.log(chalk.yellow('WARN: cannot setup history file: ' + err.message))
      }
    })
  }
  return r
}

/**
 * Read client/server http logs
 * @param {string} arg
 * @param {('server'|'client')} type
 * @param {NodeClient} client
 * @private
 */
function _readHttpLogs (arg, type, client) {
  this.clearBufferedCommand()
  let [num, ...cols] = arg.replace(/,/gi, '').split(' ')
  num = num ? parseInt(num) : 1
  client.tailHttpLogs(type, num, ...cols).then(logs => {
    logs.forEach(logLine => console.dir(logLine, { depth: null }))
  }).catch(e => {
    console.error(e)
  }).finally(() => this.displayPrompt())
}

const reIdent = /^[a-z_][a-z0-9_$]*$/i

/**
 * Quote identifier
 * @param {string} ident
 * @returns {string}
 * @private
 */
function quote_ident (ident) {
  if (reIdent.exec(ident)) {
    return ident
  }
  return `"${ident}"`
}

module.exports = {
  Cli,
}
