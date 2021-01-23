const knownContracts = require('./known-contracts');
const { POOL_START_DATE } = require('./pools');

const Cash = artifacts.require('Cash');
const Share = artifacts.require('Share');
const Oracle = artifacts.require('Oracle');
const MockDai = artifacts.require('MockDai');
const IERC20 = artifacts.require('IERC20');

const DAIUNCLPToken_UNSPool = artifacts.require('DAIUNCLPTokenSharePool')
const DAIUNSLPToken_UNSPool = artifacts.require('DAIUNSLPTokenSharePool')

const UniswapV2Factory = artifacts.require('UniswapV2Factory');

module.exports = async (deployer, network, accounts) => {
  const uniswapFactory = ['dev'].includes(network)
    ? await UniswapV2Factory.deployed()
    : await UniswapV2Factory.at(knownContracts.UniswapV2Factory[network]);
  const dai = network === 'mainnet' || network === 'rinkeby'
    ? await IERC20.at(knownContracts.DAI[network])
    : await MockDai.deployed();
  
  const oracle = await Oracle.deployed();

  const dai_unc_lpt = await oracle.pairFor(uniswapFactory.address, Cash.address, dai.address);
  const dai_uns_lpt = await oracle.pairFor(uniswapFactory.address, Share.address, dai.address);
  await deployer.deploy(DAIUNCLPToken_UNSPool, Share.address, dai_unc_lpt, POOL_START_DATE);
  await deployer.deploy(DAIUNSLPToken_UNSPool, Share.address, dai_uns_lpt, POOL_START_DATE);
};
