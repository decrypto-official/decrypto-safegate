// TEMPORARY design-review scaffold. Deleted before commit.
import { score } from '@safegate/scoring/model2.js';
import { ScoreResult } from '../../components/ScoreResult';

export const dynamic = 'force-dynamic';

export default function Preview() {
  const s = score({
    chain: 'ethereum',
    address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
    symbol: 'MKR',
    name: 'Maker',
    signals: [
      { capability: 'admin-authority', state: 'PRESENT', axis: 'control', observations: [
        { capability: 'admin-authority', value: '0x0a3f6849f78076aefadf113f5bed87720274ddc0', source: 'onchain', patternId: 'admin-dsauth', method: 'authority()', observedAt: '2026-09-02T00:00:00.000Z' }],
        reasoning: 'The DSAuthority contract at 0x0a3f68...ddc0 can authorise any function guarded by the auth modifier, which on this token includes mint, burn and setOwner. Ownership reads as empty, so an owner()-only reader would report no administrator at all.' },
      { capability: 'mint-authority', state: 'UNKNOWN', axis: 'control', observations: [], reasoning: 'No pattern in the dictionary reads this capability for this contract shape, so we could not determine who holds it. That is not the same as nobody holding it.' },
      { capability: 'upgradeability', state: 'ABSENT', axis: 'control', observations: [
        { capability: 'upgradeability', value: null, source: 'onchain', patternId: 'proxy-eip1967', method: 'eth_getStorageAt 0x360894a13b...', observedAt: '2026-09-02T00:00:00.000Z' }],
        reasoning: 'Every proxy pattern we read returned an empty implementation slot, so the contract logic appears to be fixed at this address.' },
      { capability: 'transfer-restriction', state: 'EXPECTED', axis: 'exit', observations: [
        { capability: 'transfer-restriction', value: 'mechanism present, currently false/zero', source: 'onchain', patternId: 'transfer-pausable', method: 'paused() exists, so the capability is built in', observedAt: '2026-09-02T00:00:00.000Z' }],
        reasoning: 'A pause mechanism is built into the contract and the registry records it as expected for this archetype. An expected capability is still a capability: the holder can use it.' },
    ],
    disagreements: [],
    unverified: [],
    registryEntry: { id: 'mkr-governance', archetype: 'governance-token', approvedBy: 'decrypto', verifiedAt: '2026-07-22' },
    inputSnapshotHash: 'sha256:preview0000000000000000000000000',
    computedAt: '2026-09-02T00:00:00.000Z',
    dictionaryGaps: [{ selector: '0x40c10f19', signature: 'mint(address,uint256)', capability: 'mint-authority',
      note: 'The contract exposes mint(address,uint256), so new supply can be created. No pattern in the dictionary reads this, and nothing else resolved mint-authority for this token, so the capability is unaccounted for rather than absent.' }],
    gapScan: 'ran',
  });
  return <ScoreResult score={s} />;
}
