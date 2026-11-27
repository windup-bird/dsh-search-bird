/**
 * The browser half: one card on the Plugins settings page.
 *
 * It reads and writes the Host plugin entry's Config through the settings
 * domain's own form controller (`configForms`), so values persist exactly like
 * a hand-edited profile patch, and the volatile fields apply without a plugin
 * restart. Engine switches write immediately; the proxy address is a text field
 * committed with its own button.
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
      title: '轻量搜索',
      description: '大陆引擎优先直连，海外引擎走可配置的 Clash 代理。',
      providerActive: '已成为 web_search 的搜索来源',
      providerInactive: '当前搜索来源不是本插件',
      providerUnknown: '无法读取当前搜索来源',
      proxyTitle: '代理',
      proxyHint: '大陆引擎始终直连；海外引擎在「自动」下优先走代理，代理不可达时自动跳过。',
      proxyPlaceholder: 'http://127.0.0.1:7897',
      apply: '应用',
      applied: '已应用',
      modeLabel: '海外引擎通路',
      modeAuto: '自动',
      modeAlways: '始终走代理',
      modeNever: '从不走代理',
      enginesTitle: '引擎',
      regionCn: '大陆直连',
      regionGlobal: '需代理',
      engineNever: '尚未运行',
      engineFailed: '失败',
      engineOk: '正常',
      verticalsTitle: '编程源',
      verticalsHint: '在搜索词前加前缀就只查这个源，例如 crate: serde。不带前缀时走普通网页搜索。',
      limitsTitle: '结果',
      resultsLabel: '每次返回条数',
      instantHint: '改动立即生效，无需重启。',
      unreachable: '不可达',
      reachable: '可达',
      probing: '检测中…',
      unavailable: '状态接口不可用',
      readFailed: '读取失败',
      credentialHint: '若状态一直不可用，代理是否需要先启动？',
    }

    const en = {
      title: 'Lightweight search',
      description: 'Mainland engines go direct; the rest use a configurable Clash proxy.',
      providerActive: 'Serving web_search',
      providerInactive: 'Another provider serves web_search',
      providerUnknown: 'Cannot read the active provider',
      proxyTitle: 'Proxy',
      proxyHint:
        'Mainland engines always go direct. Global engines prefer the proxy in auto mode and fall back when it is unreachable.',
      proxyPlaceholder: 'http://127.0.0.1:7897',
      apply: 'Apply',
      applied: 'Applied',
      modeLabel: 'Global route',
      modeAuto: 'Auto',
      modeAlways: 'Always proxy',
      modeNever: 'Never proxy',
      enginesTitle: 'Engines',
      regionCn: 'Mainland',
      regionGlobal: 'Needs proxy',
      engineNever: 'Not run yet',
      engineFailed: 'Failed',
      engineOk: 'OK',
      verticalsTitle: 'Developer sources',
      verticalsHint: 'Prefix a query to search one source only, e.g. crate: serde. Plain queries stay on the open web.',
      limitsTitle: 'Results',
      resultsLabel: 'Results per search',
      instantHint: 'Changes apply immediately, no restart.',
      unreachable: 'Unreachable',
      reachable: 'Reachable',
      probing: 'Checking…',
      unavailable: 'Status endpoint unavailable',
      readFailed: 'Read failed',
      credentialHint: 'If this stays unavailable, is the proxy running?',
    }

    const styles = {
      root: { display: 'grid', gap: '16px', fontSize: '13px', lineHeight: 1.5, color: 'inherit' },
      section: { display: 'grid', gap: '8px' },
      heading: {
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)',
      },
      row: { display: 'flex', alignItems: 'center', gap: '10px' },
      spread: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' },
      name: { fontWeight: 550 },
      meta: { fontSize: '11.5px', color: 'var(--dsw-alias-label-secondary)' },
      badge: {
        borderRadius: '999px',
        padding: '1px 7px',
        fontSize: '11px',
        border: '1px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
        whiteSpace: 'nowrap',
      },
      input: {
        boxSizing: 'border-box',
        flex: '1 1 220px',
        minWidth: '160px',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '8px',
        background: 'transparent',
        color: 'inherit',
        padding: '6px 10px',
        font: 'inherit',
        fontSize: '12.5px',
      },
      button: {
        appearance: 'none',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '8px',
        background: 'transparent',
        color: 'inherit',
        padding: '5px 11px',
        font: 'inherit',
        fontSize: '12px',
        cursor: 'pointer',
      },
      select: {
        boxSizing: 'border-box',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '8px',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'inherit',
        padding: '5px 8px',
        font: 'inherit',
        fontSize: '12.5px',
      },
      track: (checked, disabled) => ({
        appearance: 'none',
        position: 'relative',
        flex: '0 0 auto',
        width: '34px',
        height: '20px',
        borderRadius: '999px',
        border: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        background: checked ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l2)',
        transition: 'background 120ms ease',
      }),
      knob: (checked) => ({
        position: 'absolute',
        top: '2px',
        left: '2px',
        width: '16px',
        height: '16px',
        borderRadius: '999px',
        background: 'var(--dsw-alias-bg-base)',
        transform: checked ? 'translateX(14px)' : 'none',
        transition: 'transform 120ms ease',
      }),
      hint: { fontSize: '11.5px', color: 'var(--dsw-alias-label-secondary)' },
      ok: { color: 'var(--dsw-alias-state-success-primary)' },
      warn: { color: 'var(--dsw-alias-state-warn-primary)' },
      bad: { color: 'var(--dsw-alias-state-error-primary)' },
    }

    function Toggle(props) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': props.checked,
          'aria-label': props.label,
          disabled: props.disabled,
          onClick: () => props.onChange(!props.checked),
          style: styles.track(props.checked, props.disabled),
        },
        h('span', { style: styles.knob(props.checked) }),
      )
    }

    function statusText(t, last) {
      if (last === null || last === undefined) return t('engineNever')
      if (last.ok === true) return `${last.ms}ms · ${last.count}`
      return `${t('engineFailed')}：${String(last.error ?? '').slice(0, 48)}`
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
        return h('div', { style: styles.hint }, statusError === null ? t('probing') : t('unavailable'))
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
      const active = status !== null && status.provider === 'search-bird' && status.selectedProvider === 'search-bird'

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

      return h(
        'div',
        { style: styles.root },

        // Provider status line.
        h(
          'div',
          { style: styles.row },
          h('span', { style: active ? styles.ok : styles.warn }, active ? '●' : '○'),
          h(
            'span',
            { style: styles.hint },
            status === null ? t('providerUnknown') : active ? t('providerActive') : t('providerInactive'),
          ),
        ),

        // Engines.
        h(
          'div',
          { style: styles.section },
          h('div', { style: styles.heading }, t('enginesTitle')),
          ...ENGINES.map((engine) => {
            const entry =
              status === null ? null : (status.engines ?? []).find((item) => item.id === engine.id)
            const last = entry === null || entry === undefined ? null : entry.last
            return h(
              'div',
              { key: engine.id, style: styles.spread },
              h(
                'div',
                { style: styles.row },
                h('span', { style: styles.name }, engine.label),
                h('span', { style: styles.badge }, engine.region === 'cn' ? t('regionCn') : t('regionGlobal')),
                h('span', { style: styles.meta }, statusText(t, last)),
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
          'div',
          { style: styles.section },
          h('div', { style: styles.heading }, t('verticalsTitle')),
          ...VERTICALS.map((vertical) => {
            const entry =
              status === null
                ? null
                : (status.verticals ?? []).find((item) => item.id === vertical.id)
            const last = entry === null || entry === undefined ? null : entry.last
            return h(
              'div',
              { key: vertical.id, style: styles.spread },
              h(
                'div',
                { style: styles.row },
                h('span', { style: styles.name }, vertical.label),
                h('span', { style: styles.badge }, `${vertical.prefix}:`),
                h('span', { style: styles.meta }, statusText(t, last)),
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
          h('div', { style: styles.hint }, t('verticalsHint')),
        ),

        // Proxy.
        h(
          'div',
          { style: styles.section },
          h('div', { style: styles.heading }, t('proxyTitle')),
          h(
            'div',
            { style: styles.row },
            h('input', {
              type: 'text',
              value: proxyUrl,
              placeholder: t('proxyPlaceholder'),
              spellCheck: false,
              disabled: !writable || busy,
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                if (event.key !== 'Enter') return
                write(['proxyUrl'], proxyUrl).then(() => setDraft(null))
              },
              style: styles.input,
            }),
            h(
              'button',
              {
                type: 'button',
                disabled: !writable || busy,
                onClick: () => write(['proxyUrl'], proxyUrl).then(() => setDraft(null)),
                style: styles.button,
              },
              justSaved ? t('applied') : t('apply'),
            ),
            health === null
              ? null
              : h(
                  'span',
                  { style: health.health !== null && health.health !== undefined && health.health.ok ? styles.ok : styles.bad },
                  health.error !== null && health.error !== undefined
                    ? health.error
                    : health.health === null || health.health === undefined
                      ? ''
                      : health.health.ok
                        ? `${t('reachable')} ${health.health.ms}ms`
                        : t('unreachable'),
                ),
          ),
          h(
            'div',
            { style: styles.row },
            h('span', { style: styles.hint }, t('modeLabel')),
            h(
              'select',
              {
                value: proxyMode,
                disabled: !writable || busy,
                onChange: (event) => write(['proxyMode'], event.target.value),
                style: styles.select,
              },
              h('option', { value: 'auto' }, t('modeAuto')),
              h('option', { value: 'always' }, t('modeAlways')),
              h('option', { value: 'never' }, t('modeNever')),
            ),
          ),
          h('div', { style: styles.hint }, t('proxyHint')),
          statusError === null
            ? null
            : h(
                'div',
                { style: styles.bad },
                `${t('unavailable')}：${statusError}`,
                ' ',
                h('span', { style: styles.hint }, t('credentialHint')),
              ),
        ),

        // Result budget.
        h(
          'div',
          { style: styles.section },
          h('div', { style: styles.heading }, t('limitsTitle')),
          h(
            'div',
            { style: styles.row },
            h('span', { style: styles.hint }, t('resultsLabel')),
            h(
              'select',
              {
                value: maxResults,
                disabled: !writable || busy,
                onChange: (event) => write(['maxResults'], Number(event.target.value)),
                style: styles.select,
              },
              ...LIMITS.map((limit) => h('option', { key: limit, value: String(limit) }, String(limit))),
            ),
          ),
        ),

        h('div', { style: styles.hint }, t('instantHint')),
      )
    }

    function apply(ctx) {
      const t = ctx.locale.bind(LOCALE_NS)
      ctx.effect(
        () => ctx.locale.register(LOCALE_NS, { zh, en }),
        'search-bird: dictionaries',
      )

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
