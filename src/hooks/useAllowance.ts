import BigNumber from 'bignumber.js'
import { useCallback, useEffect, useState } from 'react'
import { useWallet } from 'use-wallet'
import { provider } from 'web3-core'
import { Contract } from 'web3-eth-contract'
import { getMasterChefContract } from '../bao/utils'
import { getAllowance } from '../utils/erc20'
import useBao from './useBao'

const useAllowance = (lpContract: Contract) => {
  const [allowance, setAllowance] = useState(new BigNumber(0))
  const { account }: { account: string; ethereum: provider } = useWallet()

  const fetchAllowance = useCallback(async () => {
    const allowance = await getAllowance(
      lpContract,
      account,
      masterChefContract.options.address,
    )
    setAllowance(new BigNumber(allowance))
  }, [account, lpContract])

  useEffect(() => {
    if (account && lpContract) {
      fetchAllowance()
    }
    const refreshInterval = setInterval(fetchAllowance, 5000)
    return () => clearInterval(refreshInterval)
  }, [account, lpContract])

  return allowance
}

export default useAllowance
