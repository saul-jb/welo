import type { Startable } from '@libp2p/interfaces/startable'
import type { EventEmitter } from '@libp2p/interfaces/events'
import type { Datastore } from 'interface-datastore'

import type { Replica } from '@/replica/index.js'
import type { Manifest } from '@/manifest/index.js'
import type { Blocks } from '@/blocks/index.js'
import { HLDB_PREFIX } from '@/utils/constants.js'
import type { ComponentProtocol } from '@/interface.js'

export interface Props {
  manifest: Manifest
  blocks: Blocks
  replica: Replica
  datastore: Datastore
}

export type Creator = (...args: any[]) => any

export type Selector = (state: any) => (...args: any[]) => any

export interface Events {
  update: CustomEvent<undefined>
}

export interface StoreInstance extends Startable {
  creators: {
    [key: string]: Creator
  }
  selectors: {
    [key: string]: Selector
  }
  latest: () => Promise<any>
  events: EventEmitter<Events>
}

export interface StoreComponent<T extends StoreInstance = StoreInstance, P extends string = string> extends ComponentProtocol<P> {
  create: (props: Props) => T
}

export const prefix = `${HLDB_PREFIX}store/` as const
