import BigNumber from 'bignumber.js/bignumber'
import Web3 from 'web3'
import * as Types from './types.js'
import {
  SUBTRACT_GAS_LIMIT,
  contractAddresses,
  supportedPools,
  SupportedPool,
} from './constants'

import UNIV2PairAbi from './abi/uni_v2_lp.json'
import BaoAbi from './abi/bao.json'
import BaocxAbi from './abi/baocx.json'
import MasterChefAbi from './abi/masterchef.json'
import ERC20Abi from './abi/erc20.json'
import WETHAbi from './abi/weth.json'
import UniOracleABI from './abi/unioracle.json'
import ChainOracle from './abi/chainoracle.json'
import CxSwapAbi from './abi/cxswap.json'
import { BaoOptions } from '../Bao'
import { provider } from 'web3-core/types'
import { Contract } from 'web3-eth-contract'
import { AbiItem } from 'web3-utils'
import { getContract } from '../../utils/erc20'

export interface FarmableSupportedPool extends SupportedPool {
  lpAddress: string
  tokenAddress: string
  lpContract: Contract
  tokenContract: Contract
}

export class Contracts {
  bao: Contract
  web3: Web3
  defaultConfirmations: number
  autoGasMultiplier: number
  confirmationType: number
  defaultGas: string
  defaultGasPrice: string
  masterChef: Contract
  cxswap: Contract
  baocx: Contract
  weth: Contract
  wethPrice: Contract
  baoPrice: Contract
  pools: FarmableSupportedPool[]
  blockGasLimit: any
  notifier: any

  constructor(
    provider: string | provider,
    networkId: number,
    web3: Web3,
    options: BaoOptions,
  ) {
    this.web3 = web3
    this.defaultConfirmations = options.defaultConfirmations
    this.autoGasMultiplier = options.autoGasMultiplier || 1.1
    this.confirmationType =
      options.confirmationType || Types.ConfirmationType.Confirmed
    this.defaultGas = options.defaultGas
    this.defaultGasPrice = options.defaultGasPrice

    this.bao = new this.web3.eth.Contract(BaoAbi as AbiItem[])
    this.masterChef = new this.web3.eth.Contract(MasterChefAbi as AbiItem[])
    this.cxswap = new this.web3.eth.Contract(CxSwapAbi as AbiItem[])
    this.baocx = new this.web3.eth.Contract(BaocxAbi as AbiItem[])
    this.weth = new this.web3.eth.Contract(WETHAbi as AbiItem[])
    this.wethPrice = new this.web3.eth.Contract(ChainOracle as AbiItem[])
    this.baoPrice = new this.web3.eth.Contract(UniOracleABI as AbiItem[])

    this.pools =
      networkId == 100
        ? supportedPools.map((pool) =>
            Object.assign(pool, {
              lpAddress: pool.lpAddresses[networkId],
              tokenAddress: pool.tokenAddresses[networkId],
              lpContract: new this.web3.eth.Contract(UNIV2PairAbi as AbiItem[]),
              tokenContract: new this.web3.eth.Contract(ERC20Abi as AbiItem[]),
            }),
          )
        : undefined

    this.setProvider(provider, networkId)
    this.setDefaultAccount(this.web3.eth.defaultAccount)
  }

  setProvider(provider: provider, networkId: number): void {
    const setProvider = (contract: Contract, address: string) => {
      // FIXME: how was this ever working before on mainnet?
      // contract.setProvider(provider)
      if (address) contract.options.address = address
      else console.error('Contract address not found in network', networkId)
    }

    if (networkId == 100) {
      setProvider(this.bao, contractAddresses.bao[networkId])
      setProvider(this.masterChef, contractAddresses.masterChef[networkId])
      setProvider(this.weth, contractAddresses.weth[networkId])
      setProvider(this.wethPrice, contractAddresses.wethPrice[networkId])
      setProvider(this.baoPrice, contractAddresses.baoPrice[networkId])
      setProvider(this.baocx, contractAddresses.baocx[networkId])
      setProvider(this.cxswap, contractAddresses.cxswap[networkId])
    }
    if (this.pools) {
      this.pools.forEach(({ lpContract, lpAddress, tokenAddress }) => {
        const tokenContract = getContract(provider, tokenAddress)
        setProvider(lpContract, lpAddress)
        setProvider(tokenContract, tokenAddress)
      })
    }
  }

  setDefaultAccount(account: string): void {
    this.bao.options.from = account
    this.masterChef.options.from = account
    this.wethPrice.options.from = account
    this.baoPrice.options.from = account
  }

  async callContractFunction(method: any, options: any) {
    const {
      confirmations,
      confirmationType,
      autoGasMultiplier,
      ...txOptions
    } = options

    if (!this.blockGasLimit) {
      await this.setGasLimit()
    }

    if (!txOptions.gasPrice && this.defaultGasPrice) {
      txOptions.gasPrice = this.defaultGasPrice
    }

    if (confirmationType === Types.ConfirmationType.Simulate || !options.gas) {
      let gasEstimate
      if (
        this.defaultGas &&
        confirmationType !== Types.ConfirmationType.Simulate
      ) {
        txOptions.gas = this.defaultGas
      } else {
        try {
          console.log('estimating gas')
          gasEstimate = await method.estimateGas(txOptions)
        } catch (error) {
          const data = method.encodeABI()
          const { from, value } = options
          const to = method._parent._address
          error.transactionData = { from, value, data, to }
          throw error
        }

        const multiplier = autoGasMultiplier || this.autoGasMultiplier
        const totalGas = Math.floor(gasEstimate * multiplier)
        txOptions.gas =
          totalGas < this.blockGasLimit ? totalGas : this.blockGasLimit
      }

      if (confirmationType === Types.ConfirmationType.Simulate) {
        let g = txOptions.gas
        return { gasEstimate, g }
      }
    }

    if (txOptions.value) {
      txOptions.value = new BigNumber(txOptions.value).toFixed(0)
    } else {
      txOptions.value = '0'
    }

    const promi = method.send(txOptions)

    const OUTCOMES = {
      INITIAL: 0,
      RESOLVED: 1,
      REJECTED: 2,
    }

    let hashOutcome = OUTCOMES.INITIAL
    let confirmationOutcome = OUTCOMES.INITIAL

    const t =
      confirmationType !== undefined ? confirmationType : this.confirmationType

    if (!Object.values(Types.ConfirmationType).includes(t)) {
      throw new Error(`Invalid confirmation type: ${t}`)
    }

    let hashPromise
    let confirmationPromise

    if (
      t === Types.ConfirmationType.Hash ||
      t === Types.ConfirmationType.Both
    ) {
      hashPromise = new Promise((resolve, reject) => {
        promi.on('error', (error: Error) => {
          if (hashOutcome === OUTCOMES.INITIAL) {
            hashOutcome = OUTCOMES.REJECTED
            reject(error)
            const anyPromi = promi
            anyPromi.off()
          }
        })

        promi.on('transactionHash', (txHash: string) => {
          if (hashOutcome === OUTCOMES.INITIAL) {
            hashOutcome = OUTCOMES.RESOLVED
            resolve(txHash)
            if (t !== Types.ConfirmationType.Both) {
              const anyPromi = promi
              anyPromi.off()
            }
          }
        })
      })
    }

    if (
      t === Types.ConfirmationType.Confirmed ||
      t === Types.ConfirmationType.Both
    ) {
      confirmationPromise = new Promise((resolve, reject) => {
        promi.on('error', (error: Error) => {
          if (
            (t === Types.ConfirmationType.Confirmed ||
              hashOutcome === OUTCOMES.RESOLVED) &&
            confirmationOutcome === OUTCOMES.INITIAL
          ) {
            confirmationOutcome = OUTCOMES.REJECTED
            reject(error)
            const anyPromi = promi
            anyPromi.off()
          }
        })

        const desiredConf = confirmations || this.defaultConfirmations
        if (desiredConf) {
          promi.on('confirmation', (confNumber: number, receipt: string) => {
            if (confNumber >= desiredConf) {
              if (confirmationOutcome === OUTCOMES.INITIAL) {
                confirmationOutcome = OUTCOMES.RESOLVED
                resolve(receipt)
                const anyPromi = promi
                anyPromi.off()
              }
            }
          })
        } else {
          promi.on('receipt', (receipt: string) => {
            confirmationOutcome = OUTCOMES.RESOLVED
            resolve(receipt)
            const anyPromi = promi
            anyPromi.off()
          })
        }
      })
    }

    if (t === Types.ConfirmationType.Hash) {
      const transactionHash = await hashPromise
      if (this.notifier) {
        this.notifier.hash(transactionHash)
      }
      return { transactionHash }
    }

    if (t === Types.ConfirmationType.Confirmed) {
      return confirmationPromise
    }

    const transactionHash = await hashPromise
    if (this.notifier) {
      this.notifier.hash(transactionHash)
    }
    return {
      transactionHash,
      confirmation: confirmationPromise,
    }
  }

  async callConstantContractFunction(method: any, options: any) {
    const m2 = method
    const { blockNumber, ...txOptions } = options
    return m2.call(txOptions, blockNumber)
  }

  async setGasLimit() {
    const block = await this.web3.eth.getBlock('latest')
    this.blockGasLimit = block.gasLimit - SUBTRACT_GAS_LIMIT
  }
}
