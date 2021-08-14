import BigNumber from 'bignumber.js'
import React, { useCallback, useMemo, useState } from 'react'
import styled from 'styled-components'
import baoIcon from '../../../assets/img/bao-icon.svg'
import { getBaoAddress, getBaoContract } from '../../../bao/utils'
import Button from '../../../components/Button'
import Card from '../../../components/Card'
import CardContent from '../../../components/CardContent'
import CardIcon from '../../../components/CardIcon'
import Label from '../../../components/Label'
import Value from '../../../components/Value'
import useAllowanceCx from '../../../hooks/useAllowanceCx'
import useApproveCx from '../../../hooks/useApproveCx'
import useBao from '../../../hooks/useBao'
import useDepositCx from '../../../hooks/useDepositCx'
import useModal from '../../../hooks/useModal'
import useTokenBalance from '../../../hooks/useTokenBalance'
import useWithdrawCx from '../../../hooks/useWithdrawCx'
import { getBalanceNumber } from '../../../utils/formatBalance'
import DepositModal from './DepositModal'
import WithdrawModal from './WithdrawModal'

interface SwapCxProps {
	withdrawableBalance: BigNumber
}

const SwapCxSwap: React.FC<SwapCxProps> = ({ withdrawableBalance }) => {
	const bao = useBao()
	const tokenName = 'BAO'
	const address = useMemo(() => getBaoAddress(bao), [bao])
	const tokenDecimals = 18

	const walletBalance = useTokenBalance(address)

	const [requestedApproval, setRequestedApproval] = useState(false)
	const baoContract = useMemo(() => getBaoContract(bao), [bao])
	const allowance = useAllowanceCx(baoContract)
	const { onApprove } = useApproveCx(baoContract)

	const { onDeposit } = useDepositCx(address)
	const { onWithdraw } = useWithdrawCx(address)

	const [onPresentDeposit] = useModal(
		<DepositModal
			max={walletBalance}
			onConfirm={onDeposit}
			tokenName={tokenName}
			tokenDecimals={tokenDecimals}
		/>,
	)

	const [onPresentWithdraw] = useModal(
		<WithdrawModal
			max={withdrawableBalance}
			onConfirm={onWithdraw}
			tokenName={tokenName}
			tokenDecimals={tokenDecimals}
		/>,
	)

	const handleApprove = useCallback(async () => {
		try {
			setRequestedApproval(true)
			const txHash = await onApprove()
			// user rejected tx or didn't go thru
			if (!txHash) {
				setRequestedApproval(false)
			}
		} catch (e) {
			console.log(e)
		}
	}, [onApprove, setRequestedApproval])

	return (
		<Card>
			<CardContent>
				<StyledCardContentInner>
					<StyledCardHeader>
						<CardIcon>
							<img src={baoIcon} alt="" height="50" />
						</CardIcon>
						<Value value={getBalanceNumber(walletBalance, tokenDecimals)} />
						<Label text={`${tokenName} in wallet`} />
						<Value
							value={getBalanceNumber(withdrawableBalance, tokenDecimals)}
						/>
						<Label text={`${tokenName} withdrawable `} />
					</StyledCardHeader>
					<StyledCardActions>
						{!allowance.toNumber() ? (
							<Button
								disabled={
									requestedApproval || walletBalance.eq(new BigNumber(0))
								}
								onClick={handleApprove}
								text={`Approve ${tokenName}`}
							/>
						) : (
							<Button
								disabled={!address || walletBalance.eq(new BigNumber(0))}
								text={`Deposit ${tokenName}`}
								onClick={onPresentDeposit}
							/>
						)}
						<StyledActionSpacer />
						<Button
							disabled={!address || withdrawableBalance.eq(new BigNumber(0))}
							text={`Withdraw ${tokenName}`}
							onClick={onPresentWithdraw}
						/>
					</StyledCardActions>
				</StyledCardContentInner>
			</CardContent>
		</Card>
	)
}

const StyledCardHeader = styled.div`
	align-items: center;
	display: flex;
	flex-direction: column;
`

const StyledCardActions = styled.div`
	display: flex;
	justify-content: center;
	margin-top: ${(props) => props.theme.spacing[5]}px;
	width: 100%;
`

const StyledActionSpacer = styled.div`
	height: ${(props) => props.theme.spacing[4]}px;
	width: ${(props) => props.theme.spacing[4]}px;
`

const StyledCardContentInner = styled.div`
	align-items: center;
	display: flex;
	flex: 1;
	flex-direction: column;
	justify-content: space-between;
`

export default SwapCxSwap
