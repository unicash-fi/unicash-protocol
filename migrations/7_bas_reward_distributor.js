const {
  unsPools,
  INITIAL_UNS_FOR_DAI_UNC,
  INITIAL_UNS_FOR_DAI_UNS,
} = require('./pools');

// Pools
// deployed first
const Share = artifacts.require('Share');
const InitialShareDistributor = artifacts.require('InitialShareDistributor');

// ============ Main Migration ============

async function migration(deployer, network, accounts) {
  const unit = web3.utils.toBN(10 ** 18);
  const totalBalanceForDAIUNC = unit.muln(INITIAL_UNS_FOR_DAI_UNC)
  const totalBalanceForDAIUNS = unit.muln(INITIAL_UNS_FOR_DAI_UNS)
  const totalBalance = totalBalanceForDAIUNC.add(totalBalanceForDAIUNS);

  const share = await Share.deployed();

  const lpPoolDAIUNC = artifacts.require(unsPools.DAIUNC.contractName);
  const lpPoolDAIUNS = artifacts.require(unsPools.DAIUNS.contractName);

  await deployer.deploy(
    InitialShareDistributor,
    share.address,
    lpPoolDAIUNC.address,
    totalBalanceForDAIUNC.toString(),
    lpPoolDAIUNS.address,
    totalBalanceForDAIUNS.toString(),
  );
  const distributor = await InitialShareDistributor.deployed();

  await share.mint(distributor.address, totalBalance.toString());
  console.log(`Deposited ${INITIAL_UNS_FOR_DAI_UNC} UNS to InitialShareDistributor.`);

  console.log(`Setting distributor to InitialShareDistributor (${distributor.address})`);
  await lpPoolDAIUNC.deployed().then(pool => pool.setRewardDistribution(distributor.address));
  await lpPoolDAIUNS.deployed().then(pool => pool.setRewardDistribution(distributor.address));

  await distributor.distribute();
}

module.exports = migration;
