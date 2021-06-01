import barFunc from './bar'

export function foo () {
  bar()
  return 42
}

export const bar = barFunc
