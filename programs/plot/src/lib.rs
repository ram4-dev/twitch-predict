//! Checked settlement arithmetic. This crate does not implement the on-chain program.

#[derive(Debug, PartialEq, Eq)]
pub enum SettlementError {
    InvalidFees,
    InvalidStake,
    Overflow,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Settlement {
    pub treasury: u64,
    pub streamer: u64,
    pub net: u64,
}

pub fn settle(
    gross: u64,
    treasury_bps: u16,
    streamer_bps: u16,
) -> Result<Settlement, SettlementError> {
    if u32::from(treasury_bps) + u32::from(streamer_bps) > 10_000 {
        return Err(SettlementError::InvalidFees);
    }
    let fee = |bps| -> Result<u64, SettlementError> {
        u64::try_from(u128::from(gross) * u128::from(bps) / 10_000)
            .map_err(|_| SettlementError::Overflow)
    };
    let treasury = fee(treasury_bps)?;
    let streamer = fee(streamer_bps)?;
    let net = gross
        .checked_sub(treasury)
        .and_then(|v| v.checked_sub(streamer))
        .ok_or(SettlementError::Overflow)?;
    Ok(Settlement {
        treasury,
        streamer,
        net,
    })
}

pub fn winning_claim(stake: u64, winning_total: u64, net: u64) -> Result<u64, SettlementError> {
    if winning_total == 0 || stake > winning_total {
        return Err(SettlementError::InvalidStake);
    }
    u64::try_from(u128::from(stake) * u128::from(net) / u128::from(winning_total))
        .map_err(|_| SettlementError::Overflow)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn common_vector_and_small_pools() {
        let s = settle(1000, 200, 200).unwrap();
        assert_eq!(
            s,
            Settlement {
                treasury: 20,
                streamer: 20,
                net: 960
            }
        );
        assert_eq!(winning_claim(600, 600, s.net), Ok(960));
        assert_eq!(settle(3, 200, 200).unwrap().net, 3);
        assert_eq!(winning_claim(1, 3, 3), Ok(1));
    }

    #[test]
    fn bounds_and_rounding_never_create_value() {
        assert_eq!(settle(1, 10_000, 1), Err(SettlementError::InvalidFees));
        assert_eq!(winning_claim(1, 0, 1), Err(SettlementError::InvalidStake));
        assert_eq!(winning_claim(2, 1, 1), Err(SettlementError::InvalidStake));
        for gross in [0, 1, 2, 99, 1000, u64::MAX] {
            let s = settle(gross, 200, 200).unwrap();
            assert_eq!(
                u128::from(s.treasury) + u128::from(s.streamer) + u128::from(s.net),
                u128::from(gross)
            );
            let a = winning_claim(1, 3, s.net).unwrap();
            let b = winning_claim(2, 3, s.net).unwrap();
            assert!(u128::from(a) + u128::from(b) <= u128::from(s.net));
        }
    }
}
