const Boardroom = artifacts.require('Boardroom');
const BoardroomLp = artifacts.require('BoardroomLp');
const Treasury = artifacts.require('Treasury');
const Cash = artifacts.require('Cash');
const Bond = artifacts.require('Bond');
const Share = artifacts.require('Share');
const Timelock = artifacts.require('Timelock');
const LinearThreshold = artifacts.require('LinearThreshold');

const DAY = 86400;

module.exports = async (deployer, network, accounts) => {
  const cash = await Cash.deployed();
  const share = await Share.deployed();
  const bond = await Bond.deployed();
  const treasury = await Treasury.deployed();
  const boardroom = await Boardroom.deployed();
  const boardroomLp = await BoardroomLp.deployed();
  const linearThreshold = await LinearThreshold.deployed();
  const timelock = await deployer.deploy(Timelock, accounts[0], 2 * DAY);

  for await (const contract of [ cash, share, bond ]) {
    await contract.transferOperator(treasury.address);
    await contract.transferOwnership(treasury.address);
  }

  if (network === 'mainnet') {
    await linearThreshold.transferOperator(timelock.address);
    await linearThreshold.transferOwnership(timelock.address);
  }

  await boardroom.transferOperator(treasury.address);
  await boardroom.transferOwnership(timelock.address);
  await boardroomLp.transferOperator(treasury.address);
  await boardroomLp.transferOwnership(timelock.address);

  if (network === 'mainnet') {
    await treasury.transferOperator(timelock.address);
    await treasury.transferOwnership(timelock.address);
  }

  console.log(`Transferred the operator role from the deployer (${accounts[0]}) to Treasury (${Treasury.address})`);
}
