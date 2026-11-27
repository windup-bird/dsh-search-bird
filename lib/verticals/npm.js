/**
 * npm registry search, coding vertical.
 */

import { truncate } from '../html.js'

export default {
  id: 'npm',
  prefix: 'npm',
  label: 'npm',
  description: 'JavaScript packages by name or keyword',

  buildUrl(query) {
    const url = new URL('https://registry.npmjs.org/-/v1/search')
    url.searchParams.set('text', query)
    url.searchParams.set('size', '8')
    return url.href
  },

  parse(text) {
    const data = JSON.parse(text)
    const objects = Array.isArray(data.objects) ? data.objects : []
    return objects.map((entry) => {
      const pkg = entry.package ?? {}
      const version = pkg.version === undefined ? '' : `v${pkg.version}`
      const description = typeof pkg.description === 'string' ? pkg.description : ''
      return {
        title: String(pkg.name ?? ''),
        url: `https://www.npmjs.com/package/${pkg.name}`,
        snippet: truncate([version, description].filter((part) => part !== '').join(' · '), 260),
      }
    }).filter((item) => item.title !== '')
  },
}
