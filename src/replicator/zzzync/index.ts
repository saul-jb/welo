import type { Web3Storage } from 'web3.storage'
import W3NameService from 'w3name/service'
import { zzzync, type Zzzync, toDcid } from '@tabcat/zzzync'
import { namer, revisionState, type RevisionState } from '@tabcat/zzzync/namers/w3'
import { advertiser, CreateEphemeralLibp2p, Libp2pWithDHT } from '@tabcat/zzzync/advertisers/dht'
import { CID } from 'multiformats/cid'
import { CarWriter, CarReader } from '@ipld/car'
import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import { peerIdFromBytes } from '@libp2p/peer-id'

import { Playable } from '@/utils/playable.js'
import type { Replica } from '@/replica/index.js'
import { Blocks } from '@/blocks/index.js'

import protocol from './protocol'
import type { Config, ReplicatorModule } from '../interface.js'
import type { Ed25519PeerId } from '@libp2p/interface-peer-id'
import { Paily } from '@/utils/paily'
import type { Blockstore } from 'interface-blockstore'
import type { ShardLink } from '@alanshaw/pail/src/shard'
import { Datastore, Key } from 'interface-datastore'
import { CodeError } from '@libp2p/interfaces/dist/src/errors'
import type { AnyBlock, BlockFetcher } from '@alanshaw/pail/src/block'
import type { AnyLink } from '@alanshaw/pail/src/link'
import type { SignedEntry } from '@/entry/basal'
import type { IdentityInstance } from '@/identity/interface'
import type { EntryInstance } from '@/entry/interface'

const ipfsNamespace = '/ipfs/'
const republishInterval = 1000 * 60 * 60 * 10 // 10 hours in milliseconds
const providerKey = new Key('provider')

export class ZzzyncReplicator extends Playable {
  readonly replica: Replica
  readonly datastore: Datastore
  readonly blockstore: Blockstore
  readonly blocks: Blocks
  readonly dcid: CID

  readonly w3: Required<W3>
  #zync: Zzzync
  #provider: Ed25519PeerId | null
  #revisions: RevisionState
  #lastAdvertised: number

  constructor ({ replica, blocks, ipfs, datastore, blockstore, options }: Config & { options: Options }) {
    if (options.createEphemeralLibp2p == null) {
      throw new Error('need createEphemeralLibp2p function to be supplied')
    }

    if (ipfs.libp2p.services.dht == null) {
      throw new Error('zzzync replicator needs the dht')
    }

    const starting = async (): Promise<void> => {
      try {
        const bytes = await datastore.get(providerKey)
        this.#provider = peerIdFromBytes(bytes) as Ed25519PeerId
      } catch (e) {
        if (e instanceof CodeError && e.code === 'ERR_NOT_FOUND') {
          this.#provider = await createEd25519PeerId()
          await datastore.put(providerKey, this.#provider.toBytes())
        } else {
          throw e
        }
      }
    }
    const stopping = async (): Promise<void> => {}
    super({ starting, stopping })

    this.replica = replica
    this.blocks = blocks
    this.datastore = datastore
    this.blockstore = blockstore
    this.dcid = toDcid(replica.manifest.block.cid)

    this.w3 = { name: new W3NameService(), ...options.w3 }

    this.#revisions = options.revisions ?? revisionState(datastore)
    this.#lastAdvertised = 0

    const libp2p = ipfs.libp2p as unknown as Libp2pWithDHT

    this.#zync = zzzync(
      namer(this.w3.name, this.#revisions),
      advertiser(libp2p, options.createEphemeralLibp2p)
    )

    this.#provider = null
  }

  async upload (peerId: Ed25519PeerId): Promise<void> {
    if (this.#provider == null) {
      throw new Error('provider required. is ZzzyncReplicator started?')
    }

    const revision = await this.#revisions.get(peerId)

    const root = this.replica.graph.nodes.root

    let oldRoot: ShardLink
    if (revision == null) {
      oldRoot = await Paily.create(this.blockstore).then(paily => paily.root)
    } else {
      if (!revision.value.startsWith(ipfsNamespace)) {
        throw new Error('invalid revision value, value does not start with "/ipfs/"')
      }

      oldRoot = CID.parse(revision.value.slice(ipfsNamespace.length))
    }

    const diff = await this.replica.graph.nodes.diff(oldRoot)

    const { writer, out } = await CarWriter.create(this.replica.graph.nodes.root as CID)

    for (const [k] of diff.keys) {
      const entry = await this.replica.components.entry.fetch({
        blocks: this.blocks,
        identity: this.replica.components.identity,
        cid: CID.parse(k)
      })

      await writer.put(entry.block)
      await writer.put(entry.identity.block)
    }

    for (const shard of diff.shards.additions) {
      await writer.put({ cid: shard.cid, bytes: shard.bytes })
    }

    await writer.close()

    // @ts-expect-error - w3client uses old @ipld/car and CID versions
    await this.w3.client.putCar(await CarReader.fromIterable(out))

    await this.#zync.namer.publish(this.#provider, root as CID)

    const now = Date.now()
    if (this.#lastAdvertised - now > republishInterval) {
      await this.#zync.advertiser.collaborate(root as CID, this.#provider)
      this.#lastAdvertised = now
    }
  }

  async download (): Promise<void> {
    const providers: Map<string, Ed25519PeerId> = new Map()
    for await (const event of this.#zync.advertiser.findCollaborators(this.dcid)) {
      if (event.name === 'PROVIDER') {
        for (const provider of event.providers) {
          if (provider.id.type !== 'Ed25519') {
            continue
          }
          const peerIdString = provider.id.toString()
          !providers.has(peerIdString) && providers.set(peerIdString, provider.id)
        }
      }
    }

    const fetchEntry = async (cid: CID): Promise<EntryInstance<SignedEntry>> => {
      const response = await this.w3.client.get(cid.toString())

      if (response?.status !== 200) {
        throw new Error('base response fetching entry')
      }

      const arrayBuffer = await response.arrayBuffer()
      const block = await Blocks.decode<SignedEntry>({ bytes: new Uint8Array(arrayBuffer) })
      const identity = await Promise.race([
        fetchIdentity(block.value.auth),
        this.replica.components.identity.fetch({ blocks: this.blocks, auth: block.value.auth })
      ])

      if (identity == null) {
        throw new Error('identity was null')
      }

      const entry = await this.replica.components.entry.asEntry({ block, identity })

      if (entry == null) {
        throw new Error('entry was null')
      }

      return entry as EntryInstance<SignedEntry>
    }

    const fetchIdentity = async (cid: CID): Promise<IdentityInstance<unknown>> => {
      const response = await this.w3.client.get(cid.toString())

      if (response?.status === 200) {
        const arrayBuffer = await response.arrayBuffer()
        const block = await Blocks.decode({ bytes: new Uint8Array(arrayBuffer) })
        const identity = this.replica.components.identity.asIdentity({ block })

        if (identity != null) {
          return identity
        } else {
          throw new Error('want not an identity')
        }
      } else {
        throw new Error('bad response fetching identity')
      }
    }

    const resolveAndFetch = async (peerId: Ed25519PeerId): Promise<void> => {
      let value: ShardLink
      try {
        value = await this.#zync.namer.resolve(peerId) as ShardLink
      } catch (e) {
        console.error(e)
        return
      }

      const diff = await this.replica.graph.nodes.diff(value, { blockFetcher: w3storageBlockFetcher(this.w3.client) })

      const promises: Array<Promise<EntryInstance<SignedEntry>>> = []
      for (const [k, v] of diff.keys) {
        if (v[0] != null) {
          continue
        }

        promises.push(fetchEntry(CID.parse(k)))
      }
      await Promise.all(promises).then(this.replica.add)
    }

    const promises: Array<Promise<unknown>> = []
    for (const provider of providers.values()) {
      promises.push(resolveAndFetch(provider))
    }
    await Promise.all(promises)
  }
}

export const w3storageBlockFetcher = (client: Web3Storage): BlockFetcher => ({
  get: async (link: AnyLink): Promise<AnyBlock | undefined> => {
    return undefined
  }
})

interface W3 {
  client: Web3Storage
  name?: W3NameService
}
interface Options {
  w3: W3
  revisions?: RevisionState
  createEphemeralLibp2p: CreateEphemeralLibp2p
}

export const zzzyncReplicator: (options: Options) => ReplicatorModule<ZzzyncReplicator, typeof protocol> =
(options) => ({
  protocol,
  create: (config: Config) => new ZzzyncReplicator({ ...config, options })
})
