const INITIAL_UNC_FOR_POOLS = 30000;
const INITIAL_UNS_FOR_DAI_UNC = 450000;
const INITIAL_UNS_FOR_DAI_UNS = 150000;

const POOL_START_DATE = Date.parse('2021-01-22T16:00:00Z') / 1000;

const uncPools = [
  { contractName: 'UNCUSDTPool', token: 'USDT' },
  { contractName: 'UNCUSDCPool', token: 'USDC' },
  { contractName: 'UNCDAIPool', token: 'DAI' },
  { contractName: 'UNCCVPPool', token: 'CVP'},
  { contractName: 'UNCBACPool', token: 'BAC' },
  { contractName: 'UNCMICPool', token: 'MIC' },
  { contractName: 'UNCESDPool', token: 'ESD' },
  { contractName: 'UNCDSDPool', token: 'DSD' },
];

const unsPools = {
  DAIUNC: { contractName: 'DAIUNCLPTokenSharePool', token: 'DAI_UNC-LPv2' },
  DAIUNS: { contractName: 'DAIUNSLPTokenSharePool', token: 'DAI_UNS-LPv2' },
}

module.exports = {
  POOL_START_DATE,
  INITIAL_UNC_FOR_POOLS,

  INITIAL_UNS_FOR_DAI_UNC,
  INITIAL_UNS_FOR_DAI_UNS,

  uncPools,
  unsPools,
};
