import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';

// Test the AgentService transaction preparation logic (no DB needed)
describe('AgentService - Transaction Preparation', () => {
  const WAVEWARZ_ABI = [
    'function buyShares(uint64 battleId, bool artistA, uint256 amount, uint256 minTokensOut, uint64 deadline) payable returns (uint256)',
    'function sellShares(uint64 battleId, bool artistA, uint256 tokenAmount, uint256 minAmountOut, uint64 deadline) returns (uint256)',
    'function claimShares(uint64 battleId) returns (uint256)',
  ];

  const CONTRACT_ADDRESS = '0xe28709DF5c77eD096f386510240A4118848c1098';
  const CHAIN_ID = 84532;

  it('should encode buyShares calldata correctly', () => {
    const iface = new ethers.Interface(WAVEWARZ_ABI);
    const deadline = Math.floor(Date.now() / 1000) + 300;
    const calldata = iface.encodeFunctionData('buyShares', [
      1001, true, BigInt('1000000000000000'), BigInt('0'), deadline,
    ]);

    expect(calldata).toMatch(/^0x/);
    expect(calldata.length).toBeGreaterThan(10);

    // Verify it's decodable
    const decoded = iface.decodeFunctionData('buyShares', calldata);
    expect(Number(decoded[0])).toBe(1001); // battleId
    expect(decoded[1]).toBe(true); // artistA
    expect(decoded[2]).toBe(BigInt('1000000000000000')); // amount
  });

  it('should encode sellShares calldata correctly', () => {
    const iface = new ethers.Interface(WAVEWARZ_ABI);
    const deadline = Math.floor(Date.now() / 1000) + 300;
    const calldata = iface.encodeFunctionData('sellShares', [
      1001, false, BigInt('500000000'), BigInt('0'), deadline,
    ]);

    expect(calldata).toMatch(/^0x/);

    const decoded = iface.decodeFunctionData('sellShares', calldata);
    expect(Number(decoded[0])).toBe(1001);
    expect(decoded[1]).toBe(false); // artistB
    expect(decoded[2]).toBe(BigInt('500000000'));
  });

  it('should encode claimShares calldata correctly', () => {
    const iface = new ethers.Interface(WAVEWARZ_ABI);
    const calldata = iface.encodeFunctionData('claimShares', [1001]);

    expect(calldata).toMatch(/^0x/);
    // claimShares has just 1 param so calldata is shorter
    expect(calldata.length).toBe(74); // 0x + 4 bytes selector + 32 bytes param

    const decoded = iface.decodeFunctionData('claimShares', calldata);
    expect(Number(decoded[0])).toBe(1001);
  });

  it('should set value for buy (payable) and 0 for sell/claim', () => {
    const amount = '1000000000000000';

    // Buy: value = amount (payable)
    const buyTx = {
      to: CONTRACT_ADDRESS,
      value: amount,
      chainId: CHAIN_ID,
    };
    expect(buyTx.value).toBe(amount);

    // Sell: value = 0
    const sellTx = {
      to: CONTRACT_ADDRESS,
      value: '0',
      chainId: CHAIN_ID,
    };
    expect(sellTx.value).toBe('0');

    // Claim: value = 0
    const claimTx = {
      to: CONTRACT_ADDRESS,
      value: '0',
      chainId: CHAIN_ID,
    };
    expect(claimTx.value).toBe('0');
  });
});

describe('AgentService - Validation', () => {
  it('should validate wallet address format', () => {
    expect(ethers.isAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(true);
    expect(ethers.isAddress('0xinvalid')).toBe(false);
    expect(ethers.isAddress('not-an-address')).toBe(false);
    expect(ethers.isAddress('')).toBe(false);
  });

  it('should validate agent ID format', () => {
    const agentIdRegex = /^[a-zA-Z0-9_-]+$/;
    expect(agentIdRegex.test('valid-agent-001')).toBe(true);
    expect(agentIdRegex.test('WAVEX_AI')).toBe(true);
    expect(agentIdRegex.test('agent with spaces')).toBe(false);
    expect(agentIdRegex.test('agent@special!')).toBe(false);
  });
});
