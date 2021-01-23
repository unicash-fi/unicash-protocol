const contract = require('@truffle/contract');
const { POOL_START_DATE } = require('./pools');
const knownContracts = require('./known-contracts');

const Cash = artifacts.require('Cash');
const Bond = artifacts.require('Bond');
const Share = artifacts.require('Share');
const IERC20 = artifacts.require('IERC20');
const MockDai = artifacts.require('MockDai');

const Oracle = artifacts.require('Oracle')
const Boardroom = artifacts.require('Boardroom')
const BoardroomLp = artifacts.require('BoardroomLp')
const Treasury = artifacts.require('Treasury')
const SimpleFund = artifacts.require('SimpleERCFund')

const LinearThreshold = artifacts.require('LinearThreshold');

const UniswapV2Factory = artifacts.require('UniswapV2Factory');
const UniswapV2Router02 = artifacts.require('UniswapV2Router02');

const HOUR = 60 * 60;
const DAY = 86400;
const ORACLE_START_DATE = Date.parse('2021-01-22T16:00:00Z') / 1000;

async function migration(deployer, network, accounts) {
  let uniswap, uniswapRouter;
  if (['dev'].includes(network)) {
    console.log('Deploying uniswap on dev network.');
    await deployer.deploy(UniswapV2Factory, accounts[0]);
    uniswap = await UniswapV2Factory.deployed();

    await deployer.deploy(UniswapV2Router02, uniswap.address, accounts[0]);
    uniswapRouter = await UniswapV2Router02.deployed();
  } else {
    uniswap = await UniswapV2Factory.at(knownContracts.UniswapV2Factory[network]);
    uniswapRouter = await UniswapV2Router02.at(knownContracts.UniswapV2Router02[network]);
  }

  const dai = network === 'mainnet' || network === 'rinkeby'
    ? await IERC20.at(knownContracts.DAI[network])
    : await MockDai.deployed();
  
  // 2. provide liquidity to BAC-DAI and BAS-DAI pair
  // if you don't provide liquidity to BAC-DAI and BAS-DAI pair after step 1 and before step 3,
  //  creating Oracle will fail with NO_RESERVES error.
  const unit = web3.utils.toBN(10 ** 18).toString();
  const unit6 = web3.utils.toBN(10 ** 6).toString();
  const max = web3.utils.toBN(10 ** 18).muln(10000).toString();
  const max6 = web3.utils.toBN(10 ** 6).muln(10000).toString();//usdt's decimals is 6

  const MIN_SUPPLY = '0';
  const MAX_SUPPLY = web3.utils.toBN(10 ** 20).muln(2500000).toString();
  const MIN_CEILING = web3.utils.toBN(10 ** 16).muln(101).toString();
  const MAX_CEILING = web3.utils.toBN(10 ** 16).muln(105).toString();

  const cash = await Cash.deployed();
  const share = await Share.deployed();

  console.log('Approving Uniswap on tokens for liquidity');
  await Promise.all([
    approveIfNot(cash, accounts[0], uniswapRouter.address, max),
    approveIfNot(share, accounts[0], uniswapRouter.address, max),
    approveIfNot(dai, accounts[0], uniswapRouter.address, max),
  ]);

  // WARNING: msg.sender must hold enough DAI to add liquidity to BAC-DAI & BAS-DAI pools
  // otherwise transaction will revert
  console.log('Adding liquidity to pools');
  await uniswapRouter.addLiquidity(
    cash.address, dai.address, unit, unit, unit, unit, accounts[0], deadline(),
  );

  await uniswapRouter.addLiquidity(
    share.address, dai.address, unit, unit, unit, unit, accounts[0],  deadline(),
  );

  console.log(`DAI-UNC pair address: ${await uniswap.getPair(dai.address, cash.address)}`);
  console.log(`DAI-UNS pair address: ${await uniswap.getPair(dai.address, share.address)}`);
  
  let startTime = POOL_START_DATE;
  let bondOraclePeriod = 75;// 1.25 min
  let seigniorageOraclePeriod = 30 * 60;//30 min = 1.25 * 24
  let poolStartDate = Date.parse('2021-01-22T16:00:00Z') / 1000;
  let oracleStartDate = Date.parse('2021-01-22T16:00:00Z') / 1000;
  let boardroomStartDate = Date.parse('2021-01-25T08:00:00Z') / 1000;//deploy boardroom

  if (network == 'mainnet') {
    bondOraclePeriod = HOUR / 3;
    seigniorageOraclePeriod = DAY / 3;
    oracleStartDate = ORACLE_START_DATE;

    boardroomStartDate = startTime + 64 * HOUR;
    startTime += 3 * DAY;
  } else {
    poolStartDate = deadline();
    oracleStartDate = poolStartDate;
    boardroomStartDate = poolStartDate - seigniorageOraclePeriod;
    startTime = poolStartDate;
  }

  console.log("baseLaunchDate", poolStartDate * 1000);
  console.log('bondLaunchesAt', oracleStartDate * 1000);
  console.log('boardroomLaunchesAt', (boardroomStartDate - 4 * HOUR) * 1000);//UI

  // Deploy boardroom
  await deployer.deploy(Boardroom, cash.address, share.address, boardroomStartDate);
  // Deploy boardroom for lp
  const lp = await uniswap.getPair(dai.address, share.address);
  console.log(`Boardroom DAI-UNS pair address: ${lp}`);
  await deployer.deploy(BoardroomLp, cash.address, lp, boardroomStartDate)
  // Deploy simpleFund
  await deployer.deploy(SimpleFund);

  // 2. Deploy oracle for the pair between bac and dai
  const BondOracle = await deployer.deploy(
    Oracle,
    uniswap.address,
    cash.address,
    dai.address,
    bondOraclePeriod,
    oracleStartDate
  );
  const SeigniorageOracle = await deployer.deploy(
    Oracle,
    uniswap.address,
    cash.address,
    dai.address,
    seigniorageOraclePeriod,
    oracleStartDate
  );

  const linearThreshold = await deployer.deploy(
    LinearThreshold,
    MIN_SUPPLY,
    MAX_SUPPLY,
    MIN_CEILING,
    MAX_CEILING
  )

  await deployer.deploy(
    Treasury,
    cash.address,
    Bond.address,
    Share.address,
    BondOracle.address,
    SeigniorageOracle.address,
    Boardroom.address,
    BoardroomLp.address,
    SimpleFund.address,
    linearThreshold.address,
    startTime,
  );
}

async function approveIfNot(token, owner, spender, amount) {
  const allowance = await token.allowance(owner, spender);
  if (web3.utils.toBN(allowance).gte(web3.utils.toBN(amount))) {
    return;
  }
  await token.approve(spender, amount);
  console.log(` - Approved ${token.symbol ? (await token.symbol()) : token.address}`);
}

function deadline() {
  // 30 minutes
  return Math.floor(new Date().getTime() / 1000) + 1800;
}

module.exports = migration;
