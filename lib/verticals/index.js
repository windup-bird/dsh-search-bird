/**
 * Coding verticals and the query routing that reaches them.
 *
 * A vertical is a single non-web source (a registry, a code host, a Q&A site,
 * a paper index). They are reached through a source prefix inside the ordinary
 * `web_search` query rather than a new tool, so an agent preset that keeps a
 * deliberately small tool set stays small.
 */

import github from './github.js'
import crates from './crates.js'
import npm from './npm.js'
import pypi from './pypi.js'
import stackoverflow from './stackoverflow.js'
import arxiv from './arxiv.js'

export const VERTICALS = [github, crates, npm, pypi, stackoverflow, arxiv]

export const VERTICAL_BY_ID = new Map(VERTICALS.map((vertical) => [vertical.id, vertical]))

export const VERTICAL_BY_PREFIX = new Map(
  VERTICALS.map((vertical) => [vertical.prefix, vertical]),
)

/** `prefix: the rest` — the only form that selects a vertical explicitly. */
const PREFIX = /^\s*([a-z]+)\s*:\s*([\s\S]+)$/i

/** A GitHub URL that names a repository. */
const REPO_URL = /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.-]*)/i

/** A bare `owner/repo` token: no spaces, both sides identifier-shaped. */
const REPO_SHAPE = /^([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.-]*)$/

/**
 * Slash phrases that are not repositories. Without this list a general query
 * such as `async/await` would be sent to the GitHub vertical.
 */
const SLASH_PHRASES = new Set([
  'async/await',
  'and/or',
  'either/or',
  'tcp/ip',
  'http/https',
  'input/output',
  'client/server',
  'read/write',
  'request/response',
  'frontend/backend',
  'win/win',
  'yes/no',
  '24/7',
  'km/h',
  'm/s',
  'n/a',
  'him/her',
])

/**
 * Read an explicit source prefix.
 * @returns {{vertical: object, query: string} | null}
 */
export function parseVerticalQuery(raw) {
  const match = PREFIX.exec(String(raw ?? ''))
  if (match === null) return null
  const vertical = VERTICAL_BY_PREFIX.get(match[1].toLowerCase())
  if (vertical === undefined) return null
  const query = match[2].trim()
  return query === '' ? null : { vertical, query }
}

/**
 * Recognise a query that can only mean one repository: a GitHub URL or a bare
 * `owner/repo` token. Everything else stays on the open web, because guessing a
 * vertical for a general question costs latency and adds noise.
 * @returns {{vertical: object, query: string} | null}
 */
export function detectVertical(raw) {
  const text = String(raw ?? '').trim()

  const url = REPO_URL.exec(text)
  if (url !== null) {
    const repo = url[2].replace(/\.git$/i, '')
    return { vertical: VERTICAL_BY_ID.get('github'), query: `repo:${url[1]}/${repo}` }
  }

  const shape = REPO_SHAPE.exec(text)
  if (shape !== null) {
    const [, owner, repo] = shape
    const looksLikeRepo =
      owner.length >= 2 &&
      repo.length >= 2 &&
      !/^\d+$/.test(owner) &&
      !SLASH_PHRASES.has(text.toLowerCase())
    if (looksLikeRepo) {
      return { vertical: VERTICAL_BY_ID.get('github'), query: `repo:${owner}/${repo}` }
    }
  }

  return null
}
