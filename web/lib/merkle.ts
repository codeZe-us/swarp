import { poseidon2Hash } from '@zkpassport/poseidon2';
import { MERKLE_TREE_DEPTH } from './constants';

export const TREE_DEPTH = MERKLE_TREE_DEPTH;

/**
 * Pre-computes empty tree zero values at each level:
 * zeros[0] = Poseidon2([0n])
 * zeros[i] = Poseidon2([zeros[i-1], zeros[i-1]])
 */
export function getZeroValues(): bigint[] {
  const zeros: bigint[] = new Array(TREE_DEPTH + 1);
  zeros[0] = poseidon2Hash([BigInt(0)]);
  for (let i = 1; i <= TREE_DEPTH; i++) {
    zeros[i] = poseidon2Hash([zeros[i - 1], zeros[i - 1]]);
  }
  return zeros;
}

/**
 * Efficiently builds a depth-20 Merkle tree root from an array of leaves.
 * Complexity is O(N * log M) where N is number of leaves, avoiding allocating 2^20 nodes.
 */
export function buildTree(leaves: bigint[]): bigint {
  const zeros = getZeroValues();
  if (leaves.length === 0) {
    return zeros[TREE_DEPTH];
  }

  let currentLayer = [...leaves];

  for (let level = 0; level < TREE_DEPTH; level++) {
    const nextLayer: bigint[] = [];
    const zeroAtLevel = zeros[level];

    for (let i = 0; i < currentLayer.length; i += 2) {
      const left = currentLayer[i];
      const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : zeroAtLevel;

      let parent;
      if (left === zeroAtLevel && right === zeroAtLevel) {
        parent = zeros[level + 1];
      } else {
        parent = poseidon2Hash([left, right]);
      }
      nextLayer.push(parent);
    }

    currentLayer = nextLayer;
    if (currentLayer.length === 0) {
      return zeros[TREE_DEPTH];
    }
  }

  return currentLayer[0];
}

/**
 * Generates elements and indices Merkle proof paths for a leaf index.
 * pathElements: sibling hashes at each level
 * pathIndices: 0 if left, 1 if right
 */
export function getProof(
  leaves: bigint[],
  leafIndex: number
): { pathElements: bigint[]; pathIndices: number[] } {
  const zeros = getZeroValues();
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];

  let currentLayer = [...leaves];
  let idx = leafIndex;

  for (let level = 0; level < TREE_DEPTH; level++) {
    const zeroAtLevel = zeros[level];

    const isLeft = idx % 2 === 0;
    const siblingIdx = isLeft ? idx + 1 : idx - 1;

    let sibling;
    if (siblingIdx < currentLayer.length) {
      sibling = currentLayer[siblingIdx];
    } else {
      sibling = zeroAtLevel;
    }

    pathElements.push(sibling);
    pathIndices.push(isLeft ? 0 : 1);

    // Compute next layer
    const nextLayer: bigint[] = [];
    for (let i = 0; i < currentLayer.length; i += 2) {
      const left = currentLayer[i];
      const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : zeroAtLevel;
      let parent;
      if (left === zeroAtLevel && right === zeroAtLevel) {
        parent = zeros[level + 1];
      } else {
        parent = poseidon2Hash([left, right]);
      }
      nextLayer.push(parent);
    }

    currentLayer = nextLayer;
    idx = Math.floor(idx / 2);
  }

  return { pathElements, pathIndices };
}

/**
 * Verifies a Merkle proof locally.
 */
export function computeRootFromPath(
  leaf: bigint,
  pathElements: bigint[],
  pathIndices: number[]
): bigint {
  let current = leaf;
  for (let level = 0; level < TREE_DEPTH; level++) {
    const sibling = pathElements[level];
    const direction = pathIndices[level];

    let left, right;
    if (direction === 0) {
      left = current;
      right = sibling;
    } else {
      left = sibling;
      right = current;
    }

    current = poseidon2Hash([left, right]);
  }
  return current;
}

/**
 * Verifies a Merkle proof locally.
 */
export function verifyProof(
  root: bigint,
  leaf: bigint,
  pathElements: bigint[],
  pathIndices: number[]
): boolean {
  return computeRootFromPath(leaf, pathElements, pathIndices) === root;
}
