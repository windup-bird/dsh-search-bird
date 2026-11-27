/**
 * The browser half: one card on the Plugins settings page.
 *
 * It reads and writes the Host plugin entry's Config through the settings
 * domain's own form controller (`configForms`), so values persist exactly like
 * a hand-edited profile patch, and the volatile fields apply without a plugin
 * restart.
 *
 * The card ships its own stylesheet instead of importing the UI primitives:
 * the declarations below are copied from the host's switch, text field, select,
 * field row and button modules, with only `--dsw-*` token references kept, so
 * the card follows the theme (including light/dark) without depending on a
 * private module table. Classes are prefixed `sb-` so they cannot collide.
 */

window.__ModuleLoader__.load({
  id: 'search-bird',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const module = { exports: {} }
    const exports = module.exports

    /** Host plugin entry id — also the settings namespace. */
    const NS = 'search-bird'
    /** Dictionary namespace owned by this card. */
    const LOCALE_NS = 'searchBird'
    /** Read-only status resource the Host registers. */
    const STATUS_PATH = '/api/search-bird/status'

    const ENGINES = [
      { id: 'bing', region: 'cn', label: 'Bing' },
      { id: 'baidu', region: 'cn', label: 'Baidu' },
      { id: 'so360', region: 'cn', label: '360 Search' },
      { id: 'sogou', region: 'cn', label: 'Sogou' },
      { id: 'ddg', region: 'global', label: 'DuckDuckGo' },
      { id: 'google', region: 'global', label: 'Google' },
    ]

    const VERTICALS = [
      { id: 'github', prefix: 'gh', label: 'GitHub' },
      { id: 'crates', prefix: 'crate', label: 'crates.io' },
      { id: 'npm', prefix: 'npm', label: 'npm' },
      { id: 'pypi', prefix: 'pypi', label: 'PyPI' },
      { id: 'stackoverflow', prefix: 'so', label: 'Stack Overflow' },
      { id: 'arxiv', prefix: 'paper', label: 'arXiv', defaultEnabled: false },
    ]

    const LIMITS = [5, 8, 10, 15, 20]

    /** Defaults mirrored from the Host Config, for a partial or missing value. */
    const DEFAULT_ENGINES = {
      bing: true,
      baidu: true,
      so360: true,
      sogou: false,
      ddg: true,
      google: false,
    }

    /** Accept either a plain value or a live (volatile) schema node. */
    function plain(value, fallback) {
      if (value !== null && typeof value === 'object' && typeof value.get === 'function') {
        const live = value.get()
        return live === undefined ? fallback : live
      }
      return value === undefined || value === null ? fallback : value
    }

    const zh = {
      title: '搜索小鸟',
      description: '大陆引擎优先直连，海外引擎走可配置的 Clash 代理；编程源用前缀，例如 crate: serde。',
      providerActive: '已是 web_search 的搜索来源',
      providerInactive: '当前搜索来源不是本插件',
      providerUnknown: '无法读取当前搜索来源',
      enginesTitle: '网页引擎',
      verticalsTitle: '编程源',
      verticalsHint: '在搜索词前加前缀就只查这个源，例如 crate: serde。不带前缀时走普通网页搜索。',
      proxyTitle: '代理',
      proxyLabel: '代理地址',
      proxyHint: '大陆引擎始终直连；海外引擎在「自动」下优先走代理，代理不可达时自动跳过。',
      proxyPlaceholder: 'http://127.0.0.1:7897',
      apply: '应用',
      applied: '已应用',
      modeLabel: '海外引擎通路',
      modeAuto: '自动',
      modeAlways: '始终走代理',
      modeNever: '从不走代理',
      regionCn: '大陆直连',
      regionGlobal: '需代理',
      engineNever: '尚未运行',
      engineFailed: '失败',
      resultsLabel: '每次返回条数',
      resultsTitle: '结果',
      instantHint: '改动立即生效，无需重启。',
      unreachable: '不可达',
      reachable: '可达',
      probing: '检测中…',
      unavailable: '状态接口不可用',
      credentialHint: '若状态一直不可用，代理是否需要先启动？',
      openPage: '插件页面',
    }

    const en = {
      title: 'Search Bird',
      description: 'Mainland engines go direct, the rest use a Clash proxy; prefix a query for developer sources, e.g. crate: serde.',
      providerActive: 'Serving web_search',
      providerInactive: 'Another provider serves web_search',
      providerUnknown: 'Cannot read the active provider',
      enginesTitle: 'Web engines',
      verticalsTitle: 'Developer sources',
      verticalsHint: 'Prefix a query to search one source only, e.g. crate: serde. Plain queries stay on the open web.',
      proxyTitle: 'Proxy',
      proxyLabel: 'Proxy address',
      proxyHint:
        'Mainland engines always go direct. Global engines prefer the proxy in auto mode and fall back when it is unreachable.',
      proxyPlaceholder: 'http://127.0.0.1:7897',
      apply: 'Apply',
      applied: 'Applied',
      modeLabel: 'Global route',
      modeAuto: 'Auto',
      modeAlways: 'Always proxy',
      modeNever: 'Never proxy',
      regionCn: 'Mainland',
      regionGlobal: 'Needs proxy',
      engineNever: 'Not run yet',
      engineFailed: 'Failed',
      resultsLabel: 'Results per search',
      resultsTitle: 'Results',
      instantHint: 'Changes apply immediately, no restart.',
      unreachable: 'Unreachable',
      reachable: 'Reachable',
      probing: 'Checking…',
      unavailable: 'Status endpoint unavailable',
      credentialHint: 'If this stays unavailable, is the proxy running?',
      openPage: 'plugin page',
    }

    /** Declarations copied from the host's switch, field, input and button modules. */
    const CSS = `
.sb-root{display:flex;flex-direction:column;gap:14px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);min-width:0}
.sb-status{display:flex;align-items:center;gap:8px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.sb-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.sb-dot[data-on=true]{background:var(--dsw-alias-state-success-primary)}
.sb-dot[data-on=false]{background:var(--dsw-alias-state-warn-primary)}
.sb-section{display:flex;flex-direction:column;min-width:0}
.sb-title{margin:0 0 2px;font-size:12px;font-weight:600;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.sb-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:12px 0}
.sb-row+.sb-row,.sb-row+.sb-field,.sb-field+.sb-row,.sb-field+.sb-field{border-top:.5px solid var(--dsw-alias-border-l2)}
.sb-rowMain{display:flex;flex-direction:column;gap:2px;min-width:0}
.sb-line{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.sb-name{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}
.sb-badge{flex:none;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;white-space:nowrap}
.sb-meta{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);min-width:0}
.sb-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}
.sb-label{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}
.sb-inline{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sb-hint{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.sb-ok{color:var(--dsw-alias-state-success-primary)}
.sb-bad{color:var(--dsw-alias-state-error-primary)}
.sb-input{box-sizing:border-box;flex:1 1 200px;min-width:0;height:34px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}
.sb-input::placeholder{color:var(--dsw-alias-label-dimmed)}
.sb-input:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.sb-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.sb-select{box-sizing:border-box;height:34px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.5}
.sb-select:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.sb-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;padding:0 10px;border:.5px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;box-shadow:inset 0 0 0 var(--dsh-hairline-width,.5px) var(--dsh-button-outline-color,var(--dsw-alias-border-l3));color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.sb-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.sb-button:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.sb-button:disabled{cursor:not-allowed;opacity:.4}
.sb-button:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.sb-switch{box-sizing:border-box;position:relative;flex:none;width:36px;height:20px;padding:2px;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer}
.sb-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary)}
.sb-switch:disabled{cursor:default;opacity:.5}
.sb-switch:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.sb-thumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);transition:transform .12s ease}
.sb-switch[aria-checked=false] .sb-thumb{background:var(--dsw-alias-switch-thumb)}
.sb-switch[aria-checked=true] .sb-thumb{transform:translate(16px)}
`

    function Toggle(props) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          className: 'sb-switch',
          'aria-checked': props.checked,
          'aria-label': props.label,
          disabled: props.disabled,
          onClick: () => props.onChange(!props.checked),
        },
        h('span', { className: 'sb-thumb' }),
      )
    }

    function statusText(t, last) {
      if (last === null || last === undefined) return t('engineNever')
      if (last.ok === true) return `${last.ms}ms · ${last.count}`
      return `${t('engineFailed')}：${String(last.error ?? '').slice(0, 40)}`
    }

    function SearchCard(props) {
      const { t } = props
      // The Plugins page may hand us its own form for this entry; that is the
      // authoritative read/write surface. Fall back to our own controller when
      // the host renders the card without one.
      const provided = props.form !== undefined && props.form !== null ? props.form : null
      const api = props.searchBird
      const ownState = React.useSyncExternalStore(api.subscribe, api.snapshot, api.snapshot)
      const state = provided !== null ? provided.state : ownState

      const [draft, setDraft] = React.useState(null)
      const [justSaved, setJustSaved] = React.useState(false)
      const [status, setStatus] = React.useState(null)
      const [statusError, setStatusError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)

      const value = state !== null && state !== undefined ? state.value : undefined
      const writable = state === null || state === undefined ? false : state.writable !== false

      const refresh = React.useCallback(async () => {
        try {
          const response = await fetch(STATUS_PATH, {
            headers: { accept: 'application/json' },
            cache: 'no-store',
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          setStatus(await response.json())
          setStatusError(null)
        } catch (error) {
          setStatus(null)
          setStatusError(error instanceof Error ? error.message : String(error))
        }
      }, [])

      React.useEffect(() => {
        refresh()
        const timer = setInterval(refresh, 20000)
        return () => clearInterval(timer)
      }, [refresh])

      if (props.view === 'summary') return t('description')
      if (value === undefined || value === null) {
        return h('div', { className: 'sb-root' }, h('style', { key: 'sb-css' }, CSS), h('p', { className: 'sb-hint' }, t('probing')))
      }

      const engines = plain(value.engines, {}) ?? {}
      const enabledOf = (id) =>
        typeof engines[id] === 'boolean' ? engines[id] : DEFAULT_ENGINES[id] === true
      const verticals = plain(value.verticals, {}) ?? {}
      const verticalEnabled = (id) =>
        typeof verticals[id] === 'boolean'
          ? verticals[id]
          : VERTICALS.find((item) => item.id === id)?.defaultEnabled !== false
      const proxyUrl = draft === null ? String(plain(value.proxyUrl, '')) : draft
      const proxyMode = String(plain(value.proxyMode, 'auto'))
      const maxResults = String(plain(value.maxResults, 8))
      const health = status !== null && status.proxy !== null ? status.proxy : null
      const active =
        status !== null && status.provider === 'search-bird' && status.selectedProvider === 'search-bird'

      // Call through the owner so a method-shaped `mutate` keeps its receiver.
      const mutate =
        provided !== null ? (ops) => provided.mutate(ops) : (ops) => api.form.mutate(ops)

      const write = async (path, next) => {
        setBusy(true)
        try {
          await mutate([{ op: 'set', path, value: next }])
          setJustSaved(true)
          setTimeout(() => setJustSaved(false), 1600)
          refresh()
        } finally {
          setBusy(false)
        }
      }

      const commitProxy = () => {
        write(['proxyUrl'], proxyUrl).then(() => setDraft(null))
      }

      const healthLabel =
        health === null
          ? null
          : health.error !== null && health.error !== undefined
            ? health.error
            : health.health === null || health.health === undefined
              ? null
              : health.health.ok
                ? `${t('reachable')} ${health.health.ms}ms`
                : t('unreachable')

      return h(
        'div',
        { className: 'sb-root' },
        h('style', { key: 'sb-css' }, CSS),

        // Provider status line.
        h(
          'div',
          { className: 'sb-status' },
          h('span', {
            className: 'sb-dot',
            'data-on': status === null ? 'idle' : active ? 'true' : 'false',
          }),
          h(
            'span',
            { className: active ? 'sb-ok' : undefined },
            status === null
              ? t('providerUnknown')
              : active
                ? t('providerActive')
                : t('providerInactive'),
          ),
        ),

        // Web engines.
        h(
          'section',
          { className: 'sb-section' },
          h('h3', { className: 'sb-title' }, t('enginesTitle')),
          ...ENGINES.map((engine) => {
            const entry =
              status === null ? null : (status.engines ?? []).find((item) => item.id === engine.id)
            const last = entry === null || entry === undefined ? null : entry.last
            return h(
              'div',
              { key: engine.id, className: 'sb-row' },
              h(
                'div',
                { className: 'sb-rowMain' },
                h(
                  'div',
                  { className: 'sb-line' },
                  h('span', { className: 'sb-name' }, engine.label),
                  h(
                    'span',
                    { className: 'sb-badge' },
                    engine.region === 'cn' ? t('regionCn') : t('regionGlobal'),
                  ),
                ),
                h('span', { className: 'sb-meta' }, statusText(t, last)),
              ),
              h(Toggle, {
                checked: enabledOf(engine.id),
                disabled: !writable || busy,
                label: engine.label,
                onChange: (next) =>
                  write(
                    ['engines'],
                    Object.fromEntries(
                      ENGINES.map((item) => [item.id, item.id === engine.id ? next : enabledOf(item.id)]),
                    ),
                  ),
              }),
            )
          }),
        ),

        // Developer sources reached through a query prefix.
        h(
          'section',
          { className: 'sb-section' },
          h('h3', { className: 'sb-title' }, t('verticalsTitle')),
          ...VERTICALS.map((vertical) => {
            const entry =
              status === null
                ? null
                : (status.verticals ?? []).find((item) => item.id === vertical.id)
            const last = entry === null || entry === undefined ? null : entry.last
            return h(
              'div',
              { key: vertical.id, className: 'sb-row' },
              h(
                'div',
                { className: 'sb-rowMain' },
                h(
                  'div',
                  { className: 'sb-line' },
                  h('span', { className: 'sb-name' }, vertical.label),
                  h('span', { className: 'sb-badge' }, `${vertical.prefix}:`),
                ),
                h('span', { className: 'sb-meta' }, statusText(t, last)),
              ),
              h(Toggle, {
                checked: verticalEnabled(vertical.id),
                disabled: !writable || busy,
                label: vertical.label,
                onChange: (next) =>
                  write(
                    ['verticals'],
                    Object.fromEntries(
                      VERTICALS.map((item) => [
                        item.id,
                        item.id === vertical.id ? next : verticalEnabled(item.id),
                      ]),
                    ),
                  ),
              }),
            )
          }),
          h('p', { className: 'sb-hint' }, t('verticalsHint')),
        ),

        // Proxy.
        h(
          'section',
          { className: 'sb-section' },
          h('h3', { className: 'sb-title' }, t('proxyTitle')),
          h(
            'div',
            { className: 'sb-field' },
            h(
              'div',
              { className: 'sb-inline' },
              h('span', { className: 'sb-label' }, t('proxyLabel')),
              healthLabel === null
                ? null
                : h(
                    'span',
                    {
                      className:
                        health.health !== null &&
                        health.health !== undefined &&
                        health.health.ok
                          ? 'sb-hint sb-ok'
                          : 'sb-hint sb-bad',
                    },
                    healthLabel,
                  ),
            ),
            h(
              'div',
              { className: 'sb-inline' },
              h('input', {
                type: 'text',
                className: 'sb-input',
                value: proxyUrl,
                placeholder: t('proxyPlaceholder'),
                spellCheck: false,
                disabled: !writable || busy,
                onChange: (event) => setDraft(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') commitProxy()
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'sb-button',
                  disabled: !writable || busy,
                  onClick: commitProxy,
                },
                justSaved ? t('applied') : t('apply'),
              ),
            ),
            h(
              'div',
              { className: 'sb-inline' },
              h('span', { className: 'sb-label' }, t('modeLabel')),
              h(
                'select',
                {
                  className: 'sb-select',
                  value: proxyMode,
                  disabled: !writable || busy,
                  onChange: (event) => write(['proxyMode'], event.target.value),
                },
                h('option', { value: 'auto' }, t('modeAuto')),
                h('option', { value: 'always' }, t('modeAlways')),
                h('option', { value: 'never' }, t('modeNever')),
              ),
            ),
            h('p', { className: 'sb-hint' }, t('proxyHint')),
            statusError === null
              ? null
              : h(
                  'p',
                  { className: 'sb-hint sb-bad' },
                  `${t('unavailable')}：${statusError}`,
                  ' ',
                  t('credentialHint'),
                ),
          ),
        ),

        // Result budget.
        h(
          'section',
          { className: 'sb-section' },
          h('h3', { className: 'sb-title' }, t('resultsTitle')),
          h(
            'div',
            { className: 'sb-field' },
            h(
              'div',
              { className: 'sb-inline' },
              h('span', { className: 'sb-label' }, t('resultsLabel')),
              h(
                'select',
                {
                  className: 'sb-select',
                  value: maxResults,
                  disabled: !writable || busy,
                  onChange: (event) => write(['maxResults'], Number(event.target.value)),
                },
                ...LIMITS.map((limit) => h('option', { key: limit, value: String(limit) }, String(limit))),
              ),
            ),
          ),
        ),

        h('p', { className: 'sb-hint' }, t('instantHint')),
      )
    }

    function apply(ctx) {
      const t = ctx.locale.bind(LOCALE_NS)
      ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'search-bird: dictionaries')

      const form = ctx.configForms.get(NS)
      const face = {
        form,
        subscribe: (listener) => form.subscribe(listener),
        snapshot: () => form.getSnapshot(),
      }

      ctx.effect(
        () =>
          ctx.configForms.whileServed([NS], () =>
            ctx.slots.inject('plugins.item', () =>
              ctx.slots.register(
                {
                  name: 'plugins.item',
                  id: 'search-bird',
                  order: 30,
                  label: () => t('title'),
                  locale: LOCALE_NS,
                  inject: () => ({ searchBird: face }),
                },
                SearchCard,
              ),
            ),
          ),
        'search-bird: settings card',
      )
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale', 'remote', 'configForms']
    return module.exports
  },
})
