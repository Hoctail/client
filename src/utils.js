const path = require('path')
const os = require('os')
const fs = require('fs')
const { rollup } = require('rollup')
const json = require('@rollup/plugin-json')
const commonjs = require('@rollup/plugin-commonjs')
const { nodeResolve } = require('@rollup/plugin-node-resolve')
const { createFilter } = require('@rollup/pluginutils')
const pkgUp = require('pkg-up')
const MagicString = require('magic-string')
const mime = require('mime-types')
const loadConfigFile = require('rollup/dist/loadConfigFile')

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
 * @param {Object} client - client instance
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
  return path.join(dir, '.hoctail', 'bundle.js')
}

const outputPlugin = {
  name: 'hoctail-output',
  async generateBundle (options, bundle) {
    const filter = createFilter(options.include, options.exclude)
    Object.keys(bundle).forEach(id => {
      if (filter(id)) {
        const magicString = new MagicString(bundle[id].code)
        magicString.prepend('(function (){ ')
        magicString.append('})()\n')
        bundle[id].code = magicString.toString()
      }
    })
  },
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
        outputPlugin,
      ],
      external: installed,
    },
    output: {
      file: outFile,
      format: 'cjs',
      exports: 'auto',
      sourcemap: 'inline',
      sourcemapPathTransform: sourcePath => sourcePath.replace(
        `..${path.sep}`,
        `${pkg.name}${path.sep}`
      )
    },
    pkg,
  }
}

/**
 * Bundle the entry point with rollup
 * @param {string} main - main entry point dir or file
 * @param {Object} client - client to use for server queries
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

async function rollupBundle (inputPath, rollupConfigPath) {
  let { options, warnings } = await loadConfigFile(rollupConfigPath)
  warnings.flush()
  options = options[0]

  const pkgDir = findPkgDir(inputPath)
  // use inputPath or 'main' from package.json
  let pkg = pkgDir
    ? require(path.join(pkgDir, 'package.json')) || {}
    : {}
  options.input = inputPath || pkg.main

  // options is an array of "inputOptions" objects with an additional "output"
  // property that contains an array of "outputOptions".
  // The following will generate all outputs for all inputs, and write them to disk the same
  // way the CLI does it:
  const res = []
  const bundle = await rollup(options)
  for (const idx in options.output) {
    const outputOptions = options.output[idx]
    const files = await bundle.write(outputOptions)
    files.output.forEach(async (artefact, pieceIdx) => {
      const { fileName, code } = artefact
      res.push(artefact)
      console.log(`bundle size: ${code.length} bytes ${!pieceIdx ? '' : '. Won\'t upload this file.' }`)
    })
  }
  bundle.close()
  return res
}

async function putFile (client, filePath, url, content_type) {
  const data = fs.readFileSync(filePath)
  content_type = content_type || mime.lookup(filePath)
  await client.tx(async (tx) => {
    await tx.call(`http_server.put`, url, content_type, data)
  })
}

/**
 * Check if app type is the same as requested by user
 * @param {NodeClient} client
 * @param {string} appTypeRequired
 * @returns {Promise<void>}
 * @private
 */
 async function checkAppType (client, appTypeRequired) {
  const appType = await client.getAppType()
  const res = appType === appTypeRequired
  if (!res) {
    console.warn(
      `Error: Bad app type: '${appType}', expected '${
        appTypeRequired}'. Create new '${appTypeRequired
        }' app or change type of existing one.`)
  }
  return res
}

module.exports = {
  pack,
  findPkgDir,
  rollupBundle,
  putFile,
  checkAppType,
}
