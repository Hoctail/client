const { findPkgDir } = require('../src/utils')
const path = require('path')
const fs = require('fs')
const SourceMapConsumer = require('source-map').SourceMapConsumer

/**
 * Mock list of packages available in the sandbox
 * @type {string[]}
 */
const listOfPackages = [
  'fs',
  'tar',
  'https',
  'http',
  'node-fetch',
  'mobx',
  'mobx-state-tree',
  'etag',
  'ejs',
  '@hoc/utils',
  '@hoc/models',
  '@hoctail/patch-interface',
  '@hoc/http-server',
  'express',
  '@hoc/email',
  'nodemailer',
  '@hoc/common',
  'buffer',
  'assert',
  'constants',
  'string_decoder',
  'util',
  'timers',
  'process',
  'stream',
  'path',
  'crypto',
  'events',
  'uuidv4',
  'vm',
  'os',
  'punycode',
  'querystring',
  'sys',
  'tty',
  'url',
  'zlib',
  'child_process',
  'cluster',
  'dgram',
  'dns',
  'inspector',
  'module',
  'net',
  'perf_hooks',
  'readline',
  'repl',
  'tls',
  'http2',
]

/**
 * Mock client to get package list
 * @type {{call(string, ...[*]): Promise<*[]|undefined>}}
 */
const client = {
  async call (query, ...params) {
    if (query === 'npm.installed') {
      return listOfPackages
    }
  },
}

/**
 * Find a line/index position by offset from the string start
 * @param {number} offset
 * @param {string} string
 * @return {[number, number]}
 */
function lineNumberByOffset (offset, string) {
  const re = /^[\S\s]/gm
  // lines start from 1 in `source-map` positions
  let line = 1
  let lastRowIndex = 0
  let match
  while ((match = re.exec(string))) {
    if (match.index > offset) break
    lastRowIndex = match.index
    line++
  }
  return [Math.max(line - 1, 1), lastRowIndex]
}

/**
 * Find all line/column positions for a specific regex
 * @param {RegExp} regex
 * @param {string} source
 * @return {Array<{ line: number, column: number, [string]: *}>}
 */
const findPositions = (regex, source) => {
  regex = new RegExp(regex.source, 'gm')
  let match
  const result = []
  while ((match = regex.exec(source))) {
    const position = lineNumberByOffset(regex.lastIndex, source)
    result.push({
      match,
      line: position[0],
      column: regex.lastIndex - position[1] - match[0].length,
    })
  }
  return result
}

const reSourceMap = /^data:application\/json[^,]+base64,/

/**
 * Extract SourceMapURL comment from source code
 * @param {string} source
 * @return {string}
 */
function retrieveSourceMapURL (source) {
  const fileData = fs.readFileSync(source).toString()
  const reSourceMappingURL =
    /(?:\/\/[@#][\s]*sourceMappingURL=([^\s'"]+)[\s]*$)|(?:\/\*[@#][\s]*sourceMappingURL=([^\s*'"]+)[\s]*(?:\*\/)[\s]*$)/mg
  // Keep executing the search to find the *last* sourceMappingURL to avoid
  // picking up sourceMappingURLs from comments, strings, etc.
  let lastMatch, match
  while (match = reSourceMappingURL.exec(fileData)) lastMatch = match
  if (!lastMatch) return null
  return lastMatch[1]
}

/**
 * Resolve relative source-map url if any
 * @param {string} file
 * @param {string} url
 * @return {string}
 */
function supportRelativeURL (file, url) {
  if (!file) return url
  const dir = path.dirname(file)
  const match = /^\w+:\/\/[^\/]*/.exec(dir)
  let protocol = match ? match[0] : ''
  const startPath = dir.slice(protocol.length)
  if (protocol && /^\/\w\:/.test(startPath)) {
    // handle file:///C:/ paths
    protocol += '/'
    return protocol + path.resolve(dir.slice(protocol.length), url).replace(/\\/g, '/')
  }
  return protocol + path.resolve(dir.slice(protocol.length), url)
}

/**
 * Read and de-serialize source map
 * @param {string} source
 * @return {null|{map: string, url: string}}
 */
function retrieveSourceMap (source) {
  let sourceMappingURL = retrieveSourceMapURL(source)
  if (!sourceMappingURL) return null

  // Read the contents of the source map
  let sourceMapData
  if (reSourceMap.test(sourceMappingURL)) {
    // Support source map URL as a data url
    const rawData = sourceMappingURL.slice(sourceMappingURL.indexOf(',') + 1)
    sourceMapData = Buffer.from(rawData, 'base64').toString()
    sourceMappingURL = source
  } else {
    // Support source map URLs relative to the source URL
    sourceMappingURL = supportRelativeURL(source, sourceMappingURL)
    sourceMapData = fs.readFileSync(sourceMappingURL).toString()
  }

  if (!sourceMapData) {
    return null
  }

  return {
    url: sourceMappingURL,
    map: sourceMapData,
  }
}

/**
 * Check if position-like arguments match exactly
 * @param {Object} pos1
 * @param {Object} pos2
 */
function matchPositions (pos1, pos2) {
  expect({ line: pos1.line, column: pos1.column })
    .toStrictEqual({ line: pos2.line, column: pos2.column })
}

/**
 * Verify that a specific position in bundle can be traced exactly to the correct position in source
 * Essentially validates an invariant: `sourceMap.originalPosition(bundlePosition) === sourcePosition`
 * @param {Object} config
 * @param {RegExp} codeMatch
 */
function verifySourcePos (config, codeMatch) {
  const bundle = fs.readFileSync(config.output.file).toString()
  const map = retrieveSourceMap(config.output.file).map
  const bundlePos = findPositions(codeMatch, bundle)[0]
  const origPos = new SourceMapConsumer(map).originalPositionFor(bundlePos)
  expect(origPos.source).toBeTruthy()
  const pkgDir = findPkgDir(config.input.input)
  const srcPath = path.join(pkgDir, origPos.source.split(path.sep).splice(1).join(path.sep))
  const sourcePos = findPositions(codeMatch, fs.readFileSync(srcPath).toString())[0]
  expect(bundlePos).toBeTruthy()
  expect(sourcePos).toBeTruthy()
  matchPositions(sourcePos, origPos)
}

module.exports = {
  client,
  verifySourcePos,
}
