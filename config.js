const dotEnv = require('dotenv')
const expand = require('dotenv-expand')
const config = dotEnv.config()
expand(config)
