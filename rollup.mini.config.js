import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import { banner, footer, iifeArgs } from './common.config'

export default {
  input: 'index.js',
  output: {
    file: './.bundle.mini.js',
    format: 'iife',
    name: 'miniApp',
    banner: banner,
    footer: footer,
    exports: 'default',
    globals: iifeArgs,
  },
  external: Object.keys(iifeArgs),
  plugins: [
    resolve({
      mainFields: ['module', 'jsnext', 'main'],
    }), 
    json(),
    commonjs(),
  ],
}
