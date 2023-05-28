import type { Helia } from '@helia/interface'
import type { Libp2p, ServiceMap } from '@libp2p/interface-libp2p'
import type { PubSub } from '@libp2p/interface-pubsub'
import type { Datastore } from 'interface-datastore'
import type { KeyChain } from '@libp2p/interface-keychain'

import type { AccessProtocol } from '@/access/static/protocol.js'
import type { EntryProtocol } from '@/entry/basal/protocol.js'
import type { IdentityProtocol } from '@/identity/basal/protocol.js'
import type { IdentityInstance, IdentityModule } from '@/identity/interface.js'
import type { Blocks } from '@/blocks/index.js'
import type { StoreProtocol } from '@/store/keyvalue/protocol.js'
import type { Address, Manifest } from '@/manifest/index.js'
import type { AccessInstance, AccessModule } from '@/access/interface.js'
import type { EntryModule } from '@/entry/interface.js'
import type { StoreInstance, StoreModule } from '@/store/interface'
import type { Replica } from '@/replica/index.js'
import type { Replicator, ReplicatorModule } from '@/replicator/interface'

export type GossipServiceMap = ServiceMap & { pubsub: PubSub }
export type GossipLibp2p<T extends GossipServiceMap = GossipServiceMap> = Libp2p<T>
export type GossipHelia<T extends GossipLibp2p<GossipServiceMap> = GossipLibp2p<GossipServiceMap>> = Helia<T>

export interface Module<T extends string = string> {
  protocol: T
}

/** @public */
export interface Create {
  datastore?: Datastore
  replicators?: ReplicatorModule[]
  identity?: IdentityInstance<any>
  ipfs: GossipHelia
  start?: boolean

  components: {
    access: AccessModule[]
    store: StoreModule[]
    entry: EntryModule[]
    identity: IdentityModule[]
  }
}

export interface Config {
  replicators: ReplicatorModule[]
  datastore: Datastore
  identity: IdentityInstance<any>
  blocks: Blocks
  keychain: KeyChain
  ipfs: GossipHelia

  components: {
    access: AccessModule[]
    store: StoreModule[]
    entry: EntryModule[]
    identity: IdentityModule[]
  }
}

/** @public */
export interface Determine {
  protocol?: string
  name: string
  access?: AccessProtocol
  entry?: EntryProtocol
  identity?: IdentityProtocol
  store?: StoreProtocol
  meta?: any
  tag?: Uint8Array
}

// /** @public */ commented out a comment lol
// export { FetchOptions } from '@/utils/types'

/** @public */
export interface OpenOptions {
  identity?: IdentityInstance<any>
  datastore?: Datastore
  replicators?: ReplicatorModule[]
}

interface AddressEmit {
  address: Address
}

export interface OpenedEmit extends AddressEmit {}
export interface ClosedEmit extends AddressEmit {}

export interface Events {
  opened: CustomEvent<OpenedEmit>
  closed: CustomEvent<ClosedEmit>
}

export interface DbOpen {
  datastore: Datastore
  start?: boolean
  blocks: Blocks
  replicators: ReplicatorModule[]
  ipfs: GossipHelia
  identity: IdentityInstance<any>
  manifest: Manifest
  access: AccessModule
  entry: EntryModule
  identityModule: IdentityModule
  store: StoreModule
}

export interface DbConfig extends Omit<DbOpen, 'start' | 'ipfs' | 'replicators' | 'access' | 'store'> {
  replicators: Replicator[]
  replica: Replica
  store: StoreInstance
  access: AccessInstance
}

export interface DbEvents {
  closed: CustomEvent<ClosedEmit>
  update: CustomEvent<undefined>
}

export interface Components {
  access: AccessModule
  entry: EntryModule
  identity: IdentityModule
  store: StoreModule
}
