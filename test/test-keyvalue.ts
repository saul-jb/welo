import { strict as assert } from 'assert'

import { Keyvalue } from '../src/manifest/store/keyvalue.js'

import { Replica } from '../src/database/replica.js'

import { Blocks } from '../src/mods/blocks.js'
import { StaticAccess } from '../src/manifest/access/static.js'
import { Entry } from '../src/manifest/entry/index.js'
import { Identity } from '../src/manifest/identity/index.js'
import { initRegistry } from '../src/registry.js'

import { getIpfs, getIdentity } from './utils/index.js'
import { IPFS } from 'ipfs'
import { Manifest } from '../src/manifest/index.js'
import { defaultManifest } from '../src/util.js'

const registry = initRegistry()

registry.store.add(Keyvalue)
registry.access.add(StaticAccess)
registry.entry.add(Entry)
registry.identity.add(Identity)

describe('Keyvalue', () => {
  let ipfs: IPFS, blocks: Blocks, identity: Identity, keyvalue: Keyvalue
  const type = '/opal/store/keyvalue'

  before(async () => {
    ipfs = await getIpfs()
    blocks = new Blocks(ipfs)

    const got = await getIdentity()
    identity = got.identity

    await blocks.put(identity.block)
  })

  after(async () => {
    await ipfs.stop()
  })

  describe('class', () => {
    it('exposes static properties', () => {
      assert.ok(Keyvalue.open)
      assert.equal(Keyvalue.type, type)
    })

    describe('open', () => {
      it('returns a new instance of Keyvalue', async () => {
        keyvalue = await Keyvalue.open()
      })
    })
  })

  describe('instance', () => {
    it('exposes instance properties', () => {
      assert.ok(keyvalue.state)
      assert.ok(keyvalue.events)
      assert.ok(keyvalue.close)
      assert.ok(keyvalue.selectors)
      assert.ok(keyvalue.reducer)
      assert.ok(keyvalue.update)
    })

    describe('update', () => {
      let replica: Replica, manifest: Manifest, access: StaticAccess
      const key = 'key'
      const value = 0

      before(async () => {
        manifest = await Manifest.create({
          ...defaultManifest('name', identity, registry),
          access: { type: StaticAccess.type, write: [identity.id] }
        })
        access = await StaticAccess.open({ manifest })
        replica = await Replica.open({
          manifest,
          blocks,
          access,
          identity,
          Entry,
          Identity
        })
      })

      after(async () => {
        await replica.close()
      })

      it('sets a key value pair to value', async () => {
        const payload = keyvalue.actions.put(key, value)
        const entry = await replica.write(payload)

        await keyvalue.update({ replica })

        assert.deepEqual(entry.payload, payload)
        assert.equal(keyvalue.state.get(key), value)
      })

      it('updates a key value pair to new value', async () => {
        const payload = keyvalue.actions.put(key, value + 1)
        const entry = await replica.write(payload)

        await keyvalue.update({ replica })

        assert.deepEqual(entry.payload, payload)
        assert.equal(keyvalue.state.get(key), value + 1)
      })

      it('deletes a key value pair', async () => {
        const payload = keyvalue.actions.del(key)
        const entry = await replica.write(payload)

        await keyvalue.update({ replica })

        assert.deepEqual(entry.payload, payload)
        assert.equal(keyvalue.state.get(key), undefined)
      })
    })

    describe('close', () => {
      it('resets the keyvalue state', async () => {
        await keyvalue.close()
        assert.deepEqual(keyvalue.state, new Map())
      })
    })
  })
})
