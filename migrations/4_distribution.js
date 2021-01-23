const knownContracts = require('./known-contracts');
const { uncPools, POOL_START_DATE } = require('./pools');

// Tokens
// deployed first
const Cash = artifacts.require('Cash');
const MockDai = artifacts.require('MockDai');
const MockMIC = artifacts.require('MockMIC');
const MockESD = artifacts.require('MockESD');
const MockDSD = artifacts.require('MockDSD');
const MockUSDT = artifacts.require('MockUSDT');
const MockUSDC = artifacts.require('MockUSDC');
const MockBAC = artifacts.require('MockBAC');

function getMockTokenAddress(symbol) {
  if (symbol == 'DAI')
    return MockDai.address;
  else
    return artifacts.require('Mock' + symbol).address;
}

// ============ Main Migration ============
module.exports = async (deployer, network, accounts) => {
  for await (const { contractName, token } of uncPools) {
    const tokenAddress = knownContracts[token][network] || getMockTokenAddress(token);
    if (!tokenAddress) {
      // network is mainnet, so MockDai is not available
      throw new Error(`Address of ${token} is not registered on migrations/known-contracts.js!`);
    }

    const contract = artifacts.require(contractName);
    await deployer.deploy(contract, Cash.address, tokenAddress, POOL_START_DATE);
  }
};
