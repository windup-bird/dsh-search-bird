/**
 * Settings-card smoke test without a browser.
 *
 * `client.js` is a module-loader artifact that expects `window` and `react` from
 * the page. This harness supplies a minimal React surface (no re-renders are
 * needed: the card derives everything from the form snapshot) and renders the
 * registered component to markup, which catches the failures that would blank
 * the Plugins page entry.
 *
 * Run with `node test/card.mjs`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

/** The smallest React surface the card uses. */
function createReactStub() {
  function createElement(type, props, ...children) {
    return { type, props: { ...(props ?? {}), children }, key: props?.key }
  }
  return {
    createElement,
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useSyncExternalStore: (_subscribe, getSnapshot, getServerSnapshot) =>
      (getServerSnapshot ?? getSnapshot)(),
  }
}

/** Render an element tree to markup, invoking function components. */
function renderToString(element) {
  if (element === null || element === undefined || element === false || element === true) return ''
  if (typeof element === 'string' || typeof element === 'number') return String(element)
  if (Array.isArray(element)) return element.map(renderToString).join('')
  if (element.type === undefined) return ''

  const { type, props } = element
  if (typeof type === 'function') return renderToString(type(props))

  const attributes = []
  for (const key of ['role', 'aria-checked', 'aria-label', 'type', 'value']) {
    if (props[key] !== undefined) attributes.push(`${key}="${String(props[key])}"`)
  }
  const open = `<${type}${attributes.length > 0 ? ` ${attributes.join(' ')}` : ''}>`
  return `${open}${renderToString(props.children ?? [])}</${type}>`
}

/** Depth-first collect of elements matching a predicate. */
function collect(element, predicate, found = []) {
  if (element === null || element === undefined || typeof element !== 'object') return found
  if (Array.isArray(element)) {
    for (const item of element) collect(item, predicate, found)
    return found
  }
  if (predicate(element)) found.push(element)
  const { type, props } = element
  if (typeof type === 'function') {
    collect(type(props), predicate, found)
    return found
  }
  collect(props?.children ?? [], predicate, found)
  return found
}

// ---- Harness: capture the module the loader registers ----------------------

let captured = null
const sandbox = {
  window: {
    __ModuleLoader__: {
      load: ({ id, factory }) => {
        const react = createReactStub()
        captured = {
          id,
          exports: factory((name) => {
            if (name === 'react') return react
            throw new Error(`unexpected module: ${name}`)
          }),
        }
      },
    },
  },
  fetch: async () => {
    throw new Error('offline in this test')
  },
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  console,
}
vm.createContext(sandbox)
vm.runInContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), sandbox)

record('module registered', captured !== null && captured.id === 'search-bird', captured?.id)
assert.ok(captured !== null)

const exports = captured.exports
record(
  'required services injected',
  Array.isArray(exports.inject) &&
    ['slots', 'locale', 'remote', 'configForms'].every((name) => exports.inject.includes(name)),
  exports.inject?.join(', '),
)

// ---- Fake client context ---------------------------------------------------

const config = {
  engines: { bing: true, baidu: true, so360: true, sogou: false, ddg: true, google: false },
  proxyUrl: 'http://127.0.0.1:7897',
  proxyMode: 'auto',
  maxResults: 8,
}

const writes = []
const form = {
  getSnapshot: () => ({ status: 'ready', writable: true, revision: 4, value: config }),
  subscribe: () => () => {},
  set: async (field, value) => {
    writes.push([field, value])
    return true
  },
  mutate: async (ops) => {
    writes.push(['mutate', ops])
    return true
  },
}

const registrations = []
const dictionaries = []
const ctx = {
  effect: (fn) => {
    fn()
  },
  locale: {
    bind: () => (key) => key,
    register: (ns, dicts) => {
      dictionaries.push([ns, dicts])
      return () => {}
    },
  },
  configForms: {
    get: () => form,
    whileServed: (_namespaces, register) => {
      check(register(new Set(['search-bird'])) !== undefined)
    },
  },
  slots: {
    inject: (_key, callback) => callback(),
    register: (options, Component) => {
      registrations.push({ options, Component })
      return () => {}
    },
  },
}
function check(value) {
  return value
}

exports.apply(ctx)

record('one card registered', registrations.length === 1, registrations[0]?.options?.id)
record(
  'card targets the plugins page',
  registrations[0]?.options?.name === 'plugins.item' &&
    registrations[0]?.options?.id === 'search-bird' &&
    registrations[0]?.options?.order === 30,
)
record('dictionaries registered', dictionaries.length > 0 && dictionaries[0][1].zh !== undefined)

// ---- Render -----------------------------------------------------------------

const { Component, options } = registrations[0]
const { searchBird: face } = options.inject()
const tree = Component({
  searchBird: face,
  t: (key) => key,
  view: 'page',
})
const markup = renderToString(tree)

record('renders without throwing', markup.length > 200, `${markup.length} chars`)
for (const label of ['Bing', 'Baidu', '360 Search', 'Sogou', 'DuckDuckGo', 'Google', 'GitHub', 'crates.io', 'npm', 'PyPI', 'Stack Overflow', 'arXiv']) {
  record(`shows ${label}`, markup.includes(`>${label}<`))
}
record('shows twelve switches', (markup.match(/role="switch"/g) ?? []).length === 12)
record('shows the proxy field', markup.includes('http://127.0.0.1:7897'))
record('shows action and mode labels', markup.includes('>apply<') && markup.includes('>modeAlways<'))
record(
  'shows source prefixes',
  ['gh:', 'crate:', 'npm:', 'pypi:', 'so:', 'paper:'].every((prefix) => markup.includes(`>${prefix}<`)),
)
record(
  'reflects configured switches',
  markup.includes('aria-checked="true"') && markup.includes('aria-checked="false"'),
)

// ---- Writes -----------------------------------------------------------------

// Fallback path: no host-provided form, so the injected controller is used.
{
  const switches = collect(tree, (element) => element?.props?.role === 'switch')
  record('all switches reachable', switches.length === 12, String(switches.length))
  const before = writes.length
  await switches[5].props.onClick() // Google, default off
  const op = writes.slice(before).at(-1)
  record(
    'toggle writes through the injected form',
    op?.[0] === 'mutate' &&
      op[1][0]?.op === 'set' &&
      op[1][0]?.path?.[0] === 'engines' &&
      op[1][0]?.value?.google === true,
    JSON.stringify(op?.[1]?.[0]?.value ?? op),
  )
}

// Host-provided form wins when the Plugins page passes one.
{
  const ownerWrites = []
  const ownerForm = {
    state: form.getSnapshot(),
    mutate: async (ops) => {
      ownerWrites.push(ops)
      return true
    },
  }
  const ownerTree = Component({
    searchBird: face,
    form: ownerForm,
    t: (key) => key,
    view: 'page',
  })
  const switches = collect(ownerTree, (element) => element?.props?.role === 'switch')
  await switches[3].props.onClick() // Sogou, default off
  record(
    'toggle writes through the host form',
    ownerWrites.length === 1 &&
      ownerWrites[0][0]?.op === 'set' &&
      ownerWrites[0][0]?.value?.sogou === true,
    JSON.stringify(ownerWrites[0]?.[0]?.value?.sogou),
  )
  record(
    'host form keeps other switches unchanged',
    ownerWrites[0][0]?.value?.google === false && ownerWrites[0][0]?.value?.bing === true,
  )
}

// A developer source writes the verticals map, not the engines map.
{
  const before = writes.length
  const switches = collect(tree, (element) => element?.props?.role === 'switch')
  await switches[6].props.onClick() // GitHub, first vertical
  const op = writes.slice(before).at(-1)
  record(
    'vertical toggle writes verticals',
    op?.[0] === 'mutate' &&
      op[1][0]?.path?.[0] === 'verticals' &&
      op[1][0]?.value?.github === false &&
      op[1][0]?.value?.crates === true,
    JSON.stringify(op?.[1]?.[0]?.value ?? op),
  )
}

// Summary view used by the Plugins page row.
const summary = Component({ searchBird: face, t: (key) => key, view: 'summary' })
record('summary view', summary === 'description', String(summary))

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length > 0) assert.fail(`${failed.length} card checks failed`)
