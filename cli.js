#!/usr/bin/env node
const config = require('./config')
const { Cli } = require('.')

const cli = new Cli(config.parsed)
cli.setup()
cli.run()
