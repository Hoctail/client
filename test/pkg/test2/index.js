import { foo, bar } from './foo'

export function call () {
  bar()
  return foo()
}
