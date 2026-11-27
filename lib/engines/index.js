/**
 * The engine registry.
 *
 * Order is presentation order in the settings card and the priority used when
 * two engines produce an equally ranked hit. Adding an engine means adding one
 * module here plus its `engines.<id>` switch in the Host Config.
 */

import bing from './bing.js'
import baidu from './baidu.js'
import so360 from './so360.js'
import sogou from './sogou.js'
import ddg from './ddg.js'
import google from './google.js'

export const ENGINES = [bing, baidu, so360, sogou, ddg, google]

/** Every engine id, in registry order. */
export const ENGINE_IDS = ENGINES.map((engine) => engine.id)

/** Look an engine up by id. */
export const ENGINE_BY_ID = new Map(ENGINES.map((engine) => [engine.id, engine]))
