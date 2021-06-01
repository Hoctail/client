const { pack } = require('../src/utils')
const { client, verifySourcePos } = require('./mocks')
const path = require('path')

describe('pack', () => {
  it('one script', async () => {
    const source = path.join(__dirname, './pkg/test1/single.js')
    const config = await pack(source, client)
    verifySourcePos(config, /function noop1/)
  })
  it('package', async () => {
    const source = path.join(__dirname, './pkg/test1')
    const config = await pack(source, client)
    verifySourcePos(config, /function noop/)
  })
  it('package nested', async () => {
    const source = path.join(__dirname, './pkg/test2')
    const config = await pack(source, client)
    verifySourcePos(config, /function call/)
    verifySourcePos(config, /function foo/)
    verifySourcePos(config, /function bar/)
  })
})
