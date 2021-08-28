import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import babel from '@rollup/plugin-babel'
import globals from 'rollup-plugin-node-globals'
import builtins from 'rollup-plugin-node-builtins'
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
    babel({
      exclude: /node_modules/,
      plugins: [
        ['inline-react-svg'],
        ['@babel/plugin-transform-react-jsx'],
        ['@babel/plugin-proposal-class-properties', { loose: true }],
        ['transform-modern-regexp'],
      ],
      babelHelpers: 'bundled',
    }),
    json(),
    commonjs(),
    globals(),
    builtins(),
  ],
}
