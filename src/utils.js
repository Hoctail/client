const path = require('path')
const os = require('os')
const fs = require('fs')
const { rollup } = require('rollup')
const json = require('@rollup/plugin-json')
const commonjs = require('@rollup/plugin-commonjs')
const { nodeResolve } = require('@rollup/plugin-node-resolve')
const pkgUp = require('pkg-up')
const { NodeClient } = require('./NodeClient')

/**
 * Rollup types {@link https://rollupjs.org/guide/en/}
 * @external rollup
 * @property InputOptions - [Rollup.InputOptions]{@link https://rollupjs.org/guide/en/#inputoptions-object} object
 * @property OutputOptions - [Rollup.OutputOptions]{@link https://rollupjs.org/guide/en/#outputoptions-object} object
 */

/**
 * Cache for the default package list on server
 * @type {string[]}
 * @private
 */
let installed

/**
 * Load existing/installed packages from server
 * @param {NodeClient|NodeClient.Tx} client - client instance
 * @return {Promise<void>}
 * @private
 * @async
 */
async function _loadInstalled (client) {
  if (installed) {
    return
  }
  try {
    installed = (await client.call('npm.installed', true)).filter(item => !item.startsWith('.'))
  } catch (e) {
    console.log(e)
  }
}

/**
 * Get bundle output path
 * @param {string} dir - package directory
 * @return {string} bundle path
 * @private
 */
function _getOutputPath (dir) {
  return path.join(dir, '.hoctail', 'server.js')
}

/**
 * Create a typical rollup config for bundling server-side modules
 * @param {string} main - path to an entry point, can be a directory with package.json or an actual entry point .js file
 * @return {{ input: external:rollup.InputOptions, output: external:rollup.OutputOptions, pkg: Object|null }}
 * @private
 */
function _getConfig (main) {
  if (!installed) {
    throw new Error(`Externals are not loaded yet`)
  }
  /**
   * @type {string}
   */
  let entryPoint
  let outFile
  let pkg
  if (!fs.existsSync(main)) {
    throw new Error(`Path ${main} doesn't exist`)
  }
  if (fs.lstatSync(main).isDirectory()) {
    const pkgPath = path.join(main, 'package.json')
    if (!fs.existsSync(pkgPath)) {
      throw new Error(`Path ${pkgPath} doesn't exist`)
    }
    pkg = require(pkgPath)
    const pkgDir = path.dirname(pkgPath)
    entryPoint = require.resolve(pkgDir)
    if (!entryPoint) {
      throw new Error(`Cannot find an entry point in ${pkgPath}`)
    }
    entryPoint = path.resolve(pkgDir, entryPoint)
    outFile = _getOutputPath(main)
  } else {
    entryPoint = main
    const pkgDir = findPkgDir(main)
    if (pkgDir) {
      outFile = _getOutputPath(pkgDir)
      const pkgPath = path.join(pkgDir, 'package.json')
      pkg = require(pkgPath)
    } else {
      outFile = _getOutputPath(os.tmpdir())
      pkg = null
    }
  }
  entryPoint = path.resolve(entryPoint)
  if (!fs.existsSync(entryPoint)) {
    throw new Error(`Entry point ${entryPoint} doesn't exist`)
  }
  return {
    input: {
      input: entryPoint,
      plugins: [
        json(),
        nodeResolve({
          mainFields: ['module', 'jsnext', 'main'],
          exportConditions: ['node'],
        }),
        commonjs(),
      ],
      external: installed,
    },
    output: {
      file: outFile,
      format: 'cjs',
      exports: 'auto',
      sourcemap: 'inline',
    },
    pkg,
  }
}

/**
 * Bundle the entry point with rollup
 * @param {string} main - main entry point dir or file
 * @param {NodeClient|NodeClient.Tx} client - client to use for server queries
 * @param {*} [options] - additional rollup options
 * @return {Promise<{{ input: external:rollup.InputOptions, output: external:rollup.OutputOptions }}>} resulting config
 * @async
 */
async function pack (main, client, options) {
  try {
    await _loadInstalled(client)
  } catch (e) {
    throw new Error(`Could not load existing packages: ${e.stack}`)
  }
  const config = Object.assign({}, _getConfig(main), options)
  const bundle = await rollup(config.input)
  await bundle.write(config.output)
  return config
}

/**
 * Find a package dir from an entry point
 * @param {string} main - main entry point dir or file
 * @return {string|null} root dir of the package
 */
function findPkgDir (main) {
  if (!fs.existsSync(main)) {
    throw new Error(`Path ${main} doesn't exist`)
  }
  let cwd = main
  if (!fs.lstatSync(main).isDirectory()) {
    cwd = path.dirname(main)
  }
  const pkgPath = pkgUp.sync({ cwd })
  return pkgPath ? path.dirname(pkgPath) : null
}

module.exports = {
  pack,
  findPkgDir,
}
