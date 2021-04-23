#!/usr/bin/env node
require('./config')
const { Cli } = require('.')

const cli = new Cli()
cli.setup()
cli.run()
